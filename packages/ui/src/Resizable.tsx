/**
 * Resizable + ResizablePanel + ResizableHandle —— `@berkshire/ui` 可拖拽尺寸的分隔面板。
 *
 * shadcn `Resizable` 基于 `react-resizable-panels`；本包遵守 S1 依赖政策
 * （`.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`）：
 * **不放行新增运行时库，自实现拖拽**——用 `flex-grow` 比例 + pointer 事件完成，
 * 保持本库「仅 react（+clsx 内联）」的独立基线。
 *
 * 组合形态：
 * - `Resizable`（根）：`direction` 决定主轴（horizontal 横排 / vertical 纵排），
 *   flex 容器承载面板与分隔条；子项按 `ResizablePanel`、`ResizableHandle` 交替摆放。
 * - `ResizablePanel`：flex 项，`defaultSize`（百分比）决定初始占比；`min`/`max`（百分比）
 *   钳制可拖拽区间。占比以 `flex-grow` 比例表达，故容器缩放时面板**自然等比例伸缩**，
 *   无需 ResizeObserver 手动重算（本实现不引入 ResizeObserver）。
 * - `ResizableHandle`（分隔条）：`role="separator"` + `aria-orientation`，`tabIndex={0}`
 *   键盘可达——`pointerdown` 捕获 + `pointermove` 依主轴像素增量换算 flex-grow 比例再钳制，
 *   `pointerup` 释放；方向键微调相邻面板尺寸。
 *
 * 拖拽三角色（S1 能力缝精神在采用侧）：面板装配（Provider 侧经 context 注册 DOM 与 min/max/
 * 占比）、分隔条消费（Consumer 侧做拖拽）、根做 flex 布局（Definition 侧组装契约）。坏面板/
 * 缺相邻面板时拖拽降级为 no-op，绝不抛坏宿主。
 *
 * 诚实边界（未实现／目标态）：
 * - **不做嵌套分组拖拽**（shadcn `PanelGroup` 递归分组）——本组件只处理一层扁平面板序列。
 * - **不做尺寸持久化**（那是消费方经 `ctx.storage` 的活，本包不碰）。
 * - **三面板及以上**仅作「扁平序列上的相邻双面板拖拽」基础支持（依赖 flex 相邻关系，语义稳定），
 *   更复杂的等比联动分配仍属目标态。
 * - 无动画、无碰撞/吸附、无触控板滚轮缩放。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `clsx`（内联）；不引 Tailwind/CVA/tailwind-merge/Radix。
 */
import { clsx } from "clsx"
import {
  createContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useContext,
} from "react"
import type {
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react"
import styles from "./Resizable.module.css"

export type ResizeDirection = "horizontal" | "vertical"

/** 键盘微调步进（flex-grow 比例增量，5%）。 */
const KEYBOARD_STEP = 0.05

/** 单一面板的运行时登记信息（占比为 flex-grow 比例，总和归一为 1）。 */
interface PanelInfo {
  id: string
  /** 是否由调用方显式给了 defaultSize（未给则参与自动平分）。 */
  explicit: boolean
  /** 最小占比（比例，0..1）。 */
  min: number
  /** 最大占比（比例，0..1）。 */
  max: number
  /** 当前占比（= flex-grow 值，总和归一为 1）。 */
  frac: number
}

/** 经 context 下发的装配/读数手段（产生于 `Resizable` 根）。 */
interface ResizableContextValue {
  direction: ResizeDirection
  containerRef: RefObject<HTMLDivElement | null>
  panelInfo: MutableRefObject<Map<HTMLElement, PanelInfo>>
  /** 拖拽/键盘调整结束时的布局回调（各面板百分比）。 */
  onLayoutSettle: () => void
}

/** 面板 DOM 元素标记（供相邻探测用）。 */
const PANEL_ATTR = "data-resizable-panel"
/** 分隔条 DOM 元素标记（供相邻探测 / 手柄宽度测量用）。 */
const HANDLE_ATTR = "data-resizable-handle"

const ResizableContext = createContext<ResizableContextValue | null>(null)

/** 读主轴（拖拽/测量沿 direction 的轴）。 */
function nextElementSiblingBy(el: Element | null, attr: string): Element | null {
  let cur = el?.nextElementSibling ?? null
  while (cur) {
    if (cur.hasAttribute(attr)) return cur
    cur = cur.nextElementSibling
  }
  return null
}

function previousElementSiblingBy(el: Element | null, attr: string): Element | null {
  let cur = el?.previousElementSibling ?? null
  while (cur) {
    if (cur.hasAttribute(attr)) return cur
    cur = cur.previousElementSibling
  }
  return null
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 容器可用自由空间：主轴总长减去所有分隔条主轴长（分隔条是 `flex: 0 0 auto` 的固定项）。 */
function freeSpacePx(container: HTMLElement, direction: ResizeDirection): number {
  const rect = container.getBoundingClientRect()
  const main = direction === "horizontal" ? rect.width : rect.height
  let handles = 0
  for (const child of container.children) {
    if (child.hasAttribute(HANDLE_ATTR)) {
      const r = child.getBoundingClientRect()
      handles += direction === "horizontal" ? r.width : r.height
    }
  }
  return Math.max(1, main - handles)
}

/**
 * 对某分隔条两侧的相邻面板做一次相对增量调整（deltaFrac 为 flex-grow 比例增量）。
 * 以「分隔条两侧两面板的占比和」守恒为前提，互斥增减并各自钳制到 min/max。
 * 无相邻面板（序列首/尾）时降级为 no-op。
 */
function resizeAdjacent(
  ctx: ResizableContextValue,
  handleEl: HTMLElement,
  deltaFrac: number,
): void {
  const beforeEl = previousElementSiblingBy(handleEl, PANEL_ATTR) as HTMLElement | null
  const afterEl = nextElementSiblingBy(handleEl, PANEL_ATTR) as HTMLElement | null
  if (!beforeEl || !afterEl) return
  const beforeInfo = ctx.panelInfo.current.get(beforeEl)
  const afterInfo = ctx.panelInfo.current.get(afterEl)
  if (!beforeInfo || !afterInfo) return

  const pair = beforeInfo.frac + afterInfo.frac
  // 随指针增量增减前侧，后侧反向补足；两次钳制保证两侧都不越 min/max。
  let nextBefore = clamp(beforeInfo.frac + deltaFrac, beforeInfo.min, beforeInfo.max)
  let nextAfter = clamp(pair - nextBefore, afterInfo.min, afterInfo.max)
  nextBefore = clamp(pair - nextAfter, beforeInfo.min, beforeInfo.max)

  beforeInfo.frac = nextBefore
  afterInfo.frac = nextAfter
  beforeEl.style.flexGrow = String(nextBefore)
  afterEl.style.flexGrow = String(nextAfter)
}

export interface ResizableProps extends HTMLAttributes<HTMLDivElement> {
  /** 主轴方向。默认 `horizontal`。 */
  direction?: ResizeDirection
  /** 面板/分隔条（ResizablePanel 与 ResizableHandle 交替）。 */
  children?: ReactNode
  /** 每次拖拽/键盘调整结束时的尺寸回调（各面板百分比，序=L 到 R／上到下）。 */
  onLayoutChange?: (sizes: number[]) => void
  /** 附加 className（透传根容器）。 */
  className?: string
}

export function Resizable({
  direction = "horizontal",
  children,
  onLayoutChange,
  className,
  ...rest
}: ResizableProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelInfo = useRef<Map<HTMLElement, PanelInfo>>(new Map())
  const onLayoutRef = useRef(onLayoutChange)
  onLayoutRef.current = onLayoutChange

  const emitLayout = useMemo(() => {
    return () => {
      const cb = onLayoutRef.current
      if (!cb) return
      const container = containerRef.current
      if (!container) return
      const sizes: number[] = []
      for (const child of container.children) {
        if (child instanceof HTMLElement && child.hasAttribute(PANEL_ATTR)) {
          const p = panelInfo.current.get(child)
          sizes.push(Math.round((p?.frac ?? 0) * 100))
        }
      }
      cb(sizes)
    }
  }, [])

  const ctx = useMemo<ResizableContextValue>(
    () => ({ direction, containerRef, panelInfo, onLayoutSettle: emitLayout }),
    [direction, emitLayout],
  )

  // 子面板注册（经子组件 useLayoutEffect）完成后，归一化占比到总和 1：
  // 显式给了 defaultSize 的保留其比例；没给的平分剩余。子布局 effect 先于本 effect 执行。
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const els: HTMLElement[] = []
    for (const child of container.children) {
      if (child instanceof HTMLElement && child.hasAttribute(PANEL_ATTR)) els.push(child)
    }
    if (els.length === 0) return

    let explicitSum = 0
    let autoCount = 0
    for (const el of els) {
      const p = panelInfo.current.get(el)
      if (p) p.explicit ? (explicitSum += p.frac) : autoCount++
    }

    if (autoCount > 0) {
      const auto = Math.max(0, (1 - explicitSum) / autoCount)
      for (const el of els) {
        const p = panelInfo.current.get(el)
        if (p && !p.explicit) {
          p.frac = auto
          el.style.flexGrow = String(auto)
        }
      }
    }
    // 双保险：即便全显式/极端输入让总和偏离 1，也等比归一（保证 flex-grow 总和恒定为 1）。
    let total = 0
    for (const el of els) total += panelInfo.current.get(el)?.frac ?? 0
    if (total > 0 && Math.abs(total - 1) > 1e-6) {
      for (const el of els) {
        const p = panelInfo.current.get(el)
        if (p) {
          p.frac /= total
          el.style.flexGrow = String(p.frac)
        }
      }
    }
    // 依赖 `direction`：运行期改主轴方向会触发子面板重注册（frac 复位到 defaultSize/0），
    // 本 effect 随之重跑归一化，避免未给 defaultSize 的自动面板在换向后塌缩成 flex-grow:0。
  }, [direction])

  return (
    <ResizableContext.Provider value={ctx}>
      <div
        ref={containerRef}
        className={clsx(
          styles.group,
          direction === "horizontal" ? styles.groupHorizontal : styles.groupVertical,
          className,
        )}
        {...rest}
      >
        {children}
      </div>
    </ResizableContext.Provider>
  )
}

/* ------------------------------------------------------------------------- */

export interface ResizablePanelProps extends HTMLAttributes<HTMLDivElement> {
  /** 初始占比（百分比 0..100）；缺省平分剩余空间。 */
  defaultSize?: number
  /** 最小占比（百分比 0..100）。默认 0。 */
  min?: number
  /** 最大占比（百分比 0..100）。默认 100。 */
  max?: number
  /** 面板内容。 */
  children?: ReactNode
  /** 附加 className（透传面板元素）。 */
  className?: string
}

export function ResizablePanel({
  defaultSize,
  min = 0,
  max = 100,
  children,
  className,
  style,
  ...rest
}: ResizablePanelProps) {
  const ctx = useContext(ResizableContext)
  if (!ctx) throw new Error("ResizablePanel 必须在 <Resizable> 内使用")
  const idRef = useRef(`bk-panel-${Math.random().toString(36).slice(2)}`)
  const elRef = useRef<HTMLDivElement | null>(null)

  // 「注册即效应」：挂载时登记面板 DOM 与 min/max/占比，卸载时撤销（registrations are effects）。
  useLayoutEffect(() => {
    const el = elRef.current
    if (!el) return
    const ex = defaultSize !== undefined
    const frac = ex ? Math.max(0, Math.min(1, defaultSize / 100)) : 0
    ctx.panelInfo.current.set(el, {
      id: idRef.current,
      explicit: ex,
      min: clamp(min / 100, 0, 1),
      max: clamp(max / 100, 0, 1),
      frac,
    })
    el.style.flexGrow = String(frac)
    return () => {
      ctx.panelInfo.current.delete(el)
    }
    // defaultSize/min/max 是装配期初值；后续变更属受控重装配（注册 effect 重跑生效）。
  }, [ctx, defaultSize, min, max])

  return (
    <div
      ref={elRef}
      {...{ [PANEL_ATTR]: true }}
      className={clsx(styles.panel, className)}
      style={{ flexGrow: 0, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------------- */

export interface ResizableHandleProps extends HTMLAttributes<HTMLDivElement> {
  /** 附加 className（透传分隔条元素）。 */
  className?: string
  /** 是否渲染内侧抓握块（视觉提示）。默认 true。 */
  withGrip?: boolean
  /** 分隔条的可访问名称。默认「拖动调整面板尺寸」。 */
  ariaLabel?: string
}

export function ResizableHandle({
  className,
  withGrip = true,
  ariaLabel = "拖动调整面板尺寸",
  onKeyDown,
  ...rest
}: ResizableHandleProps) {
  const ctx = useContext(ResizableContext)
  if (!ctx) throw new Error("ResizableHandle 必须在 <Resizable> 内使用")

  const dragStart = useRef<{ main: number; pointer: number }>({ main: 0, pointer: 0 })

  const primaryCoord = (e: ReactPointerEvent<HTMLDivElement>) =>
    ctx.direction === "horizontal" ? e.clientX : e.clientY

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const container = ctx.containerRef.current
    if (!container) return
    e.preventDefault()
    e.stopPropagation()
    // pointer capture：移出分隔条后仍持续接收 move/up，防止中断。
    el.setPointerCapture(e.pointerId)
    el.setAttribute("data-dragging", "true")
    dragStart.current = { main: freeSpacePx(container, ctx.direction), pointer: primaryCoord(e) }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const el = e.currentTarget
    const beforeEl = previousElementSiblingBy(el, PANEL_ATTR) as HTMLElement | null
    const afterEl = nextElementSiblingBy(el, PANEL_ATTR) as HTMLElement | null
    const beforeInfo = beforeEl ? ctx.panelInfo.current.get(beforeEl) : undefined
    if (!beforeInfo || !afterEl) return
    const deltaPx = primaryCoord(e) - dragStart.current.pointer
    // 占比总和=1，故像素增量在全部分隔条固定宽下换算成 flex-grow 比例增量 = delta/freeSpace。
    resizeAdjacent(ctx, el, deltaPx / dragStart.current.main)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    el.removeAttribute("data-dragging")
    // 拖拽结束：释放后向消费者汇报一次当前各面板尺寸。
    ctx.onLayoutSettle()
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const step =
      e.key === "ArrowLeft" || e.key === "ArrowUp"
        ? -KEYBOARD_STEP
        : e.key === "ArrowRight" || e.key === "ArrowDown"
          ? KEYBOARD_STEP
          : 0
    if (step === 0) {
      onKeyDown?.(e)
      return
    }
    e.preventDefault()
    // 键盘调整不关心箭头轴方向——方向键只取“增/减”语义。
    resizeAdjacent(ctx, el, step)
    ctx.onLayoutSettle()
  }

  return (
    <div
      {...{ [HANDLE_ATTR]: true }}
      role="separator"
      aria-orientation={ctx.direction}
      aria-label={ariaLabel}
      tabIndex={0}
      className={clsx(
        styles.handle,
        ctx.direction === "horizontal" ? styles.handleHorizontal : styles.handleVertical,
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {withGrip && <span aria-hidden className={styles.grip} />}
    </div>
  )
}