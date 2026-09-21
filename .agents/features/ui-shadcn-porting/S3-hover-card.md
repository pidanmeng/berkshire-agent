---
batch: 3            # 批次号：同号可并行；此号依赖 S1（命名）+ 既有 Popover overlay 决策
feature: hover-card
depends_on: [shadcn-import-decision]
parallel_with: [alert-dialog, drawer-sheet, resizable, sidebar-primitive]
---

# S3 · `@berkshire/ui` 新增 `HoverCard`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `HoverCard`（hover 触发的上下文信息卡片：悬浮/聚焦 anchor 后，经门户在 anchor 附近显示内容，悬停打开可含进入 delay；失焦/离开后关闭）。复用 `Popover` 的 portal + 定位机制，零 new 依赖、样式 `var(--bk-*)`。产出 `HoverCard.tsx` + `HoverCard.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary）。
- overlay 决策 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`（方案 1 自实现 portal+定位，不引 Radix）。
- 主参考实现（**不改它的 API/源码**）：`packages/ui/src/Popover.tsx`（`createPortal` 到 `document.body` + `placement`/`align` + viewport 钳制 + 外部点击/ESC 关闭）。`Popover` 基于「点击切换」，`HoverCard` 改为「hover/focus 触发 + delay」——逻辑明显重叠，优先：**内部复用 `Popover`（包一层 hover 触发 + open round-trip）**，而非重写定位。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `HoverCard`（根）+ `HoverCardTrigger`/`HoverCardContent`（或单组件 + `trigger`/`children` props）：hover（`mouseenter/leave`、接管进入 delay 如 300ms）+ 键盘 focus（`focus/blur`）触发显示；离开时关闭可带短暂 delay（防抖动）。
- [ ] **复用 `Popover` 的定位/portal**：把 hover 状态接到 `Popover` 的 `open`/`onOpenChange`（受控），避免重写定位/钳制；避免大量 dupe。
- [ ] 可访问性：anchor `aria-expanded`/`aria-describedby` 或 `aria-haspopup`；内容 `role="dialog"` 或 `role="tooltip"`（按信息含义任选其一并在 JSDoc 说明）；键盘可达（focus 触发）；ESC/移出关闭。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；`placement`/`align`/`className` 透传。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实标注：永不自动打开；不做多实例 `delay` 个性化高级行为之外的功能）。

## 硬约束（必须遵守）

- **不改 `Popover` API/源码**；优先复用 `Popover`（composition），只在确有需要时在本包加轻量的 hover 触发 state helper，不侵入既有组件。
- 只依赖 `react` + `react-dom`（`createPortal`，已是 peer）+ `clsx`，零新增运行时库；不引 Radix/浮层库。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管（delay timer 清理）。
- 诚实：未实现的 hover 行为不写成已实现。

## 范围边界（明确不做什么）

- **不**改 `Popover`/`Tooltip` 实现；**不**做 `Command` 搜索弹层；`Tooltip`（提示文案）与 `HoverCard`（内容卡片）语义不同、并存不合并。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/HoverCard.tsx` + `HoverCard.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`HoverCard` 落地并复用 `Popover` 的定位/portal（hover+focus+delay 触发，失焦/ESC 关闭，防抖 delay），样式全 `var(--bk-*)`、无魔法色值，`Popover` 接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，零新增运行时依赖。