/**
 * Sidebar —— 可扩展侧边栏（应用壳，dark-first 终端风；下沉到 `@berkshire/base-ui`）。
 *
 * 结构（顶→底）：
 * - 品牌区（折叠/展开开关 + 「Berkshire」品牌标识）：折叠开关复用 `@berkshire/ui` `Button`
 *   （WP-3：不再手写平行按钮）；品牌区克制分层、一个强调色 mark 作收敛的视觉锚。
 * - 导航区：核心路由（`/`）pinned + 插件路由按 `section` 分组（经 prop `routes` 注入）；
 * - `layout.navigation.extra` 槽：插件在导航区追加项/分组；
 * - 底部：`layout.sidebar.footer` 槽（插件在设置入口上方追加控制项）+ 设置入口（点开**设置弹窗**，WP-6）。
 *
 * 每个槽项/可折叠态经 context 传给插件组件；每个槽组件包在 ExtensionBoundary（ExtensionSlot 内建）。
 * 从宿主 `apps/berkshire-agent/src/layout/Sidebar.tsx` 迁出下沉；插件路由改由 prop 注入（不依赖宿主
 * routesStore）。折叠态为 webview 内存态（v-next 持久化），作为 context 传给槽。
 * 满高由 AppShell grid 的 sidebar 区域提供（本组件 `height: 100%`，不再写死 100vh）。
 */
import { useState, type ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { clsx } from "clsx"
import { Button } from "@berkshire/ui"
import { ExtensionSlot, type StorageHandle } from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"
import { SettingsDialog } from "./SettingsDialog"
import styles from "./Sidebar.module.css"

/**
 * 核心 pinned 导航（壳自有，插件不可覆盖；设置走底部入口打开弹窗，非路由）。
 * 产品取舍（WP-4）：`/theme`（主题对照页）是设计/开发期的主题验证工具，移出消费者导向的
 * 主导航；它仍是受核心路由保护的、可地址访问的 dev 工具路由（见 core `CORE_ROUTE_PATHS`）。
 */
const CORE_NAV = [{ path: "/", title: "首页" }] as const

export function Sidebar({ routes, storage }: { routes: readonly ShellRouteInfo[]; storage: StorageHandle }) {
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
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
        <Button
          variant="ghost"
          size="sm"
          className={styles.collapseToggle}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-label="切换侧边栏折叠"
        >
          {collapsed ? "»" : "«"}
        </Button>
        {!collapsed && (
          <span className={styles.brandWord}>
            {/* 品牌 mark：accent 作品牌区收敛色（WP-1 未令牌化品牌专用色 `#8B5CF6`，故用强调色顶替，
                仅出现在品牌区，不扩散到功能语义）。品牌字用等宽加强终端感。 */}
            <span className={styles.brandMark} aria-hidden />
            <span className={styles.brandName}>Berkshire</span>
          </span>
        )}
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
        {/* WP-6：设置入口从路由页改为打开设置弹窗（/settings 路由已移除）。 */}
        <Button
          variant="ghost"
          size="sm"
          className={clsx(styles.settingsEntry, collapsed && styles.settingsEntryCollapsed)}
          onClick={() => setSettingsOpen(true)}
          title={collapsed ? "设置" : "打开设置"}
        >
          <span className={styles.settingsIcon} aria-hidden>
            ⚙
          </span>
          {!collapsed && <span>设置</span>}
        </Button>
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} storage={storage} />
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