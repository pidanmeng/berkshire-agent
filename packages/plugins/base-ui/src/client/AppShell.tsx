/**
 * AppShell —— 应用壳（dark-first 终端风）的 **grid 三区域骨架**（下沉到 `@berkshire/base-ui`）。
 *
 * 布局（WP-3 改 grid，见 `AppShell.module.css` 的 `grid-template-areas`）：
 *   ┌──────────┬──────────────┐
 *   │ sidebar  │  statusbar   │   左 = 可扩展侧边栏（Sidebar，跨两行满高）
 *   │          ├──────────────┤
 *   │          │    content   │   右 = 顶栏 StatusBar + 内容区（routes 结果，可滚动）
 *   └──────────┴──────────────┘
 *
 * 壳只做「挂点与契约」：可填充内容（导航项/小组件/状态项/设置卡片）全部经 slot / route /
 * client module 由插件注入；坏插件经 ExtensionBoundary 降级、绝不崩宿主页（fail-closed）。
 * 视觉收敛到 design.md：暗色优先、边框分层、少阴影、语义色只用对的地方；组件复用
 * `@berkshire/ui`（Button/Badge），不手写平行按钮/状态条。
 *
 * 诚实标注：本组件从宿主 `apps/berkshire-agent/src/layout/AppShell.tsx` 迁出并下沉为 base-ui
 * 的 webview 壳插件；插件路由与桥接连通态改由 **prop 注入**（宿主从 `routesStore`/`lib/api`
 * 计算后传入）。折叠态为 webview 内存态（v-next 持久化到 storage 能力缝）；store 作用域、
 * `bk://` 远程 bundle、经 sidecar/root 槽装配（可 disable）仍目标态。
 */
import type { ReactNode } from "react"
import type { ShellRouteInfo, StorageHandle, TitleBarController } from "@berkshire/ui-slots"
import { Sidebar } from "./Sidebar"
import { StatusBar } from "./StatusBar"
import { TitleBar } from "./TitleBar"
import styles from "./AppShell.module.css"

// `ShellRouteInfo`（id/path/title/order）契约单源在共享缝 `@berkshire/ui-slots`，此处直接复用再导出，
// 不再本地重复定义（避免两侧形状漂移，见 ui-slots types.ts）。
export type { ShellRouteInfo } from "@berkshire/ui-slots"

export interface AppShellProps {
  /** 插件自声明路由（宿主 routesStore 快照），供侧边栏导航 + 状态栏标题。 */
  routes: readonly ShellRouteInfo[]
  /** 桥接连通态（宿主经 `lib/api` 探测注入）；`null`=检测中。 */
  bridgeOnline?: boolean | null
  /** 自绘标题栏控制器（WP-5）：宿主经 Rust window command 封装后注入；壳只做呈现/拖拽。 */
  titleBar: TitleBarController
  /** 持久化句柄（宿主经 root 槽注入）：设置弹窗/表单逐字段落 KV 用。 */
  storage: StorageHandle
  /** 右侧内容区（宿主 `<Routes>` 渲染结果）。 */
  children: ReactNode
}

export function AppShell({ routes, bridgeOnline, titleBar, storage, children }: AppShellProps): ReactNode {
  return (
    <div className={styles.shell}>
      {/* grid-area titlebar：顶部自绘标题栏（跨两列，decorations:false 后代替原生栏）。 */}
      <div className={styles.titlebarRegion}>
        <TitleBar controller={titleBar} />
      </div>
      {/* grid-area sidebar：左导航，满高。 */}
      <aside className={styles.sidebarRegion}>
        <Sidebar routes={routes} storage={storage} />
      </aside>
      {/* grid-area statusbar：右上顶栏。 */}
      <div className={styles.statusbarRegion}>
        <StatusBar routes={routes} bridgeOnline={bridgeOnline} />
      </div>
      {/* grid-area content：右下内容区，独立滚动。 */}
      <main className={styles.contentRegion}>{children}</main>
    </div>
  )
}
