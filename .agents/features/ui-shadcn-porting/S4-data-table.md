---
batch: 4            # 批次号：同号可并行；此号依赖 S1（依赖政策/Data Table 定义）+ S2 Pagination + 既有 Table
feature: data-table
depends_on: [shadcn-import-decision, pagination]
parallel_with: [command, date-picker]
---

# S4 · `@berkshire/ui` 新增 `DataTable`（shadcn 移植：排序/筛选/分页数据表格）

## 目标

在 `packages/ui`（`@berkshire/ui`）实现 shadcn 的「Data Table」数据表格增强（在既有 `Table` 之上加列排序、可选筛选、分页、选择），作为**组合/容器组件**而非改既有 `Table`。按 [S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md) 依赖政策决定：**缺省自实现排序/分页逻辑，零新增运行时库（不引 tanstack-table）**。产出 `DataTable.tsx`（+ 子件）+ `DataTable.module.css`（若需附加样式）+ `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**Data Table 定义 + 依赖政策结论，先读并遵守**：确认 `DataTable` 是否作为独立容器组件、是否放行 tanstack；缺省自实现 + 复用既有 `Table`）。
- 数据契约红线（`docs/data-model.md §6`）：本组件**不做**任何数据来源/口径转换，只消费调用方给好的结构化行数据；A 股数值（价格/比例）的格式化是调用方/数据层的事，组件不臆造格式——在 JSDoc 说明。
- 复用既有件：`packages/ui` 的 `Table`（`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`）、`Button`、`Checkbox`（行选择，可选）、`Input`（筛选框，可选）、`Pagination`（S2，可选）。**不改 `Table` 的 API**。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `DataTable<Row>` 泛型容器：`columns` 描述（`key`/`header`/`cell 渲染`/可选 `sortable`）+ `data` 行数组 +（可选）`pageSize`/`currentPage`；内部管理排序 + 分页状态（受控或非受控，props 稳定）。
- [ ] **排序**：点击可排序列头切换 asc/desc/无；自实现比较器（基础类型 `string|number`，自定义 `sortFn` 可选）。列头 `role="columnheader"`/button + `aria-sort`。
- [ ] **分页**：复用 S2 `Pagination` 组合（`page`/`totalPages`/`onPageChange`），数据切片在组件内做。
- [ ] 可选增强：列筛选（`Input` 过滤 `<input>`）、行选择（`Checkbox`）+ 全选——**若成本可控实现，否则标「目标态」子集不实现（保持核心：排序 + 分页）**。
- [ ] 样式：表格视觉继承既有 `Table`，附加排序箭头/可排序列 hover 用 CSS Modules `var(--bk-*)`；零魔法色值、暗色单表、组件零主题选择器。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实标注：不做虚拟化/大数据渲染优化、不臆造数值格式、明确泛型边界）。

## 硬约束（必须遵守）

- **不改既有 `Table`/`Button`/`Checkbox`/`Pagination`（S2）API**；本包是容器组件，内部复用它们。
- 只依赖 `react` + `clsx`（+ 必须依赖的既有 `@berkshire/ui` 组件，属同包内引用）；**缺省零新增外部运行时库**（不引 `@tanstack/react-table`，除非 S1 显式放行且如实入 `package.json`）。
- 只写冻结 `var(--bk-*)`，禁魔法色值；不做数据口径转换（数据契约红线）。
- 诚实：未实现的高级特性（行选择、列筛选、虚拟化）标「目标态」。
- 命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**改 `Table` 组件；**不**做远程/异步数据获取与加载骨架；**不**做 CSV/导出、列拖动重排。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/DataTable.tsx` +（若需要）`DataTable.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`DataTable` 实现核心（列定义 + 自实现排序 + 复用 S2 `Pagination` 的分页切片；可选行选择/列筛选为增强），复用既有 `Table` 且**其接口零破坏**，样式全 `var(--bk-*)`、无魔法色值、无臆造数据格式，`packages/ui` 构建 + root typecheck/lint 绿，缺省零新增运行时依赖；未实现特性诚实标「目标态」。