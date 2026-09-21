---
batch: 1            # 批次号：同号可并行；此号依赖所有更小批次（无）。本包为全批次共享底层，强烈建议最先启动。
feature: shadcn-import-decision
depends_on: []      # 直接前置包，首批为空（仅依赖仓库既有事实基线 + 已落地的 ui-shadcn-redesign 成果）
parallel_with: []
---

# S1 · shadcn 组件移植——影响清点、命名对齐与本批次边界决策

## 目标

用户要求把 shadcn 的 24 个组件（见需求明细）移植进本仓库。本包**不实现任何组件**，而是产出决策记录与影响清点，**冻结命名对齐、Scope 边界、依赖政策**，作为后续全部组件包（S2/S3/S4）共同依赖的接口约定。这样每个并行实现包拿到的都是可执行的命名/边界契约，不会互相踩脚或重复造轮子。

产出路径：决策记录落 `.agents/notes/`（Agent Notes，中文单文件 + 分类，过门禁）；不必新增功能代码。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)（尤其「目标态 vs 已实现」、样式治理、命令面、诚实纪律）。
- 已落地的 UI 设计语言与组件库批次（本包直接建立其上；以下为持久化落点，原 `ui-shadcn-redesign` 特性文件已按「用完即删」清除）：
  - `docs/ui-design-language.md`（S1 冻结档位清单，`var(--bk-*)` 唯一允许引用来源）。
  - `packages/ui/`（S2：组件库基线，见 `packages/ui/src/index.ts` 诚实标注与导出）。
  - 落地决策 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`——**「复杂弹层自实现 portal + 定位（方案 1）、不引 Radix」**是本批次各弹层类组件必须遵守的既定决策。
- 组件库现状（用 glob/read 核实，不要凭描述）：`packages/ui/src/`（`index.ts` 导出 Button/Input/Select/Dropdown/Popover/Modal/Toast/ToastRegion/Notification/Badge/Tooltip/EmptyState/Card/Table/Tabs/Switch/Checkbox/Divider；每个配 `.module.css`；只依赖 `react`+`react-dom`+`clsx`；构建 `scripts/build-client.ts`、`src/css-modules.d.ts` ambient）。`packages/ui/package.json`（peer 已含 react-dom）。
- 壳侧现状（Sidebar 判别需要）：`packages/plugins/base-ui/src/client/`（`AppShell` 网格 + `Sidebar`/`Sidebar.module.css` 应用壳侧边栏 + `StatusBar` 等）。shadcn 的 `Sidebar` 与壳侧 `Sidebar` 是否同一物，需如实判别。

## 需求明细（验收点）

- [ ] 把用户列出的 24 项逐条登记到一张**影响清点表**（编号｜组件名｜现状：`已落地`/`已有近似`/`需新建`｜落点 `packages/ui` 或他处｜依赖批次），并对以下既有近似项给出**对齐结论**（改名 or 别名 or 维持 + 明确关系）：
  - `Dialog(8)` ↔ 现有 `Modal`；`Dropdown Menu(10)` ↔ 现有 `Dropdown`；`Data Table(6)` ↔ 现有 `Table`；`Badge(2)`/`Tooltip(24)`/`Tabs(20)`/`Toast(21)` 是否已满足 shadcn 视觉。
  - 结论必须**保持既有组件 API/props 不变**（向后兼容硬约束），只能新增别名/导出或新组件，不重命名既有导出。
- [ ] 对本批要新建的组件（AlertDialog(1)、Breadcrumb(3)、ButtonGroup(4)、Command(5)、Date Picker(7)、Drawer(9)、Hover Card(11)、Kbd(12)、Pagination(13)、Resizable(14)、Scroll Area(15)、Sheet(17)、Sidebar(18)、Spinner(19)、Toggle(22)、Toggle Group(23)）逐一给出：所属批次（本决策按依赖 DAG 分配）、零依赖可行性、可访问性要点。
- [ ] **Sidebar 边界决策**：判别 shadcn `Sidebar` 通用原语与 `@berkshire/base-ui` 应用壳 `Sidebar` 的关系——是「通用导航原语入 `packages/ui` + 壳消费它」还是「壳私有不通用」，给出结论并写入决策，避免 S3 与 base-ui 踩脚。
- [ ] **依赖政策决策**：沿用 [2026-09-21-overlay-primitives.md](../../../.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md) 的「自实现、零新 UI 库依赖」基调，明确：是否允许引入 `tanstack-table`（Data Table）/ `date-fns`（Date Picker）/ `scroll` 类库？给出「允许 → 理由」或「禁止 → 自实现子集/标注目标态」的明确结论，供 S4 执行。
- [ ] 产出一份中文 Agent Note（决策记录）落 `.agents/notes/`，过 `verify:agent-notes` 门禁；若该决策局部推翻/扩展 overlay-primitives note，按 [.agents/notes/AGENTS.md](../../../.agents/notes/AGENTS.md) 的超驰规则交叉链接（不改写既有 note 决策，仅新增/链接）。
- [ ] 更新本批次各包文件头部（`depends_on`/`parallel_with`）与本决策一致（若批次分配有出入，以本决策为准并同步）。

## 硬约束（必须遵守）

- 诚实：本包是**决策/清点**包，**不实现组件、不改 `packages/ui` 源码**（那是 S2/S3/S4），不得把未落地的组件写成已实现。
- 不得推荐违反仓库契约的做法：不引 Tailwind/CVA/tailwind-merge；若放行某个运行时依赖（如 tanstack/date-fns）必须给出理由并在对应包文件与 `package.json` 如实体现，且不破坏「纯 CSS Modules + `var(--bk-*)`」的样式基线。
- 命名：不得重命名既有 `@berkshire/ui` 导出（向后兼容硬约束）；对齐结论只能新增。
- 新 Agent Note 须过 `bun run verify:agent-notes`；无尾随空白（`git diff --check`）。

## 范围边界（明确不做什么）

- **不**实现任何组件、**不**改 `packages/ui/src/`、**不**改 base-ui 壳/插件/宿主源码。
- **不**动 `packages/theme` 令牌（既有冻结档位已够，若认为需要新档位，仅在本决策中提「回提 S1-ui-design-language」的申请，不擅自改令牌）。
- 单一决策包，不做分散小决策。

## 产物与验证

- 决策 Agent Note：`.agents/notes/` 下新增中文记录（含影响清点表、命名对齐、Sidebar 边界、依赖政策、批次分配）。
- 运行（真实存在）：
  - `bun run verify:agent-notes`（Agent Notes 门禁）。
  - `cd packages/ui && bun run build`（确认未破坏组件库构建）。
  - `bun run lint:styles` + `bun run typecheck`（根）。
  - `git diff --check`。

## 完成定义（DoD）

影响清点表完整、命名对齐结论可执行（既有接口零破坏）、Sidebar 边界与依赖政策有明确结论、批次分配写入各包头部、决策 Agent Note 过门禁、`packages/ui` 构建不被本包破坏。S2/S3/S4 可依据本决策开工。