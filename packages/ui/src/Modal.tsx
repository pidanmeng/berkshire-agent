/**
 * Modal —— `@berkshire/ui` 模态对话框。
 *
 * 完整可访问性（对齐 design.md §5.1 Modal）：
 * - 遮罩点击、ESC 关闭（`onClose`）；
 * - 焦点陷阱：打开时聚焦对话框，Tab/Shift+Tab 圈定在框内，关闭时还原到先前聚焦元素；
 * - `aria-modal` + `role="dialog"` + `aria-label`；
 * - `closeOnBackdrop` / `closeOnEsc` 可关；`disableScroll` 关闭背景滚动。
 */
import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { clsx } from "clsx"
import styles from "./Modal.module.css"

export interface ModalProps {
  /** 打开状态。为 true 时渲染遮罩+面板。 */
  open: boolean
  /** 关闭回调（ESC/遮罩/关闭按钮）。 */
  onClose: () => void
  /** 无障碍标题。 */
  ariaLabel: string
  /** 面板内容；通常提供标题与正文。 */
  children: ReactNode
  /** 点击遮罩关闭。默认 true。 */
  closeOnBackdrop?: boolean
  /** ESC 关闭。默认 true。 */
  closeOnEsc?: boolean
  /** 背景滚动锁定。默认 true。 */
  disableScroll?: boolean
  className?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  ariaLabel,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  disableScroll = true,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    if (dialog) dialog.focus()

    const restore = () => prevFocusRef.current?.focus?.()
    return restore
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (closeOnEsc) onClose()
        return
      }
      // 焦点陷阱：Tab 圈定在 dialog 内。
      if (e.key !== "Tab") return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialog.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, closeOnEsc, onClose])

  // 背景滚动锁定。
  useEffect(() => {
    if (!open || !disableScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, disableScroll])

  if (!open) return null
  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={clsx(styles.dialog, className)}
      >
        {children}
      </div>
    </div>
  )
}