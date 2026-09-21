/**
 * Badge —— `@berkshire/ui` 小徽标（状态/语义标签）。
 *
 * kind 覆盖 neutral / info / success / warning / danger / accent / bull / bear（语义色）。
 * `variant` 提供三档视觉：`soft`（弱化底 + 语义色文字，默认）/ `solid`（语义色实底 + 反色文字）/
 * `outline`（透明底 + 语义色描边）。默认 soft，向后兼容既有消费方。
 *
 * 实现注记：`soft` 无专属 CSS 类——soft 依赖各 kind 类自带的语义色淡化底（Badge.module.css 里
 * `background: var(--bk-color-*-soft)`），故 `styles[variant="soft"]` 为空、由 kind 的 soft 底色兜底；
 * `solid`/`outline` 才有专属类覆盖。默认值即落在这条路径，使用上无影响。
 */
import { clsx } from "clsx"
import type { ReactNode } from "react"
import styles from "./Badge.module.css"

export type BadgeKind = "neutral" | "info" | "success" | "warning" | "danger" | "accent" | "bull" | "bear"

/** 徽标视觉变体：soft（默认）/ solid / outline。 */
export type BadgeVariant = "soft" | "solid" | "outline"

export interface BadgeProps {
  kind?: BadgeKind
  /** 视觉变体。默认 `soft`。 */
  variant?: BadgeVariant
  children?: ReactNode
  className?: string
}

export function Badge({ kind = "neutral", variant = "soft", children, className }: BadgeProps) {
  return <span className={clsx(styles.badge, styles[kind], styles[variant], className)}>{children}</span>
}