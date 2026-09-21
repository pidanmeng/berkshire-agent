/**
 * StatusBar —— 右侧路由区顶部的状态栏（应用壳，dark-first 终端风；下沉到 `@berkshire/base-ui`）。
 *
 * 左=当前上下文（由当前 pathname 派生：核心路由/插件路由标题）；右=宿主桥接态 + 插件状态槽。
 * - 桥接态：`bridgeOnline` 由 **prop 注入**（宿主经 `lib/api` 探测后传入），本组件只负责呈现，
 *   并复用 `@berkshire/ui` 的 `Badge`（WP-3：语义色只用于 UI 状态——在线=success / 离线=danger
 *   / 检测中=neutral；bull/bear 是价格涨跌语义，不在此混用）。
 * - `layout.statusbar.right` 槽：插件追加状态项（插件自持响应式数据）。
 *
 * 从宿主 `apps/berkshire-agent/src/layout/StatusBar.tsx` 迁出下沉；桥接探测与 `lib/api` 调用留宿主
 * （插件不依赖宿主）。挂点归中枢，状态项内容归插件。
 */
import { useLocation } from "react-router-dom"
import { Badge } from "@berkshire/ui"
import { ExtensionSlot } from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"
import styles from "./StatusBar.module.css"

/** 核心路由显示名（壳自有）。`/theme` 为 dev 工具路由，不在主导航但可地址访问，仍给标题。 */
const CORE_TITLES: Record<string, string> = {
  "/": "首页",
  "/theme": "主题",
}

/** 兜底：连 context 也没有时的缺省标题。 */
const DEFAULT_TITLE = "Berkshire"

export function StatusBar({
  routes,
  bridgeOnline,
}: {
  routes: readonly ShellRouteInfo[]
  bridgeOnline?: boolean | null
}) {
  const { pathname } = useLocation()

  const pluginRoute = routes.find((r) => r.path === pathname)
  const title = CORE_TITLES[pathname] ?? pluginRoute?.title ?? DEFAULT_TITLE

  // 桥接态 → Badge 语义 kind：在线 success / 离线 danger / 检测中 neutral（UI 状态，用成功/危险，
  // 不是 bull/bear——后者只表达价格涨跌）。
  const statusKind = bridgeOnline === null ? "neutral" : bridgeOnline ? "success" : "danger"
  const statusText = bridgeOnline === null ? "检测中" : bridgeOnline ? "在线" : "离线"

  return (
    <header className={styles.statusBar}>
      <div className={styles.context}>{title}</div>
      <div className={styles.right}>
        <span className={styles.bridge} title={statusText}>
          <Badge kind={statusKind}>{statusText}</Badge>
        </span>
        <ExtensionSlot name="layout.statusbar.right" context={{}} />
      </div>
    </header>
  )
}