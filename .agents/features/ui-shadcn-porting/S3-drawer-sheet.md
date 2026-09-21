---
batch: 3            # 批次号：同号可并行；此号依赖 S1（命名）+ 既有 Popover/Modal overlay 决策
feature: drawer-sheet
depends_on: [shadcn-import-decision]
parallel_with: [alert-dialog, hover-card, resizable, sidebar-primitive]
---

# S3 · `@berkshire/ui` 新增 `Drawer`、`Sheet`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建两个「屏幕边缘滑出面板」组件：`Sheet`（左/右/顶/底边缘面板）与 `Drawer`（底部抽屉式面板，通常不遮挡全部背景、可拖拽收放——若成本可控）。二者共享同一滑出面板机制，纳入同一包。零 new 依赖、样式 `var(--bk-*)`。产出 `Sheet.tsx`/`Drawer.tsx`（可共享内部 helper）+ 各 `.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary）。既有 overlay 决策 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`（方案 1 自实现 portal+定位+focus-trap，不引 Radix）。
- 复用模式（**不改它们的 API**）：`packages/ui/src/Popover.tsx`（`createPortal` + 定位 + 外部点击/ESC 关闭）、`Modal.tsx`（focus-trap + body scroll lock + 遮罩关闭）。搬移动画：视觉上滑出（可用入场动画，用 CSS transition；注意 `createPortal` 后面板在 body 下，动画用 CSS 即可，不加动画库）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `Sheet`：受控 `open`/`onOpenChange`；`side`（`left`/`right`/`top`/`bottom`，右默认）；遮罩点击/ESC 关闭 + body scroll lock + focus-trap（复用 `Modal` 模式）；内容经 portal 渲染到 `document.body`（受裁剪不影响）；滑出入场动效（CSS transition，柔和不生硬）。
- [ ] `Drawer`：底部滑出 + 更语义化（`aria-modal`），遮罩可半透明；拖拽收放（`pointer` 拖拽下拉关闭）**为可选增强**——若实现成本超出「有限改动独立完成」上限，可标「目标态」子集不实现拖拽，只保留基础滑出 + 遮罩/ESC 关闭，并在 JSDoc/Decision 如实标注。
- [ ] 可访问性：`role="dialog"`/`aria-modal`/`aria-labelledby`（标题）；focus-trap（Tab 圈定）+ 关闭还原焦点（参照 `Modal`）; ESC 关闭。
- [ ] 与 `ScrollArea`（S2）可组合承载长内容，但不强耦合（`Sheet` 内容透传 children，滚动交给内容自身或消费方）。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；中文 JSDoc 诚实标注（未实现的拖拽/动画变体）。
- [ ] `src/index.ts` 导出 `Sheet`/`Drawer` + 类型。

## 硬约束（必须遵守）

- **不改既有 `Modal`/`Popover` API/源码**；复制的 focus-trap/portal 逻辑放本包内 helper 或共享，不侵入既有组件。
- 只依赖 `react` + `react-dom`（`createPortal`，已是 peer）+ `clsx`，零新增运行时库；不加动效库（CSS transition 即可）。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管。
- 诚实：拖拽/复杂动画未实现时标「目标态」，不写成已实现。

## 范围边界（明确不做什么）

- **不**改 `Modal`/`Popover`；**不**做 `AlertDialog`/`Command` 弹层。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/Sheet.tsx` + `Sheet.module.css`、`packages/ui/src/Drawer.tsx` + `Drawer.module.css`（+ 共享内部 helper）+ `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Sheet`/`Drawer` 落地：portal 滑出 + 遮罩 + ESC 关闭 + focus-trap + body scroll lock，样式全 `var(--bk-*)`、无魔法色值，既有 `Modal`/`Popover` 接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，零新增运行时依赖；拖拽等未实现部分诚实标「目标态」。