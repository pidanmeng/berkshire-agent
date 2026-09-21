/**
 * Breadcrumb —— `@berkshire/ui` 面包屑导航（shadcn new-york 结构参照，纯表现层原子组件）。
 *
 * 双形态：
 * - **组合形态**（`children`）：`Breadcrumb`(nav) 包 `BreadcrumbList`(ol)，内放
 *   `BreadcrumbItem`(li) → `BreadcrumbLink`(a) / `BreadcrumbPage`(当前页, aria-current="page")，
 *   项间以 `BreadcrumbSeparator`(装饰, aria-hidden) 分隔；可折叠由 `BreadcrumbEllipsis` 手动表达。
 * - **数组形态**（`items`）：`Breadcrumb items={[{label,href},…]} maxItems={n}` 自动渲染层级项与
 *   分隔符，末项为当前页；当项数超过 `maxItems` 时把中间项折叠为可点的省略「…」（点击展开全部）。
 *
 * 语义化：`nav aria-label` + `<ol>/<li>`，分隔符纯装饰（`aria-hidden`），当前页 `aria-current="page"`。
 * 样式全 `var(--bk-*)`、零魔法色值、暗色单表；组件零主题选择器。
 */
import { clsx } from "clsx"
import { Fragment, useState } from "react"
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import styles from "./Breadcrumb.module.css"

/** 数组形态的单条路径项。 */
export interface BreadcrumbEntry {
  /** 项内容（通常为文本）。 */
  label: ReactNode
  /** 父项跳转地址；省略则渲染为纯文本 crumb（按钮态当前页亦可传 href）。 */
  href?: string
  /** 强制标记为当前页（`aria-current="page"`）；不设则默认末项为当前页。 */
  isCurrent?: boolean
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  /** `nav` 的可访问标签。默认 `"Breadcrumb"`。 */
  label?: string
  /** 数组形态的路径项（提供则自动渲染层级 + 分隔符 + 折叠）。 */
  items?: readonly BreadcrumbEntry[]
  /** 折叠阈值：项数超过它时折叠中间项为省略「…」。仅对 `items` 形态生效。 */
  maxItems?: number
  /** 组合形态的子树（通常为单个 `<BreadcrumbList>`）。 */
  children?: ReactNode
  className?: string
}

export interface BreadcrumbListProps extends HTMLAttributes<HTMLOListElement> {
  children?: ReactNode
  className?: string
}

export interface BreadcrumbItemProps extends HTMLAttributes<HTMLLIElement> {
  children?: ReactNode
  className?: string
}

export interface BreadcrumbLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode
  className?: string
}

export interface BreadcrumbPageProps extends HTMLAttributes<HTMLSpanElement> {
  /** 当前页也可带链接（渲染为 `<a aria-current="page">`）。 */
  href?: string
  children?: ReactNode
  className?: string
}

export interface BreadcrumbSeparatorProps extends HTMLAttributes<HTMLLIElement> {
  /** 分隔符内容；默认 `›`。纯装饰（`aria-hidden`）。 */
  children?: ReactNode
  className?: string
}

export interface BreadcrumbEllipsisProps extends HTMLAttributes<HTMLLIElement> {
  className?: string
}

/** `nav aria-label`：面包屑根容器。组合形态里包 `<BreadcrumbList>`。 */
export function Breadcrumb({
  label = "Breadcrumb",
  items,
  maxItems,
  className,
  children,
  ...rest
}: BreadcrumbProps) {
  const [expanded, setExpanded] = useState(false)
  return (
    <nav aria-label={label} className={clsx(styles.root, className)} {...rest}>
      {items ? (
        <BreadcrumbItems items={items} maxItems={maxItems} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      ) : (
        children
      )}
    </nav>
  )
}

/** `<ol>` 层级列表容器。 */
export function BreadcrumbList({ className, children, ...rest }: BreadcrumbListProps) {
  return (
    <ol className={clsx(styles.list, className)} {...rest}>
      {children}
    </ol>
  )
}

/** `<li>` 单个路径项。 */
export function BreadcrumbItem({ className, children, ...rest }: BreadcrumbItemProps) {
  return (
    <li className={clsx(styles.item, className)} {...rest}>
      {children}
    </li>
  )
}

/** 父级跳转链接（主色 + hover 下划线）。 */
export function BreadcrumbLink({ className, children, ...rest }: BreadcrumbLinkProps) {
  return (
    <a className={clsx(styles.crumb, className)} {...rest}>
      {children}
    </a>
  )
}

/** 当前页（`aria-current="page"`）；传 `href` 时渲染为链接变体。 */
export function BreadcrumbPage({ href, className, children, ...rest }: BreadcrumbPageProps) {
  if (href) {
    return (
      <a aria-current="page" href={href} className={clsx(styles.page, styles.pageLink, className)} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <span aria-current="page" className={clsx(styles.page, className)} {...rest}>
      {children}
    </span>
  )
}

/** 装饰性分隔符（`aria-hidden`，默认 `›`）。 */
export function BreadcrumbSeparator({ className, children, ...rest }: BreadcrumbSeparatorProps) {
  return (
    <li role="presentation" className={clsx(styles.item, styles.separator, className)} {...rest}>
      <span aria-hidden>{children ?? "›"}</span>
    </li>
  )
}

/** 手动折叠省略项（组合形态用）：静态「…」，无语义。 */
export function BreadcrumbEllipsis({ className, ...rest }: BreadcrumbEllipsisProps) {
  return (
    <li aria-hidden className={clsx(styles.item, styles.ellipsisStatic, className)} {...rest}>
      <span>…</span>
    </li>
  )
}

/** 数组形态渲染：按 slots（项/省略）逐槽输出，槽间插分隔符；末项为当前页。 */
function BreadcrumbItems({
  items,
  maxItems,
  expanded,
  onToggle,
}: {
  items: readonly BreadcrumbEntry[]
  maxItems?: number
  expanded: boolean
  onToggle: () => void
}) {
  const lastEntry = items[items.length - 1]
  const collapsed = maxItems != null && maxItems >= 2 && items.length > maxItems && !expanded

  // 组装「槽」：组合列表 —— 首项 +（省略号）+ 末段；折叠时中间项被省略替代。
  const slots: ({ type: "item"; entry: BreadcrumbEntry } | { type: "ellipsis" })[] = []
  if (collapsed) {
    const tailCount = Math.max(maxItems! - 2, 1)
    const head = [items[0]!]
    const tail = items.slice(-tailCount)
    slots.push(...head.map((entry) => ({ type: "item" as const, entry })))
    if (head.length + tail.length < items.length) slots.push({ type: "ellipsis" })
    slots.push(...tail.map((entry) => ({ type: "item" as const, entry })))
  } else {
    slots.push(...items.map((entry) => ({ type: "item" as const, entry })))
  }

  return (
    <ol className={styles.list}>
      {slots.map((slot, i) => (
        <Fragment key={i}>
          {i > 0 && <BreadcrumbSeparator />}
          {slot.type === "ellipsis" ? (
            <li className={styles.item}>
              <button
                type="button"
                className={styles.ellipsis}
                onClick={onToggle}
                aria-label="展开全部导航路径"
                title="展开全部导航路径"
              >
                …
              </button>
            </li>
          ) : (
            (() => {
              const entry = slot.entry
              const isCurrent = entry.isCurrent ?? entry === lastEntry
              const isLink = !isCurrent && !!entry.href
              return (
                <li className={styles.item}>
                  {isCurrent ? (
                    <BreadcrumbPage href={entry.href}>{entry.label}</BreadcrumbPage>
                  ) : isLink ? (
                    <BreadcrumbLink href={entry.href}>{entry.label}</BreadcrumbLink>
                  ) : (
                    <span className={styles.crumbPlain}>{entry.label}</span>
                  )}
                </li>
              )
            })()
          )}
        </Fragment>
      ))}
    </ol>
  )
}