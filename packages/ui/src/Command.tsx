/**
 * Command —— `@berkshire/ui` 命令/搜索面板（palette / combobox），shadcn Command 轻移植（无 Radix）。
 *
 * 实现形态：单组件 props 形态（S4「根 + 子件 或 单组件全部 props 任选」取单组件，便于 SSR 冒烟
 * 与稳定 props）。数据驱动：消费方给出 `items`（label + 可选 `keywords`），本件自实现过滤 + 键盘导航。
 *
 * 过滤策略（自实现，不引搜索库，见 S1 依赖政策）：大小写不敏感**子串**匹配，匹配 label 或任一
 * `keywords`；空查询时返回全部。无候选项时显示 `emptyText`（`CommandEmpty` 语义）。
 *
 * 两种用法（props 稳定，至少其一满足弹层组合要求，二者皆支持）：
 * - **内嵌面板**：不传 `trigger`，渲染为独立面板（输入框 + 过滤列表）。
 * - **命令 palette 弹层**：传 `trigger`，经复用 `Popover` 的 portal + 定位包成弹出面板，
 *   支持 `open`/`defaultOpen`/`onOpenChange`（受控/非受控皆可）+ `placement`/`align` 透传。
 *
 * 可访问性：
 * - 输入框 `role="combobox"` + `aria-expanded` + `aria-controls`（指向列表）+ `aria-activedescendant`
 *   （指向高亮项）；列表 `role="listbox"`、项 `role="option"` + `aria-selected`。
 * - 键盘（焦点始终在输入框，active index 自实现）：`ArrowUp/Down` 移动高亮（跳过 disabled、首尾环绕）、
 *   `Enter` 选中、`Esc` 关闭弹层（palette 模式，复用 `Popover` 的 ESC）或清空查询（内嵌模式）、
 *   输入即过滤且焦点保持。
 * - 鼠标：点击项选中；mouseenter 同步高亮到该项。
 *
 * 诚实边界（目标态，本件不实现）：分组 headers、虚拟化大列表、多选、嵌套分组、Async 远程搜索加载
 * （消费方接线，本包不做）、全局快捷键注册（palette 触发由消费方自理）。`disabled` 项可渲染但不参与
 * 导航/选中。
 *
 * 依赖纪律：只 import `react`（宿主注入）+ `react-dom` 的 `createPortal`（经复用的 `Popover`，
 * 宿主注入）+ `clsx`（内联）+ 复用 `Popover`。不加 Tailwind/CVA/tailwind-merge/Radix。
 */
import { clsx } from "clsx"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react"
import type { PopoverAlign, PopoverPlacement } from "./Popover"
import { Popover } from "./Popover"
import styles from "./Command.module.css"

export interface CommandItem {
  /** 稳定键 / 选中回调值。 */
  value: string
  /** 展示与匹配的标签。 */
  label: string
  /** 额外匹配关键词（大小写不敏感子串维度，不展示）。 */
  keywords?: readonly string[]
  /** 禁用：可渲染但不参与键盘导航/选中。 */
  disabled?: boolean
}

export interface CommandProps {
  /** 可选项数据。 */
  items: readonly CommandItem[]
  /** 选中回调（value）。 */
  onSelect?: (value: string) => void
  /** 输入框占位文案。 */
  placeholder?: string
  /** 无候选项时的空态文案。默认「无匹配结果」。 */
  emptyText?: ReactNode
  /**
   * 当前选中值（受控高亮初始化用，消费方常用于回填表单）。
   * 面板中的视觉高亮由键盘/鼠标导航的 active index 决定，本值不驱动导航。
   */
  value?: string
  /**
   * 传则进入「命令 palette 弹层」模式：本件经 `Popover` 包成弹出面板（触发内容必为纯展示物，
   * 契约同 `Popover.trigger`）。不传则为「内嵌面板」模式。
   */
  trigger?: ReactNode
  /** 弹层受控展开态（仅 palette 模式）。 */
  open?: boolean
  /** 弹层初始展开态（仅 palette 模式，非受控）。 */
  defaultOpen?: boolean
  /** 展开态变化回调（仅 palette 模式，受控/非受控都会触发）。 */
  onOpenChange?: (open: boolean) => void
  /** 弹层相对 anchor 的方位（仅 palette 模式，透传 `Popover.placement`）。默认 bottom。 */
  placement?: PopoverPlacement
  /** 弹层次级轴对齐（仅 palette 模式，透传 `Popover.align`）。默认 start。 */
  align?: PopoverAlign
  /** 附加 className（内嵌模式透传到根容器；palette 模式透传到 `Popover` 面板）。 */
  className?: string
}

/** 大小写不敏感子串匹配单一项（label 或任一 keyword）。 */
function matches(query: string, item: CommandItem): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (item.label.toLowerCase().includes(q)) return true
  return (item.keywords ?? []).some((k) => k.toLowerCase().includes(q))
}

export function Command({
  items,
  onSelect,
  placeholder = "搜索…",
  emptyText = "无匹配结果",
  value,
  trigger,
  open,
  defaultOpen = false,
  onOpenChange,
  placement = "bottom",
  align = "start",
  className,
}: CommandProps) {
  const palette = trigger !== undefined
  // palette 模式展开受控镜像：Command 自管 open，使「打开即聚焦搜索框」在受控/非受控下行为一致
  // （非受控时 Popover 内部展开不会回填到本组件的 `open`，若不镜像则焦点 effect 永不触发）。
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = controlled ? !!open : internalOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const [query, setQuery] = useState("")
  const listRootId = useId()
  const listId = `${listRootId}-list`
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 过滤（自实现子串匹配）。
  const filtered = useMemo(
    () => items.filter((it) => matches(query, it)),
    [items, query],
  )

  // active index：随查询/候选项变化复位到首个可用项；超界钳位。
  const [activeIndex, setActiveIndex] = useState(0)
  const signature = filtered.map((it) => `${it.value}::${it.disabled ?? ""}`).join("\u0000")
  useEffect(() => {
    const first = filtered.findIndex((it) => !it.disabled)
    setActiveIndex(first === -1 ? -1 : first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  // 弹层展开时把焦点交给输入框（palette 模式）。依赖派生 `isOpen`（非受控镜像也让它在展开时触发）。
  useEffect(() => {
    if (palette && isOpen) inputRef.current?.focus()
  }, [palette, isOpen])

  // 高亮项随导航滚动进视口（保持焦点在输入框，不移动真实焦点）。
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.children[activeIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  // 键盘导航：跳过 disabled、首尾环绕；Enter 选中；Esc 关闭弹层（palette）或清空查询（内嵌）。
  const move = (delta: number) => {
    setActiveIndex((prev) => {
      if (filtered.length === 0) return -1
      const n = filtered.length
      for (let step = 1; step <= n; step++) {
        const idx = (prev + delta * step + n) % n
        if (!filtered[idx]?.disabled) return idx
      }
      return prev
    })
  }
  const select = (idx: number) => {
    const it = filtered[idx]
    if (it && !it.disabled) onSelect?.(it.value)
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        move(1)
        break
      case "ArrowUp":
        e.preventDefault()
        move(-1)
        break
      case "Enter":
        if (activeIndex >= 0) {
          e.preventDefault()
          select(activeIndex)
        }
        break
      case "Escape":
        if (palette) {
          onOpenChange?.(false)
        } else {
          e.preventDefault()
          setQuery("")
        }
        break
    }
  }

  const inner = (
    <div className={clsx(styles.inner)}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={palette ? isOpen : true /* 内嵌模式列表常显，视作恒展开；palette 模式随弹层展开 */}
        aria-controls={listId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className={clsx(styles.search)}
      />
      {filtered.length > 0 ? (
        <ul ref={listRef} id={listId} role="listbox" className={clsx(styles.list)}>
          {filtered.map((it, i) => (
            <li
              key={it.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              aria-disabled={it.disabled || undefined}
              className={clsx(
                styles.item,
                i === activeIndex && styles.itemActive,
                it.disabled && styles.itemDisabled,
              )}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => select(i)}
            >
              {it.label}
            </li>
          ))}
        </ul>
      ) : (
        <div role="status" className={clsx(styles.empty)}>
          {emptyText}
        </div>
      )}
    </div>
  )

  // palette 模式：复用 Popover 的 portal + 定位/面板；数据回填经 value 提示消费方。
  if (palette) {
    return (
      <Popover
        trigger={trigger}
        open={isOpen}
        onOpenChange={setOpen}
        placement={placement}
        align={align}
        className={className}
      >
        {inner}
      </Popover>
    )
  }
  return <div className={clsx(styles.root, className)}>{inner}</div>
}