/**
 * ToggleGroup —— `@berkshire/ui` 分组开关（shadcn new-york 结构参照，轻实现无 Radix）。
 *
 * 组合子组件：`ToggleGroup`（容器，持有选择态）+ `ToggleGroupItem`（子项，内部渲染一个
 * `Toggle`）。支持单选（`type="single"`，最多一个开启）与多选（`type="multiple"`，各自独立
 * 切换）。受控（`value` + `onValueChange`）与非受控（`defaultValue`）两种用法；`value`/返回
 * 值在单选为 `string`、多选为 `string[]`。
 *
 * 可访问性：单选用 `role="radiogroup"`（子项 `role="radio"` + `aria-checked`），多选用
 * `role="group"` + 子项 `aria-pressed`。诚实边界：v1 提供基础 Tab 逐个可达；主/副轴方向键
 * （`radiogroup` 的建议增强）未自动接入，由消费方按需增强（同 Tabs v1 取舍，不引 Radix 虚拟
 * 焦点环）。`disabled` 透传给全部子项。
 */
import { clsx } from "clsx"
import { createContext, useContext, useState } from "react"
import type { HTMLAttributes, MouseEvent, ReactNode } from "react"
import { Toggle } from "./Toggle"
import type { ToggleProps } from "./Toggle"
import styles from "./ToggleGroup.module.css"

export type ToggleGroupType = "single" | "multiple"

interface GroupCtx {
  type: ToggleGroupType
  value: string[]
  onToggle: (value: string, nextPressed: boolean) => void
  groupDisabled: boolean
}
const Ctx = createContext<GroupCtx | null>(null)
function useGroup(): GroupCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("ToggleGroup 的子组件必须在 <ToggleGroup> 内使用")
  return ctx
}

function toArray(v: string | string[] | undefined): string[] {
  if (v == null) return []
  return Array.isArray(v) ? [...v] : [v]
}

export interface ToggleGroupProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "value"> {
  /** 类型：`single` 单选 / `multiple` 多选。默认 `single`。 */
  type?: ToggleGroupType
  /** 受控：当前开启值（单选为 string，多选为 string[]）。 */
  value?: string | string[]
  /** 非受控：初始开启值。 */
  defaultValue?: string | string[]
  /** 值变化回调：单选收 string，多选收 string[]。 */
  onValueChange?: (value: string | string[]) => void
  /** 无障碍名（`aria-label`，radiogroup/group 需要可读名时）。 */
  label?: string
  /** 整体禁用：透传给全部子项。 */
  disabled?: boolean
  children?: ReactNode
  className?: string
}

/** `ToggleGroup` 根：持有选择态并通过 Context 下发给子项。 */
export function ToggleGroup({
  type = "single",
  value,
  defaultValue,
  onValueChange,
  label,
  disabled = false,
  className,
  children,
  ...rest
}: ToggleGroupProps) {
  const [inner, setInner] = useState<string[]>(() => toArray(defaultValue))
  const current = value !== undefined ? toArray(value) : inner

  const onToggle = (v: string, nextPressed: boolean) => {
    if (type === "single") {
      setInner([v])
      onValueChange?.(v)
    } else {
      const next = nextPressed ? [...current, v] : current.filter((x) => x !== v)
      setInner(next)
      onValueChange?.(next)
    }
  }

  const role = type === "single" ? "radiogroup" : "group"
  return (
    <Ctx.Provider value={{ type, value: current, onToggle, groupDisabled: disabled }}>
      <div role={role} aria-label={label} className={clsx(styles.group, className)} {...rest}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export interface ToggleGroupItemProps
  extends Omit<ToggleProps, "pressed" | "defaultPressed" | "onPressedChange"> {
  /** 该子项的取值（加入 / 移出选择态以此匹配）。 */
  value: string
}

/** `ToggleGroupItem`：组内一个可开关子项（内部渲染 `Toggle`，开启态/语义由组注入）。 */
export function ToggleGroupItem({
  value,
  disabled,
  className,
  children,
  onClick,
  ...rest
}: ToggleGroupItemProps) {
  const { type, value: current, onToggle, groupDisabled } = useGroup()
  const pressed = current.includes(value)
  const single = type === "single"

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    onToggle(value, !pressed)
    onClick?.(e)
  }

  return (
    <Toggle
      pressed={pressed}
      role={single ? "radio" : undefined}
      aria-pressed={single ? undefined : pressed}
      aria-checked={single ? pressed : undefined}
      onPressedChange={undefined}
      onClick={handleClick}
      disabled={disabled || groupDisabled}
      className={clsx(styles.item, className)}
      {...rest}
    >
      {children}
    </Toggle>
  )
}