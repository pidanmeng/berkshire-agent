/**
 * Select —— `@berkshire/ui` 原生下拉选择框（样式化 `<select>`）。
 *
 * 走原生 select 以保无障碍与移动端；仅统一视觉（圆角/边框/焦点环/禁用态）。带 `label` 关联与 `hint`。
 */
import { clsx } from "clsx"
import { useId } from "react"
import type { ReactNode, SelectHTMLAttributes } from "react"
import styles from "./Select.module.css"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** 视觉标签（`htmlFor` 关联）。 */
  label?: ReactNode
  /** 可选项。也可自行传 `<option>` child；给 options 时按此渲染。 */
  options?: readonly SelectOption[]
  hint?: ReactNode
}

export function Select({ label, hint, options, id, className, children, disabled, ...rest }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={clsx(styles.field, className)}>
      {label != null && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <div className={styles.wrap}>
        <select
          id={selectId}
          disabled={disabled}
          className={clsx(styles.select, disabled && styles.selectDisabled)}
          {...rest}
        >
          {children ?? options?.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span aria-hidden className={styles.chevron} />
      </div>
      {hint != null && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}