/**
 * DatePicker —— `@berkshire/ui` 日期选择器（shadcn 移植，最小可用子集）。
 *
 * 触发元素（非交互样式的日期显示）→ 复用 `Popover` 的 portal 定位外壳弹出日历格网，
 * 点选/键盘选中后回填 `onChange` 并自动收起。
 *
 * ## 依赖政策（见 `.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`）
 * 一律不放行新 UI 库：**不放行 date-fns**，日历格网用原生 `Date` + 自实现月算法（零新增运行时
 * 依赖，只依赖 `react`/`react-dom`/`clsx`）。复用 `Popover` 而非自造 portal。
 *
 * ## 日期语义（数据契约红线，必读）
 * 本组件**一律以本地时区 `Date` 运算与交付**：
 * - 内部比较只用 `getFullYear()/getMonth()/getDate()`（本地日），`onChange` 交付**本地时区**
 *   `Date | null`，不把本地 Date 当已 UTC 序列化、不做任何时区转换。
 * - `min`/`max` 亦按本地日在整日精度上钳制（不涉时间分量）。
 * 消费方若需要在别的时区归档，应在自己的数据/序列化层做显式转换，本组件不越权。
 *
 * ## 诚实（目标态）
 * 已落地：单日期 + 月视图格网 + 前后月导航 + 键盘选中（Arrow/Home/End + Enter/Space，Esc 由
 * Popover 负责）＋ 今天高亮 ＋ `min`/`max` 钳制 ＋ `weekStart` 周起始。**目标态子集不实现**：
 * 日期范围/区间选择、多日选择、周视图/日视口、完整 i18n（周起始可配置已支持，但月份/星期文案
 * 仅本地化展示，非完整日历本地化）、禁用日集合（当前只由 min/max 隐式产出）、可编辑键盘输入
 * 回填（当前触发器只读展示）。其中范围/多日若将来被证明必须，需回评是否放行 date-fns（见 S1 决策）。
 */
import { clsx } from "clsx"
import { useEffect, useMemo, useRef, useState } from "react"
import { Popover } from "./Popover"
import styles from "./DatePicker.module.css"

// ── 原生 Date 月算法辅助（不放行 date-fns）──────────────────────────────────
/** 规整到本地时区当日零点；跨夏令时/DST 安全的日运算基线。 */
function toDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
/** 本地日内是否同一（忽略时间分量）。 */
function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}
/** 可排序的本地日键（y*10000+m*100+d），用于 min/max 比较。 */
function dateKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}
/** 把 day 钳到 (year, month) 内有效日（1..last）。 */
function clampDay(year: number, month: number, day: number): number {
  const last = new Date(year, month + 1, 0).getDate()
  return Math.max(1, Math.min(day, last))
}
/** 在月历上加减 delta 个月，保留日期号（越月自动进位/退位）。 */
function moveMonth(year: number, month: number, day: number, delta: number): Date {
  const total = year * 12 + month + delta
  const y = Math.floor(total / 12)
  const m = ((total % 12) + 12) % 12
  return new Date(y, m, clampDay(y, m, day))
}

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"] as const

/** 周起始列头（默认周日起）。 */
function weekdayLabels(weekStart: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 7; i++) out.push(WEEKDAY_SHORT[(weekStart + i) % 7]!)
  return out
}

/** 完整日期文案（含星期），用于格 cell 的 aria-label。 */
function formatFullDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(d)
}
/** 触发器显示短日期（yyyy/MM/dd 风格，依 locale）。 */
function formatShort(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(
    toDay(d),
  )
}
/** 面板标题：年月（如「2026年9月」）。 */
function formatMonthTitle(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year, month, 1),
  )
}

export interface DatePickerProps {
  /** 受控选中日期（本地时区 Date，或 null 表示未选）。 */
  value?: Date | null
  /** 初始选中日期（非受控；日期语义见 JSDoc 顶部）。 */
  defaultValue?: Date | null
  /** 选中变化回调，交付本地时区 `Date | null`。 */
  onChange?: (date: Date | null) => void
  /** 可选的本地日下限（整日精度钳制，之前日期禁用）。 */
  min?: Date
  /** 可选的本地日上限（整日精度钳制，之后日期禁用）。 */
  max?: Date
  /** 未选时的触发器占位文案。默认「选择日期」。 */
  placeholder?: string
  /** 周起始：0=周日…6=周六。默认 0（对齐 shadcn 惯例）。 */
  weekStart?: number
  /** 注入「今天」（仅影响今天高亮；默认 `new Date()`，便于测试/时区固定）。 */
  today?: Date
  /** 展示文案 locale（仅影响 Intl 展示/命名，非完整日历本地化）。默认 `zh-CN`。 */
  locale?: string
  /** 受控展开态（透传 Popover）。 */
  open?: boolean
  /** 初始展开态（非受控）。 */
  defaultOpen?: boolean
  /** 展开态变化回调。 */
  onOpenChange?: (open: boolean) => void
  /** 禁用态：不弹面板、样式置灰、`onChange` 不触发。 */
  disabled?: boolean
  /** 附加 className（透传到面板容器）。 */
  className?: string
}

export function DatePicker({
  value,
  defaultValue,
  onChange,
  min,
  max,
  placeholder = "选择日期",
  weekStart = 0,
  today,
  locale = "zh-CN",
  open,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
}: DatePickerProps) {
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = (controlled ? !!open : internalOpen) && !disabled

  const setOpen = (next: boolean) => {
    if (!disabled) {
      if (!controlled) setInternalOpen(next)
      onOpenChange?.(next)
    }
  }

  const todayRef = useRef(today ?? new Date())
  const [cursor, setCursor] = useState<Date>(() =>
    toDay(defaultValue ?? value ?? todayRef.current),
  )

  // 打开面板时把「焦点日」重置到选中/今天的月份，保证每次展开都以正确月份起步。
  useEffect(() => {
    if (!isOpen) return
    setCursor(toDay(value ?? todayRef.current))
  }, [isOpen])

  const cursorKey = dateKey(cursor)
  const cy = cursor.getFullYear()
  const cm = cursor.getMonth()
  const labels = useMemo(() => weekdayLabels(weekStart % 7), [weekStart])

  // 月视图单元格（含上月/下月溢出格，inMonth=false 走弱化态）。
  const cells = useMemo(() => {
    const daysInMonth = new Date(cy, cm + 1, 0).getDate()
    const firstWeekday = new Date(cy, cm, 1).getDay()
    const offset = ((firstWeekday - (weekStart % 7)) + 7) % 7
    const total = Math.ceil((offset + daysInMonth) / 7) * 7
    const list: { date: Date; day: number; inMonth: boolean }[] = []
    for (let i = 0; i < total; i++) {
      const day = i - offset + 1
      list.push({ date: new Date(cy, cm, day), day, inMonth: day >= 1 && day <= daysInMonth })
    }
    return list
  }, [cy, cm, weekStart])

  const rows = useMemo(() => {
    const out: typeof cells[] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [cells])

  const isDayDisabled = (d: Date) => {
    const k = dateKey(d)
    if (min && k < dateKey(toDay(min))) return true
    if (max && k > dateKey(toDay(max))) return true
    return false
  }

  const canPrev = !min || cy * 12 + cm - 1 >= min.getFullYear() * 12 + min.getMonth()
  const canNext = !max || cy * 12 + cm + 1 <= max.getFullYear() * 12 + max.getMonth()

  const selectDate = (d: Date) => {
    if (disabled || isDayDisabled(d)) return
    onChange?.(d)
    setOpen(false)
  }

  // 行内焦点管理：roving tabindex（聚焦日唯一 tabbable）+ 打开/切月时把焦点推到该 cell。
  const gridRef = useRef<HTMLDivElement>(null)
  const dayEls = useRef(new Map<number, HTMLButtonElement>())
  const setDayRef = (key: number) => (el: HTMLButtonElement | null) => {
    if (el) dayEls.current.set(key, el)
    else dayEls.current.delete(key)
  }
  useEffect(() => {
    if (!isOpen) return
    dayEls.current.get(cursorKey)?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cursorKey])

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const d = cursor.getDate()
    let next: Date | null = null
    switch (e.key) {
      case "ArrowLeft":
        next = new Date(cy, cm, d - 1)
        break
      case "ArrowRight":
        next = new Date(cy, cm, d + 1)
        break
      case "ArrowUp":
        next = new Date(cy, cm, d - 7)
        break
      case "ArrowDown":
        next = new Date(cy, cm, d + 7)
        break
      case "Home":
        next = new Date(cy, cm, 1)
        break
      case "End":
        next = new Date(cy, cm, new Date(cy, cm + 1, 0).getDate())
        break
      case "PageUp":
        next = moveMonth(cy, cm, d, -1)
        break
      case "PageDown":
        next = moveMonth(cy, cm, d, 1)
        break
      case "Enter":
      case " ":
        e.preventDefault()
        selectDate(cursor)
        return
      default:
        return
    }
    if (next) {
      e.preventDefault()
      setCursor(next)
    }
  }

  const selectedKey = value ? dateKey(toDay(value)) : null
  const todayKey = dateKey(todayRef.current)

  return (
    <Popover
      open={isOpen}
      onOpenChange={setOpen}
      className={clsx(styles.panel, className)}
      trigger={
        <span
          className={clsx(styles.triggerDisplay, disabled && styles.triggerDisabled)}
          aria-hidden="false"
        >
          <span className={styles.triggerText}>
            {value ? formatShort(value, locale) : placeholder}
          </span>
          <svg
            className={styles.chevron}
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <path
              d="M3 6l5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      }
    >
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="上个月"
          disabled={!canPrev || !isOpen}
          onClick={() =>
            setCursor(moveMonth(cy, cm, cursor.getDate(), -1))
          }
        >
          ‹
        </button>
        <div className={styles.headerTitle} aria-live="polite">
          {formatMonthTitle(cy, cm, locale)}
        </div>
        <button
          type="button"
          className={styles.navBtn}
          aria-label="下个月"
          disabled={!canNext || !isOpen}
          onClick={() =>
            setCursor(moveMonth(cy, cm, cursor.getDate(), 1))
          }
        >
          ›
        </button>
      </div>

      <div
        ref={gridRef}
        className={styles.grid}
        role="grid"
        aria-label={`选择日期 ${formatMonthTitle(cy, cm, locale)}`}
        onKeyDown={onGridKeyDown}
      >
        <div role="row" className={styles.weekRow}>
          {labels.map((label) => (
            <div key={label} role="columnheader" className={styles.weekday}>
              {label}
            </div>
          ))}
        </div>
        {rows.map((row, ri) => (
          <div role="row" className={styles.weekRow} key={ri}>
            {row.map((cell) => {
              const key = dateKey(cell.date)
              const isSelected = selectedKey === key
              const isToday = todayKey === key
              const isCursor = cursorKey === key
              const cellDisabled = isDayDisabled(cell.date)
              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  tabIndex={isCursor ? 0 : -1}
                  ref={setDayRef(key)}
                  className={clsx(
                    styles.cellBtn,
                    !cell.inMonth && styles.cellOut,
                    isSelected && styles.cellSelected,
                    isToday && !isSelected && styles.cellToday,
                    cellDisabled && styles.cellDisabled,
                  )}
                  aria-selected={isSelected || undefined}
                  aria-label={formatFullDate(cell.date, locale)}
                  onClick={() => selectDate(cell.date)}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Popover>
  )
}