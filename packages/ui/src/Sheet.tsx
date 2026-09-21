/**
 * Sheet —— `@berkshire/ui` 屏幕边缘滑出面板（左/右/顶/底，右默认）。
 *
 * shadcn `Sheet` 移植；共享滑出面板机制见 `overlay.ts`（焦点陷阱/关闭还原焦点/ESC/
 * body 滚动锁），本组件只负责 portal + 定位对齐（side）+ 滑出入场动效。
 *
 * 行为与可访问性（对齐 `Modal` 契约，见 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`）：
 * - 受控 `open`/`onOpenChange`；`side` 决定从哪条边滑出（`left`/`right`/`top`/`bottom`，右默认）；
 * - 遮罩点击、ESC 关闭；`closeOnBackdrop` / `closeOnEsc` 可关；`disableScroll` 锁定背景滚动；
 * - 焦点陷阱（Tab 圈定）+ 关闭时还原焦点到先前聚焦元素；
 * - `role="dialog"` + `aria-modal` + `aria-label`（命名对话框；消费方也可在标题元素上挂
 *   `id` 并用 `aria-labelledby` 组合同等命名）。
 * - 内容经 `react-dom` 的 `createPortal` 渲染到 `document.body`，脱离任何 overflow/transform/
 *   clip 上下文，受裁剪不影响（与 `Popover` 同款 portal 理由）。
 *
 * 动效诚实边界：**只做入场滑出**（CSS keyframes 过渡，柔和缓动），
 * **未做离场动画**（关闭即卸载）——离场动画等变体为「目标态」。
 *
 * 组合：内容透传 children，不内建滚动；长内容可用 `ScrollArea`（S2）自承载，
 *   `Sheet` 不强耦合（滚动交给内容自身或消费方）。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `react-dom` 的 `createPortal`（宿主注入）+
 *   `clsx`（内联）；不加动效库。样式全 `var(--bk-*)`，禁魔法色值。
 */
import { clsx } from "clsx"
import { useRef } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import styles from "./Sheet.module.css"
import { useEscToClose, useFocusOnOpen, useFocusTrap, useScrollLock } from "./overlay"

export type SheetSide = "left" | "right" | "top" | "bottom"

/** 边缘 → 遮罩对齐类：控制面板落在 flex 容器的哪一轴哪一侧。 */
const OVERLAY_SIDE: Record<SheetSide, string | undefined> = {
  left: styles.overlayLeft,
  right: styles.overlayRight,
  top: styles.overlayTop,
  bottom: styles.overlayBottom,
}

/** 边缘 → 面板几何类：控制滑出尺寸/圆角/入场动画。 */
const PANEL_SIDE: Record<SheetSide, string | undefined> = {
  left: styles.panelLeft,
  right: styles.panelRight,
  top: styles.panelTop,
  bottom: styles.panelBottom,
}

export interface SheetProps {
  /** 打开状态。为 true 时经 portal 渲染遮罩+面板到 `document.body`。 */
  open: boolean
  /** 打开态变化回调（遮罩/ESC/关闭按钮等触发）。 */
  onOpenChange: (open: boolean) => void
  /** 滑出边缘。默认 `right`。 */
  side?: SheetSide
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

export function Sheet({
  open,
  onOpenChange,
  side = "right",
  ariaLabel,
  children,
  closeOnBackdrop = true,
  closeOnEsc = true,
  disableScroll = true,
  className,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusOnOpen(panelRef, open)
  useFocusTrap(panelRef, open)
  useEscToClose(open, closeOnEsc, () => onOpenChange(false))
  useScrollLock(open, disableScroll)

  if (!open) return null

  return createPortal(
    <div
      className={clsx(styles.overlay, OVERLAY_SIDE[side])}
      data-side={side}
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
        className={clsx(styles.panel, PANEL_SIDE[side], className)}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}