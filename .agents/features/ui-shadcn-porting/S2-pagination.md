---
batch: 2            # 批次号：同号可并行；此号依赖 S1（shadcn-import-decision）先落地命名/边界
feature: pagination
depends_on: [shadcn-import-decision]   # 命名/boundary 以 S1 为冻结契约
parallel_with: [breadcrumb, toggle-group, spinner-kbd, scroll-area]
---

# S2 · `@berkshire/ui` 新增 `Pagination`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `Pagination` 分页组件（上一页/数字页码/下一页，含省略号逻辑），纯表现层、零 portal、零新运行时依赖。产出 `Pagination.tsx` + `Pagination.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**命名/boundary 冻结契约，先读**）。
- 设计档位：`docs/ui-design-language.md`（冻结清单，`var(--bk-*)` 唯一允许引用来源）；令牌 `packages/theme/src/tokens.ts`。
- 组件库现状+构建管线：`packages/ui/`（`src/index.ts` 导出风格、`src/css-modules.d.ts` ambient、`scripts/build-client.ts`、`package.json`；只依赖 react+react-dom+clsx）。参考既有 `Button`/`Table` 的 JSDoc 口吻与 `.module.css` 写法（组件式分隔、mixin/叠层、暗色单表）。shadcn 参照仅作结构/视觉。
- 若 S1 决策把 `Data Table` 依赖分页逻辑，本包保持独立纯组件、不耦合实现细节，仅 `Pagination` props 稳定。

## 需求明细（验收点）

- [ ] `Pagination` 组件：受控 `page` + `totalPages`（或 `page`/`count`/`pageSize` 二选一，props 形状自定但**稳定**）+ `onPageChange`；渲染上一页/下一页/当前页区间 + 首末/省略号；`disabled` 边界（首/末页）。可含 `PaginationItem`/`PaginationLink`/`PaginationEllipsis` 子件（可仅在文件内部，不强求导出面）。
- [ ] 复用 `Button` 的既有按钮样式语义（直接用一个基础态；可 `className` 透传）；样式全 `var(--bk-*)`、零魔法色值、暗色由 static 层单表覆盖（组件零主题选择器）。
- [ ] 可访问性基础：正确语义（`nav`/`aria-label`、`aria-current="page"`、键盘可达按钮）。
- [ ] `src/index.ts` 导出 `Pagination` + 类型；中文 JSDoc 标注诚实边界（**未实现**：无分页数据源绑定、无链接式路由页）。
- [ ] 不新增任何运行时依赖（仅 react+clsx）。

## 硬约束（必须遵守）

- 样式只写 S1 冻结清单内 `var(--bk-*)`，禁魔法色值，组件零主题选择器，暗色由 static 单表。
- 只依赖 `react` + `clsx`，不加任何新依赖（Tailwind/Radix/CVA/tailwind-merge 一律禁止）。
- **不重命名/不改既有组件 API**；不 import 尚不存在的 `ctx.*`/`@berkshire/core`。
- 命名以 S1 决策为准；不得与既有导出冲突。

## 范围边界（明确不做什么）

- **不**做数据表格集成（S4 `Data Table` 的活）、不做路由链接分页（`react-router`）——本包是纯 `@berkshire/ui` 原子组件。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主 `apps/berkshire-agent/src`。

## 产物与验证

- `packages/ui/src/Pagination.tsx` + `Pagination.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）。
  - `bun run lint:styles`（根）+ `git diff --check`。
  - 建议（可选）：`cd apps/berkshire-agent && bun run build` 确认接口不破坏。

## 完成定义（DoD）

`Pagination` 落地含 index 导出与中文 JSDoc，样式全 `var(--bk-*)`、无魔法色值，现有接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，无新增运行时依赖。