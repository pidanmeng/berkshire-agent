/**
 * Toast —— `@berkshire/ui` 单个轻提示（kind: error/success/info/warning）。
 *
 * `autoClose` 毫秒（默认 4000，传 `0` 不自动关）后调 `onClose`。独立于宿主，可组合进
 * `ToastRegion` 或任意容器。颜色语义走 `--bk-*` 状态令牌（soft 底 + kind 强调）。
 */
import { clsx } from "clsx"
import { useEffect } from "react"
import styles from "./Toast.module.css"

export type ToastKind = "error" | "success" | "info" | "warning"

export interface ToastProps {
  kind?: ToastKind
  /** 提示正文。 */
  message: string
  /** 自动消失毫秒；`0` 不自动关。默认 4000。 */
  autoClose?: number
  /** 手动关闭回调。 */
  onClose?: () => void
  className?: string
}

export function Toast({ kind = "info", message, autoClose = 4000, onClose, className }: ToastProps) {
  useEffect(() => {
    if (autoClose <= 0) return
    const t = setTimeout(() => onClose?.(), autoClose)
    return () => clearTimeout(t)
  }, [autoClose, onClose])

  return (
    <div
      role="status"
      aria-live="polite"
      className={clsx(styles.toast, styles[kind], className)}
    >
      <span className={styles.dot} />
      <span className={styles.message}>{message}</span>
      {onClose != null && (
        <button type="button" aria-label="关闭" className={styles.close} onClick={onClose}>
          ×
        </button>
      )}
    </div>
  )
}