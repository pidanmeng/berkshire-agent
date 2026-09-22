/**
 * 跨边界品牌化 id。
 *
 * 约定（docs/secondary-development.md §2 规则 5）：跨进程/跨层传递的标识符一律用
 * `Branded<T>` 包装，**禁止裸 `string`**，防止「凭代码格式猜资产类型」这类 bug。
 *
 * 这些类型在 v1 已在 `ctx.capabilities` / `ctx.notifier` 事件载荷与 `ctx.datasets` 声明、
 * `ctx.dataSources` 路由（`DatasetId`/`DataSourceId`）中落地；其余 symbol/asset 的品牌化
 * id 是类型占位，待对应的业务核心服务落地时接入。
 */

/** 把一个基础类型 T 加上一个名义（structural 之外的）品牌标记 S。 */
export type Branded<T, S extends string> = T & { readonly __brand: S }

/** 能力 id：一个可注册/门控的能力（如 'notify-console'）。 */
export type CapabilityId = Branded<string, 'capability'>

/** 数据集 id（已落地：`ctx.datasets` 注册表 + 八组基础数据集声明，见 services/datasets.ts）。 */
export type DatasetId = Branded<string, 'dataset'>

/** 资产类型（stock/index/etf）。固定字面量，非不透明 id，不打包 Branded。 */
export type AssetType = 'stock' | 'index' | 'etf'

/** 资产 id（目标态，业务侧 v2 接入）。 */
export type AssetId = Branded<string, 'asset'>

/** 证券代码 id（目标态，业务侧 v2 接入）。 */
export type SymbolId = Branded<string, 'symbol'>

/** client 插件（前端 bundle）id：跨 sidecar/Rust/webview 的 client 模块标识（T1 落地）。 */
export type ClientModuleId = Branded<string, 'client-module'>

/** 存储命名空间 id：基于插件 id → `$BK_HOME/state/<ns>/` 目录映射（WP-2 持久化能力缝）。 */
export type StorageNamespaceId = Branded<string, 'storage-namespace'>

/** 数据源 provider id（`ctx.dataSources` 缝，WP：数据源能力缝落地）。 */
export type DataSourceId = Branded<string, 'datasource'>