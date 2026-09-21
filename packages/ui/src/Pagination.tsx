/**
 * Pagination —— `@berkshire/ui` 分页（shadcn 结构参照）。
 *
 * 受控分页条：`page` + `totalPages` + `onPageChange` 三足支撑；渲染上一页/下一页图标钮、
 * 首末页与当前区间数字页、区间断口用省略号（`…`）占位。页码按钮复用 `Button` 的幽灵/强调
 * 基础态（`Button` 内部照常处理 focus 环与 hover 叠层），省略号为纯非交互占位。
 *
 * 可访问性：外层 `<nav aria-label>` 声明导航语义；当前页钮标 `aria-current="page"`；
 * 首/末边界自动 `disabled`；页钮与方向钮均为键盘可达按钮。
 *
 * 诚实边界（未实现）：无数据源分页绑定（数据总量/切片由消费方自管）；无链接式路由页
 * （不做 `react-router` / `<a href>` 页态）；页码省略窗口固定为当前 ±1，不支持可配置窗口。
 * 纯 `@berkshire/ui` 原子组件，不耦合 `Table`/`DataTable`（组合留给 S4）。
 */
import { clsx } from "clsx"
import type { ReactNode } from "react"
import { Button } from "./Button"
import styles from "./Pagination.module.css"

/** 单页即非交互省略号占位（内部件，不对外暴露）。 */
function PaginationEllipsis() {
  return (
    <span aria-hidden className={styles.ellipsis}>
      …
    </span>
  )
}

/** 上一页/下一页图标（无依赖内联 SVG，`aria-hidden` 由方向钮的文本标签兜底）。 */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir === "left" ? (
        <path d="m15 18-6-6 6-6" />
      ) : (
        <path d="m9 18 6-6-6-6" />
      )}
    </svg>
  )
}

/**
 * 计算要展示的页号序列（含省略号断口）。
 * 恒展示首末页；首末与当前区间之间若断层则插省略号。
 */
function getPageItems(
  totalPages: number,
  current: number,
): Array<{ type: "page"; value: number } | { type: "ellipsis"; key: string }> {
  const set = new Set<number>()
  if (totalPages < 1) return []
  set.add(1)
  for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) {
    set.add(i)
  }
  if (totalPages > 1) set.add(totalPages)
  const sorted = [...set].sort((a, b) => a - b)
  const items: Array<{ type: "page"; value: number } | { type: "ellipsis"; key: string }> = []
  let prev = 0
  for (const value of sorted) {
    if (value - prev > 1) items.push({ type: "ellipsis", key: `ellipsis-${prev}-${value}` })
    items.push({ type: "page", value })
    prev = value
  }
  return items
}

export interface PaginationProps {
  /** 当前页（1 起始）。越界值会被 clamp 到 `[1, totalPages]` 渲染。 */
  page: number
  /** 总页数。`<1` 时视为 1（仅渲染单页当前钮）。 */
  totalPages: number
  /** 页码变更回调；`disabled` 边界（首/末）不会回调。 */
  onPageChange: (page: number) => void
  /** 透传到 `<nav>`。 */
  className?: string
  /** 导航语义标签。默认中文「分页」。 */
  ariaLabel?: string
  /** 上一页/下一页钮的 `aria-label` 与 `title` 文本。 */
  previousLabel?: string
  nextLabel?: string
  /** 方向钮内容；缺省为内联 chevron 图标（`aria-hidden`）。 */
  previousIcon?: ReactNode
  nextIcon?: ReactNode
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  ariaLabel = "分页",
  previousLabel = "上一页",
  nextLabel = "下一页",
  previousIcon,
  nextIcon,
}: PaginationProps) {
  const count = totalPages < 1 ? 1 : totalPages
  const current = Math.min(Math.max(page, 1), count)
  const items = getPageItems(count, current)
  const showPrev = current > 1
  const showNext = current < count

  return (
    <nav aria-label={ariaLabel} className={clsx(styles.root, className)}>
      {/* 上一页：当前页 > 1 时可点 */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.dir}
        aria-label={previousLabel}
        title={previousLabel}
        disabled={!showPrev}
        onClick={() => showPrev && onPageChange(current - 1)}
      >
        {previousIcon ?? <Chevron dir="left" />}
      </Button>

      {items.map((item) =>
        item.type === "ellipsis" ? (
          <PaginationEllipsis key={item.key} />
        ) : item.value === current ? (
          <Button
            key={item.value}
            type="button"
            variant="primary"
            size="sm"
            aria-current="page"
            className={styles.page}
          >
            {item.value}
          </Button>
        ) : (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="sm"
            className={styles.page}
            onClick={() => onPageChange(item.value)}
          >
            {item.value}
          </Button>
        ),
      )}

      {/* 下一页：当前页 < 总页数时可点 */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.dir}
        aria-label={nextLabel}
        title={nextLabel}
        disabled={!showNext}
        onClick={() => showNext && onPageChange(current + 1)}
      >
        {nextIcon ?? <Chevron dir="right" />}
      </Button>
    </nav>
  )
}