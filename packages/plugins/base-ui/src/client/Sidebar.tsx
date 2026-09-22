/**
 * Sidebar —— 可扩展侧边栏（应用壳，shadcn 克制分层；下沉到 `@berkshire/base-ui`）。
 *
 * 结构（顶→底）由 `@berkshire/ui` 的 `Sidebar` **原语族**组合而来（不再手写平行骨架）：
 * - `Sidebar`（根）：管折叠态（受控 `collapsed` + `onCollapseChange`）与展开/折叠宽度；
 * - `SidebarHeader`：品牌区。折叠开关复用库 `SidebarCollapseTrigger`；品牌区克制分层、
 *   一个强调色 mark 作收敛的视觉锚，下缘以分隔线收束（库 Header 自带边框）。
 * - `SidebarContent`（独立滚动）：**一条扁平导航列表**——壳自有核心（`/` 首页）与全部插件
 *   自声明页面**同权**排布（不再按 `section` 分组、「扩展」组已取消），导航项用库
 *   `SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`（`useNavigate` 导航 + `active` 激活态，
 *   激活项以弱化强调底 + 左侧强调色竖条作信息层级锚）；排布顺序 = 声明序（sidecar
 *   `routes/list` 已按 `order` 排好，首页 order 0 在前）；`layout.navigation.extra` 槽让插件追加项。
 *   生效列表经 `useSidebarItems` 合并「声明 + 持久化覆盖/预设」得出——为 v-next 设置弹窗的
 *   排序/隐藏/切换预设留好出口（见 `sidebarItems.ts`），首页与插件页同走一个模型（同权）。
 * - `SidebarFooter`：`layout.sidebar.footer` 槽（插件在设置入口上方追加控制项）+ 设置入口（打开
 *   **设置弹窗**，WP-6）。
 *
 * 每个槽项/可折叠态经 context 传给插件组件；每个槽组件包在 ExtensionBoundary（ExtensionSlot 内建）。
 * 从宿主 `apps/berkshire-agent/src/layout/Sidebar.tsx` 迁出下沉；插件路由改由 prop 注入（不依赖宿主
 * routesStore）。折叠态为 webview 内存态（v-next 持久化），作为 context 传给槽。
 * 满高由 AppShell grid 的 sidebar 区域提供（库 `Sidebar` 根 `height:100%`，宽度内联）。
 */
import { useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Button,
  Sidebar as UiSidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarCollapseTrigger,
  useSidebar,
} from "@berkshire/ui"
import { ExtensionSlot, type StorageHandle } from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"
import { CORE_NAV, useSidebarItems, type SidebarItem } from "./sidebarItems"
import { SettingsDialog } from "./SettingsDialog"
import styles from "./Sidebar.module.css"

export function Sidebar({ routes, storage }: { routes: readonly ShellRouteInfo[]; storage: StorageHandle }) {
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 生效导航项：声明序 + 持久化覆盖/预设合并（v-next 设置弹窗排序/隐藏/预设切换的出口，见 sidebarItems.ts）。
  const { items } = useSidebarItems(routes, storage)

  return (
    <UiSidebar
      collapsed={collapsed}
      onCollapseChange={setCollapsed}
      ariaLabel="主导航"
      width={224}
      collapsedWidth={56}
    >
      <SidebarHeader className={styles.brand}>
        <BrandWord />
        <SidebarCollapseTrigger aria-label="切换侧边栏折叠" className={styles.collapseToggle} />
      </SidebarHeader>

      <SidebarContent className={styles.navScroll}>
        <NavList items={items} />
        {/* 插件导航追加项（挂点归中枢，内容归插件）；折叠态经 useSidebar 上下文读。 */}
        <PluginNavExtra />
      </SidebarContent>

      <SidebarFooter>
        <div className={styles.footer}>
          <PluginFooter />
          <SettingsEntry collapsed={collapsed} onClick={() => setSettingsOpen(true)} />
        </div>
      </SidebarFooter>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} storage={storage} />
    </UiSidebar>
  )
}

/** 品牌 mark + 字（折叠态仅 mark；折叠态从库 `useSidebar` 上下文读）。 */
function BrandWord(): ReactNode {
  const { collapsed } = useSidebar()
  return (
    <span className={styles.brandWord}>
      {/* 品牌 mark：accent 作品牌区收敛色（避免魔法色值，见 WP-1 取舍），仅出现在品牌区。 */}
      <span className={styles.brandMark} aria-hidden />
      {!collapsed && <span className={styles.brandName}>Berkshire</span>}
    </span>
  )
}

/** `layout.navigation.extra`：插件导航追加项（折叠态与当前路由从 useSidebar/useLocation 读）。 */
function PluginNavExtra(): ReactNode {
  const { collapsed } = useSidebar()
  const { pathname } = useLocation()
  return <ExtensionSlot name="layout.navigation.extra" context={{ collapsed, pathname }} />
}

/** `layout.sidebar.footer`：插件在设置入口上方追加的控制项（折叠态从 useSidebar 读）。 */
function PluginFooter(): ReactNode {
  const { collapsed } = useSidebar()
  return <ExtensionSlot name="layout.sidebar.footer" context={{ collapsed }} />
}

function SettingsEntry({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }): ReactNode {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={styles.settingsEntry}
      onClick={onClick}
      title="打开设置"
    >
      <span className={styles.settingsIcon} aria-hidden>
        ⚙
      </span>
      {!collapsed && <span>设置</span>}
    </Button>
  )
}

/**
 * 导航滚动区内容：**一条扁平导航列表**（首页 + 全部插件页面同权，无分组）。
 * 折叠态下当前导航项无 icon、无文字通道，只保留核心（首页）可点（对齐库折叠语意）。
 */
function NavList({ items }: { items: readonly SidebarItem[] }): ReactNode {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { collapsed } = useSidebar()

  // 折叠态只保留核心 pinned（首页）：插件项无 icon 通道，折叠后无可读入口（后续给项加 icon 时再放开）。
  const visible = collapsed ? items.filter((i) => i.id === CORE_NAV[0]!.id) : items

  return (
    <SidebarMenu>
      {visible.map((i) => (
        <SidebarMenuItem key={i.id}>
          <SidebarMenuButton label={i.title} active={pathname === i.path} onClick={() => navigate(i.path)}>
            {i.title}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
