---
batch: 3            # 批次号：同号可并行；此号依赖 S1（Sidebar 边界决策）+ 既有 Shell/ScrollArea 模式
feature: sidebar-primitive
depends_on: [shadcn-import-decision]
parallel_with: [alert-dialog, drawer-sheet, hover-card, resizable]
---

# S3 · `@berkshire/ui` 新增 `Sidebar`（shadcn 移植）——与 `@berkshire/base-ui` 壳侧边栏对齐决策后落地

## 目标

在 `packages/ui`（`@berkshire/ui`）新增 shadcn 风格的通用 `Sidebar` 可折叠导航侧栏原语（侧栏容器 + 折叠/展开 + 导航项列表 + 页脚），并**依据 [S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md) 的 Sidebar↔base-ui 边界结论**处理与 `@berkshire/base-ui` 应用壳侧边栏的关系（典型结论：通用原语入 `@berkshire/ui`，壳侧 `Sidebar` 保留但后续可重构消费它）。零 new 依赖、样式 `var(--bk-*)`。产出 `Sidebar.tsx` + `Sidebar.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**Sidebar↔base-ui 边界结论，先读并严格遵守**——本包落地形态以此为准）。
- 壳侧现状（判别/对齐依据）：`packages/plugins/base-ui/src/client/Sidebar.tsx` + `Sidebar.module.css`、`AppShell.tsx`（壳网格：侧栏是可扩展的导航区）。shadcn `Sidebar` 是可组合（`SidebarProvider`/`Sidebar`/`SidebarContent`/`SidebarFooter`/`SidebarMenu…`）的通用侧栏族。
- 可复用既有件：`packages/ui` 的 `Button`/`Badge`/`Tooltip`（折叠后图标悬停提示）。折叠视口的滚动可组合 `ScrollArea`（S2）可选。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] 通用 `Sidebar` 原语族（至少根 + 一组子件：`Sidebar` 容器 + `SidebarHeader`/`SidebarContent`/`SidebarFooter`/`SidebarMenu`/`SidebarMenuItem`/`SidebarMenuButton` 或精简版）在 `@berkshire/ui` 落地。
- [ ] 折叠/展开：受控 `collapsed` + `onCollapseChange`（或内部状态 + 回调）；折叠态宽度缩减、仅图标或隐藏标签；折叠时菜单项悬停可用 `Tooltip` 提示（可选增强）。
- [ ] 固定/跟随父容器布局；内容区超长可滚动（`ScrollArea` 组合可选）。`className`/项数据透传：支持 `items` 数组 或 子节点 JSX 两种形态任选（props 稳定）。
- [ ] **与 base-ui 对齐**：按 S1 结论——若结论为「通用原语入 ui + 壳重构消费」，则本包仅实现原语且不改壳；若 S1 结论为「保持壳私有、不造通用原语」，则本包改为在 `packages/plugins/base-ui` 增强壳 `Sidebar`（此情况以 S1 为准并如实改目标路径）。缺省/未决时：实现通用 `@berkshire/ui` 原语，**不动壳**。
- [ ] 可访问性：侧栏 `role`/`aria-label`、导航语义（`<nav>` 内菜单项 `aria-current="page"` 可选）、折叠切换按钮键盘可达 + `aria-expanded`。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实标注边界：不做响应式移动端抽屉/overlay 模式，不做路由联动激活态——除非 S1 另定）。

## 硬约束（必须遵守）

- **遵守 S1 的 Sidebar↔base-ui 边界结论**；**不改 base-ui 壳源码**（除非 S1 结论明确要求，且那属于 base-ui 包而非 ui 包，本包不承担）。
- 只依赖 `react` + `clsx`，零新增运行时库（不引 Radix `collapsible`/`react` nav 库）。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管。
- 诚实：不把未实现的响应式/overlay 模式写成已实现。
- 命名以 S1 决策为准；不重名冲突既有导出。

## 范围边界（明确不做什么)

- **不**改 `packages/plugins/base-ui` 壳（对齐为只读参考，除非 S1 判定本包落那边）。
- **不**做移动端抽屉/overlay、路由激活联动（均标目标态）。
- **不**改 `packages/theme` 或宿主 `apps/berkshire-agent/src`。

## 产物与验证

- 若落地 `@berkshire/ui`：`packages/ui/src/Sidebar.tsx` + `Sidebar.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。
- 若 S1 判落 base-ui，则改跑 `cd packages/plugins/base-ui && bun run build` 与对应 `compile:styles`（以 S1 结论为准）。

## 完成定义（DoD）

按 S1 边界结论落地通用 `Sidebar` 原语（或改在 base-ui 增强），折叠/展开 + 菜单项 + 页脚 + 可滚动，样式全 `var(--bk-*)`、无魔法色值，`@berkshire/ui` 构建（或 base-ui 构建）+ root typecheck/lint 绿，零新增运行时依赖；未实现特性诚实标「目标态」。