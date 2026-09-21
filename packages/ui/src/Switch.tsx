/**
 * Switch —— `@berkshire/ui` 开关（shadcn new-york 视觉，轻实现无 Radix）。
 *
 * 语义为 `<button role="switch">` + `aria-checked`，键盘可达（原生 button 支持 Space/Enter）。
 * 受控用法：传 `checked` + `onCheckedChange`。`label` 作为无障碍名，缺省 "切换"。
 */
import { clsx } from "clsx"
import type { ButtonHTMLAttributes } from "react"
import styles from "./Switch.module.css"

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /** 开关状态（受控）。 */
  checked: boolean
  /** 状态变化回调。 */
  onCheckedChange?: (checked: boolean) => void
  /** 无障碍名（`aria-label`，无可见文本时的可读名）。 */
  label?: string
  className?: string
}

export function Switch({ checked, onCheckedChange, label = "切换", disabled, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={clsx(styles.switch, checked && styles.on, disabled && styles.disabled, className)}
      {...rest}
    >
      <span aria-hidden className={styles.thumb} />
    </button>
  )
}