---
batch: 2            # 批次号：同号可并行；此号依赖 S1 先落地命名/边界
feature: scroll-area
depends_on: [shadcn-import-decision]
parallel_with: [pagination, breadcrumb, toggle-group, spinner-kbd]
---

# S2 · `@berkshire/ui` 新增 `ScrollArea`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `ScrollArea`（自定义滚动区：包裹长内容、提供统一风格的滚动条轨道/滑块、支持鼠标滚轮 + 拖拽滑块 + 可选键盘滚动）。零 portal、零 new 依赖、样式 `var(--bk-*)`。产出 `ScrollArea.tsx` + `ScrollArea.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary 契约）。
- 设定档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库现状+构建：`packages/ui/`（`src/index.ts`、`css-modules.d.ts`、`scripts/build-client.ts`、`package.json`；`react-dom` 已在 peer）。参考 `Popover` 用 `useLayoutEffect` 测量 + `resize/scroll` 监听的做法；参考 `Modal` 焦点管理的自实现风格。
- **决策约束**：overlay 决策（`.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`，方案 1 自实现）——ScrollArea 若需自绘滚动条/拖拽，遵循「自实现、零新依赖」。若 S1 决策另行放行某 scroll 库，以 S1 为准；缺省走自实现。

## 需求明细（验收点）

- [ ] `ScrollArea`（根）+ `Scrollbar`（轨道/滑块）组合：内容超出视口时可滚；提供视觉一致的滚动条（滑块尺寸≈可见比例、可拖拽、可按轨道空白滚动可选）。
- [ ] 滚轮/触控板原生滚动保留；拖拽滑块用 pointer 事件 `pointerdown/move/up` 自实现（参照 `Popover` 的 effect 清理纪律）；**健壮性**：`resize`/内容高度变化时重算滑块比例与位置（`ResizeObserver` 或 `resize` 监听），防 stale 滑块。
- [ ] 仅在有滚动时显示滑块（`overflow` 探测）；`type="auto"`/`"always"`/`"hover"` 显隐形态可选（若成本可控，至少实现 auto）。
- [ ] 可访问性基础：容器 `tabIndex={0}` + `role="region"`/`aria-label`（若可聚焦滚动），键盘 `ArrowUp/Down/PageUp/PageDown/Home/End` 滚动（若实现键盘滚动）；滑块 `role="scrollbar"`/`aria-controls`/`aria-valuenow`。
- [ ] 零魔法色值、暗色单表、组件零主题选择器；`className`/子内容透传。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实标注边界：不做虚拟化列表，不做 `scroll-lock` 管理——那是 Modal 的活）。

## 硬约束（必须遵守)

- 只写 S1 冻结清单内 `var(--bk-*)`，禁魔法色值。
- 只依赖 `react` （+ `react-dom` 仅当需 portal，通常不需要）+ `clsx`；**缺省不加任何新依赖**（除非 S1 决策显式放行，且须如实记入 `package.json`）。
- 附带 effect 遵循「注册即效应 + disposer」自管（`useEffect` 返回清理），不硬引 `@berkshire/core`。
- 不改既有组件 API；不 import 尚不存在的 `ctx.*`/`@berkshire/core`；命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做列表虚拟化（大列表优化是目标态/另包）；不接管背景滚动锁（Modal 已管）。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/ScrollArea.tsx` + `ScrollArea.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`ScrollArea`（含 `Scrollbar`）落地并支持滚轮+拖拽+（可选）键盘滚动，滑块随内容/视图动态重算无 stale，样式 `var(--bk-*)`、无魔法色值，`packages/ui` 构建 + root typecheck/lint 绿，缺省零新依赖。