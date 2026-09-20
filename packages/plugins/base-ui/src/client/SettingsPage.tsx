/**
 * SettingsPage —— 核心路由 `/settings` 的设置页宿主（应用壳；下沉到 `@berkshire/base-ui`）。
 *
 * 功能（WP-3）：
 * - **设置分组占位骨架**：渲染 `DEFAULT_SETTINGS_GROUPS`（通用 / 模型）的只读列表，作为分组
 *   契约的可见承载；真正设置弹窗/表单由 **WP-6** 消费，本页显式标注「占位 / UI 在 WP-6」。
 * - `settings.cards` 槽宿主：插件经槽追加设置卡片，context 携带 `settingsGroups`（分组契约）
 *   供卡片按组挂载；每张卡片包在 ExtensionBoundary（ExtensionSlot 内建）。暂无注册则空态
 *   fail-closed 不报错。挂点归中枢、卡片内容归插件。
 *
 * 核心路由 `/settings` 不可被插件覆盖（CORE_ROUTE_PATHS）。从宿主 `src/layout/SettingsPage.tsx` 迁出下沉。
 */
import type { ReactNode } from "react"
import { ExtensionSlot } from "@berkshire/ui-slots"
import { DEFAULT_SETTINGS_GROUPS } from "./settingsGroups"
import styles from "./SettingsPage.module.css"

export function SettingsPage(): ReactNode {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>设置</h1>
      <p className={styles.hint}>
        通用设置 / 模型设置分组占位骨架在此呈现；分组弹窗与表单由 WP-6 消费落地（此处为占位）。
      </p>

      {/* 设置分组占位承载（契约可见面；弹窗 UI 是 WP-6，勿当已实现消费）。 */}
      <div className={styles.groups} aria-label="设置分组（占位）">
        <h2 className={styles.groupsTitle}>设置分组（占位骨架）</h2>
        {DEFAULT_SETTINGS_GROUPS.map((g) => (
          <div key={g.id} className={styles.groupRow}>
            <span className={styles.groupName}>{g.label}</span>
            <code className={styles.groupId}>{g.id}</code>
            <span className={styles.groupNote}>{g.description}</span>
            <span className={styles.groupOrder} aria-label={`顺序 ${g.order}`}>
              #{g.order}
            </span>
          </div>
        ))}
        <p className={styles.placeholderNote}>★ 占位：真正设置弹窗/表单在 WP-6；此处仅定义分组 id / label / 顺序。</p>
      </div>

      <div className={styles.cards}>
        <ExtensionSlot name="settings.cards" context={{ settingsGroups: DEFAULT_SETTINGS_GROUPS }} />
      </div>
    </section>
  )
}