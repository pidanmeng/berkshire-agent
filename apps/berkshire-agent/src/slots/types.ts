/**
 * slot 上下文类型化 map（契约，不是示例）。
 *
 * 宿主在固定槽位挂组件时，把「该槽位约定的上下文 + actions」以 `context` 属性注入
 * （见 registry.ts 的 `SlotComponent<C>`）。本 map 约束 slot 名与其上下文的一一对应：
 * 写一个 slot 的组件，就等于吃死它的 context 形状——类型是下游插件的契约。
 *
 * 诚实标注（边界）：这些 context 供 **webview 内注册的本地组件** 使用——sidecar 的
 * clientModules 快照经 ClientModuleHost 汇入本表（T1），动态路由（能力块 B）按 `route.slot`
 * 经 `ExtensionRoute` 触发渲染；插件包内组件跨包不 import 宿主，用**结构镜像**上下文
 * 对齐（v2 共享类型层债务）。跨 sidecar/Rust/webview 边界的 id（如 symbol）仍为 webview
 * 本地域裸字符串，品牌化为 `Branded<T>` 留 v2。
 */

/** 个股查看视角（stock-preview.footer 上下文之一）。 */
export type PreviewView = "daily" | "intraday"

/** 自选列表工具栏的视图形态。 */
export type WatchlistViewMode = "compact" | "full"

/**
 * slot 名 → 上下文/actions 的类型化 map。
 *
 * 新增槽位 = 在此加一行（名 + 上下文形状），宿主与插件两端都跟着类型走；注意同步
 * {@link FRONTEND_SLOT_NAMES} 运行时数组（注册时的 fail-closed 校验用）。
 */
export interface FrontendSlotContextMap {
  /** 个股预览页底部：宿主给出正在查看的证券与视角，插件据此渲染补充内容。 */
  "stock-preview.footer": {
    /** 证券代码（跨边界前暂用裸字符串）。 */
    symbol: string
    /** 证券名称。 */
    name: string
    /** 当前查看视角。 */
    view: PreviewView
  }
  /** 自选列表工具栏：宿主给出当前列表、视图与刷新能力。 */
  "watchlist.toolbar": {
    /** 自选证券代码列表。 */
    symbols: string[]
    /** 当前视图形态。 */
    viewMode: WatchlistViewMode
    /** 触发宿主刷新列表。 */
    refresh: () => void
  }
  /** 分析菜单（页面注入载体，能力块 B/路由契约化的挂点）：插件自声明路由的页面内容经此槽渲染；宿主暂无上下文。 */
  "analysis.menu": Record<string, never>
}

/** 已注册槽位的名字（即类型化 map 的键全集）。 */
export type FrontendSlotName = keyof FrontendSlotContextMap

/**
 * 运行时存在的槽位名，用于注册时的「未知 slot」校验（fail-closed）。与
 * {@link FrontendSlotContextMap} 的键保持一致。
 */
export const FRONTEND_SLOT_NAMES: readonly FrontendSlotName[] = [
  "stock-preview.footer",
  "watchlist.toolbar",
  "analysis.menu",
]