/**
 * ScrollArea + Scrollbar —— `@berkshire/ui` 自定义滚动区。
 *
 * 决策依据（S1 依赖政策，见 `.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`）：
 * **不放行 `scroll`/Radix scroll 类库，自实现滚动条**——`useLayoutEffect` 测量 + pointer 事件拖拽 +
 * `ResizeObserver` 防 stale。符合 overlay-primitives 决策的「自实现、零新 UI 库依赖」基调，
 * 保持本库「仅 react（+clsx 内联）」独立基线。
 *
 * 组合形态：
 * - `ScrollArea`（根）：包裹长内容、隐藏浏览器原生滚动条、暴露自绘滚动条轨道/滑块。滚轮/触控板
 *   原生滚动保留（靠底层 `overflow:auto` 视口），仅接管**视觉滚动条**的绘制与拖拽。
 * - `Scrollbar`（轨道/滑块）：可独立导出，亦可在任意既有滚动容器上用 `viewportRef` 装配自绘滚动条。
 *   `ScrollArea` 内部默认挂一根垂直 + 一根水平 `Scrollbar`。
 *
 * 滑块几何：滑块尺寸 ≈ 可见比例（`clientSize / scrollSize`，下限 `MIN_THUMB`），位置随 `scrollTop/Left`
 * 同步；内容尺寸/视口尺寸变化时由 `ResizeObserver`（观察视口与内容包装层）重算，**不 stale**。
 *
 * 可访问性：视口 `tabIndex={0}` + `role="region"` + `aria-label`，支持 `Arrow/PgUp/PgDn/Home/End`
 * 键盘滚动；滑块 `role="scrollbar"` + `aria-controls`（指向视口 id）+ `aria-valuenow/min/max` +
 * `aria-orientation`。
 *
 * 显隐形态 `type`：`auto`（可滚时半透明浮现、hover/拖拽时全显）／`always`（可滚时常显）／`hover`
 * （仅 hover/拖拽时显）。仅在可滚动（`scrollHeight/scrollWidth` 超出视口）时绘制。
 *
 * 诚实边界：**不做列表虚拟化**（大列表优化是目标态/另包）；不接管背景滚动锁（`Modal` 已管）；
 * 不支持「点轨道空白跳转」（目标态，可后续在此文件叠加）。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `clsx`（内联）；不引 Tailwind/CVA/tailwind-merge/Radix。
 */
import { clsx } from "clsx"
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react"
import styles from "./ScrollArea.module.css"

export type ScrollAreaType = "auto" | "always" | "hover"
export type ScrollbarOrientation = "vertical" | "horizontal"

/** 滑块几何（沿滚动主轴）。 */
interface ScrollMetrics {
  /** 是否可滚动（内容超出视口）。 */
  isScrollable: boolean
  /** 滑块沿主轴的像素长度（≈ 可见比例，下限钳制）。 */
  thumbSize: number
  /** 滑块起点距轨道起点的偏移（px）。 */
  thumbOffset: number
}

/** 滑块最小像素长度（几何常量，非色值，不触碰「禁魔法色值」纪律）。 */
const MIN_THUMB = 20
/** 键盘滚动的行步进（px，几何常量）。 */
const SCROLL_LINE = 40

function computeMetrics(view: HTMLElement, orientation: ScrollbarOrientation): ScrollMetrics {
  const isVertical = orientation === "vertical"
  const scrollSize = isVertical ? view.scrollHeight : view.scrollWidth
  const clientSize = isVertical ? view.clientHeight : view.clientWidth
  const scrollPos = isVertical ? view.scrollTop : view.scrollLeft
  const maxScroll = scrollSize - clientSize
  const isScrollable = maxScroll > 0
  if (!isScrollable) {
    return { isScrollable, thumbSize: clientSize, thumbOffset: 0 }
  }
  const thumbSize = Math.max(MIN_THUMB, (clientSize / scrollSize) * clientSize)
  const thumbOffset = (scrollPos / maxScroll) * (clientSize - thumbSize)
  return { isScrollable, thumbSize, thumbOffset }
}

/** 主轴方向上的 PointerEvent 坐标。 */
function primaryAxis(e: PointerEvent | ReactPointerEvent, orientation: ScrollbarOrientation): number {
  return orientation === "vertical" ? e.clientY : e.clientX
}

export interface ScrollbarProps {
  /** 被滚动视口（必须是实际带 `overflow:auto/scroll` 的滚动容器）。 */
  viewportRef: RefObject<HTMLElement | null>
  /** 滚动轴向。默认 vertical。 */
  orientation?: ScrollbarOrientation
  /** 显隐形态。默认 auto。 */
  type?: ScrollAreaType
  /** 附加 className（透传到轨道容器）。 */
  className?: string
}

export function Scrollbar({
  viewportRef,
  orientation = "vertical",
  type = "auto",
  className,
}: ScrollbarProps) {
  const isVertical = orientation === "vertical"
  const [metrics, setMetrics] = useState<ScrollMetrics>(() => ({
    isScrollable: false,
    thumbSize: 0,
    thumbOffset: 0,
  }))
  const [dragging, setDragging] = useState(false)
  // 拖拽门闩用 ref（事件回调闭包可能比拖动时的重渲染更频繁触发，避免读到过期 state）。
  const draggingRef = useRef(false)
  const metricsRef = useRef(metrics)
  const dragStart = useRef<{ pointer: number; offset: number }>({ pointer: 0, offset: 0 })
  const thumbId = useId()

  // 始终把最新 metrics 暴露给拖拽回调（避免闭包捕捉过期 state）。
  metricsRef.current = metrics

  // 计算 + 测量：尺寸随视口/内容变化经 ResizeObserver 重算，scroll/resize 亦触发。
  useLayoutEffect(() => {
    const view = viewportRef.current
    if (!view) return

    const recompute = () => {
      const el = viewportRef.current
      if (!el) return
      setMetrics(computeMetrics(el, orientation))
    }

    recompute()
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(recompute)
      ro.observe(view)
      // 观察内容包装层（ScrollArea 内部是 .content 单包层）：内容高度/宽度变化时防 stale 滑块。
      const content = view.firstElementChild
      if (content) ro.observe(content)
    }
    view.addEventListener("scroll", recompute, { passive: true })
    window.addEventListener("resize", recompute)
    return () => {
      ro?.disconnect()
      view.removeEventListener("scroll", recompute)
      window.removeEventListener("resize", recompute)
    }
  }, [viewportRef, orientation])

  // 拖拽：pointerdown 捕获 + pointermove 换算滚动增量（指针交还给 ScrollArea 的 effect 纪律自理）。
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const view = viewportRef.current
    if (!view || !metricsRef.current.isScrollable) return
    e.preventDefault()
    e.stopPropagation()
    dragStart.current = {
      pointer: primaryAxis(e.nativeEvent, orientation),
      offset: metricsRef.current.thumbOffset,
    }
    draggingRef.current = true
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const view = viewportRef.current
    if (!view) return
    const isV = orientation === "vertical"
    const scrollSize = isV ? view.scrollHeight : view.scrollWidth
    const clientSize = isV ? view.clientHeight : view.clientWidth
    const maxScroll = scrollSize - clientSize
    if (maxScroll <= 0) return
    const delta = primaryAxis(e.nativeEvent, orientation) - dragStart.current.pointer
    const scrollableDist = clientSize - metricsRef.current.thumbSize
    if (scrollableDist <= 0) return
    const nextPos = (dragStart.current.offset + delta) / scrollableDist * maxScroll
    const clamped = Math.max(0, Math.min(nextPos, maxScroll))
    if (isV) view.scrollTop = clamped
    else view.scrollLeft = clamped
  }

  const endDrag = () => {
    draggingRef.current = false
    setDragging(false)
  }

  if (!metrics.isScrollable) {
    return null
  }

  const isAlways = type === "always"
  const isHover = type === "hover"

  // aria-valuenow/valuemax 同量表：都是「滑块起点偏移」，max 为滑块可移动范围（clientSize - thumbSize），
  // 而非内容总长 scrollSize，否则与 valuenow 量纲错配（读屏回报失真）。
  const view = viewportRef.current
  const viewportId = view?.id
  const viewClient = (isVertical ? view?.clientHeight : view?.clientWidth) ?? 0
  const maxThumbOffset = Math.max(0, viewClient - metrics.thumbSize)

  return (
    <div
      className={clsx(
        styles.track,
        isVertical ? styles.trackVertical : styles.trackHorizontal,
        isAlways && styles.trackAlways,
        isHover && styles.trackHover,
        className,
      )}
      data-active={dragging || undefined}
    >
      <div
        role="scrollbar"
        aria-label={isVertical ? "垂直滚动条" : "水平滚动条"}
        aria-controls={viewportId}
        aria-orientation={isVertical ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(Math.min(metrics.thumbOffset, maxThumbOffset))}
        aria-valuemin={0}
        aria-valuemax={Math.round(maxThumbOffset)}
        id={thumbId}
        className={clsx(
          styles.thumb,
          isVertical ? styles.thumbVertical : styles.thumbHorizontal,
          dragging && styles.thumbActive,
        )}
        style={{
          height: isVertical ? metrics.thumbSize : undefined,
          width: isVertical ? undefined : metrics.thumbSize,
          transform: isVertical
            ? `translateY(${metrics.thumbOffset}px)`
            : `translateX(${metrics.thumbOffset}px)`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}

export interface ScrollAreaProps {
  /** 滚动内容。会被包进内容包装层（.content）。 */
  children: ReactNode
  /** 显隐形态。默认 auto。 */
  type?: ScrollAreaType
  /** 附加 className（透传到根容器）。 */
  className?: string
  /** 附加 className（透传到滚动视口）。 */
  viewportClassName?: string
  /** 附加 className（透传到两条 Scrollbar 的轨道）。 */
  scrollbarClassName?: string
  /** 视口 `role="region"` 的可访问名称。默认「滚动区域」。 */
  ariaLabel?: string
}

export function ScrollArea({
  children,
  type = "auto",
  className,
  viewportClassName,
  scrollbarClassName,
  ariaLabel = "滚动区域",
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewportId = useId()

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const view = viewportRef.current
    if (!view) return
    let handled = true
    switch (e.key) {
      case "ArrowDown":
        view.scrollBy({ top: SCROLL_LINE, behavior: "auto" })
        break
      case "ArrowUp":
        view.scrollBy({ top: -SCROLL_LINE, behavior: "auto" })
        break
      case "ArrowRight":
        view.scrollBy({ left: SCROLL_LINE, behavior: "auto" })
        break
      case "ArrowLeft":
        view.scrollBy({ left: -SCROLL_LINE, behavior: "auto" })
        break
      case "PageDown":
        view.scrollBy({ top: view.clientHeight * 0.9, behavior: "auto" })
        break
      case "PageUp":
        view.scrollBy({ top: -view.clientHeight * 0.9, behavior: "auto" })
        break
      case "Home":
        view.scrollTo({ top: 0, left: 0 })
        break
      case "End":
        view.scrollTo({ top: view.scrollHeight, left: view.scrollWidth })
        break
      default:
        handled = false
    }
    if (handled) e.preventDefault()
  }

  return (
    <div className={clsx(styles.root, className)}>
      <div
        ref={viewportRef}
        id={viewportId}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className={clsx(styles.viewport, viewportClassName)}
        onKeyDown={onKeyDown}
      >
        <div className={styles.content}>{children}</div>
      </div>
      <Scrollbar viewportRef={viewportRef} orientation="vertical" type={type} className={scrollbarClassName} />
      <Scrollbar viewportRef={viewportRef} orientation="horizontal" type={type} className={scrollbarClassName} />
    </div>
  )
}