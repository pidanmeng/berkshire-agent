/**
 * HoverCard —— `@berkshire/ui` hover/focus 触发的上下文内容卡片（shadcn HoverCard 轻移植，无 Radix）。
 *
 * 设计决策（见 Agent Note `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md` +
 * S3 `HoverCard` 特性）：**复用 `Popover` 的 portal + 定位/面板样式**，把 hover/focus + delay 的
 * 打开状态接到受控 `Popover` 的 `open`/`onOpenChange` 上，不重写定位/钳制（`Placement`/`Align`
 * 同 `Popover`）。`HoverCard` 自身只做「触发状态机」：悬停/聚焦 anchor → 经进入 delay 打开；
 * 移出 anchor 或卡片、失焦 → 经关闭 delay 收起（防抖）。
 *
 * 状态机摘要（全部以「注册即效应 + disposer」自管，delay timer 在卸载/关闭时清理）：
 * - `onMouseEnter`（anchor 包装）→ 悬停锁真，清关闭 timer，起打开 timer（`openDelay`，默认 300ms）。
 * - `onFocus`（anchor，键盘可达）→ 聚焦锁真，立即打开（不等待 delay）。
 * - 移出 anchor → 悬停锁假；经 document 级 `mouseover`/`mouseout` 追踪 portal 面板内的悬停：
 *   指针在卡片内则保持打开（清关闭 timer），离开卡片才允许 `maybeClose`。
 * - `onBlur`（anchor）→ 聚焦锁假；三个锁（悬停 anchor/悬停卡片/聚焦）全假时才起关闭 timer。
 * - 关闭 timer 到点 → `setOpen(false)`；ESC / 点击外部由受控 `Popover` 自带处理回调到本件。
 *
 * 诚实边界：
 * - 内容面板 `role="dialog"`（继承自复用的 `Popover`）；本件不引入独立 `role="tooltip"` 变体，
 *   需要 tooltip 语义的消费方可用既有 `Tooltip`（纯提示文案）而非本卡片。
 * - `trigger` 被复用的 `Popover` 包进 `role="button"` anchor；点按 anchor 会经 `Popover`
 *   的 onClick 触发一次 `onOpenChange(!open)`（受控下等价于点击切换）。这是复用契约的副作用，
 *   本件以 hover/focus 为主要触发，不额外干预点击。
 * - 焦点落入卡片内（卡片含可交互元素并获焦）时不视为「失焦锚定保持」：仅在指针仍悬停卡片时保持。
 *   进入卡片内焦点后移开指针会关闭（如实标注，不做多实例/个性化 openDelay 之外的复杂交互模型）。
 * - 不支持多实例独立 delay 等进阶行为；flip 碰撞翻转/箭头/进出场动画仍目标态（同 `Popover`）。
 */
import { clsx } from "clsx"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { PopoverAlign, PopoverPlacement } from "./Popover"
import { Popover } from "./Popover"
import styles from "./HoverCard.module.css"

const DEFAULT_OPEN_DELAY = 300
const DEFAULT_CLOSE_DELAY = 150

export interface HoverCardProps {
  /**
   * 触发内容。**必须是纯展示/非交互内容**（文本、图标、内联元素等）——会被复用的
   * `Popover` 包进接管交互的 `role="button"` anchor（见 `Popover.trigger` 的诚实边界）。
   * hover / focus 触发本卡片显示。
   */
  trigger: ReactNode
  /** 卡片内容（portal 定位渲染）。 */
  children: ReactNode
  /** 受控展开态。 */
  open?: boolean
  /** 初始展开态（非受控）。 */
  defaultOpen?: boolean
  /** 展开态变化回调（受控/非受控都会触发）。 */
  onOpenChange?: (open: boolean) => void
  /** 悬停进入 delay（ms）。默认 300。focus 触发立即打开，不走本 delay。 */
  openDelay?: number
  /** 移出/失焦后的防抖关闭 delay（ms）。默认 150。 */
  closeDelay?: number
  /** 相对 anchor 的方位。默认 bottom。透传 `Popover.placement`。 */
  placement?: PopoverPlacement
  /** 次级轴对齐。默认 center。透传 `Popover.align`。 */
  align?: PopoverAlign
  /** 附加 className（透传到面板容器，沿用 `Popover.className` 语义）。 */
  className?: string
}

export function HoverCard({
  trigger,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  openDelay = DEFAULT_OPEN_DELAY,
  closeDelay = DEFAULT_CLOSE_DELAY,
  placement = "bottom",
  align = "center",
  className,
}: HoverCardProps) {
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = controlled ? open : internalOpen

  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const wrapRef = useRef<HTMLSpanElement>(null)
  const hoveringRef = useRef(false) // 指针悬停在 anchor 包装上
  const hoveringContentRef = useRef(false) // 指针悬停在 portal 面板内
  const focusedRef = useRef(false) // anchor 获焦
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearOpenTimer = () => {
    if (openTimer.current !== null) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const clearTimers = () => {
    clearOpenTimer()
    clearCloseTimer()
  }

  const openNow = () => {
    clearTimers()
    setOpen(true)
  }
  const closeNow = () => {
    clearTimers()
    setOpen(false)
  }
  const scheduleOpen = () => {
    clearCloseTimer()
    openTimer.current = setTimeout(openNow, openDelay)
  }
  const scheduleClose = () => {
    clearOpenTimer()
    closeTimer.current = setTimeout(closeNow, closeDelay)
  }
  const maybeClose = () => {
    if (hoveringRef.current || focusedRef.current || hoveringContentRef.current) return
    scheduleClose()
  }

  // document 级指针追踪：面板经 portal 渲染在 body，指针滑入/滑出卡片需维持/解除「悬停卡片」锁，
  // 否则从 anchor 短暂移开就会误关。面板经 anchor 的 `aria-controls` → `getElementById` 定位。
  useEffect(() => {
    if (!isOpen) return
    const getPanel = () => {
      const anchor = wrapRef.current?.querySelector<HTMLElement>("[aria-controls]")
      const id = anchor?.getAttribute("aria-controls")
      return id ? document.getElementById(id) : null
    }
    const onOver = (e: MouseEvent) => {
      const panel = getPanel()
      if (panel && panel.contains(e.target as Node)) {
        hoveringContentRef.current = true
        clearCloseTimer()
      }
    }
    const onOut = (e: MouseEvent) => {
      const panel = getPanel()
      const related = e.relatedTarget as Node | null
      if (!panel || !panel.contains(related)) {
        hoveringContentRef.current = false
        maybeClose()
      }
    }
    document.addEventListener("mouseover", onOver)
    document.addEventListener("mouseout", onOut)
    return () => {
      document.removeEventListener("mouseover", onOver)
      document.removeEventListener("mouseout", onOut)
    }
  }, [isOpen])

  // 卸载清理：所注册的 delay timer 全部释放。
  useEffect(() => () => clearTimers(), [])

  return (
    <span
      ref={wrapRef}
      className={clsx(styles.wrap)}
      onMouseEnter={() => {
        hoveringRef.current = true
        scheduleOpen()
      }}
      onMouseLeave={() => {
        hoveringRef.current = false
        maybeClose()
      }}
      onFocus={() => {
        focusedRef.current = true
        openNow()
      }}
      onBlur={() => {
        focusedRef.current = false
        maybeClose()
      }}
    >
      <Popover trigger={trigger} open={isOpen} onOpenChange={setOpen} placement={placement} align={align} className={className}>
        {children}
      </Popover>
    </span>
  )
}