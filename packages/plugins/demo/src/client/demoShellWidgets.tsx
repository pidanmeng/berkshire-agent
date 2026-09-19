/**
 * demo 插件 webview 半身第 4 块（应用壳布局挂点证明）：sidebar 导航追加项 + 状态栏状态项 + 设置卡片。
 *
 * 类名来自插件独立打包阶段编译产物 `./styles.generated.ts`（P3：lightningcss 哈希 CSS Modules）。
 * 三组件分别挂进应用壳新增的布局槽：
 * - `layout.navigation.extra`（DemoNavExtra）：证明侧边栏导航区可被插件追加项；
 * - `layout.statusbar.right`（DemoStatusItem）：证明状态栏右侧可被插件追加状态项；
 * - `settings.cards`（DemoSettingsCard）：证明设置页可被插件追加卡片。
 * 各 context 是对宿主 `slots/types.ts` 对应槽上下文的**结构镜像**（v2 共享类型层）。
 */
import type { ReactNode } from "react"
import { navExtra, statusItem, settingsCard } from "./styles.generated"

/** 言行 `layout.navigation.extra` 槽上下文的插件侧结构。 */
interface NavExtraContext {
  collapsed?: boolean
  pathname?: string
}

/** `layout.navigation.extra`：侧边栏导航区追加的 demo 导航提醒项。 */
export const DemoNavExtra = ({ context }: { context: unknown }): ReactNode => {
  const c = context as NavExtraContext
  return (
    <div className={navExtra.classNames.navExtra}>
      demo 导航追加项 <code>layout.navigation.extra</code>
      <div>折叠={String(c.collapsed === true)} · 当前路径={c.pathname ?? "?"}</div>
    </div>
  )
}

/** `layout.statusbar.right`：状态栏右侧追加的 demo 状态项。 */
export const DemoStatusItem = (_: { context: unknown }): ReactNode => (
  <span className={statusItem.classNames.statusItem}>
    <span className={statusItem.classNames.statusDot} />
    demo 状态项
  </span>
)

/** `settings.cards`：设置页追加的 demo 设置卡片。 */
export const DemoSettingsCard = (_: { context: unknown }): ReactNode => (
  <section className={settingsCard.classNames.settingsCard}>
    <h2 className={settingsCard.classNames.settingsCardTitle}>demo 设置卡片</h2>
    由 <code>@berkshire/plugin-demo</code> 贡献，挂在 <code>settings.cards</code> 槽（挂点归中枢、内容归插件）。
  </section>
)