# Agent Note: shadcn 组件移植——命名对齐、Scope 边界与依赖政策（S1 决定本批次执行契约）

Status: implemented

## 问题

用户提出把 shadcn 的 24 项组件移植进 `packages/ui`（`@berkshire/ui`）。S2/S3/S4 各实现包按依赖并行开发，若无统一的命名对齐、组件边界与依赖政策，多个并行包会互相踩脚：既有组件（Modal/Dropdown/Table 等）与 shadcn 命名（Dialog/Dropdown Menu/Data Table）是同一物还是不同物、通用弹层该不该引 Radix、Data Table / Date Picker / Scroll Area 该不该引第三方库——这些都由每个包各自拍板会导致重复决策与接口漂移。本决定把这些跨包契约一次冻结，交给其后各实现包执行。

## 决策

本包是决策/清点包：不实现任何组件、不改 `packages/ui` 源码、不改 base-ui 壳/插件/宿主。产出冻结各实现包共同遵守的命名对齐、组件边界与依赖政策，作为 S2/S3/S4 的接口约定。

### 影响清点表

对用户列出的 24 项逐条登记（现状经 `packages/ui/src/index.ts` 现存导出与组件源码核实，非凭描述）。

| 编号 | shadcn 组件 | 现状 | 落点 | 批次 | 对齐结论 / 备注 |
|---|---|---|---|---|---|
| 1 | AlertDialog | 需新建 | `packages/ui` | S3 | 新建独立 `AlertDialog`，复用 Modal 的 focus-trap/遮罩思路，不改 Modal |
| 2 | Badge | 已落地 | `packages/ui`（已有） | — | 维持；已满足 shadcn 视觉，见下方对齐结论 |
| 3 | Breadcrumb | 需新建 | `packages/ui` | S2 | 新建 `Breadcrumb`（含可折叠省略为可选子集） |
| 4 | ButtonGroup | 需新建 | `packages/ui` | S2 | 新建视觉分组容器，不改 `Button` 接口 |
| 5 | Command | 需新建 | `packages/ui` | S4 | 新建，复用 Popover 做弹层外壳，自实现过滤+键盘导航 |
| 6 | Data Table | 已有近似 | `packages/ui` | S4 | 新建独立 `DataTable` 组合容器，复用好既有 `Table`，不改其 API |
| 7 | Date Picker | 需新建 | `packages/ui` | S4 | 新建，复用 Popover 外壳，自实现日历格网 |
| 8 | Dialog | 已有近似（=Modal） | `packages/ui`（已有） | — | 维持 `Modal` 不改名，Dialog 语义由 Modal 承担，见下方对齐结论 |
| 9 | Drawer | 需新建 | `packages/ui` | S3 | 与 Sheet 同包，共享滑出面板机制 |
| 10 | Dropdown Menu | 已有近似 | `packages/ui`（已有） | — | 维持 `Dropdown` 不改名，见下方对齐结论 |
| 11 | Hover Card | 需新建 | `packages/ui` | S3 | 新建，内部复用 `Popover` 的 portal+定位 |
| 12 | Kbd | 需新建 | `packages/ui` | S2 | 纯展示 `<kbd>` |
| 13 | Pagination | 需新建 | `packages/ui` | S2 | 纯表现层，供 S4 DataTable 复用 |
| 14 | Resizable | 需新建 | `packages/ui` | S3 | 自实现 pointer 拖拽，不引 react-resizable-panels |
| 15 | Scroll Area | 需新建 | `packages/ui` | S2 | 自实现滚动条，见依赖政策 |
| 17 | Sheet | 需新建 | `packages/ui` | S3 | 与 Drawer 同包 |
| 18 | Sidebar | 需新建（通用原语） | `packages/ui` | S3 | 边界决策见「Sidebar 边界」；壳侧 `Sidebar` 属另一物 |
| 19 | Spinner | 需新建 | `packages/ui` | S2 | 纯展示加载指示器 |
| 20 | Tabs | 已落地 | `packages/ui`（已有） | — | 维持；已满足，见下方对齐结论 |
| 21 | Toast | 已落地 | `packages/ui`（已有） | — | 维持；`Toast`+`ToastRegion` 已覆盖，见下方对齐结论 |
| 22 | Toggle | 需新建 | `packages/ui` | S2 | 与 ToggleGroup 同包 |
| 23 | Toggle Group | 需新建 | `packages/ui` | S2 | 与 Toggle 同包 |
| 24 | Tooltip | 已落地 | `packages/ui`（已有） | — | 维持；纯 CSS 显隐版，见下方对齐结论 |

（清单编号为需求原文编号，16 号在需求清单中缺失，故表中直接跳号登记。）

批次分配依据依赖 DAG，与 `.agents/features/ui-shadcn-porting/` 各包头部一致：

- **S2**（纯表现层、零交互复杂度、最先生成）：Pagination / Breadcrumb / Toggle+ToggleGroup+ButtonGroup / Spinner+Kbd / ScrollArea。
- **S3**（依赖既有 Modal/Popover overlay 决策的弹层与交互）：AlertDialog / Sheet+Drawer / HoverCard / Resizable / Sidebar。
- **S4**（组合了 S2/S3 件的复合组件）：Command（复用 Popover）/ DatePicker（复用 Popover）/ DataTable（复用 S2 Pagination + 既有 Table）。

### 命名对齐结论（向后兼容硬约束：保持既有 API/props 不变，只能新增别名/导出或新组件，不重命名既有导出）

- **Dialog(8) ↔ Modal**：**维持 Modal，不改名、不加 Dialog 导出**。shadcn 的 `Dialog` 是通用模态框，与既有 `Modal`（自带 focus-trap + 遮罩 + ESC/遮罩关闭 + body scroll lock）语义等价；`Dialog` 的告警/确认独特诉求由新建的 `AlertDialog`（S3）承担，普通对话框直接用 `Modal`。既不为满足 shadcn 命名新增无谓别名，也与 overlay 决策的「Modal 为模态原语」一致。
- **Dropdown Menu(10) ↔ Dropdown**：**维持 `Dropdown`，不改名**。既有 `Dropdown`（含 `DropdownItem`）即 shadcn Dropdown Menu 的 BK 对应件；其无 portal 的定位局限已有 `Popover` 作为可迁移目标，但本批不改 `Dropdown` 接口。shadcn 的复杂菜单（submenu/多级）仍为目标态（见 index.ts 头部 JSDoc），与既有组件同源诚实标注。
- **Data Table(6) ↔ Table**：既有 `Table`（`TableHeader/Body/Row/Head/Cell`）保持为纯展示表格原语、**不改 API**；`DataTable` 作为独立的组合/容器组件（S4）在 `Table` 之上加排序/分页，属于「新组件」而非改写 `Table`。
- **Badge(2) / Tabs(20) / Toast(21)**：已落地且已满足 shadcn 视觉（Badge 有 `BadgeVariant/BadgeKind`；Tabs 有 `TabsList/Trigger/Content`；Toast 有 `Toast`+`ToastRegion` 及 `ToastKind`）。**维持现状**，本批不做变体或重命名；如需细化视觉档位，属后续小改（可走 S1-ui-design-language 档位清单），不在本批次内。
- **Tooltip(24)**：**维持既有纯 CSS 显隐版 `Tooltip`**（无 portal）。portal 定位 + delay 的复杂悬浮信息卡由 `HoverCard`（S3，复用 Popover）承担；`Tooltip` 与 `HoverCard` 语义不同（短提示 vs 内容卡）并存不合并。

### Sidebar 边界

**结论：shadcn 通用 `Sidebar` 原语入 `@berkshire/ui`（S3 新建可折叠导航菜单族）；`@berkshire/base-ui` 壳侧的 `Sidebar` 是另一物——壳业务导航实例，保留不改、不重构为本批不做的壳变更。**

判别依据（grep 壳源码）：`packages/plugins/base-ui/src/client/Sidebar.tsx` 的职责是消费壳契约——经 prop 注入 `routes`（routesStore 快照）、`storage`（StorageHandle 持久化句柄），挂载 `layout.navigation.extra` / `layout.sidebar.footer` 两个 slot 槽，用 `react-router-dom` 的 `Link`/`useLocation` 做激活态，品牌区/设置弹窗（打开 `SettingsDialog`）都是壳业务实例的一部分。这是「应用壳的多槽业务侧栏」，不是「通用可组合导航原语家族」（shadcn 的 `SidebarProvider/SidebarContent/SidebarMenu…`）。

因此二者不合并：通用原语（无路由、无 StorageHandle、无壳槽依赖）作为可复用件入 `@berkshire/ui`，供任意插件/内部页面使用；壳 `Sidebar` 保留为壳私有实例。为避免消费者混淆两个同名 `Sidebar`，通用原语在 `@berkshire/ui` 导出为 `Sidebar`，壳侧 `Sidebar` 留在 `@berkshire/base-ui` 包内不对外铺开导出。**壳后续可重构为消费通用原语，属目标态（base-ui 包变更），不在本批 S3 ui 原语的范围内**——S3 落地时严格不动壳源码。

### 依赖政策

**结论：一律不放行新运行时 UI 库，缺省自实现子集并诚实标「目标态」。** 这是 overlay-primitives 决策（方案 1：自实现 portal+定位、零新 UI 库依赖）对非弹层组件族的延伸，不推翻该决策：

- **Data Table——不放行 `tanstack-table`**：既有 `Table` + 少量排序/分页逻辑即可覆盖最小可用面（列定义 + 排序 + 复用 S2 Pagination 切片），`@tanstack/react-table` 引入一个 headless 数据层 API 与依赖面，为延后型收益不合算。虚拟化、列拖拽重排标目标态。
- **Date Picker——不放行 `date-fns`**：最小日历（单日期 + 月格网 + 月导航 + 键盘选中）用原生 `Date` + 自实现月算法足够；日期范围/本土化/周起始可配置标目标态时才回评是否放行。日期语义走 JSDoc 明确本地时区 vs UTC（数据契约红线纪律，不把本地 Date 当 UTC 序列化）。
- **Scroll Area——不放行 `scroll`/Radix scroll 类库**：自实现滚动条（`useLayoutEffect` 测量 + pointer 事件拖拽 + `ResizeObserver` 防 stale）符合 overlay 决策基调；虚拟化列表标目标态。仅需 portal 时用既有 `react-dom` `createPortal`（已是 peerDependency），不加动效库（CSS transition 即可）。

放行条件：仅当某高级特性（如完整虚拟化、完整日历范围/多日/首页国际化）被证明必须且自实现成本显著高于引库时，才在对应包文件与 `package.json` 如实体现依赖，并由新 Agent Note 决策；缺省一律零新增运行时依赖。

样式约束在整个批次生效：全部 CSS Modules + `var(--bk-*)`（冻结档位清单 `docs/ui-design-language.md` 为唯一允许引用来源），禁魔法色值；不引 Tailwind/CVA/tailwind-merge。

## 曾考虑的替代方案

- **Dialog/Dropdown Menu 加疑问别导出以贴近 shadcn 命名**：否决。既有 `Modal`/`Dropdown` 名称已稳定（壳/插件已消费），新增别名无实际消费方价值，反而制造两个导出一个含义的歧义；直接以「Modal 即 Dialog、Dropdown 即 Dropdown Menu」的关系文档化，比造别名更诚实。
- **Data Table / Date Picker 放行 tanstack/date-fns**：否决，理由见依赖政策。引入库的收益集中在高级特性（虚拟化/范围选择），而最小核心子集自实现成本低且保持 `@berkshire/ui` 的「仅 react+clsx」独立基线；高级特性现已是目标态标注，届时再单独决策。
- **通用 Sidebar 原语与壳侧 Sidebar 归并 / 壳先重构消费原语**：否决。归并会把壳的路由/slot/storage 契约塞进通用原语，破坏其复用面；本批先重构壳则扩大变更面并碰 base-ui 包（S3 明确不承担）。先落地通用原语、壳保持现状，重构消费列入目标态是范围最小的可行路径。
- **Scroll Area 引类库（Radix scroll/自绘虚拟化）**：否决，理由见依赖政策。

## 后果

- **收益**：S2/S3/S4 各并行实现包拿到一份可执行契约（命名对齐、Sidebar 边耦、依赖政策、批次分配），不重复决策；既有 `@berkshire/ui` 导出零破坏，向后兼容得到硬约束保证；依赖政策把「零新 UI 库」从 overlay 延伸到 data/date/scroll 族，保持组件库独立基线。
- **代价**：一批 shadcn 组件的「完整版」（多级菜单、范围日期、虚拟化、三面板拖拽等）被明确压到目标态，落到最小可用子集；放行第三方库的潜在受益被延后到有真实需求驱动时再评估。
- **对 overlay-primitives 决策是部分扩展而非推翻**：不改写其「自实现 portal+定位、不引 Radix」结论，仅把同一「自实现、零新 UI 库」基调扩展到非弹层组件族；overlay note 保持 active 并与之交叉链接。
- **诚实边界**：本决策不把任何未落地组件写成已实现；各实现包落地后需同步更新 `packages/ui/src/index.ts` 头部 JSDoc 与 overlay note 的诚实标注（复杂弹层/目标态面）。

## 相关

- 特性来源：`.agents/features/ui-shadcn-porting/S1-shadcn-import-decision.md`；批次分配与各 S2/S3/S4 包头部 `depends_on`/`parallel_with` 一致。
- 组件库现状与导出：`packages/ui/src/index.ts`。
- overlay 决策（本决策延伸的基线，keep active）：[2026-09-21-overlay-primitives.md](2026-09-21-overlay-primitives.md)。
- 壳侧 Sidebar（边界判别依据，只读参考）：`packages/plugins/base-ui/src/client/Sidebar.tsx` / `AppShell.tsx`。
- 设计档位：`docs/ui-design-language.md`（`var(--bk-*)` 唯一允许引用来源）。