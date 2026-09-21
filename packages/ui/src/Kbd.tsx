/**
 * Kbd —— `@berkshire/ui` 键盘键帽显示（`<kbd>` 元素 + 键帽视觉）。
 *
 * 纯展示、无焦点管理、无快捷键监听；`children` 为键名（如 "⌘K" / "Ctrl"）。
 * 支持 `className` 透传与任意 `<kbd>` 原生属性（如 `aria-label`）。
 *
 * 诚实边界：仅显示键帽，不做任何键盘/快捷键绑定。
 */
import { clsx } from "clsx"
import type { HTMLAttributes, ReactNode } from "react"
import styles from "./Kbd.module.css"

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** 键名文本。 */
  children?: ReactNode
}

export function Kbd({ children, className, ...rest }: KbdProps) {
  return (
    <kbd className={clsx(styles.kbd, className)} {...rest}>
      {children}
    </kbd>
  )
}