/**
 * Checkbox —— `@berkshire/ui` 复选框（shadcn new-york 视觉，轻实现无 Radix）。
 *
 * 底层为原生 `<input type="checkbox">`（视觉隐藏 + `:checked`/`:focus-visible` 驱动样式），
 * 保证键盘可达与表单语义（`label` 包裹可整区域点按）。受控（`checked`）与非受控
 * （`defaultChecked`）均可；`onCheckedChange` 收布尔值，原生 `onChange` 仍透传。
 * 可选 `label` 渲染为可见文本（默认纯盒子）。
 */
import { clsx } from "clsx"
import { useId } from "react"
import type { InputHTMLAttributes, ReactNode } from "react"
import styles from "./Checkbox.module.css"

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> {
  /** 受控：选中状态。 */
  checked?: boolean
  /** 非受控：默认选中状态。 */
  defaultChecked?: boolean
  /** 选中变化回调（布尔值）。 */
  onCheckedChange?: (checked: boolean) => void
  /** 可选的可见标签文案（渲染于盒子旁）。 */
  label?: ReactNode
  className?: string
}

export function Checkbox({
  checked,
  defaultChecked,
  onCheckedChange,
  label,
  disabled,
  className,
  id,
  onChange,
  ...rest
}: CheckboxProps) {
  const autoId = useId()
  const checkId = id ?? autoId
  return (
    <span className={clsx(styles.group, className)}>
      <label className={clsx(styles.box, disabled && styles.disabled)}>
        <input
          type="checkbox"
          id={checkId}
          className={styles.input}
          {...(checked !== undefined ? { checked } : { defaultChecked })}
          disabled={disabled}
          onChange={(e) => {
            onChange?.(e)
            onCheckedChange?.(e.target.checked)
          }}
          {...rest}
        />
        <span aria-hidden className={styles.indicator}>
          <svg className={styles.check} viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5.4 4.3 7.6 8 2.8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        {label != null && <span className={styles.label}>{label}</span>}
      </label>
    </span>
  )
}