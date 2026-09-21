/**
 * Drawer —— `@berkshire/ui` 底部抽屉面板（bottom sheet，不遮挡全部背景）。
 *
 * shadcn `Drawer` 移植（基础子集）。与 `Sheet` 共享同一滑出面板机制（`overlay.ts`：
 * 焦点陷阱/关闭还原焦点/ESC/body 滚动锁），本组件锁定为「底部滑出 + 居半透遮罩」
 * 的固定形态，不再提供 `side`。
 *
 * 行为与可访问性：
 * - 受控 `open`/`onOpenChange`；遮罩点击、ESC 关闭；`closeOnBackdrop`/`closeOnEsc` 可关；
 * - 焦点陷阱（Tab 圈定）+ 关闭还原焦点；`role="dialog"` + `aria-modal="true"` + `aria-label`；
 * - 遮罩半透明（`--bk-scrim` 为 rgba 半透明叠层，配合模糊），面板靠底部、不遮挡全部背景。
 *
 * 诚实边界（未实现 → 目标态）：
 * - **拖拽收放（pointer 下拉关闭）未实现**——视觉上保留顶部手柄（`<div aria-hidden>`
 *   纯装饰），但无拖拽逻辑；
 * - 门把手、多 snap-point、遮罩点击后不回弹等变体未实现；
 * - 只做入场动画（面板自底部滑入），离场动画（关闭即卸载）为「目标态」。
 *
 * 组合：内容透传 children，不内建滚动；长内容可用 `ScrollArea`（S2）自承载。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `react-dom` 的 `createPortal` + `clsx`（内联）；
 *   不加动效库。样式全 `var(--bk-*)`，禁魔法色值。
 */
import { clsx } from "clsx"
import { useRef } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import styles from "./Drawer.module.css"
import { useEscToClose, useFocusOnOpen, useFocusTrap, useScrollLock } from "./overlay"

export interface DrawerProps {
  /** 打开状态。为 true 时经 portal 渲染遮罩+面板到 `document.body`。 */
  open: boolean
  /** 打开态变化回调（遮罩/ESC 等触发）。 */
  onOpenChange: (open: boolean) => void
  /** 无障碍命名。 */
  ariaLabel: string
  /** 面板内容（透传，滚动交给内容自身或消费方 `ScrollArea`）。 */
  children: ReactNode
  /** 点击遮罩关闭。默认 true。 */
  closeOnBackdrop?: boolean
  /** ESC 关闭。默认 true。 */
  closeOnEsc?: boolean
  /** 背景滚动锁定。默认 true。 */
  disableScroll?: boolean
  /** 附加 className（透传到面板）。 */
  className?: string
}

export function Drawer({
  open,
  onOpenChange,
  ariaLabel,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  disableScroll = true,
  className,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusOnOpen(panelRef, open)
  useFocusTrap(panelRef, open)
  useEscToClose(open, closeOnEsc, () => onOpenChange(false))
  useScrollLock(open, disableScroll)

  if (!open) return null

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={clsx(styles.panel, className)}
      >
        {/* 纯装饰手柄（拖拽未来目标态；aria-hidden 不进入可访问性树）。 */}
        <div aria-hidden className={styles.handle} />
        {children}
      </div>
    </div>,
    document.body,
  )
}