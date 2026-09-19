/**
 * @berkshire/sidecar 入口：把 v1 headless 核心脊变成可被宿主拉起、可对话的常驻进程。
 *
 * 协议见 ../README.md（T0 定稿）：ndjson stdio——stdout=响应+事件推送，stdin=请求，
 * stderr=日志。启动即按 `composeEntries([baseBundle, override])` 挂载 core + notify-console，
 * **第一条消息前**完成装配；随后进入逐行串行的 ndjson 读循环。
 *
 * 诚实边界：全内存实现（capabilities/log 均为进程内状态），持久化目标态；
 * 本入口只做「手动 bun run 冒烟 + 协议服务」，由宿主拉起/restart 属 T2。
 */
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import * as core from '@berkshire/core'
import * as notify from '@berkshire/plugin-notify-console'
import * as demo from '@berkshire/plugin-demo'
import { Boot } from '@berkshire/boot'
import type { PatchOverlay } from '@berkshire/boot'
import { createLineWriter } from './writer'
import { handleLine } from './protocol'
import type { HandleLineDeps } from './protocol'
import { attachEventPusher } from './events'
import { attachDevWatcher } from './dev_watch'

/** 仓库根：packages/sidecar/src → ../../../（bun 的 import.meta.dir 即本文件目录）。 */
const REPO = resolve(import.meta.dir, '../../..')

const resolver = (name: string) =>
  ({
    '@berkshire/core': core,
    '@berkshire/plugin-notify-console': notify,
    '@berkshire/plugin-demo': demo,
  })[name]

async function main(): Promise<void> {
  const boot = new Boot()

  // base bundle 显式引用真实 patch 文件（T0：BaseBundle 由 sidecar 显式引用）。
  const basePatch = parse(readFileSync(resolve(REPO, 'packages/bundle/base/cordis.patch.yml'), 'utf8')) as PatchOverlay
  // T3：把 demo 插件 bundle 也叠进装配——装上即出现 footer/toolbar 组件 + 资金流向页 + scoped 样式。
  // 要复现「卸下即消失」，把 demo-off bundle patch 叠进 layers（见 packages/plugins/demo/examples/smoke.ts）。
  const demoPatch = parse(readFileSync(resolve(REPO, 'packages/bundle/demo/cordis.patch.yml'), 'utf8')) as PatchOverlay
  // T0 协议：stdout 独占协议流。notify-console 默认 echo:true 会 console.log 到 stdout，
  // 必须在装配时按 id 整体覆盖其 config 把 echo 关掉（composeEntries 的整行替换语义）。
  const override: PatchOverlay = [{ id: 'notify-console', config: { channel: 'console', echo: false } }]

  await boot.mountFromLayers([basePatch, demoPatch, override], resolver, (msg) =>
    process.stderr.write(`[sidecar][patch] ${msg}\n`),
  )
  process.stderr.write(`[sidecar] booted; active=${boot.activeCount}\n`)

  const writer = createLineWriter(process.stdout)
  // 事件订阅在装配完成后挂上：装配期间的能力注册不推送，host 用 capabilities/list 拉首次快照。
  const detachEvents = attachEventPusher(boot.ctx, (line) => writer.write(line))

  // dev 态插件热更（宿主在 dev 启动时注入 BK_DEV_HOTRELOAD=1）：sidecar 半身文件变更 →
  // 推 `dev/reload-requested`，宿主收到后重启本进程以加载新声明/样式，并推 `client/changed`
  // 让 webview 重拉快照。组件 `.tsx` 不在 watcher 内（归 Vite Fast Refresh）。生产不附加。
  let detachDevReload: (() => void) | undefined
  if (process.env['BK_DEV_HOTRELOAD'] === '1') {
    detachDevReload = attachDevWatcher(REPO, (path) => {
      process.stderr.write(`[sidecar][dev] hot-reload requested (${path})\n`)
      writer.write(JSON.stringify({ event: 'dev/reload-requested', payload: { path } }))
      void writer.flush()
    })
  }

  const deps: HandleLineDeps = { ctx: boot.ctx }

  const teardown = async () => {
    detachDevReload?.()
    detachEvents()
    const order = await boot.dispose() // 逆序清理：后装先卸（v1 §8 已验证语义）。
    process.stderr.write(`[sidecar] shutdown: dispose order = ${order.join(' -> ')}\n`)
    process.exit(0)
  }

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let shuttingDown = false
  let chain: Promise<void> = Promise.resolve()
  rl.on('line', (line) => {
    if (shuttingDown) return
    chain = chain
      .then(async () => {
        const { lines, shutdown } = await handleLine(line, deps)
        for (const l of lines) writer.write(l)
        if (shutdown) {
          shuttingDown = true
          await writer.flush() // 确保 shutdown 响应已送达宿主
          await teardown()
        }
      })
      .catch((err) => {
        process.stderr.write(`[sidecar][internal] ${err instanceof Error ? err.message : String(err)}\n`)
      })
  })

  // stdin EOF（宿主关闭管道）：flush 已排队的响应后以 0 退出。真实宿主走 shutdown，不依赖此路径。
  rl.on('close', () => {
    void chain.finally(async () => {
      if (shuttingDown) return
      await writer.flush()
      process.exit(0)
    })
  })

  // 事件循环由活动的 stdin 读循环维持；由 close / shutdown 决定退出。
}

void main().catch((err) => {
  process.stderr.write(
    `[sidecar][fatal] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exitCode = 1
})