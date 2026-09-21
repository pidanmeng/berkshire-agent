/**
 * Tabs —— `@berkshire/ui` 标签页（shadcn new-york 结构参照，轻实现无 Radix）。
 *
 * 组合子组件：`Tabs` + `TabsList`(tablist)` + `TabsTrigger`(tab，按 `value` 激活)` + `TabsContent`(panel)。
 * 支持受控（`value` + `onValueChange`）与非受控（`defaultValue`）两种用法。
 * 可访问性：`role="tablist"/"tab"/"tabpanel"` + `aria-selected`/`aria-controls`/`aria-labelledby`；
 * 键盘 Tab 在 tablist 内移动、箭头键切换由消费方按需增强（v1 不自动接箭头键）。
 * 激活面板使用惰性渲染（未激活的 TabsContent 不挂载）。
 */
import { clsx } from "clsx"
import { createContext, useContext, useId, useState } from "react"
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"
import styles from "./Tabs.module.css"

interface TabsCtx {
  current: string | undefined
  setValue: (value: string) => void
  baseId: string
}
const Ctx = createContext<TabsCtx | null>(null)
function useTabsCtx(): TabsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("Tabs 子组件必须在 <Tabs> 内使用")
  return ctx
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 非受控：默认激活值。 */
  defaultValue?: string
  /** 受控：当前激活值。 */
  value?: string
  /** 值变化回调（受控/非受控均触发）。 */
  onValueChange?: (value: string) => void
  children?: ReactNode
  className?: string
}

/** `Tabs` 根：持有激活值并通过 Context 下发给 trigger/content。 */
export function Tabs({ defaultValue, value, onValueChange, className, children, ...rest }: TabsProps) {
  const [inner, setInner] = useState(defaultValue)
  const current = value ?? inner
  const baseId = useId()
  const setValue = (v: string) => {
    setInner(v)
    onValueChange?.(v)
  }
  return (
    <Ctx.Provider value={{ current, setValue, baseId }}>
      <div className={clsx(styles.tabs, className)} {...rest}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export interface TabsListProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  className?: string
}

/** `TabsList`：触发器的容器（`role="tablist"`）。 */
export function TabsList({ className, children, ...rest }: TabsListProps) {
  return (
    <div role="tablist" className={clsx(styles.list, className)} {...rest}>
      {children}
    </div>
  )
}

export interface TabsTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  /** 该触发器对应的面板值。 */
  value: string
  children?: ReactNode
  className?: string
}

/** `TabsTrigger`：可点击的 tab（按 `value` 判定激活态）。 */
export function TabsTrigger({ value, className, children, ...rest }: TabsTriggerProps) {
  const ctx = useTabsCtx()
  const active = ctx.current === value
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-trigger-${value}`}
      aria-selected={active}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className={clsx(styles.trigger, active && styles.triggerActive, className)}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  /** 该面板对应的值。 */
  value: string
  children?: ReactNode
  className?: string
}

/** `TabsContent`：激活时的面板；未激活不渲染（惰性）。 */
export function TabsContent({ value, className, children, ...rest }: TabsContentProps) {
  const ctx = useTabsCtx()
  if (ctx.current !== value) return null
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-trigger-${value}`}
      className={clsx(styles.content, className)}
      {...rest}
    >
      {children}
    </div>
  )
}