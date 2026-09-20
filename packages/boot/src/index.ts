import { Context } from '@berkshire/cordis'
import type { Fiber, Plugin } from '@berkshire/cordis'
import '@berkshire/core'
import type { EntryRow, Resolver } from './entries'
import { composeEntries } from './entries'
import { importPlugin } from './loader'

export { composeEntries, applyEntryPatches, applyRow } from './entries'
export type { EntryRow, PatchOverlay, Resolver } from './entries'
export { importPlugin, unwrapExports, resolveDownloadedPackage } from './loader'
export type { ImportPluginOptions } from './loader'
export { defaultBkHome, cordisYmlPath, nodeModulesDir, setBkHome } from './bk-home'
export {
  BK_HOME_ENV,
  BK_HOME_DIR_NAME,
  CORDIS_YML,
} from './bk-home'
export { readCordisYml } from './entries-file'

export interface Mounted {
  id: string
  fiber: Fiber
  /** 是否被上层 patch 置为 disabled（未实际挂载）。 */
  skipped: boolean
}

/**
 * 一个极简 Cordis 装配器：「装一个插件 → 声明依赖 → 触发事件 → 逆序卸除」的最小宿主。
 *
 * 目标态的 boot（packages/boot/app-boot）还负责 profile 持久化、dump-config、HMR 热
 * 装卸与 sidecar 生命周期；v1 只实现可与 Tauri/Rust 侧对接的**内存进程内装配**：
 * 用 `ctx.plugin()` 挂载、经 effect 自注册/自撤销，`dispose()` 逆序（后装先卸）清理。
 *
 * v1 是 headless 可跑的最小核心，尚未接 Tauri（进程 A）与 webview（进程 C）——
 * 那是 v2 的接线。
 */
export class Boot {
  readonly ctx: Context
  private _mounted: Mounted[] = []
  private _disposed = false

  constructor() {
    this.ctx = new Context()
  }

  /** 已挂载（含跳过）条目快照，按挂载顺序。 */
  get mounted(): readonly Mounted[] {
    return this._mounted.slice()
  }

  /** 已实际挂载、且未因 disposed 跳过 的 fiber 名（调试/测试用）。 */
  get activeCount(): number {
    return this._mounted.filter((m) => !m.skipped).length
  }

  /**
   * 挂载一行。`disabled` 时跳过（能力不可用）；否则解析插件名、
   * 用插件自带 Config 校验 config（fail loud），再 `ctx.plugin()` 挂载。
   *
   * `resolver` 缺省用内置动态 `importPlugin`（P1：npm 名 / 相对路径 / `cordis:` 三条分支，
   * 见 loader.ts）。兼容既有调用方显式传查表 resolver。
   */
  async install(row: EntryRow, resolver: Resolver = defaultResolver): Promise<void> {
    if (this._disposed) {
      throw new Error('boot already disposed')
    }
    if (row.disabled) {
      this._mounted.push({ id: row.id, fiber: null as unknown as Fiber, skipped: true })
      return
    }
    if (!row.name) {
      throw new Error(`entry "${row.id}" missing name (cannot mount)`)
    }
    const plugin = await resolver(row.name)
    if (!plugin) {
      throw new Error(`cannot resolve plugin "${row.name}" (id="${row.id}")`)
    }
    const schema = (plugin as { Config?: { parse(v: unknown): unknown } }).Config
    const config = row.config ? (schema ? schema.parse(row.config) : row.config) : {}
    const fiber = await this.ctx.plugin(plugin as Plugin, config)
    this._mounted.push({ id: row.id, fiber, skipped: false })
  }

  /** 依次挂载一组已组合好的行。 */
  async installAll(rows: EntryRow[], resolver: Resolver): Promise<void> {
    for (const row of rows) {
      await this.install(row, resolver)
    }
  }

  /** 从分层补丁组合出最终行表并挂载（与 dump 共用 `composeEntries`）。 */
  async mountFromLayers(
    layers: Parameters<typeof composeEntries>[0],
    resolver: Resolver,
    warn?: (msg: string) => void,
  ): Promise<void> {
    const rows = composeEntries(layers, warn)
    await this.installAll(rows, resolver)
  }

  /** 逆序卸除：后装先卸，保证依赖在上游被拆除前先清理自身。返回卸除顺序。 */
  async dispose(): Promise<string[]> {
    if (this._disposed) return this.disposeOrder
    this._disposed = true
    const order: string[] = []
    // 先逐个卸载已挂载 fiber（跳过 disabled 行），最后 dispose 根 ctx.fiber。
    // 注意：根 fiber 会连带清理其子正处 dispose 的 fiber，故本路径**必须幂等**——
    // 已由 core.test.ts 的 3b 用例（二次 dispose 顺序不变、不报错）验证；
    // 若将来调整卸载顺序，务必保留「先子后根 + 幂等」这一性质。
    for (const { fiber, skipped, id } of this._mounted.reverse()) {
      if (skipped) continue
      order.push(id)
      await fiber.dispose()
    }
    await this.ctx.fiber.dispose()
    this.disposeOrder = order
    return order
  }

  /** 上次 dispose 的实际卸除顺序（后装先卸）。 */
  disposeOrder: string[] = []
}

/**
 * 缺省 Resolver：走内置动态 `importPlugin`（相对路径 baseUrl 兜底到本模块目录）。
 *
 * 诚实边界：此缺省 resolver **只解析运行链上可找到的裸名/相对路径**（workspace、registry 包）。
 * 它**不**解析 `$BK_HOME/node_modules` 下下载的插件——要解析下载包必须传带 `nodeModulesDir`
 * 的显式 resolver（sidecar 正是这么做的：`importPlugin(name, { nodeModulesDir, baseUrl: bkHome })`）。
 */
const defaultResolver: Resolver = (name) => importPlugin(name)