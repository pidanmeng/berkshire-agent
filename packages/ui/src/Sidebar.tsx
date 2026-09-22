/**
 * Sidebar —— `@berkshire/ui` 通用可折叠导航侧栏原语族（shadcn `Sidebar` 移植，自实现无 Radix）。
 *
 * 对齐 shadcn 官方 `Sidebar` 的**复合家族命名与组合**，落地于本包可复用导航原语。因本包无
 * `@base-ui/react` 的 `render`/`useRender`（asChild）原语，也不引 Tailwind/`cva`/`cn`，故：
 * - **无 `render`（asChild）**：`SidebarMenuButton`/`SidebarMenuSubButton` 渲染为原生
 *   `<button>`/`<a>`；消费方需要自定义触发元素时，在按钮 `onClick` 里自行导航（base-ui 壳即
 *   用 `onClick` + `useNavigate`），或以 `render` 目标为实现自定的方式（见文件头诚实边界）。
 * - **折叠语义简化**：shadcn 用 `SidebarProvider` 上下文 + `state`（expanded/collapsed）+ 响应式
 *   offcanvas（移动端 Sheet）。本原语保持既有的「根 `Sidebar` 自管折叠态 + `useSidebar()` 下发」，
 *   并新增 `SidebarProvider` 作为可选的上下文提供方（组件族既可在 `<Sidebar>` 根内使用，也可在
 *   `<SidebarProvider>` 包裹时消费其 `collapsed`）。**移动端 offcanvas / 抽屉模式（经 Sheet）与
 *   桌面 gap/inset 布局为「目标态」**——详见文件头诚实边界。
 * - **激活态**：由消费方经 `active` 传入（不做路由联动），与既有 API 一致。
 *
 * 边界（承继既有决策，见 `.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`
 * 「Sidebar 边界」）：本包是**通用导航原语**，与 `@berkshire/base-ui` 应用壳侧的 `Sidebar`（壳业务
 * 导航实例）是两物；本原语不得依赖路由/持久化/壳槽。壳后续重构为消费本通用家族属 base-ui 包变更。
 *
 * 诚实边界（未实现 → 目标态）：
 * - **不做**移动端抽屉/offcanvas（经 `Sheet` 的 `SidebarProvider` 响应式 overlay）、`SidebarRail`
 *   拖拽、`SidebarGroupAction` 的 hover-reveal、`SidebarMenuSkeleton` 的骨架态（`SidebarRail`/
 *   `SidebarInset` 两个子件本身已提供为常驻窄条与内容内嵌容器，拖拽与 gap 动画语义仍目标态）；
 * - `SidebarMenuButton` 只支持 `variant`(`default`/`outline`) 与 `size`(`default`/`sm`/`lg`)，不做
 *   `tooltip`（折叠态提示由壳在 `onClick` 侧另用 Tooltip，或直接在 `menuListCollapsed` 时展示 label）。
 *
 * 依赖纪律：只 import `react` + `clsx`；不引 Radix/导航类库。样式全 `var(--bk-*)`，禁魔法色值。
 */
import { clsx } from "clsx"
import { createContext, useCallback, useContext, useState } from "react"
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react"
import styles from "./Sidebar.module.css"

/** 折叠态上下文：根 `Sidebar`（或 `SidebarProvider`）提供给子件（菜单按钮/折叠开关）使用。 */
interface SidebarContextValue {
  collapsed: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

/**
 * 读取当前侧栏的折叠态。未包在 `Sidebar`/`SidebarProvider` 内时返回安全默认（`collapsed:false`），
 * 不抛错——保证可在任意位置单独使用菜单子件。
 */
export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext) ?? { collapsed: false, toggle: () => {} }
}

/* ─────────────────────────── SidebarProvider ─────────────────────────── */

export interface SidebarProviderProps extends HTMLAttributes<HTMLElement> {
  /** 受控折叠态。 */
  collapsed?: boolean
  /** 折叠态变更回调（受控配合）。 */
  onCollapseChange?: (collapsed: boolean) => void
  /** 非受控初始折叠态。默认 `false`。 */
  defaultCollapsed?: boolean
  children?: ReactNode
}

/**
 * `SidebarProvider`（shadcn 语义适配）：可选的上下文提供方，给下方所有 `Sidebar` 子件共享折叠态。
 * 与根 `Sidebar` 自管折叠二选一；一般在全局布局（如 root 槽壳帧）用 Provider 统一管理折叠态，
 * 再让具体 `Sidebar` 消费。
 */
export function SidebarProvider({
  collapsed: collapsedProp,
  onCollapseChange,
  defaultCollapsed = false,
  children,
  className,
  ...rest
}: SidebarProviderProps) {
  const [inner, setInner] = useState(defaultCollapsed)
  const collapsed = collapsedProp ?? inner
  const toggle = useCallback(() => {
    const next = !collapsed
    if (collapsedProp === undefined) setInner(next)
    onCollapseChange?.(next)
  }, [collapsed, collapsedProp, onCollapseChange])

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div className={clsx(className)} {...rest}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

/* ─────────────────────────────── Sidebar ─────────────────────────────── */

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

/**
 * `Sidebar` 根：自管理折叠态（或消费外层 `SidebarProvider`），渲染 `<nav>`，内联设置展开/折叠宽度。
 */
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

/* ───────────────────────────── 三段布局 ──────────────────────────────── */

export interface SidebarHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarHeader`：上段（品牌/折叠开关区）。 */
export function SidebarHeader({ children, className, ...rest }: SidebarHeaderProps) {
  return (
    <div className={clsx(styles.header, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarContent`：中段导航滚动区（`flex:1` + `overflow-y:auto`）。 */
export function SidebarContent({ children, className, ...rest }: SidebarContentProps) {
  return (
    <div className={clsx(styles.content, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarFooter`：下段（设置等底部固定区）。 */
export function SidebarFooter({ children, className, ...rest }: SidebarFooterProps) {
  return (
    <div className={clsx(styles.footer, className)} {...rest}>
      {children}
    </div>
  )
}

/* ───────────────────────────── 分组（Group） ──────────────────────────── */

export interface SidebarGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarGroup`：一组导航（含 `SidebarGroupLabel` 与可选 `SidebarGroupContent`）。 */
export function SidebarGroup({ children, className, ...rest }: SidebarGroupProps) {
  return (
    <div className={clsx(styles.group, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarGroupLabelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarGroupLabel`：分组标签（小字号大写弱化，折叠态隐藏文本）。 */
export function SidebarGroupLabel({ children, className, ...rest }: SidebarGroupLabelProps) {
  const { collapsed } = useSidebar()
  return (
    <div className={clsx(styles.groupLabel, collapsed && styles.groupLabelCollapsed, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarGroupContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarGroupContent`：分组内容（通常放 `SidebarMenu`）。 */
export function SidebarGroupContent({ children, className, ...rest }: SidebarGroupContentProps) {
  return (
    <div className={clsx(styles.groupContent, className)} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarGroupActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
}

/** `SidebarGroupAction`：分组右上动作按钮（hover 显现为「目标态」，当前常显）。 */
export function SidebarGroupAction({ children, className, ...rest }: SidebarGroupActionProps) {
  return (
    <button type="button" className={clsx(styles.groupAction, className)} {...rest}>
      {children}
    </button>
  )
}

/* ───────────────────────────── 菜单（Menu） ──────────────────────────── */

export interface SidebarMenuProps extends HTMLAttributes<HTMLUListElement> {
  children?: ReactNode
}

/** `SidebarMenu`：菜单列表（`<ul>`）。 */
export function SidebarMenu({ children, className, ...rest }: SidebarMenuProps) {
  return (
    <ul className={clsx(styles.menu, className)} {...rest}>
      {children}
    </ul>
  )
}

export interface SidebarMenuItemProps extends HTMLAttributes<HTMLLIElement> {
  children?: ReactNode
}

/** `SidebarMenuItem`：菜单项（`<li>`）。 */
export function SidebarMenuItem({ children, className, ...rest }: SidebarMenuItemProps) {
  return (
    <li className={clsx(styles.menuItem, className)} {...rest}>
      {children}
    </li>
  )
}

export interface SidebarMenuButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** 图标（折叠态仅渲染图标）。可选；无图标时折叠态仅剩 label 的 aria。 */
  icon?: ReactNode
  /** 标签文本：展开态视作按钮文案，折叠态用作 `aria-label`。 */
  label?: string
  /** 激活态：透传 `aria-current="page"` 并叠加激活样式。不做路由联动，由消费方传入。 */
  active?: boolean
  /** 视觉变体。默认 `default`。 */
  variant?: "default" | "outline"
  /** 尺寸。默认 `default`。 */
  size?: "default" | "sm" | "lg"
  children?: ReactNode
}

/**
 * `SidebarMenuButton`：菜单按钮（原生 `<button>`）。折叠态仅渲染 `icon`（若有），否则保留可点热区；
 * 激活态弱化强调底 + 左强调竖条。无 asChild；消费方需导航时在 `onClick` 里自管（base-ui 用
 * `onClick` + `useNavigate`）。
 */
export function SidebarMenuButton({
  icon,
  label,
  active = false,
  variant = "default",
  size = "default",
  className,
  children,
  ...rest
}: SidebarMenuButtonProps) {
  const { collapsed } = useSidebar()
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-label={collapsed && label ? label : undefined}
      className={clsx(
        styles.menuButton,
        styles[variant],
        styles[size],
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
      {!collapsed && (children ?? label != null) && <span className={styles.menuLabel}>{children ?? label}</span>}
      {collapsed && !icon && <span className={styles.menuIconOnly} aria-hidden />}
    </button>
  )
}

export interface SidebarMenuActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
  /** hover 显现（目标态表示 hover 才显；当前常显）。 */
  showOnHover?: boolean
}

/** `SidebarMenuAction`：菜单项右侧动作按钮。 */
export function SidebarMenuAction({ children, className, showOnHover = false, ...rest }: SidebarMenuActionProps) {
  return (
    <button
      type="button"
      className={clsx(styles.menuAction, showOnHover && styles.menuActionShowOnHover, className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface SidebarMenuBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode
}

/** `SidebarMenuBadge`：菜单项右侧徽标（折叠态隐藏）。 */
export function SidebarMenuBadge({ children, className, ...rest }: SidebarMenuBadgeProps) {
  const { collapsed } = useSidebar()
  if (collapsed) return null
  return (
    <span className={clsx(styles.menuBadge, className)} {...rest}>
      {children}
    </span>
  )
}

/* ───────────────────────────── 子菜单（MenuSub） ─────────────────────── */

export interface SidebarMenuSubProps extends HTMLAttributes<HTMLUListElement> {
  children?: ReactNode
}

/** `SidebarMenuSub`：子菜单（缩进 + 左缘竖线；折叠态隐藏）。 */
export function SidebarMenuSub({ children, className, ...rest }: SidebarMenuSubProps) {
  const { collapsed } = useSidebar()
  if (collapsed) return null
  return (
    <ul className={clsx(styles.menuSub, className)} {...rest}>
      {children}
    </ul>
  )
}

export interface SidebarMenuSubItemProps extends HTMLAttributes<HTMLLIElement> {
  children?: ReactNode
}

/** `SidebarMenuSubItem`：子菜单项（`<li>`）。 */
export function SidebarMenuSubItem({ children, className, ...rest }: SidebarMenuSubItemProps) {
  return (
    <li className={clsx(styles.menuSubItem, className)} {...rest}>
      {children}
    </li>
  )
}

export interface SidebarMenuSubButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** 尺寸。默认 `md`。 */
  size?: "sm" | "md"
  /** 激活态。 */
  active?: boolean
  children?: ReactNode
}

/** `SidebarMenuSubButton`：子菜单按钮（`<a>`；缺省无 href，消费方传入）。 */
export function SidebarMenuSubButton({
  size = "md",
  active = false,
  className,
  children,
  ...rest
}: SidebarMenuSubButtonProps) {
  return (
    <a
      aria-current={active ? "page" : undefined}
      className={clsx(styles.menuSubButton, styles[size], active && styles.menuSubButtonActive, className)}
      {...rest}
    >
      {children}
    </a>
  )
}

/* ───────────────────────────── 其它 + 折叠 ──────────────────────────── */

export interface SidebarInputProps extends InputHTMLAttributes<HTMLInputElement> {
  children?: ReactNode
}

/** `SidebarInput`：侧栏内搜索/输入框（原生 `<input>` 视觉，宽度自适应）。 */
export function SidebarInput({ className, ...rest }: SidebarInputProps) {
  return <input className={clsx(styles.sidebarInput, className)} {...rest} />
}

export interface SidebarSeparatorProps extends HTMLAttributes<HTMLDivElement> {}

/** `SidebarSeparator`：侧栏内分隔线。 */
export function SidebarSeparator({ className, ...rest }: SidebarSeparatorProps) {
  return <div role="separator" aria-orientation="horizontal" className={clsx(styles.separator, className)} {...rest} />
}

export interface SidebarRailProps extends HTMLAttributes<HTMLDivElement> {
  /** 副触发器（非交互装饰时留空；可为 `SidebarCollapseTrigger` 的窄态外壳）。 */
  children?: ReactNode
  /** 细条宽（px）。默认 `16`。 */
  width?: number
  /** 可访问名称。默认「切换侧边栏」；children 已承载时置空避免重复。 */
  ariaLabel?: string
}

/**
 * `SidebarRail`：侧栏右侧的窄「轨道」条（shadcn 桌面 gap 布局的一条细竖轨，通常放折叠触发
 * 或纯装饰分隔）。本实装是**可折叠侧栏之外的常驻窄条**：无面板、无拖拽；`children` 空时渲染
 * 一个等宽的纯视觉分隔轨（`role="none"`）。
 */
export function SidebarRail({ children, width = 16, ariaLabel = "切换侧边栏", className, ...rest }: SidebarRailProps) {
  if (!children) {
    return <div role="none" className={clsx(styles.rail, className)} style={{ width }} {...rest} />
  }
  return (
    <div className={clsx(styles.railInteract, className)} style={{ width }} {...rest}>
      {children}
    </div>
  )
}

export interface SidebarInsetProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `SidebarInset`：与侧栏并排的主内容「内嵌区」（shadcn 桌面侧栏 + 内容 gap 布局的右翼容器）。 */
export function SidebarInset({ children, className, ...rest }: SidebarInsetProps) {
  return (
    <main className={clsx(styles.inset, className)} {...rest}>
      {children}
    </main>
  )
}

export interface SidebarTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
}

/** `SidebarTrigger`：折叠/展开切换按钮（`aria-expanded` + 键盘可达）。 */
export function SidebarTrigger({ children = <span aria-hidden>«</span>, className, ...rest }: SidebarTriggerProps) {
  const { collapsed, toggle } = useSidebar()
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
      className={clsx(styles.collapseTrigger, className)}
      onClick={toggle}
      {...rest}
    >
      {children}
    </button>
  )
}

/** `SidebarCollapseTrigger`：`SidebarTrigger` 的向后兼容别名（更贴近既有命名）。 */
export function SidebarCollapseTrigger(props: SidebarTriggerProps) {
  return <SidebarTrigger {...props} />
}

/** `SidebarCollapseTriggerProps`：=`SidebarTriggerProps` 的向后兼容类型别名。 */
export type SidebarCollapseTriggerProps = SidebarTriggerProps