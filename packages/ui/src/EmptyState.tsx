/**
 * EmptyState —— `@berkshire/ui` 空状态占位（对齐 design.md §5.1：图示 + 标题 + 提示）。
 *
 * 不依赖图标库；`icon` 传任意 ReactNode（可放 SVG/lucide）。居中排版，含可选操作区。
 */
import { clsx } from "clsx"
import type { ReactNode } from "react"
import styles from "./EmptyState.module.css"

export interface EmptyStateProps {
  /** 图示（SVG/图标），可空。 */
  icon?: ReactNode
  /** 标题。 */
  title: ReactNode
  /** 引导文案。 */
  description?: ReactNode
  /** 可选操作（按钮等）。 */
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx(styles.empty, className)}>
      {icon != null && <div className={styles.icon}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description != null && <div className={styles.description}>{description}</div>}
      {action != null && <div className={styles.action}>{action}</div>}
    </div>
  )
}