/**
 * Popover —— `@berkshire/ui` 复杂弹层首件：portal 定位的上下文弹出面板。
 *
 * 决策背景（见 Agent Note `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`）：
 * 方案 1（自实现 portal + 定位），保持零新 UI 库依赖、纯 CSS Modules + `var(--bk-*)`。
 * 与既有 `Dropdown`（同容器绝对定位、无 portal）的关键差异点是 **portal**：内容经
 * `react-dom` 的 `createPortal` 渲染到 `document.body`，脱离触发容器/任何 `overflow|transform|clip`
 * 上下文，可被 `z-index` 稳定盖住相邻层；并做 viewport 钳制定位（placement + align + 边距收敛）。
 *
 * 可访问性：anchor 带 `aria-haspopup`/`aria-expanded`/`aria-controls`；Enter/Space 切换；
 * ESC 或点击外部（anchor/面板之外）关闭。focus-trap 不适用（popover 是非模态上下文面板，
 * 聚焦陷阱归 `Modal`/`Dialog`）。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `react-dom` 的 `createPortal`（也是宿主注入的
 * React 宿主运行时，非新增 UI 库）+ `clsx`（内联）。不加 Tailwind/CVA/tailwind-merge/Radix。
 *
 * 诚实：本件是「portal + 定位」的代表实现；完整碰撞翻转（flip）、箭头、submenu、动画、
 * 以及 `Combobox`/`Drawer`/`ContextMenu` 等其余复杂弹层仍为「目标态/待决策」，见下文 index 标注。
 */
import { clsx } from "clsx"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import styles from "./Popover.module.css"

export type PopoverPlacement = "top" | "bottom" | "left" | "right"
export type PopoverAlign = "start" | "center" | "end"

export interface PopoverProps {
  /**
   * 触发内容。**必须是纯展示/非交互内容**（文本、图标、`<a>` 外的内联元素等）。
   * Popover 会把它包进一个接管交互的 `role="button"` anchor（`onClick`/Enter/Space/ESC、`aria-*`）。
   * 若传可交互组件（如 `Button`/原生 `<button>`），会形成「anchor ⊃ 子按钮」的**嵌套交互**并可能双重触发，
   * 属误用；需要 Button 外观时请传静态度量元素或在其外自行套一层非交互包装。
   */
  trigger: ReactNode
  /** 弹出面板内容。 */
  children: ReactNode
  /** 受控展开态。 */
  open?: boolean
  /** 初始展开态（非受控）。 */
  defaultOpen?: boolean
  /** 展开态变化回调（受控/非受控都会触发）。 */
  onOpenChange?: (open: boolean) => void
  /** 相对 anchor 的方位。默认 bottom。 */
  placement?: PopoverPlacement
  /** 次级轴对齐。默认 center。 */
  align?: PopoverAlign
  /** 附加 className（透传到面板容器）。 */
  className?: string
}

/** 面板 geometry 最小边距（离 viewport 边缘），非色值，不触碰「禁魔法色值」纪律。 */
const VIEWPORT_MARGIN = 8
/** 面板与 anchor 的间距。 */
const GAP = 8

export function Popover({
  trigger,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom",
  align = "center",
  className,
}: PopoverProps) {
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = controlled ? !!open : internalOpen

  const anchorRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const panelId = useId()
  const portalTarget = typeof document !== "undefined" ? document.body : null

  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  // 定位：测量 anchor + 面板尺寸，按 placement/align 计算并钳制在 viewport 内。
  useLayoutEffect(() => {
    if (!isOpen) return
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return

    const place = () => {
      const ar = anchor.getBoundingClientRect()
      const pw = panel.offsetWidth
      const ph = panel.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight

      const clamp = (v: number, max: number) =>
        Math.max(VIEWPORT_MARGIN, Math.min(v, Math.max(VIEWPORT_MARGIN, max - VIEWPORT_MARGIN)))

      // 次级轴（与 placement 正交）上的对齐基线。
      const crossPrimary = (base: number) =>
        align === "start" ? base : align === "end" ? base - pw : base - pw / 2
      const crossSecondary = (base: number) =>
        align === "start" ? base : align === "end" ? base - ph : base - ph / 2

      let top = 0
      let left = 0
      if (placement === "bottom") {
        top = ar.bottom + GAP
        left = clamp(crossPrimary(ar.left + ar.width / 2), vw)
      } else if (placement === "top") {
        top = ar.top - GAP - ph
        left = clamp(crossPrimary(ar.left + ar.width / 2), vw)
      } else if (placement === "right") {
        left = ar.right + GAP
        top = clamp(crossSecondary(ar.top + ar.height / 2), vh)
      } else {
        left = ar.left - GAP - pw
        top = clamp(crossSecondary(ar.top + ar.height / 2), vh)
      }

      // 主轴钳制（视口内），并顺带兜底到面板能完整可见。
      if (placement === "bottom" || placement === "top") {
        top = clamp(top, vh)
      } else {
        left = clamp(left, vw)
      }
      setPos({ top, left })
    }

    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [isOpen, placement, align])

  // 外部点击 + ESC 关闭。
  useEffect(() => {
    if (!isOpen) return
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
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
  }, [isOpen])

  return (
    <>
      <span
        ref={anchorRef}
        className={clsx(styles.anchor)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(!isOpen)
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
      >
        {trigger}
      </span>
      {isOpen && portalTarget
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="popover"
              className={clsx(styles.panel, className)}
              style={{ top: pos.top, left: pos.left }}
            >
              {children}
            </div>,
            portalTarget,
          )
        : null}
    </>
  )
}