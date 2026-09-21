---
batch: 3            # 批次号：同号可并行；此号依赖 S1（命名/边界）+ 既有 Modal/Popover overlay 决策
feature: alert-dialog
depends_on: [shadcn-import-decision]
parallel_with: [drawer-sheet, hover-card, resizable, sidebar-primitive]
---

# S3 · `@berkshire/ui` 新增 `AlertDialog`（shadcn 移植），与既有 `Modal` 对齐

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `AlertDialog`（确认/告警式模态：聚焦陷阱 + 遮罩 + 确认/取消动作），并依据 [S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md) 的 `Dialog(8)↔Modal` 对齐结论处理与既有 `Modal` 的关系（通常：`AlertDialog` 作为「模态 + 告警语义 + 动作区」组合新建，**不改** `Modal` 接口）。零 new 依赖、样式 `var(--bk-*)`。产出 `AlertDialog.tsx` + `AlertDialog.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**Dialog↔Modal 对齐结论，先读并遵守**）。
- overlay 决策：`.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`（方案 1 自实现 portal+定位+focus-trap，不引 Radix）。
- 既有实现参考（可复用模式，**不改它们的 API**）：`packages/ui/src/Modal.tsx`（focus-trap + 遮罩 ESC 关闭 + body scroll lock）、`Popover.tsx`（portal 到 document.body + 定位）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库构建管线：`packages/ui/`（`src/index.ts`、`css-modules.d.ts`、`scripts/build-client.ts`、`package.json`）。

## 需求明细（验收点）

- [ ] `AlertDialog`（或组合件）：受控 `open` + `onOpenChange`；渲染遮罩 + 居中面板；焦点陷阱（复用 Modal 的自实现 focus-trap 思路，但不改 Modal 源码——可抽公共 hook 放本包内或就地复写）；ESC/遮罩关闭可按需禁用（告警常强制确认）；body scroll lock。
- [ ] 告警语义：标题区（`aria-labelledby` 关联）+ 描述区（`aria-describedby` 关联）+ 动作区（取消/确认，danger 视觉）；`role="alertdialog"`；确认可 `disabled` 或加载态（配 `Spinner` 可选）。
- [ ] 尊重 S1 的 Dialog↔Modal 对齐结论：通常新建 `AlertDialog` 独立组件、**保持 `Modal` API 不变**；若 S1 结论要求另出 `Dialog` 别名/组合，一并完成。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；中文 JSDoc 诚实标注边界（不做连续多告警队列、不做 `command`/`title` 外复杂头部插槽）。

## 硬约束（必须遵守）

- **不改既有 `Modal`/`Popover` API 与源码**；若要复用 focus-trap/portal 逻辑，抽本包内 helper 或按 S1 指示放共享处，不侵入既有组件。
- 只依赖 `react` + `react-dom`（`createPortal`，已是 peer）+ `clsx`，零新增运行时库；不引 Radix/Tailwind/CVA。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管。
- 诚实：不把未实现的告警增强写成已实现。

## 范围边界（明确不做什么）

- **不**改 `Modal`/`Popover`/`Dropdown` 接口（S1 别名需求除外）。
- **不**做 `Drawer`/`Sheet`（S3-drawer-sheet 的活）；**不**做 `Command` 弹层。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/AlertDialog.tsx` + `AlertDialog.module.css` + `src/index.ts` 导出更新（及 S1 结论要求的相关别名）。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD)

`AlertDialog` 落地：modal 遮罩 + focus-trap + ESC/遮罩关闭策略 + 标题/描述/动作区 + `role="alertdialog"`；样式全 `var(--bk-*)`、无魔法色值；既有 `Modal`/`Popover` 接口零破坏；`packages/ui` 构建 + root typecheck/lint 绿；零新增运行时依赖。