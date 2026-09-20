/**
 * `@berkshire/ui-slots` —— 共享 UI 缝引擎入口（webview 侧，对齐 dsh `@dsh-client-ui-slots`）。
 *
 * 从宿主 `apps/berkshire-agent/src/{slots,lib}` 迁出：slot 注册表（`SlotRegistry`/
 * `slotRegistry`/`SLOT_API_VERSION`/`SlotComponent`/`SlotRegistration`）、渲染器
 * （`ExtensionSlot`/`ExtensionBoundary`）、类型化 slot 契约（`FrontendSlotContextMap`/
 * `FrontendSlotName`/`FRONTEND_SLOT_NAMES`）。
 *
 * 宿主与所有插件（含未来的 `@berkshire/base-ui` 壳插件）共同 import 本包——插件不再依赖宿主，
 * 这是把应用壳下沉进插件的前提（结构性解耦）。webview 间的 props 共享、scoped 样式注入等由消费方负责。
 */
export { SLOT_API_VERSION, SLOT_KINDS, SlotRegistry, slotRegistry } from "./registry"
export type { SlotComponent, SlotKind, SlotRegistration } from "./registry"
export { default as ExtensionSlot } from "./ExtensionSlot"
export { ExtensionBoundary } from "./ExtensionBoundary"
export {
  FRONTEND_SLOT_NAMES,
  type FrontendSlotContextMap,
  type FrontendSlotName,
  type ShellRouteInfo,
  type SettingsGroup,
  type TitleBarController,
} from "./types"
export type { PreviewView, WatchlistViewMode } from "./types"
