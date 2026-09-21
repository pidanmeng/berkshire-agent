/**
 * `@berkshire/ui` —— React 原子组件库（独立可打包发布）。
 *
 * 独立于宿主 / base-ui / core：不 import 任何运行时，仅依赖 `react`（宿主注入）与 `clsx`（内联）。
 * 样式纪律：全部 CSS Modules，只写 `var(--bk-*)`（别名层令牌），禁魔法色值；暗色由 static 层单表覆盖。
 *
 * 接口冻结：组件命名与 props 形状按本包声明稳定，JSDoc 中文标注 + 诚实边界（可访问性基础已内置）。
 *
 * 诚实：S4 已落地 portal 定位的 `Popover`（复杂弹层首件，方案 1 自实现，见
 * `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`）；其余复杂弹层
 * （Combobox / Drawer / ContextMenu、flip 碰撞翻转 / 箭头 / 动画）仍为「目标态/待决策」。
 */
export { Button } from "./Button"
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button"

export { Input } from "./Input"
export type { InputProps } from "./Input"

export { Select } from "./Select"
export type { SelectProps, SelectOption } from "./Select"

export { Dropdown } from "./Dropdown"
export type { DropdownProps, DropdownItem } from "./Dropdown"

export { Popover } from "./Popover"
export type { PopoverProps, PopoverPlacement, PopoverAlign } from "./Popover"

export { Modal } from "./Modal"
export type { ModalProps } from "./Modal"

export { Toast } from "./Toast"
export type { ToastProps, ToastKind } from "./Toast"

export { ToastRegion } from "./ToastRegion"
export type { ToastRegionProps } from "./ToastRegion"

export { Notification } from "./Notification"
export type { NotificationProps, NotificationKind } from "./Notification"

export { Badge } from "./Badge"
export type { BadgeProps, BadgeKind, BadgeVariant } from "./Badge"

export { Tooltip } from "./Tooltip"
export type { TooltipProps } from "./Tooltip"

export { EmptyState } from "./EmptyState"
export type { EmptyStateProps } from "./EmptyState"

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card"
export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
} from "./Card"

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./Table"
export type {
  TableProps,
  TableHeaderProps,
  TableBodyProps,
  TableRowProps,
  TableHeadProps,
  TableCellProps,
} from "./Table"

export { Tabs, TabsList, TabsTrigger, TabsContent } from "./Tabs"
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from "./Tabs"

export { Switch } from "./Switch"
export type { SwitchProps } from "./Switch"

export { Checkbox } from "./Checkbox"
export type { CheckboxProps } from "./Checkbox"

export { Divider } from "./Divider"
export type { DividerProps } from "./Divider"