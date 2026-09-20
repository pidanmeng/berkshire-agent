/**
 * Input —— `@berkshire/ui` 原子文本输入框。
 *
 * 带 `label`（for/id 关联）、`hint`（帮助文案）、`error`（错误态边框+文案）。禁用态、透传 className。
 * 全部走 `var(--bk-*)`，焦点环用强调色令牌。
 */
import { clsx } from "clsx"
import { useId } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"
import styles from "./Input.module.css"

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 视觉标签（`htmlFor` 关联输入框）。 */
  label?: ReactNode
  /** 底部帮助文案。 */
  hint?: ReactNode
  /** 错误态：置边框 + 显示错误文案。 */
  error?: ReactNode
}

export function Input({ label, hint, error, id, className, disabled, ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = hint ? `${inputId}-hint` : undefined
  return (
    <div className={clsx(styles.field, error != null && styles.fieldError, className)}>
      {label != null && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={error != null || undefined}
        aria-describedby={describedBy}
        className={clsx(styles.input, disabled && styles.inputDisabled)}
        {...rest}
      />
      {hint != null && (
        <span className={styles.hint} id={describedBy}>
          {hint}
        </span>
      )}
      {error != null && <span className={styles.error}>{error}</span>}
    </div>
  )
}