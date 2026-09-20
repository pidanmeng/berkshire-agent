/**
 * Tooltip —— `@berkshire/ui` 简易提示（hover / focus 显示）。
 *
 * 图标/按钮包一层；tip 经 `aria-describedby` 关联。纯 CSS 显隐（wrapper hover/focus-within）。
 */
import { useId } from "react"
import type { ReactNode } from "react"
import styles from "./Tooltip.module.css"

export interface TooltipProps {
  /** 触发元素。 */
  children: ReactNode
  /** 提示文案。 */
  tip: ReactNode
  /** 相对位置。默认 top。 */
  placement?: "top" | "bottom" | "left" | "right"
}

export function Tooltip({ children, tip, placement = "top" }: TooltipProps) {
  const id = useId()
  return (
    <span className={styles.wrap}>
      <span className={styles.trigger} aria-describedby={id}>
        {children}
      </span>
      <span role="tooltip" id={id} className={`${styles.tip} ${styles[placement]}`}>
        {tip}
      </span>
    </span>
  )
}