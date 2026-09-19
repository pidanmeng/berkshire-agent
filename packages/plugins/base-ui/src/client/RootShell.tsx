/**
 * RootShell —— base-ui 壳帧在共享 `root` 槽的挂载组件（single 语义）。
 *
 * slot 组件只接收 `context`（无法以 `children` 收宿主内容），故 root 槽的 context 约定
 * `renderApp` 渲染 prop：宿主把 `<Routes>` 的渲染封装成 prop 注入，RootShell 解包成
 * `AppShell` 的 prop（routes/bridgeOnline）并把 `renderApp()` 放进内容区渲染。
 *
 * 这使**壳帧从插件图经 `root` 槽贡献**（对齐 dsh `ui-layout` 挂 host 内置 `root` 槽）：
 * 基座仍静态 import base-ui/client，但壳不再是宿主组合的私有件，而是共享缝的 single 槽项。
 *
 * 诚实标注：内容（路由/页面/桥接态）仍由宿主经 context 注入；远程 `bk://` bundle、经
 * sidecar 装配（可 disable）仍目标态。重复注册第二个壳帧会被共享缝 fail-closed 拒绝。
 */
import { AppShell } from "./AppShell"
import type { FrontendSlotContextMap, SlotComponent } from "@berkshire/ui-slots"

/** root 槽的壳帧组件：把 root 槽 context 解包成 `AppShell` 的 prop。 */
export const RootShell: SlotComponent<FrontendSlotContextMap["root"]> = ({ context }) => (
  <AppShell routes={context.routes} bridgeOnline={context.bridgeOnline}>
    {context.renderApp()}
  </AppShell>
)