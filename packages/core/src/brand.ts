/**
 * 跨边界品牌化 id。
 *
 * 约定（docs/secondary-development.md §2 规则 5）：跨进程/跨层传递的标识符一律用
 * `Branded<T>` 包装，**禁止裸 `string`**，防止「凭代码格式猜资产类型」这类 bug。
 *
 * 这些类型在 v1 已在 `ctx.capabilities` / `ctx.notifier` 事件载荷中落地；其余 dataset/
 * symbol/asset 的品牌化 id 是目标态，待对应的核心服务落地时接入。
 */

/** 把一个基础类型 T 加上一个名义（structural 之外的）品牌标记 S。 */
export type Branded<T, S extends string> = T & { readonly __brand: S }

/** 给一个值打上品牌标记的运行时辅助（仅为书写便捷，类型层面决定一切）。 */
export function brand<T, S extends string>(value: T, _brand: S): Branded<T, S> {
  return value as Branded<T, S>
}

/** 能力 id：一个可注册/门控的能力（如 'notify-console'）。 */
export type CapabilityId = Branded<string, 'capability'>

/** 数据集 id（目标态，待 `ctx.datasets` 落地）。 */
export type DatasetId = Branded<string, 'dataset'>

/** 资产 id（目标态）。 */
export type AssetId = Branded<string, 'asset'>

/** 证券代码 id（目标态）。 */
export type SymbolId = Branded<string, 'symbol'>

/** client 插件（前端 bundle）id：跨 sidecar/Rust/webview 的 client 模块标识（T1 落地）。 */
export type ClientModuleId = Branded<string, 'client-module'>