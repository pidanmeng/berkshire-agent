/**
 * StatusBar —— 右侧路由区顶部的状态栏（应用壳，Vercel 黑白风；下沉到 `@berkshire/base-ui`）。
 *
 * 左=当前上下文（由当前 pathname 派生：核心路由/插件路由标题）；右=宿主桥接态 + 插件状态槽。
 * - 桥接态：`bridgeOnline` 由 **prop 注入**（宿主经 `lib/api` 探测后传入），本组件只做呈现。
 * - `layout.statusbar.right` 槽：插件追加状态项（插件自持响应式数据）。
 *
 * 从宿主 `apps/berkshire-agent/src/layout/StatusBar.tsx` 迁出下沉；桥接探测与 `lib/api` 调用留宿主
 * （插件不依赖宿主）。挂点归中枢，状态项内容归插件。
 */
import { useLocation } from "react-router-dom"
import { ExtensionSlot } from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"
import styles from "./StatusBar.module.css"

/** 核心路由显示名（壳自有）。 */
const CORE_TITLES: Record<string, string> = {
  "/": "首页",
  "/theme": "主题",
  "/settings": "设置",
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

  return (
    <header className={styles.statusBar}>
      <div className={styles.context}>{title}</div>
      <div className={styles.right}>
        <span
          className={bridgeOnline === null ? styles.dotUnknown : bridgeOnline ? styles.dotOnline : styles.dotOffline}
          title={bridgeOnline === null ? "检测中…" : bridgeOnline ? "桥接在线" : "桥接离线"}
        >
          {bridgeOnline === null ? "检测中" : bridgeOnline ? "在线" : "离线"}
        </span>
        <ExtensionSlot name="layout.statusbar.right" context={{}} />
      </div>
    </header>
  )
}