---
batch: 3            # 批次号：同号可并行；此号依赖 S1（命名）+ 既有 ScrollArea/Popover 模式
feature: resizable
depends_on: [shadcn-import-decision]
parallel_with: [alert-dialog, drawer-sheet, hover-card, sidebar-primitive]
---

# S3 · `@berkshire/ui` 新增 `Resizable`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `Resizable`（可拖拽调整尺寸的面板分隔组件：父容器内两个/多个区域由分隔条拖拽改变尺寸，横竖布局）。零 portal、零 new 依赖、样式 `var(--bk-*)`。产出 `Resizable.tsx`（含 `ResizablePanel`/`ResizableHandle`/组）+ `Resizable.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（命名/boundary；确认 Resizable 不被 S1 判为目标态延后——若 S1 判延后则以 S1 为准，否则按本包实现）。
- 键盘/指针事件自实现参照：`packages/ui/src/Popover.tsx` 的 effect 清理纪律、`ScrollArea`（S2）的 `pointerdown/move/up` 拖拽模式（若已落地可参考）。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 组件库构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `Resizable`：横向/纵向（`direction`）分割两个（或更多）`ResizablePanel`，其间 `ResizableHandle` 分隔条；拖拽分隔条改变两侧面板尺寸。
- [ ] **拖拽**：handle `pointerdown` → 捕获 pointer + `pointermove` 实时更新两侧 `flex-basis`/尺寸 → `pointerup` 释放；使用 `pointer capture`/`setPointerCapture` 防移出中断；禁文本选择（简单 `user-select` CSS）；面板尺寸以**比例/像素**稳定表达（props 记初值、受控回调可选）。
- [ ] 键盘可达：handle 可 `tabIndex={0}` + `ArrowLeft/Right(或 Up/Down)` 微调聚焦面板尺寸（自实现基础增强，可选；不强求）。`role="separator"` + `aria-orientation`（@注意：`aria-orientation` 在 `separator` 需移除 `aria-valuenow` 的无义组合，按无障碍规范处理）。
- [ ] 边界：最小/最大面板尺寸钳制（`min`/`max` props 可选）。多面板：优先实现两面板稳定，三面板可标「目标态」子集。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；`className` 透传。
- [ ] `src/index.ts` 导出 + 类型 + 中文 JSDoc（诚实标注：不做嵌套面板拖拽分组/不做持久化尺寸——除非下拉实现天然支持）。

## 硬约束（必须遵守）

- 只依赖 `react` + `clsx`，零新增运行时库（不引 `react-resizable-panels`/Radix）。
- effect 遵循「注册即效应 + disposer」自管（pointer 事件解绑、capture 释放）；若引入 `ResizeObserver` 保证拖拽后视图一致，注意其生命周期清理。
- 只写冻结 `var(--bk-*)`，禁魔法色值。
- 诚实：未实现的（三面板/键盘微调等）标「目标态」。
- 不改既有组件 API；不 import 尚不存在的 `ctx.*`/`@berkshire/core`；命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做嵌套分组拖拽、**不**做尺寸持久化到存储（那是消费方/`ctx.storage` 的活，本包不做）。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/Resizable.tsx` + `Resizable.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Resizable`（含 `ResizablePanel`/`ResizableHandle`，横竖拖拽 + pointer capture + 最小/最大钳制，两面板稳定）落地，样式全 `var(--bk-*)`、无魔法色值，`packages/ui` 构建 + root typecheck/lint 绿，零新增运行时依赖；未实现部分诚实标「目标态」。