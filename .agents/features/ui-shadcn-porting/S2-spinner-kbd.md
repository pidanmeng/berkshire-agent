---
batch: 2            # 批次号：同号可并行；此号依赖 S1 先落地命名/边界
feature: spinner-kbd
depends_on: [shadcn-import-decision]
parallel_with: [pagination, breadcrumb, toggle-group, scroll-area]
---

# S2 · `@berkshire/ui` 新增 `Spinner`、`Kbd`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建两个极简纯展示组件：`Spinner`（加载指示器）与 `Kbd`（键盘键帽显示）。两者皆无交互逻辑、无 portal、零 new 依赖、样式 `var(--bk-*)`。产出 `Spinner.tsx`/`Kbd.tsx` + 各 `.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary 契约）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库现状+构建：`packages/ui/`（`src/index.ts`、`css-modules.d.ts`、`scripts/build-client.ts`、`package.json`）。参考既有 `Badge` 的极简 `.tsx` 与 `.module.css` 写法。

## 需求明细（验收点）

- [ ] `Spinner`：纯展示加载动画（CSS 旋转/脉冲圆环），可配 `label`/`aria-label` + `role="status"`/`aria-live`；`size` 档位（sm/md/lg）；`color` 走默认语义或无（用当前文字色/`var(--bk-*)`）。
- [ ] `Kbd`：键盘键帽（`<kbd>` 元素 + 键帽视觉，小圆角+浅底+阴影），纯展示、无焦点管理；`children` 为键名。
- [ ] 两个组件皆支持 `className` 透传；样式全 `var(--bk-*)`、零魔法色值，暗色单表、组件零主题选择器。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实：仅纯展示，不做 spinner 组合遮罩、不做 key 监听）。

## 硬约束（必须遵守）

- 只写 S1 冻结清单内 `var(--bk-*)`，禁魔法色值。
- 只依赖 `react` + `clsx`，零新依赖。
- 不 import 尚不存在的 `ctx.*`/`@berkshire/core`；不改既有组件；命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做加载遮罩/骨架屏组合（另属 `EmptyState`/未来件）、不做快捷键监听。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/Spinner.tsx` + `Spinner.module.css`、`packages/ui/src/Kbd.tsx` + `Kbd.module.css`、`src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Spinner`/`Kbd` 落地含 index 导出与中文 JSDoc，样式 `var(--bk-*)`、无魔法色值，`packages/ui` 构建 + root typecheck/lint 绿，无新增运行时依赖。