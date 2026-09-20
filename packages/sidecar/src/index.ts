/**
 * @berkshire/sidecar 入口：把 v1 headless 核心脊变成可被宿主拉起、可对话的常驻进程。
 *
 * 协议见 ../README.md（T0 定稿）：ndjson stdio——stdout=响应+事件推送，stdin=请求，
 * stderr=日志。启动即按 `$BK_HOME/cordis.yml` 声明装配插件，**第一条消息前**完成；
 * 随后进入逐行串行的 ndjson 读循环。
 *
 * 诚实边界：全内存实现（capabilities/log 均为进程内状态），持久化目标态；
 * 本入口只做「手动 bun run 冒烟 + 协议服务」，由宿主拉起/restart 属 T2。配置持久化
 * （写回 cordis.yml、`!!js` 惰性表达式）属 v2 目标态。
 *
 * 装载纪律（用户拍板）：加载**只由 `$BK_HOME/cordis.yml` + 下载的 npm 包驱动**——不 import、
 * 不写死表单。resolver 用 `@berkshire/boot` 内置动态 `importPlugin`（npm 裸名 / 相对·绝对
 * 路径 / `cordis:` 三分支），下载包经 `$BK_HOME/node_modules` 解析具体 dist 入口后绝对 import。
 * 新增插件 = 「`bun add` 进 `$BK_HOME/node_modules` + cordis.yml 加一行」，sidecar 零改码。
 */
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { Boot, importPlugin, defaultBkHome, nodeModulesDir, readCordisYml } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { createLineWriter } from './writer'
import { handleLine } from './protocol'
import type { HandleLineDeps } from './protocol'
import { attachEventPusher } from './events'
import { attachDevWatcher } from './dev_watch'

/** 仓库根（dev 态插件热更 watcher 用）：packages/sidecar/src → ../../../。 */
const REPO = resolve(import.meta.dir, '../../..')

async function main(): Promise<void> {
  const bkHome = defaultBkHome()
  const nmDir = nodeModulesDir(bkHome)
  // 顶层装配入口：只从 $BK_HOME/cordis.yml 读「装哪些插件」（fail-closed，缺文件即报错）。
  const rows = readCordisYml(bkHome)
  // 内置动态 resolver：npm 下载包优先解析 $BK_HOME/node_modules 的 dist 入口绝对 import；
  // 相对路径相对 $BK_HOME 解析；其余（workspace/registry 裸名）走 import(name)。
  const resolver: Resolver = (name) => importPlugin(name, { nodeModulesDir: nmDir, baseUrl: bkHome })

  const boot = new Boot()
  await boot.installAll(rows, resolver)
  process.stderr.write(`[sidecar] booted from ${bkHome}/cordis.yml; active=${boot.activeCount}\n`)

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