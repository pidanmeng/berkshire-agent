/**
 * base-ui 壳帧在共享 `root` 单例槽的注册（注册即效应）。
 *
 * 把 {@link RootShell} 注册进共享 `slotRegistry` 的内置 `root` 槽（single 语义）。返回可逆
 * disposer；宿主在装配 base-ui 时调用即可把壳帧挂到 root 槽（其余槽项照常由 ClientModuleHost
 * 汇入）。重复注册第二个壳帧会被共享缝 fail-closed 拒绝。
 */
import { slotRegistry } from "@berkshire/ui-slots"
import { RootShell } from "./RootShell"

/** base-ui 壳帧在 root 槽的稳定注册 id（owner:name 命名空间式）。 */
export const BASE_UI_SHELL_ID = "base-ui:shell" as const

/** 把 base-ui 壳帧注册进内置 `root` 槽；返回可逆 disposer。
 *
 * 幂等：若该槽已存在 `base-ui:shell` 注册（如 dev HMR/fast-refresh 重求值本模块），
 * 直接返回空 disposer——避免触发 `root` 槽 single 语义的重复注册 fail-closed 拒绝。
 */
export function registerRootShell(): () => void {
  if (slotRegistry.getSnapshot("root").some((r) => r.id === BASE_UI_SHELL_ID)) {
    return () => {}
  }
  return slotRegistry.register("root", {
    id: BASE_UI_SHELL_ID,
    component: RootShell,
  })
}