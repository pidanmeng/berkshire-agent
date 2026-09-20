/**
 * Notification —— `@berkshire/ui` 内联反馈块（非 Toast）。
 *
 * kind: error/success/info/warning；soft 底 + 强调左边框/标题色。用于表单旁/页面内嵌警示。
 */
import { clsx } from "clsx"
import type { ReactNode } from "react"
import styles from "./Notification.module.css"

export type NotificationKind = "error" | "success" | "info" | "warning"

export interface NotificationProps {
  kind?: NotificationKind
  title?: ReactNode
  children?: ReactNode
  className?: string
}

export function Notification({ kind = "info", title, children, className }: NotificationProps) {
  return (
    <div role="status" className={clsx(styles.notification, styles[kind], className)}>
      {title != null && <div className={styles.title}>{title}</div>}
      {children != null && <div className={styles.body}>{children}</div>}
    </div>
  )
}