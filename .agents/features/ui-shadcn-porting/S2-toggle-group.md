---
batch: 2            # 批次号：同号可并行；此号依赖 S1 先落地命名/边界
feature: toggle-group
depends_on: [shadcn-import-decision]
parallel_with: [pagination, breadcrumb, spinner-kbd, scroll-area]
---

# S2 · `@berkshire/ui` 新增 `Toggle`、`ToggleGroup`、`ButtonGroup`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建三个互相关联的「分段/开关」类纯表现组件：`Toggle`（单选开关）、`ToggleGroup`（一组互斥/多选的 Toggle）、`ButtonGroup`（视觉分组的相邻按钮，非多选态）。全部纯表现层、零 new 依赖、样式 `var(--bk-*)`。产出各 `.tsx` + `.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary 契约，尤其确认 `ButtonGroup` 命名与既有 `Button` 关系不冲突）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库现状+构建：`packages/ui/`（参考既有 `Button`/`Tabs`/`Checkbox`/`Switch` 的 props 形状与 `.module.css` 写法；Tabs 已有 segment 式视觉可参考一致焦点/mixin）。shadcn `toggle`/`toggle-group` 仅作结构参照。

## 需求明细（验收点)

- [ ] `Toggle`：受控 `pressed` + `onPressedChange`（或非受控 `defaultPressed`）；`aria-pressed`；键盘可达；`disabled`。
- [ ] `ToggleGroup`：接受一个或多个 `value`（单选 `type="single"` / 多选 `type="multiple"`）+ `onValueChange`；子项为 `Toggle`；用 `role="group"`/`aria-label` 或按单选/多选语义用 `role="radiogroup"`/`aria-pressed` 恰当表达；键盘方向键在主副轴切换（至少提供基础 `Tab` 可达，方向键可作为可访问增强）。
- [ ] `ButtonGroup`：视觉上把相邻 `Button`（或子元素）连成一组（边界裁切/去重圆角，`data-` 或 CSS 相邻选择器实现），不承载多选逻辑（这是 `ToggleGroup` 的活）；`role="group"`；`disabled` 透传可选。
- [ ] props 形状参照 `@berkshire/ui` 既有风格保持稳定；样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器。
- [ ] `src/index.ts` 导出三个组件 + 类型 + 中文 JSDoc（诚实标注边界：如无拖拽/无虚拟键盘优化等）。

## 硬约束（必须遵守）

- 只写 S1 冻结清单内 `var(--bk-*)`，禁魔法色值。
- 只依赖 `react` + `clsx`，不加任何新依赖（Tailwind/Radix/CVA 禁止）。
- **不改既有 `Button`/`Tabs` 接口**——`ButtonGroup` 是新增容器组件，不修改 `Button` 本身（若需挂到同级分组视觉，用容器 CSS 相邻选择器，避免侵入 `Button`）。
- 不 import 尚不存在的 `ctx.*`/`@berkshire/core`；命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做 `Switch`/`Checkbox` 的替代或改动（已有）；不引 Radix ToggleGroup 的键盘虚拟焦点环高级实现，用自实现可达即可。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/{Toggle,ToggleGroup,ButtonGroup}.tsx` + 各 `.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Toggle`/`ToggleGroup`/`ButtonGroup` 落地含 index 导出与中文 JSDoc，样式 `var(--bk-*)`、无魔法色值，既有 `Button`/`Tabs` 接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，无新增运行时依赖。