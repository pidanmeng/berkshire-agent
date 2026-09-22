/**
 * `@berkshire/ui` —— React 原子组件库（独立可打包发布）。
 *
 * 独立于宿主 / base-ui / core：不 import 任何运行时，仅依赖 `react`（宿主注入）与 `clsx`（内联）。
 * 样式纪律：全部 CSS Modules，只写 `var(--bk-*)`（别名层令牌），禁魔法色值；暗色由 static 层单表覆盖。
 *
 * 接口冻结：组件命名与 props 形状按本包声明稳定，JSDoc 中文标注 + 诚实边界（可访问性基础已内置）。
 *
 * 诚实：S4 已落地 portal 定位的 `Popover`（复杂弹层首件，方案 1 自实现，见
 * `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`）；S3 已落地
 * `AlertDialog`（确认/告警式模态）、`HoverCard`（hover/focus 触发的上下文卡片）
 * 与屏幕边缘滑出面板 `Sheet`/`Drawer`（共享 `overlay.ts` 的焦点陷阱/ESC/滚动锁机制 + 入场动画，
 * 拖拽收放/离场动画为「目标态」）、通用可折叠导航原语 `Sidebar`（折叠/展开 + 分组 + 菜单族，
 * 与 base-ui 壳业务侧栏是两物、不做响应式抽屉/路由联动，见 `Sidebar.tsx`）以及 **`Dialog` 复合家族
 * （`Dialog`/`Trigger`/`Portal`/`Close`/`Overlay`/`Content`/`Header`/`Footer`/`Title`/`Description`，
 * **取代既有 `Modal`**，普通模态对话框用它），
 * S4 已落地 `Command`（命令/搜索面板，单组件 props 形态，自实现过滤 + 键盘导航，可内嵌亦可复用
 * `Popover` 组合成命令 palette 弹层）与 `DataTable`（数据表格组合容器：在既有 `Table` 之上加
 * 自实现排序 + 复用 `Pagination` 分页 + 可选全局面板筛选/行选择，零新增运行时依赖，不改 `Table`
 * API；虚拟化/远程装载/列级多重筛选/全选 indeterminate 为「目标态」，见 `DataTable.tsx`），
 * 以及 `DatePicker`（日期选择，最小核心子集：单日期 + 月格网 + 月导航 + 键盘选中，
 * 复用 `Popover` 外壳、自实现日历格网、**不放行 date-fns**；日期范围/多日/完整本地化为「目标态」，
 * 本地时区语义见 `DatePicker.tsx`），
 * 见 shadcn-import-decision Agent Note；
 * 其余复杂弹层（ContextMenu、flip 碰撞翻转 / 箭头 / 完整动画）仍为「目标态/待决策」。
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

export { Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./Dialog"
export type {
  DialogProps,
  DialogTriggerProps,
  DialogPortalProps,
  DialogCloseProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogHeaderProps,
  DialogFooterProps,
  DialogTitleProps,
  DialogDescriptionProps,
} from "./Dialog"

export { AlertDialog } from "./AlertDialog"
export type { AlertDialogProps } from "./AlertDialog"

export { Sheet } from "./Sheet"
export type { SheetProps, SheetSide } from "./Sheet"

export { Drawer } from "./Drawer"
export type { DrawerProps } from "./Drawer"

export { Toast } from "./Toast"
export type { ToastProps, ToastKind } from "./Toast"

export { ToastRegion } from "./ToastRegion"
export type { ToastRegionProps } from "./ToastRegion"

export { Notification } from "./Notification"
export type { NotificationProps, NotificationKind } from "./Notification"

export { Badge } from "./Badge"
export type { BadgeProps, BadgeKind, BadgeVariant } from "./Badge"

export { Spinner } from "./Spinner"
export type { SpinnerProps, SpinnerSize } from "./Spinner"

export { Kbd } from "./Kbd"
export type { KbdProps } from "./Kbd"

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

export { Pagination } from "./Pagination"
export type { PaginationProps } from "./Pagination"

export { ScrollArea, Scrollbar } from "./ScrollArea"
export type { ScrollAreaProps, ScrollbarProps, ScrollAreaType, ScrollbarOrientation } from "./ScrollArea"

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "./Breadcrumb"
export type {
  BreadcrumbProps,
  BreadcrumbEntry,
  BreadcrumbListProps,
  BreadcrumbItemProps,
  BreadcrumbLinkProps,
  BreadcrumbPageProps,
  BreadcrumbSeparatorProps,
  BreadcrumbEllipsisProps,
} from "./Breadcrumb"

export { Toggle } from "./Toggle"
export type { ToggleProps } from "./Toggle"

export { ToggleGroup, ToggleGroupItem } from "./ToggleGroup"
export type { ToggleGroupProps, ToggleGroupItemProps, ToggleGroupType } from "./ToggleGroup"

export { ButtonGroup } from "./ButtonGroup"
export type { ButtonGroupProps } from "./ButtonGroup"

export { Resizable, ResizablePanel, ResizableHandle } from "./Resizable"
export type { ResizableProps, ResizablePanelProps, ResizableHandleProps, ResizeDirection } from "./Resizable"

export { HoverCard } from "./HoverCard"
export type { HoverCardProps } from "./HoverCard"

export { Command } from "./Command"
export type { CommandProps, CommandItem } from "./Command"

export { DataTable } from "./DataTable"
export type { DataTableProps, DataTableColumn, DataTableSortDirection } from "./DataTable"

export { DatePicker } from "./DatePicker"
export type { DatePickerProps } from "./DatePicker"

export {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarInput,
  SidebarSeparator,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
  SidebarCollapseTrigger,
  useSidebar,
} from "./Sidebar"
export type {
  SidebarProps,
  SidebarProviderProps,
  SidebarHeaderProps,
  SidebarContentProps,
  SidebarFooterProps,
  SidebarGroupProps,
  SidebarGroupLabelProps,
  SidebarGroupActionProps,
  SidebarGroupContentProps,
  SidebarMenuProps,
  SidebarMenuItemProps,
  SidebarMenuButtonProps,
  SidebarMenuActionProps,
  SidebarMenuBadgeProps,
  SidebarMenuSubProps,
  SidebarMenuSubItemProps,
  SidebarMenuSubButtonProps,
  SidebarInputProps,
  SidebarSeparatorProps,
  SidebarRailProps,
  SidebarInsetProps,
  SidebarTriggerProps,
  SidebarCollapseTriggerProps,
} from "./Sidebar"