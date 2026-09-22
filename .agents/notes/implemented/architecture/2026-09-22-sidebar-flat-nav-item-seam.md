# Agent Note: 侧边栏取消「扩展」分组：插件页面与首页同权（SidebarItem 模型 + 排序/隐藏/预设出口）

Status: implemented

## 问题

base-ui 应用壳的侧边栏此前把插件自声明页面按 `RouteDescriptor.section` 分组展示（缺省归入「扩展」组），首页 pinned 在顶、插件页折叠在分组标签之下。用户（权威决策者）指出：插件页面不应被「扩展」分组降权——所有插件增加的页面应与首页**同权**，扁平排布在同一条导航列表里。同时要求为后续迭代留出口子：设置弹窗未来要能对 SidebarItem 做**排序、隐藏与切换预设**。

## 决策

- **取消分组**：`Sidebar` 不再渲染 `SidebarGroup`/`SidebarGroupLabel` 分组，改为一条扁平 `SidebarMenu`——壳自有核心（`/` 首页，`core:home`）与全部插件自声明页面同权排布；排布顺序 = sidecar `routes/list` 已按 `order ?? 100` 排好的声明序（首页 order 0 在前）。
- **`section` 从插件路由声明链整体移除**：`RouteDescriptor`/`FrontendSlotRegistration`（core `slots.ts`）、`RouteEntry`（webview `lib/api.ts`）、`ResolvedRouteEntry`（`routes/routesStore.ts`）、`ShellRouteInfo`（ui-slots 共享契约 + base-ui `AppShell`）均不再携带 `section`；demo/data-manager 插件的 `section` 声明删除；sidecar 测试与两处冒烟断言同步。
- **`ShellRouteInfo` 增 `id` + `order`**：`id` 为侧边栏项稳定身份（声明与用户覆盖的合并键），`order` 为声明序——webview 从 `routes/list` 原样收下（此前 `routesStore` 丢弃 order）。
- **SidebarItem 模型 + 未来出口（base-ui `sidebarItems.ts`）**：`SidebarItem { id, title, path, order, hidden? }`；`useSidebarItems(routes, storage)` 把「声明序 + 持久化覆盖/预设」反应式合并成生效导航项。持久化契约（复用壳 `settings` 命名空间，`$BK_HOME/state/settings/`）：`sidebar.items` = `Record<itemId, {order?, hidden?}>`、`sidebar.preset` = `SidebarPresetId`；`SIDEBAR_PRESETS` 注册表 v1 仅 `default`（声明原序）。设置弹窗的**排序/隐藏/切换预设** UI 未建（v-next），但直接写这两个键即生效（`usePersistedField` 订阅 `storage/changed`，多面板/多窗口一致）——首页与插件页同走一个模型，「同权」语义含可排序/可隐藏/可预设。
- **折叠态**：折叠后当前导航项无 icon 通道，只保留核心（首页）可点（对齐库折叠语意，兑现此前注释声明过的意图）。

## 超驰账（supersession）

对 [2026-09-21-dialog-replaces-modal-and-sidebar-completion.md](2026-09-21-dialog-replaces-modal-and-sidebar-completion.md) 的**部分超驰**：

- 「base-ui 壳 Sidebar 重写为消费通用原语的分组族：用 `SidebarGroup`/`SidebarGroupLabel`/`SidebarGroupContent` 承载核心 pinned + 插件 `section` 分组」→ **被本决策取代**（分组语义取消；`@berkshire/ui` 的 `SidebarGroup` 族原语本身保留 active，只是壳侧不再用于 section 分组）。

其余部分（`Dialog` 取代 `Modal`、`@berkshire/ui` Sidebar 家族补全、原语「无路由/无 StorageHandle/无壳槽依赖」边界）**完整保留 active**。旧 Note 不完全被取代、不走合并删除条款：保留其 active，本 Note 与之交叉链接。

## 曾考虑的替代方案

- **保留 `section` 字段但侧边栏忽略它**：否决。字段从 core 一路透传到 webview 却没有消费者，正是仓库「诚实标注/无死重」纪律要避免的悬空契约；demo/data-manager 仍声明它会造成「特性还在、只是不渲染」的误导。既然分组概念取消，就整体移除声明链。
- **排序/隐藏/预设只留注释不留实现**：否决。「留出口子」若只是注释，未来设置弹窗无处落笔、两侧易漂移；把持久化键 + 解析纯函数（`resolveSidebarItems`）落地，设置 UI 直接写键即生效，才是真出口。
- **把 `SidebarItem` 模型放进共享缝 `@berkshire/ui-slots`**：否决。模型只被 base-ui 壳（侧边栏 + 未来设置弹窗）消费，非跨包契约；ui-slots 只承载宿主注入的 `ShellRouteInfo`（含 id/order）即可，避免把壳私有导航词汇泄漏进共享层。

## 后果

- **收益**：插件页面与首页视觉层级一致，多插件时不再被折叠进「扩展」；`order` 下沉到 webview 使排序可被用户覆盖；`sidebar.items`/`sidebar.preset` 持久化契约为设置弹窗迭代留好双向同步出口。
- **代价**：`section` 是插件路由声明 API 的破坏性变更（仓库内 demo/data-manager 已同步，无外部消费方）；`@berkshire/ui` 的 `SidebarGroup` 族原语暂时只有库内其他潜在用途，壳侧不再消费分组（原语保留，不删除）。
- **诚实**：设置弹窗的排序/隐藏/预设切换 UI 未建（v-next，已列入 architecture.md §11 与 secondary-development §6 的 v-next 栏）；`useSidebarItems` 首帧按声明序渲染、storage 读到覆盖后对齐（有覆盖时首帧短暂按声明序，可接受）。

## 相关

- 被部分超驰（保留 active）：[2026-09-21-dialog-replaces-modal-and-sidebar-completion.md](2026-09-21-dialog-replaces-modal-and-sidebar-completion.md)。
- 实现位置：`packages/plugins/base-ui/src/client/{sidebarItems,Sidebar,AppShell}.ts(x)`；数据路径 `packages/core/src/services/slots.ts`、`apps/berkshire-agent/src/{lib/api.ts,routes/{routesStore,RouteSync}.ts}`、`packages/ui-slots/src/types.ts`；插件 `packages/plugins/{demo,data-manager}/src/index.ts`。
