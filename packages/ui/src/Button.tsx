/**
 * Button —— `@berkshire/ui` 原子按钮。
 *
 * 变体 primary（强调色实底）/ ghost（透明描边）/ danger（危险实底）；尺寸 sm/md/lg；
 * `loading` 时禁用并旋转内置 spinner，`disabled` 直接禁点。颜色/圆角/字号一律 `var(--bk-*)`，
 * 不硬编码。
 */
import { clsx } from "clsx"
import type { ButtonHTMLAttributes, ReactNode } from "react"
import styles from "./Button.module.css"

export type ButtonVariant = "primary" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体。默认 `primary`。 */
  variant?: ButtonVariant
  /** 尺寸。默认 `md`。 */
  size?: ButtonSize
  /** 加载态：禁用并显示 spinner。 */
  loading?: boolean
  children?: ReactNode
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      className={clsx(styles.btn, styles[variant], styles[size], className)}
      {...rest}
    >
      {loading && <span aria-hidden className={styles.spinner} />}
      {children}
    </button>
  )
}