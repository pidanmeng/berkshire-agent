/**
 * SettingsPage —— 核心路由 `/settings` 的设置页宿主（应用壳；下沉到 `@berkshire/base-ui`）。
 *
 * 功能：`settings.cards` 槽宿主——插件经槽追加设置卡片/分组；每张卡片包在 ExtensionBoundary
 * （ExtensionSlot 内建）。暂无注册时渲染空态、不报错（fail-closed）。挂点归中枢、卡片内容归插件。
 * 核心路由 `/settings` 不可被插件覆盖（CORE_ROUTE_PATHS）。从宿主 `src/layout/SettingsPage.tsx` 迁出下沉。
 */
import type { ReactNode } from "react"
import { ExtensionSlot } from "@berkshire/ui-slots"
import styles from "./SettingsPage.module.css"

export function SettingsPage(): ReactNode {
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>设置</h1>
      <p className={styles.hint}>
        插件可在此追加设置卡片/分组（slot <code>settings.cards</code>）；暂无注册时为空态。
      </p>
      <div className={styles.cards}>
        <ExtensionSlot name="settings.cards" context={{}} />
      </div>
    </section>
  )
}