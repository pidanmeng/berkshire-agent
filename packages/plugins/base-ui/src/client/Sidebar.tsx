/**
 * Sidebar —— 可扩展侧边栏（应用壳，Vercel 黑白风；下沉到 `@berkshire/base-ui`）。
 *
 * 结构（顶→底）：
 * - 品牌区（折叠/展开开关 + 名称）；
 * - 导航区：核心路由（`/`、`/theme`）pinned + 插件路由按 `section` 分组（经 prop `routes` 注入）；
 * - `layout.navigation.extra` 槽：插件在导航区追加项/分组；
 * - 底部：`layout.sidebar.footer` 槽（插件在设置入口上方追加控制项）+ 固定设置入口（`/settings`）。
 *
 * 每个槽项/可折叠态经 context 传给插件组件；每个槽组件包在 ExtensionBoundary（ExtensionSlot 内建）。
 * 从宿主 `apps/berkshire-agent/src/layout/Sidebar.tsx` 迁出下沉；插件路由改由 prop 注入（不依赖宿主
 * routesStore）。折叠态为 webview 内存态（v-next 持久化），作为 context 传给槽。
 */
import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { clsx } from "clsx"
import { ExtensionSlot } from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"
import styles from "./Sidebar.module.css"

/** 核心 pinned 导航（壳自有，插件不可覆盖；/settings 走底部固定入口）。 */
const CORE_NAV = [
  { path: "/", title: "首页" },
  { path: "/theme", title: "主题" },
] as const

export function Sidebar({ routes }: { routes: readonly ShellRouteInfo[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()

  // 插件路由按 section 分组：缺省走单一默认组（兼容既有声明不配 section）。
  const groups = new Map<string, { path: string; title: string }[]>()
  for (const r of routes) {
    const key = r.section ?? "扩展"
    const list = groups.get(key) ?? []
    list.push({ path: r.path, title: r.title })
    groups.set(key, list)
  }

  const isNavLinkActive = (path: string) => pathname === path

  return (
    <nav className={clsx(styles.sidebar, collapsed && styles.sidebarCollapsed)} aria-label="主导航">
      <div className={styles.brand}>
        <button
          type="button"
          className={styles.collapseToggle}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-label="切换侧边栏折叠"
        >
          {collapsed ? "»" : "«"}
        </button>
        {!collapsed && <span className={styles.brandName}>Berkshire</span>}
      </div>

      {!collapsed && (
        <div className={styles.navSection}>
          {CORE_NAV.map((n) => (
            <NavItem key={n.path} to={n.path} active={isNavLinkActive(n.path)}>
              {n.title}
            </NavItem>
          ))}
        </div>
      )}

      {!collapsed &&
        [...groups.entries()].map(
          ([section, items]) =>
            items.length > 0 && (
              <div key={section} className={styles.navSection}>
                <div className={styles.sectionLabel}>{section}</div>
                {items.map((i) => (
                  <NavItem key={i.path} to={i.path} active={isNavLinkActive(i.path)}>
                    {i.title}
                  </NavItem>
                ))}
              </div>
            ),
        )}

      {/* 插件导航追加项/分组（挂点归中枢，内容归插件）；折叠时 context.collapsed=true。 */}
      <ExtensionSlot name="layout.navigation.extra" context={{ collapsed, pathname }} />

      <div className={styles.footer}>
        <ExtensionSlot name="layout.sidebar.footer" context={{ collapsed }} />
        <Link
          to="/settings"
          className={clsx(styles.settingsEntry, isNavLinkActive("/settings") && styles.settingsActive)}
          title={collapsed ? "设置" : undefined}
        >
          <span className={styles.settingsIcon}>⚙</span>
          {!collapsed && <span>设置</span>}
        </Link>
      </div>
    </nav>
  )
}

function NavItem({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={clsx(styles.navItem, active && styles.navItemActive)}>
      {children}
    </Link>
  )
}