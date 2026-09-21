/**
 * overlay —— `@berkshire/ui` 滑出面板/弹层共享的**内部生命周期 helper**（非公开导出）。
 *
 * 本文件把 `Modal` 已验证的「焦点陷阱 + 关闭还原焦点 + ESC 关闭 + body 滚动锁」拆成
 * 可复用的 hooks，供 `Sheet` / `Drawer`（及将来同类弹层）共享，避免每件复制粘贴。
 * 不改 `Modal`/`Popover` 源码；它们继续用各自的实现（本 helper 只服务新组件）。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `clsx`（内联）；与包基一致，零新依赖。
 *
 * 诚实：本 helper 不含任何配色/样式，纯行为逻辑；动画/定位归各组件自身 CSS。
 */
import { useEffect, useRef } from "react"
import type { RefObject } from "react"

/** 面板内可聚焦元素选择器（与 `Modal` 同款）。 */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 打开时聚焦面板、关闭时还原到先前聚焦元素（对齐 `Modal` 的可访问性契约）。
 * 依赖 gear：`panelRef` 是稳定 ref 对象，变化不会重跑；`open` 切换触发 focus/unfocus。
 */
export function useFocusOnOpen(panelRef: RefObject<HTMLElement | null>, open: boolean): void {
  const prevFocusRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) panel.focus()
    const restore = () => prevFocusRef.current?.focus?.()
    return restore
  }, [open, panelRef])
}

/**
 * Tab/Shift+Tab 焦点陷阱：把可聚焦元素圈定在面板内（对齐 `Modal` 契约）。
 */
export function useFocusTrap(panelRef: RefObject<HTMLElement | null>, open: boolean): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, panelRef])
}

/**
 * ESC 关闭（`enabled` 允许消费方关掉，对齐 `closeOnEsc`）。
 */
export function useEscToClose(open: boolean, enabled: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open || !enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, enabled, onClose])
}

/**
 * body 背景滚动锁（`enabled` 对齐 `disableScroll`；关闭或隐藏时还原原 overflow）。
 */
export function useScrollLock(open: boolean, enabled: boolean): void {
  useEffect(() => {
    if (!open || !enabled) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, enabled])
}