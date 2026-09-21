---
batch: 2            # 批次号：同号可并行；此号依赖 S1 先落地命名/边界
feature: breadcrumb
depends_on: [shadcn-import-decision]
parallel_with: [pagination, toggle-group, spinner-kbd, scroll-area]
---

# S2 · `@berkshire/ui` 新增 `Breadcrumb`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `Breadcrumb` 面包屑导航组件（项列表 + 分隔符，含可折叠省略/collapsed 态可选），纯表现层、零 new 依赖。产出 `Breadcrumb.tsx` + `Breadcrumb.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary 冻结契约）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库现状+构建：`packages/ui/`（`src/index.ts`、`css-modules.d.ts`、`scripts/build-client.ts`、`package.json`）。参考既有 `Dropdown`/`Button`/`Table` 的口吻与 `.module.css` 写法。shadcn 作结构/视觉参照。

## 需求明细（验收点）

- [ ] `Breadcrumb`（或组合件 `BreadcrumbList`/`BreadcrumbItem`/`BreadcrumbLink`/`BreadcrumbSeparator`/`BreadcrumbPage`）渲染层级项与分隔符；末项为当前页（`aria-current="page"`）；父项通常为链接。
- [ ] 结构语义化：用 `nav aria-label="Breadcrumb"` + `<ol>`/`<li>`；分隔符为纯装饰（`aria-hidden`）。
- [ ] 支持**可折叠态**：超过阈值（如 `maxItems`）时折叠中间项为省略「…」（可返回），props 形状自定但稳定。若 S1/实现成本判断为可选，可标「目标态」子集不实现，只保留基础链。
- [ ] `children`/`items` 两种受支持形态任选；styleditemprops 稳定、`className` 透传。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表；组件零主题选择器。
- [ ] `src/index.ts` 导出 + 中文 JSDoc（诚实标注边界）。

## 硬约束（必须遵守）

- 只写 S1 冻结清单内 `var(--bk-*)`，禁魔法色值。
- 只依赖 `react` + `clsx`，不加任何新依赖。
- **不改既有组件 API**；不 import 尚不存在的 `ctx.*`/`@berkshire/core`；命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做路由自动生成（`react-router` 集成）——纯 `@berkshire/ui` 原子组件。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/Breadcrumb.tsx` + `Breadcrumb.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Breadcrumb` 落地含 index 导出与中文 JSDoc，样式 `var(--bk-*)`、无魔法色值，现有接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，无新增运行时依赖。