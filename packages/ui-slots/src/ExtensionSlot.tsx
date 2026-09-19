/**
 * ExtensionSlot 渲染器（T0 最小落点，能力块 A 的挂载面）。
 *
 * 宿主/插件在页面某处放入 `<ExtensionSlot name=… context=…/>`，它按槽位名取出所有注册组件，
 * 按 `order` 顺序渲染，**每个包在 `ExtensionBoundary` 内**——坏插件降级、绝不崩宿主页。
 * `compact` 态失败降级为 null（不留占位），否则显示 muted 横幅 + 控制台日志（由
 * `ExtensionBoundary.componentDidCatch` 负责打日志）。暂无注册也正常渲染空（返回 null）。
 *
 * 诚实标注：本包是**共享 UI 缝引擎**（对齐 dsh `@dsh-client-ui-slots` 的 `renderSlot`），
 * 从宿主 `apps/berkshire-agent/src/slots/ExtensionSlot.tsx` 迁出；sidecar 的 clientModules
 * 快照经宿主 `ClientModuleHost` 汇入注册表（T1）；插件自声明的动态路由页也经本组件按
 * `route.slot` 渲染。挂点/扩展点归共享缝，页面内容仍归插件。
 */
import { useSyncExternalStore, type ReactNode } from "react"
import { ExtensionBoundary } from "./ExtensionBoundary"
import { slotRegistry } from "./registry"
import type { FrontendSlotContextMap, FrontendSlotName } from "./types"
import styles from "./ExtensionSlot.module.css"

interface Props<K extends FrontendSlotName> {
  /** 要渲染的槽位名。 */
  name: K
  /** 宿主/插件注入该槽位的上下文/actions 契约。 */
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
    <div className={styles.slot} data-slot={name}>
      {registrations.map((reg) => {
        const Component = reg.component
        return (
          <ExtensionBoundary
            key={reg.id}
            fallback={
              compact ? null : (
                <div className={styles.banner} role="alert">
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