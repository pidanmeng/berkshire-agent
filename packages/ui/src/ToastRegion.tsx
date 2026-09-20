/**
 * ToastRegion —— `@berkshire/ui` 轻提示堆栈容器（右上角固定定位）。
 *
 * 透传 `items`（`Toast` 的 props + 唯一 `id`），渲染为纵向堆叠；单项自身处理 `autoClose`/
 * `onClose`。空时不渲染。独立组件，宿主可在顶层挂一个。
 */
import type { ReactNode } from "react"
import styles from "./Toast.module.css"

export interface ToastRegionProps {
  children: ReactNode
}

export function ToastRegion({ children }: ToastRegionProps) {
  return <div className={styles.region} aria-live="polite">{children}</div>
}