/**
 * slot 上下文类型化 map（契约，不是示例）。
 *
 * 宿主/插件在固定槽位挂组件时，把「该槽位约定的上下文 + actions」以 `context` 属性注入
 * （见 registry.ts 的 `SlotComponent<C>`）。本 map 约束 slot 名与其上下文的一一对应：
 * 写一个 slot 的组件，就等于吃死它的 context 形状——类型是下游插件的契约。
 *
 * 诚实标注（边界）：本包是**共享 UI 缝引擎**（对齐 dsh `@dsh-client-ui-slots` 的 `SlotMap`），
 * 从宿主 `apps/berkshire-agent/src/slots/types.ts` 迁出，宿主与所有插件共同 import；
 * 新增槽位 = 在此加一行（名 + 上下文形状），并同步更新 {@link FRONTEND_SLOT_NAMES}。
 * sidecar 的 clientModules 快照经宿主 `ClientModuleHost` 汇入注册表（T1）；跨包组件用**结构镜像**
 * 上下文对齐（v2 共享类型层债务），跨 sidecar/Rust/webview 边界的 id 仍为 webview 本地域裸字符串，
 * 品牌化为 `Branded<T>` 留 v2。
 */
import type { ReactNode } from "react"

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
  /** 侧边栏导航区（应用壳）：插件在导航区追加项/分组。宿主给出折叠态与当前路径。 */
  "layout.navigation.extra": {
    /** 侧边栏是否处于折叠（icon 栏）态。 */
    collapsed: boolean
    /** 当前路由 pathname，供活动态派生。 */
    pathname: string
  }
  /** 侧边栏底部（应用壳）：在固定设置入口上方追加控制项。宿主给出折叠态。 */
  "layout.sidebar.footer": {
    /** 侧边栏是否处于折叠（icon 栏）态。 */
    collapsed: boolean
  }
  /** 状态栏右侧（应用壳）：插件追加状态项；插件自持响应式数据，宿主暂无上下文。 */
  "layout.statusbar.right": Record<string, never>
  /** 设置页（应用壳）：插件追加设置卡片/分组；卡片自包含，宿主每张包 ExtensionBoundary。 */
  "settings.cards": Record<string, never>
  /**
   * 根（root）槽：应用壳帧挂载点（对齐 dsh `ui-layout` 在宿主内置 `root` 槽挂 `AppFrame`）。
   * **single 语义**：全场**仅一个**壳帧（见 registry.ts `SLOT_KINDS`），重复注册 fail-closed 拒绝。
   * 宿主把路由快照、桥接态与「应用内容渲染 prop」经 `context` 注入；壳帧只做挂点与契约，
   * 具体内容（路由/页面）由 `renderApp` 提供的宿主内容填充，子槽内容归各插件。
   */
  root: {
    /** 插件自声明路由（宿主 routesStore 快照的子集），供壳内分组导航与上下文标题。 */
    routes: readonly ShellRouteInfo[]
    /** 桥接连通态（宿主经 `lib/api` 探测注入）；`null`=检测中。 */
    bridgeOnline: boolean | null
    /**
     * 应用内容渲染 prop：壳帧无法以 `children` 接收宿主内容（slot 组件只收 `context`），
     * 故宿主把 `<Routes>` 的渲染封装成 prop 注入，由壳帧放进内容区渲染。
     */
    renderApp: () => ReactNode
  }
}

/** 给壳帧的一种路由最小信息（base-ui `AppShell`/`Sidebar`/`StatusBar` 亦复用该形状）。 */
export interface ShellRouteInfo {
  path: string
  title: string
  section?: string
}

/** 已注册槽位的名字（即类型化 map 的键全集）。 */
export type FrontendSlotName = keyof FrontendSlotContextMap

/**
 * 运行时存在的槽位名，用于注册时的「未知 slot」校验（fail-closed）。与
 * {@link FrontendSlotContextMap} 的键保持一致。
 */
export const FRONTEND_SLOT_NAMES: readonly FrontendSlotName[] = [
  "root",
  "stock-preview.footer",
  "watchlist.toolbar",
  "analysis.menu",
  "layout.navigation.extra",
  "layout.sidebar.footer",
  "layout.statusbar.right",
  "settings.cards",
]