# Agent Note: Dialog 取代 Modal + 补全 shadcn Sidebar 家族并让 base-ui 消费（S1 决策部分超驰）

Status: implemented

## 问题

`shadcn-import-decision`（[2026-09-21-shadcn-import-decision.md](2026-09-21-shadcn-import-decision.md)）S1 阶段冻结了两条契约：其一「Dialog(8)↔Modal 语义等价，维持 Modal、不加 Dialog 导出」；其二「通用 Sidebar 原语入 `@berkshire/ui`，壳侧 Sidebar 保留为壳私有实例、不重构为消费通用原语（列为目标态）」。

后续实践中用户（作为权威决策者）指出：既有 `Modal` 是「整体单组件 + 受控 open/onClose」形态，而 shadcn 官方的 `Dialog` 是**复合家族**（`Dialog`/`Trigger`/`Portal`/`Close`/`Overlay`/`Content`/`Header`/`Footer`/`Title`/`Description`）；同理 `@berkshire/ui` 的 `Sidebar` 家族缺少 `SidebarGroup` 等分组子件与 `SidebarProvider`/`Rail`/`Separator`/`MenuSub` 等，导致 base-ui 壳侧仍用手写 `<div class=navSection>` 模拟分组，而非消费通用原语。两条 S1 决策都据此被部分超驰。

## 决策

以用户拍板的取舍超驰 S1 决策的对应条目（仅这两条；`shadcn-import-decision` 的其余契约，如命名对齐、依赖政策、零新 UI 库基线，保持 active）：

### Dialog 取代 Modal

`@berkshire/ui` 提供 shadcn 官方 `Dialog` **复合家族**：`Dialog`（受控 `open`/`onOpenChange` 根，Context Provider）+ `DialogTrigger` + `DialogPortal`（`createPortal`）+ `DialogClose` + `DialogOverlay`（遮罩点击关闭）+ `DialogContent`（portal + 焦点陷阱 + ESC/遮罩关闭 + body 滚动锁 + 可选内建 ✕ 关闭按钮 + 入场动画）+ `DialogHeader`/`DialogFooter`/`DialogTitle`/`DialogDescription`（布局语义件）。

- **自实现、零新 UI 库依赖**：复用 `overlay.ts` 的 `useFocusOnOpen`/`useFocusTrap`/`useEscToClose`/`useScrollLock`，与 `Sheet`/`Drawer`/既有 `Modal` 同一机制；样式 CSS Modules + `var(--bk-*)`。**不引 `@base-ui/react`**——因此没有 shadcn 官方的 `asChild`（`render`）；`DialogTrigger`/`DialogClose` 直接渲染原生 `<button>`。
- **`Modal` 移除导出并删除源码**（`Modal.tsx`/`Modal.module.css` 从 `packages/ui/src` 删除）。普通对话框一律用 `DialogContent` 承载。真正消费方迁移：base-ui 的 `SettingsDialog`（唯一消费者）从 `Modal` 改为 `Dialog`+`DialogContent`（保留其 `Tabs` 左分组左导航与持久化表单）。
- `AlertDialog`（告警/确认语义）**保持独立**，不归入 `Dialog` 家族，也不曾被 Modal 承担——不改其源码语义。

### 补全 shadcn Sidebar 家族 + base-ui 消费 SidebarGroup

`@berkshire/ui` 的 `Sidebar` 家族补全为完整 shadcn 复合命名：在既有 `Sidebar`/`SidebarHeader`/`SidebarContent`/`SidebarFooter`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton`/`SidebarCollapseTrigger`/`useSidebar` 之上，新增 `SidebarProvider`（可选上下文提供方）、`SidebarGroup`/`SidebarGroupLabel`/`SidebarGroupAction`/`SidebarGroupContent`、`SidebarMenuAction`/`SidebarMenuBadge`/`SidebarMenuSub`/`SidebarMenuSubItem`/`SidebarMenuSubButton`、`SidebarTrigger`、`SidebarRail`、`SidebarInset`、`SidebarSeparator`、`SidebarInput`。

- 折叠态上下文仍由根 `Sidebar`（或 `SidebarProvider`）提供，`useSidebar()` 下发；`useSidebar` 在无包裹时返回安全默认（`collapsed:false`），不抛错。
- **诚实边界：移动端 offcanvas/抽屉（经 `Sheet`）、`SidebarRail` 拖拽、`SidebarGroupAction` hover-reveal、`MenuSkeleton` 骨架态、`variant=collapsible` 响应式为「目标态」**（`SidebarRail`/`SidebarInset` 子件本身已提供为常驻窄条/内容内嵌容器；拖拽、gap 动画、响应式抽屉仍目标态，不虚标已实现）。
- **base-ui 壳 Sidebar 重写为消费通用原语的分组族**：用 `SidebarGroup`/`SidebarGroupLabel`/`SidebarGroupContent` 承载核心 pinned + 插件 `section` 分组，替代手写 `.navSection`/`.sectionLabel`；删除对应 CSS。路由仍由消费方 prop 注入 + `useNavigate` + `active`（无路由联动进原语）。这兑现了 S1「壳后续可重构为消费通用原语」的目标态。**该「分组族消费 section 分组」部分已被取代**（分组取消、插件页与首页同权扁平 + `SidebarItem` 模型与排序/隐藏/预设出口，见 [2026-09-22-sidebar-flat-nav-item-seam.md](2026-09-22-sidebar-flat-nav-item-seam.md)）；`@berkshire/ui` 的 `SidebarGroup` 族原语本身保留 active。

## 超驰账（supersession）

对 `2026-09-21-shadcn-import-decision.md` 的**部分超驰**：

- 「Dialog(8)↔Modal：维持 Modal、不加 Dialog 导出」→ **被本决策取代**（现有 `Dialog` 家族 + Modal 移除）。
- 「Sidebar 边界：壳保留为私有实例、不重构为消费通用原语（目标态）」→ **被部分取代**（原语补全 + 壳现消费其分组族；原语仍「无路由/无 StorageHandle/无壳槽依赖」的边界语义不变）。

其余契约（Dropdown↔Dropdown 等命名对齐维持、依赖政策「零新运行时 UI 库、缺省自实现并诚实标目标态」、样式约束）**完整保留 active**。故旧 Note 不完全被取代、不走合并删除条款：保留其 active，本 Note 与之交叉链接。

## 曾考虑的替代方案

- **只加 `Dialog` 别名、保留 `Modal` 并存**：否决。用户明示「用 Dialog 替换 Modal」；两个导出一个弹窗语义的等价物只会制造歧义（这正是 S1 造别名时反对的），且 `Dialog` 是复合家族、`Modal` 是整体单组件，二者形态本就不同，并存徒增维护。
- **`DialogTrigger`/`DialogClose` 用 `asChild`/`render` 透传**：否决。`@berkshire/ui` 缺 `@base-ui/react`（依赖政策零新 UI 库），页面级自实现 `render` 原语成本高于收益；原生 `<button>` 已满足可访问性与组合需要，消费方要自定义触发元素可自写 `onClick` 或复用 `Button`。
- **并行维护两组导航分组（库 `SidebarGroup` + 壳手写 `navSection`）**：否决。分组是通用导航语义，放库内一处；壳消费原语即删手写件，避免「库有现成件、壳自建平行件」的重复。
- **`Dialog` 家族自带 `aria-labelledby`/`aria-describedby` 自动 id 关联**：否决。保持最小件，`DialogContent` 支持 `ariaLabel`，需 `labelledby` 时消费方自设 `id`；自动关联属可加细节，不作本批承诺。

## 后果

- **收益**：消费方（base-ui 设置弹窗/侧边栏）用上完整 shadcn 复合 API，减少壳侧手写弹层与分组；`@berkshire/ui` 对齐官方命名，后续迁移/对照文档更直接；`Dialog` 家族与 `overlay.ts` 机制统一，可访问性基础（焦点陷阱/ESC/滚动锁）由既有 hooks 保证。
- **代价**：删除 `Modal` 是一次 API 破坏（唯一消费方已同步迁移，无其他消费方）；`SidebarCollapseTrigger` 保留为 `SidebarTrigger` 的向后兼容别名；`SettingsDialog` 的样式选择器已验证兼容保留。
- **诚实**：`packages/ui/src/index.ts` 头部 JSDoc 移除 Modal、增 Dialog 家族与完整 Sidebar 家族，并标注目标态面（Sidebar 响应式抽屉/拖拽/骨架/Rail 拖拽）；相关代码注释与 docs 对「Modal」的引用在本 Change 内同步为 `Dialog`（含 `AlertDialog`/`overlay.ts`/`SettingsDialog.module.css` 等注释与 `docs/` 中模态弹窗叙述）。

## 相关

- 被部分超驰（保留 active）：[2026-09-21-shadcn-import-decision.md](2026-09-21-shadcn-import-decision.md)。
- overlay 机制（本家族复用的弹层基线，keep active）：[2026-09-21-overlay-primitives.md](2026-09-21-overlay-primitives.md)。
- 实现位置：`packages/ui/src/{Dialog,Dialog.module.css,Sidebar,Sidebar.module.css}.tsx/.css`、`packages/ui/src/index.ts`；消费方 `packages/plugins/base-ui/src/client/{SettingsDialog,SettingsDialog.module.css,Sidebar,Sidebar.module.css}.tsx/.css`。
- shadcn 官方结构依据：Dialog `<https://ui.shadcn.com/docs/components/dialog>`、Sidebar `<https://ui.shadcn.com/docs/components/sidebar>`。