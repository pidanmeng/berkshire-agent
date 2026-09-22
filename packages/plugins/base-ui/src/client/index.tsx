/**
 * `@berkshire/base-ui/client` —— webview 壳插件入口。
 *
 * 承载应用壳（AppShell 网格 + Sidebar 可扩展侧边栏 + StatusBar 状态栏 + SettingsDialog 设置弹窗）
 * 与各自 CSS Modules。从宿主 `apps/berkshire-agent/src/layout/*` 迁出下沉：壳组件只依赖共享的
 * `@berkshire/ui-slots`（slot 引擎）与 `react-router-dom`/`clsx`，**不依赖宿主**——插件路由与桥接态
 * 由宿主经 prop 注入（见 `AppShellProps.routes` / `bridgeOnline`）。
 *
 * 宿主经此入口静态 import（BK 现实中间步，仍静态打包，非 `bk://` 运行时拉取）。
 * 对齐 dsh：本包对应 `ui-layout`（壳）+ 部分 `ui-primitives`（基础壳件）的角色；
 * 壳帧经 {@link registerRootShell} 注册进共享 `root` 槽（single 语义）。经 sidecar 装配
 * （可 disable、宿主=纯入口）仍目标态（后续步骤）。
 */
export { AppShell, type AppShellProps, type ShellRouteInfo } from "./AppShell"
export { Sidebar } from "./Sidebar"
export {
  CORE_NAV,
  DEFAULT_SIDEBAR_PRESET_ID,
  SIDEBAR_PRESETS,
  SIDEBAR_NS,
  SIDEBAR_ITEMS_KEY,
  SIDEBAR_PRESET_KEY,
  buildBaseItems,
  resolveSidebarItems,
  useSidebarItems,
} from "./sidebarItems"
export type {
  SidebarItem,
  SidebarItemOverride,
  SidebarPreset,
  SidebarPresetId,
} from "./sidebarItems"
export { StatusBar } from "./StatusBar"
export { TitleBar } from "./TitleBar"
export type { TitleBarController } from "@berkshire/ui-slots"
export { SettingsDialog } from "./SettingsDialog"
export { ThemePalettePage } from "./ThemePalettePage"
export { TokenSwatch } from "./TokenSwatch"
export { RootShell } from "./RootShell"
export { registerRootShell, BASE_UI_SHELL_ID } from "./registerRootShell"
export { installThemedRoot, THEME_STYLE_ID } from "./installThemedRoot"
export { DEFAULT_SETTINGS_GROUPS, DEFAULT_SETTINGS_GROUP_IDS } from "./settingsGroups"
export type { SettingsGroup } from "@berkshire/ui-slots"
