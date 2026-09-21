/**
 * Divider —— `@berkshire/ui` 分隔线（shadcn `Separator` 结构参照，命名 Divider）。
 *
 * 水平/垂直两种朝向，`role="separator"` + `aria-orientation`。纯 `<div>`，间距由消费方布局决定。
 */
import { clsx } from "clsx"
import type { HTMLAttributes } from "react"
import styles from "./Divider.module.css"

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  /** 朝向。默认 `horizontal`。 */
  orientation?: "horizontal" | "vertical"
  className?: string
}

export function Divider({ orientation = "horizontal", className, ...rest }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={clsx(styles.divider, styles[orientation], className)}
      {...rest}
    />
  )
}