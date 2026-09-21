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
import { usePersistedField, type StorageHandle, type StorageNamespaceId } from "@berkshire/ui-slots"
import { navExtra, statusItem, settingsCard, settingsSection } from "./styles.generated"

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

/** `settings.cards`：设置弹窗聚合展示的 demo 设置卡片（旧设置卡片槽）。 */
export const DemoSettingsCard = (_: { context: unknown }): ReactNode => (
  <section className={settingsCard.classNames.settingsCard}>
    <h2 className={settingsCard.classNames.settingsCardTitle}>demo 设置卡片</h2>
    由 <code>@berkshire/plugin-demo</code> 贡献，挂在 <code>settings.cards</code> 槽（挂点归中枢、内容归插件）。
  </section>
)

/** `settings.section` 槽的插件侧结构镜像（携带宿主/壳注入的持久化句柄）。 */
interface SettingsSectionContext {
  /** 持久化句柄（设置弹窗注入）：本面板把每个表单项落成 `demo` 命名空间下的一个 KV。 */
  storage?: StorageHandle
}

/**
 * `settings.section`：设置弹窗「插件设置」分组贡献的 demo 设置表单面板（WP-6 设置 Seam 证明消费者）。
 *
 * WP-7 起接入持久化管线：从 context 取 `storage` 句柄，每个表单项经 `usePersistedField` 落成一个
 * KV（`$BK_HOME/state/demo/<key>.json`，本插件用 `demo` 命名空间）——"设置里的每个表单项对应一个 KV"，
 * 无论面板来自哪个 provider。宿主/壳未注入句柄时退化为纯本地态（不崩溃）。
 */
export const DemoSettingsSection = ({ context }: { context: unknown }): ReactNode => {
  const storage = (context as SettingsSectionContext).storage
  const ns = "demo" as StorageNamespaceId
  const limit = usePersistedField(storage, ns, "watchlistLimit", { defaultValue: "50" })
  const sort = usePersistedField(storage, ns, "defaultSort", { defaultValue: "byCode" })
  return (
    <section className={settingsSection.classNames.section}>
      <h2 className={settingsSection.classNames.title}>自选列表（demo）</h2>
      <p className={settingsSection.classNames.hint}>
        挂在 <code>settings.section</code> 槽——字段变更即写入 <code>$BK_HOME/state/demo/…</code>（每项一个 KV）。
      </p>
      <label className={settingsSection.classNames.row}>
        <span>自选上限</span>
        <select
          className={settingsSection.classNames.select}
          value={limit.value}
          onChange={(e) => limit.set(e.target.value)}
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </label>
      <label className={settingsSection.classNames.row}>
        <span>默认排序</span>
        <select
          className={settingsSection.classNames.select}
          value={sort.value}
          onChange={(e) => sort.set(e.target.value)}
        >
          <option value="byCode">按代码</option>
          <option value="byChange">按涨跌幅</option>
          <option value="byAmount">按成交额</option>
        </select>
      </label>
      <p className={settingsSection.classNames.note}>
        {limit.error ?? sort.error ??
          "demo 设置项落盘在 demo 命名空间（watchlistLimit / defaultSort），重启后保留。"}
      </p>
    </section>
  )
}