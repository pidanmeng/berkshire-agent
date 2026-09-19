/**
 * ExtensionSlot 渲染器（T0 最小落点，能力块 A 的挂载面）。
 *
 * 宿主在页面某处放入 `<ExtensionSlot name=… context=…/>`，它按槽位名取出所有注册组件，
 * 按 `order` 顺序渲染，**每个包在 `ExtensionBoundary` 内**——坏插件降级、绝不崩宿主页。
 * `compact` 态失败降级为 null（不留占位），否则显示 muted 横幅 + 控制台日志（由
 * `ExtensionBoundary.componentDidCatch` 负责打日志）。暂无注册也正常渲染空（返回 null）。
 *
 * 诚实标注（T0 边界）：这里只渲染「webview 内已本地注册」的组件（T0 证明渲染器本身）；
 * clientModules 快照驱动挂载（T1）、动态路由（T2）尚未接到本组件。
 */
import { useSyncExternalStore, type ReactNode } from "react"
import { ExtensionBoundary } from "../lib/ExtensionBoundary"
import { slotRegistry } from "./registry"
import type { FrontendSlotContextMap, FrontendSlotName } from "./types"

interface Props<K extends FrontendSlotName> {
  /** 要渲染的槽位名。 */
  name: K
  /** 宿主注入该槽位的上下文/actions 契约。 */
  context: FrontendSlotContextMap[K]
  /** 紧凑模式：失败时降级为 null（不留横幅）。 */
  compact?: boolean
}

export default function ExtensionSlot<K extends FrontendSlotName>({
  name,
  context,
  compact = false,
}: Props<K>): ReactNode {
  // 反应式取该槽注册快照：sidecar 快照（T1）经 ClientModuleHost 注册进 slotRegistry 后，
  // 本组件会自动重渲染；快照由 registry 稳定缓存（useSyncExternalStore 契约）。
  const registrations = useSyncExternalStore(
    (cb) => slotRegistry.subscribe(cb),
    () => slotRegistry.getSnapshot(name),
    () => slotRegistry.getSnapshot(name),
  )
  if (registrations.length === 0) return null // 暂无注册也正常渲染空，不报错。

  return (
    <div className="extension-slot" data-slot={name}>
      {registrations.map((reg) => {
        const Component = reg.component
        return (
          <ExtensionBoundary
            key={reg.id}
            fallback={
              compact ? null : (
                <div className="extension-slot-banner" role="alert">
                  ⚠ 扩展 {reg.id} 暂时不可用（详见控制台日志）。
                </div>
              )
            }
          >
            <Component context={context} />
          </ExtensionBoundary>
        )
      })}
    </div>
  )
}