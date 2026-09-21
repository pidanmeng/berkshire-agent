/**
 * ButtonGroup —— `@berkshire/ui` 视觉分组的相邻按钮容器（shadcn new-york 结构参照，轻实现）。
 *
 * 纯表现层容器：用 CSS 相邻选择器把直接子元素（通常是 `Button`）裁切/去重相邻圆角与描边，
 * 使一组相邻按钮视觉连成一段——**不承载任何多选/开关逻辑**（那是 `ToggleGroup` 的职责）。
 * `role="group"` + 可选 `disabled` 透传为 `aria-disabled`（不改子元素的可点性，避免侵入
 * 子元素/`Button` 接口）。非侵入：不修改 `Button` 本身，只作用于本容器的后代结构。
 */
import { clsx } from "clsx"
import type { HTMLAttributes, ReactNode } from "react"
import styles from "./ButtonGroup.module.css"

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** 视觉禁用：透传为 `aria-disabled`（声明式，不改子元素可点性）。 */
  disabled?: boolean
  children?: ReactNode
  className?: string
}

export function ButtonGroup({ disabled = false, className, children, ...rest }: ButtonGroupProps) {
  return (
    <div
      role="group"
      aria-disabled={disabled || undefined}
      className={clsx(styles.group, disabled && styles.disabled, className)}
      {...rest}
    >
      {children}
    </div>
  )
}