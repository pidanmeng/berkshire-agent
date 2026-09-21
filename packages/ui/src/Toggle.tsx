/**
 * Toggle —— `@berkshire/ui` 单选开关（shadcn new-york 结构参照，轻实现无 Radix）。
 *
 * 语义为 `<button aria-pressed>`：按下态即「开启」；键盘可达（原生 button 支持 Space/Enter）。
 * 受控用法：传 `pressed` + `onPressedChange`（`pressed` 缺省时退化为非受控 `defaultPressed`）。
 * `disabled` 直接禁点（样式走 `:disabled` opacity）。`ToggleGroup` 内部以它为原子，见
 * ToggleGroup 的组态注入（单选 `role="radio"`/多选保持 `aria-pressed`）。
 */
import { clsx } from "clsx"
import { useState } from "react"
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react"
import styles from "./Toggle.module.css"

export interface ToggleProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** 受控：按下的开启态。缺省时用内部非受控状态。 */
  pressed?: boolean
  /** 非受控：初始开启态。默认 `false`。 */
  defaultPressed?: boolean
  /** 开启态变化回调（点击触发，收布尔值）。 */
  onPressedChange?: (pressed: boolean) => void
  children?: ReactNode
  className?: string
}

export function Toggle({
  pressed,
  defaultPressed = false,
  onPressedChange,
  className,
  children,
  onClick,
  ...rest
}: ToggleProps) {
  const [inner, setInner] = useState(defaultPressed)
  const current = pressed ?? inner

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    const next = !current
    onPressedChange?.(next)
    if (pressed === undefined) setInner(next)
    onClick?.(e)
  }

  return (
    <button
      type="button"
      aria-pressed={current}
      onClick={handleClick}
      className={clsx(styles.toggle, current && styles.on, className)}
      {...rest}
    >
      {children}
    </button>
  )
}