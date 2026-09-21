/**
 * Spinner —— `@berkshire/ui` 纯展示加载指示器。
 *
 * 无交互、无 portal、零新依赖。默认 `role="status"`（live region，读屏即时播报），
 * 传入 `label` 时以视觉隐藏文本供读出；也可经 `aria-label`（透传）覆盖无障碍名称。
 * `size` 提供 sm / md / lg 三档；动弧颜色默认当前文字色语义（`--bk-color-fg`），
 * 不提供 `color` 档——如需强调色请用 `className`/包裹容器覆盖。
 *
 * 诚实边界：仅纯展示，不组合加载遮罩/骨架屏，不做任何异步状态管理。
 */
import { clsx } from "clsx"
import type { HTMLAttributes, ReactNode } from "react"
import styles from "./Spinner.module.css"

export type SpinnerSize = "sm" | "md" | "lg"

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** 尺寸档位。默认 `md`。 */
  size?: SpinnerSize
  /** 视觉隐藏的可访问说明（配合 `role="status"` 由读屏读出）；不传时无。 */
  label?: ReactNode
}

export function Spinner({ size = "md", label, className, ...rest }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className={clsx(styles.spinner, className)} {...rest}>
      <span aria-hidden className={clsx(styles.ring, styles[size])} />
      {label && <span className={styles.srOnly}>{label}</span>}
    </span>
  )
}