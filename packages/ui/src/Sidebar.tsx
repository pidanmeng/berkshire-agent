/**
 * Sidebar —— `@berkshire/ui` 通用可折叠导航侧栏原语族（shadcn `Sidebar` 移植）。
 *
 * 边界（S1 决策，见 `.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`）：
 * 本包是**通用导航原语**，与 `@berkshire/base-ui` 应用壳侧的 `Sidebar`（壳业务导航实例：消费
 * 路由快照/StorageHandle/壳槽的「多槽业务侧栏」）是**两物**。本原语不得依赖路由/持久化/壳槽，
 * 作为可复用件供任意插件/内部页面使用；壳 `Sidebar` 保留为壳私有实例，**不受本组件影响**。
 * 壳后续重构为消费通用原语属目标态（base-ui 包变更），不在本器件范围。
 *
 * 形态（组合式原语族，稳定 props）：
 * - `Sidebar`（根，自管折叠态）：渲染 `<nav>`，接受受控 `collapsed` + `onCollapseChange`
 *   （或非受控 `defaultCollapsed`），内联设置展开/折叠宽度（px，`width`/`collapsedWidth`）。
 * - `SidebarHeader`/`SidebarContent`/`SidebarFooter`：上/中/下三段布局（中段 `flex:1` 可滚动）。
 * - `SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`：导航列表语义（`<ul>`/`<li>`/`<button>`）。
 * - `SidebarCollapseTrigger`：折叠/展开切换按钮，`aria-expanded` + 键盘可达。
 *
 * 折叠行为：折叠时容器宽度收窄，仅图标或隐藏标签；菜单项通过 `icon`/`label` 双通道表达，
 * 折叠态仅渲染图标并用 `Tooltip`（`@berkshire/ui`）在悬停/聚焦给出完整标签文本（可选增强）。
 * 内容区超长由 `SidebarContent` 内置 `overflow-y:auto` 处理；如需自绘滚动条可组合 `ScrollArea`
 * （S2 落地件）作为可选替换。
 *
 * 可访问性：根 `<nav aria-label>`（默认「侧边栏」）；菜单项激活态经 `active` 透传
 * `aria-current="page"`（可选；不做路由联动，激活态由消费方传入）；折叠/展开开关为原生
 * `<button>`（键盘可达）+ `aria-expanded` + `aria-label`。
 *
 * 诚实边界：**不做**响应式移动端抽屉/overlay 模式（目标态）、**不做**路由联动激活态
 * （本原语无路由依赖）；激活态只认消费方传入的 `active`。`items` 数组形态非本器件承诺，
 * 组合式子节点 JSX 是唯一稳定的形态。
 *
 * 依赖纪律：只 import `react` + `clsx`；不引 Radix / 导航类库。样式全 `var(--bk-*)`，禁魔法色值。
 */
import { clsx } from "clsx"
import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react"
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react"
import { Tooltip } from "./Tooltip"
import styles from "./Sidebar.module.css"

/** 折叠态上下文：根 `Sidebar` 提供给子件（折叠开关/菜单按钮）使用。 */
interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
})

/** 读取当前 `Sidebar` 的折叠态（未包在 `Sidebar` 内时为安全默认）。 */
export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext)
}

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** 侧栏内容（通常为 `SidebarHeader`/`SidebarContent`/`SidebarFooter` 组合）。 */
  children: ReactNode
  /** 受控折叠态。 */
  collapsed?: boolean
  /** 折叠态变更回调（受控配合；非受控时也调用）。 */
  onCollapseChange?: (collapsed: boolean) => void
  /** 非受控初始折叠态。默认 `false`。 */
  defaultCollapsed?: boolean
  /** 展开态宽度（px）。默认 `240`。 */
  width?: number
  /** 折叠态宽度（px）。默认 `56`。 */
  collapsedWidth?: number
  /** 根 `<nav>` 的可访问名称。默认「侧边栏」。 */
  ariaLabel?: string
}

export function Sidebar({
  children,
  collapsed: collapsedProp,
  onCollapseChange,
  defaultCollapsed = false,
  width = 240,
  collapsedWidth = 56,
  ariaLabel = "侧边栏",
  className,
  style,
  ...rest
}: SidebarProps) {
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed)
  // 受控优先；`collapsedProp === undefined` 时为非受控本地态。
  const collapsed = collapsedProp ?? innerCollapsed

  const toggle = useCallback(() => {
    const next = !collapsed
    if (collapsedProp === undefined) setInnerCollapsed(next)
    onCollapseChange?.(next)
  }, [collapsed, collapsedProp, onCollapseChange])

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <nav
        aria-label={ariaLabel}
        className={clsx(styles.root, collapsed && styles.rootCollapsed, className)}
        style={{ width: collapsed ? collapsedWidth : width, ...style } as CSSProperties}
        {...rest}
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  )
}

export interface SidebarHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function SidebarHeader({ children, className, ...rest }: SidebarHeaderProps) {
  return (
    <div className={clsx(styles.header, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function SidebarContent({ children, className, ...rest }: SidebarContentProps) {
  return (
    <div className={clsx(styles.content, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function SidebarFooter({ children, className, ...rest }: SidebarFooterProps) {
  return (
    <div className={clsx(styles.footer, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarMenuProps extends HTMLAttributes<HTMLUListElement> {
  children: ReactNode
}

export function SidebarMenu({ children, className, ...rest }: SidebarMenuProps) {
  return (
    <ul className={clsx(styles.menu, className)} {...rest}>
      {children}
    </ul>
  )
}

export interface SidebarMenuItemProps extends HTMLAttributes<HTMLLIElement> {
  children: ReactNode
}

export function SidebarMenuItem({ children, className, ...rest }: SidebarMenuItemProps) {
  return (
    <li className={clsx(styles.menuItem, className)} {...rest}>
      {children}
    </li>
  )
}

export interface SidebarMenuButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 图标（折叠态仅渲染图标）。可选；无图标时折叠态仅剩 `label` 的 aria/tooltip。 */
  icon?: ReactNode
  /** 标签文本：展开态视作按钮文案，折叠态用作 `aria-label`/`Tooltip`。 */
  label?: string
  /** 激活态：透传 `aria-current="page"` 并叠加激活样式。不做路由联动，由消费方传入。 */
  active?: boolean
}

export function SidebarMenuButton({
  icon,
  label,
  active = false,
  className,
  children,
  ...rest
}: SidebarMenuButtonProps) {
  const { collapsed } = useSidebar()
  const labelText = label
  const button = (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? labelText : undefined}
      title={collapsed ? labelText : undefined}
      className={clsx(
        styles.menuButton,
        collapsed && styles.menuButtonCollapsed,
        active && styles.menuButtonActive,
        className,
      )}
      {...rest}
    >
      {icon && (
        <span aria-hidden className={styles.menuIcon}>
          {icon}
        </span>
      )}
      {!collapsed && <span className={styles.menuLabel}>{children ?? labelText}</span>}
      {/* 无图标项：折叠态下隐藏文案，靠 title/aria/tooltip 表达标签。 */}
      {collapsed && !icon && <span className={styles.menuIconOnly} aria-hidden />}
    </button>
  )

  // 折叠态 + 有标签：用 `Tooltip` 在悬停/聚焦给出完整标签（可选增强）。
  if (collapsed && labelText) {
    return <Tooltip placement="right" tip={labelText}>{button}</Tooltip>
  }
  return button
}

export interface SidebarCollapseTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 展开态图标（children）。默认 `«`。 */
  children?: ReactNode
  /** 折叠展开标签。 */
  label?: string
}

export function SidebarCollapseTrigger({
  children = <span aria-hidden>«</span>,
  label = "折叠/展开侧边栏",
  className,
  ...rest
}: SidebarCollapseTriggerProps) {
  const { collapsed, toggle } = useSidebar()
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={label}
      className={clsx(styles.collapseTrigger, className)}
      onClick={toggle}
      {...rest}
    >
      {children}
    </button>
  )
}