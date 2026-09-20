/**
 * Badge —— `@berkshire/ui` 小徽标（状态/语义标签）。
 *
 * kind 覆盖 neutral / info / success / warning / danger / accent / bull / bear。soft 底 + 语义色文字。
 */
import { clsx } from "clsx"
import type { ReactNode } from "react"
import styles from "./Badge.module.css"

export type BadgeKind = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "bull" | "bear"

export interface BadgeProps {
  kind?: BadgeKind
  children?: ReactNode
  className?: string
}

export function Badge({ kind = "neutral", children, className }: BadgeProps) {
  return <span className={clsx(styles.badge, styles[kind], className)}>{children}</span>
}