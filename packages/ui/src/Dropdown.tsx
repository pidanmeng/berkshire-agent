/**
 * Dropdown —— `@berkshire/ui` 自定义菜单下拉。
 *
 * 触发器 + 弹出菜单（渲染为同一 DOM 容器的绝对定位面板，简化定位，不依赖 portal）。
 * 可访问性：trigger 带 `aria-haspopup`/`aria-expanded`/`aria-controls`；打开时按下 ESC 或
 * 点击外部关闭；点击菜单项后关闭并回调。菜单项支持 `disabled`。
 */
import { clsx } from "clsx"
import { useEffect, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import styles from "./Dropdown.module.css"

export interface DropdownItem {
  /** 稳定键。 */
  value: string
  label: string
  disabled?: boolean
}

export interface DropdownProps {
  /** 触发器内容（通常一个 Button/元素）。 */
  trigger: ReactNode
  /** 菜单项。 */
  items: readonly DropdownItem[]
  /** 选中某项回调（value）。 */
  onSelect?: (value: string) => void
  /** 附加 className（透传到容器）。 */
  className?: string
}

export function Dropdown({ trigger, items, onSelect, className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  // ESC 关闭 + 点击外部关闭。
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={clsx(styles.root, className)}>
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false)
          else if ((e.key === "Enter" || e.key === " ") && !open) setOpen(true)
        }}
      >
        {trigger}
      </div>
      {open && (
        <ul id={menuId} role="menu" className={styles.menu}>
          {items.map((it) => (
            <li key={it.value} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={clsx(styles.item, it.disabled && styles.itemDisabled)}
                onClick={() => {
                  setOpen(false)
                  onSelect?.(it.value)
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}