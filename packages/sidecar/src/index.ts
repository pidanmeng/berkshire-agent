/**
 * @berkshire/sidecar 入口：把 v1 headless 核心脊变成可被宿主拉起、可对话的常驻进程。
 *
 * 协议见 ../README.md（T0 定稿）：ndjson stdio——stdout=响应+事件推送，stdin=请求，
 * stderr=日志。启动即按 `$BK_HOME/cordis.yml` 声明装配插件，**第一条消息前**完成；
 * 随后进入逐行串行的 ndjson 读循环。
 *
 * **首启供给（provisioning）**：`$BK_HOME/cordis.yml` 尚不存在时，本进程**不装配也不崩溃**，
 * 而是进入待供给阶段——保活应答 `boot/status` → `{ phase: 'provisioning' }`，其余方法
 * METHOD(…fail-closed)。宿主据此展示首启引导、写入 cordis.yml 后 `restart` 本进程 → 重新进入
 * ready 装配路径。这样首启不再黑屏/离线，且「装配只由 cordis.yml 驱动」的纪律不变。
 *
 * 诚实边界：全内存实现（capabilities/log 均为进程内状态），持久化目标态；
 * 本入口只做「手动 bun run 冒烟 + 协议服务」，由宿主拉起/restart 属 T2。配置持久化
 * （写回 cordis.yml、`!!js` 惰性表达式）属 v2 目标态；首启写 cordis.yml 由宿主 Rust 落盘。
 *
 * 装载纪律（用户拍板）：加载**只由 `$BK_HOME/cordis.yml` + 下载的 npm 包驱动**——不 import、
 * 不写死表单。resolver 用 `@berkshire/boot` 内置动态 `importPlugin`（npm 裸名 / 相对·绝对
 * 路径 / `cordis:` 三分支），下载包经 `$BK_HOME/node_modules` 解析具体 dist 入口后绝对 import。
 * 新增插件 = 「`bun add` 进 `$BK_HOME/node_modules` + cordis.yml 加一行」，sidecar 零改码。
 */
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Boot,
  importPlugin,
  defaultBkHome,
  nodeModulesDir,
  cordisYmlPath,
  readCordisYml,
} from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { createLineWriter } from './writer'
import { handleLine, handleProvisionLine, type HandleLineDeps, type HandleLineResult } from './protocol'
import { attachEventPusher } from './events'
import { attachDevWatcher } from './dev_watch'
import { createFileStorageProvider } from './storage-provider'
import { duckDbPath } from './duckdb-provider'
import type { LineWriter } from './writer'

/** 仓库根（dev 态插件热更 watcher 用）：packages/sidecar/src → ../../../。 */
const REPO = resolve(import.meta.dir, '../../..')

/** 逐行串行的 ndjson 读循环（两阶段共享）：处理一行 → 写响应；shutdown 走 onShutdown。 */
async function runLoop(
  writer: LineWriter,
  handle: (line: string) => Promise<HandleLineResult>,
  onShutdown: () => Promise<void>,
): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  let shuttingDown = false
  let chain: Promise<void> = Promise.resolve()
  rl.on('line', (line) => {
    if (shuttingDown) return
    chain = chain
      .then(async () => {
        const { lines, shutdown } = await handle(line)
        for (const l of lines) writer.write(l)
        if (shutdown) {
          shuttingDown = true
          await writer.flush() // 确保 shutdown 响应已送达宿主
          await onShutdown()
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
}

/** 待供给阶段：cordis.yml 缺失 → 不装配不崩溃，保活应答 boot/status，等宿主写入后重启。 */
async function runProvisioning(bkHome: string): Promise<void> {
  process.stderr.write(
    `[sidecar][provisioning] cordis.yml not found at ${cordisYmlPath(bkHome)}; ` +
      `awaiting provision (answers boot/status)\n`,
  )
  const writer = createLineWriter(process.stdout)
  await runLoop(
    writer,
    (line) => handleProvisionLine(line, 'provisioning'),
    async () => {
      process.stderr.write('[sidecar] provisioning shutdown\n')
      process.exit(0)
    },
  )
}

async function main(): Promise<void> {
  const bkHome = defaultBkHome()
  const ymlPath = cordisYmlPath(bkHome)

  // 首启供给：cordis.yml 不存在 → 进入 provisioning，宿主展示引导后写盘并 restart。
  if (!existsSync(ymlPath)) {
    return runProvisioning(bkHome)
  }

  const nmDir = nodeModulesDir(bkHome)
  // 顶层装配入口：只从 $BK_HOME/cordis.yml 读「装哪些插件」（fail-closed，缺文件即报错）。
  const rows = readCordisYml(bkHome)
  // 内置动态 resolver：npm 下载包优先解析 $BK_HOME/node_modules 的 dist 入口绝对 import；
  // 相对路径相对 $BK_HOME 解析；其余（workspace/registry 裸名）走 import(name)。
  const resolver: Resolver = (name) => importPlugin(name, { nodeModulesDir: nmDir, baseUrl: bkHome })

  const boot = new Boot()
  // 持久化能力缝（WP-2）：`ctx.storage` 的 Definition 由 core 提供，故先装 core 行（若声明了），
  // 再附加文件 Provider（读写 $BK_HOME/state/<ns>），随后装配其余插件——保证 Consumer 插件
  // （如 demo 挂载时读写配置）挂上时已有 provider。core 缺声明则 storage 不可用，消费者 fail-closed。
  const coreRows = rows.filter((r) => r.name === '@berkshire/core')
  const rest = rows.filter((r) => r.name !== '@berkshire/core')
  for (const row of coreRows) {
    await boot.install(row, resolver)
  }
  let detachStorage: (() => void) | undefined
  if (coreRows.length > 0) {
    detachStorage = boot.ctx.storage.register(createFileStorageProvider(bkHome))
  }
  // DuckDB Provider（WP：数据源能力缝落地）：惰性动态 import——原生绑定若在 Bun 下加载失败，
  // 不崩 boot（装配期不拉起 duckdb），仅使 `ctx.database` 不可用；页面经 database/tables 显示
  // 离线原因（fail-closed）。真正打开发生在首次调用（见 duckdb-provider.ts）。
  let detachDatabase: (() => void) | undefined
  if (coreRows.length > 0) {
    try {
      const { createDuckDbProvider } = await import('./duckdb-provider')
      detachDatabase = boot.ctx.database.register(createDuckDbProvider(bkHome))
    } catch (err) {
      process.stderr.write(
        `[sidecar][warn] DuckDB provider 装载失败（${duckDbPath(bkHome)}）: ` +
          `${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }
  for (const row of rest) {
    await boot.install(row, resolver)
  }
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
    detachStorage?.() // 摘文件 Provider（root ctx effect；boot.dispose 亦会兜底清理）
    detachDatabase?.() // 摘 DuckDB Provider（连接随进程退出，无需显式 closeSync）
    detachEvents()
    const order = await boot.dispose() // 逆序清理：后装先卸（v1 §8 已验证语义）。
    process.stderr.write(`[sidecar] shutdown: dispose order = ${order.join(' -> ')}\n`)
    process.exit(0)
  }

  // ready：装配完成，进入服务协议；`boot/status` 由 dispatch 应答 `{ phase: 'ready' }`。
  await runLoop(writer, (line) => handleLine(line, deps), teardown)
}

void main().catch((err) => {
  process.stderr.write(
    `[sidecar][fatal] ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
  process.exitCode = 1
})