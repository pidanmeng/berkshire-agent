/**
 * AppShell —— 应用壳（Vercel 黑白风）的网格骨架（下沉到 `@berkshire/base-ui`）。
 *
 * 布局：左 = 可扩展侧边栏（Sidebar），右 = 主列（顶部状态栏 StatusBar + 内容区 <Routes> 结果）。
 * 壳只做「挂点与契约」：可填充内容（导航项/小组件/状态项/设置卡片）全部经 slot / route /
 * client module 由插件注入；坏插件经 ExtensionBoundary 降级、绝不崩宿主页（fail-closed）。
 *
 * 诚实标注：本组件从宿主 `apps/berkshire-agent/src/layout/AppShell.tsx` 迁出并下沉为 base-ui
 * 的 webview 壳插件；为保持插件不依赖宿主，插件路由与桥接连通态改由**prop 注入**（宿主从
 * `routesStore`/`lib/api` 计算后传入）。折叠态为 webview 内存态（v-next 持久化到 storage 能力缝）；
 * store 作用域、`bk://` 远程 bundle、经 sidecar/root 槽装配（可 disable）仍目标态。
 */
import type { ReactNode } from "react"
import { Sidebar } from "./Sidebar"
import { StatusBar } from "./StatusBar"
import styles from "./AppShell.module.css"

/** 给壳的插件路由最小信息（宿主 routesStore 快照的子集，供侧边栏分组 + 状态栏标题）。 */
export interface ShellRouteInfo {
  path: string
  title: string
  section?: string
}

export interface AppShellProps {
  /** 插件自声明路由（宿主 routesStore 快照），供侧边栏分组导航 + 状态栏标题。 */
  routes: readonly ShellRouteInfo[]
  /** 桥接连通态（宿主经 `lib/api` 探测注入）；`null`=检测中。 */
  bridgeOnline?: boolean | null
  /** 右侧路由区内容（宿主 `<Routes>` 渲染结果）。 */
  children: ReactNode
}

export function AppShell({ routes, bridgeOnline, children }: AppShellProps): ReactNode {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Sidebar routes={routes} />
      </aside>
      <div className={styles.mainColumn}>
        <StatusBar routes={routes} bridgeOnline={bridgeOnline} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}