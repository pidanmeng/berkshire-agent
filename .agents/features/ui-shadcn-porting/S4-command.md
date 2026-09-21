---
batch: 4            # 批次号：同号可并行；此号依赖 S1（依赖政策）+ S3 弹层（Popover/Dialog/HoverCard）+ 既有 Input
feature: command
depends_on: [shadcn-import-decision, alert-dialog, drawer-sheet, hover-card, resizable, sidebar-primitive]
parallel_with: [date-picker, data-table]
---

# S4 · `@berkshire/ui` 新增 `Command`（命令面板 / Combobox）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `Command`（命令/搜索弹层面板：输入框 + 可过滤选项列表 + 键盘导航，作为 palette/combobox 用）。按 [S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md) 的依赖政策决定实现范围——**缺省走自实现过滤 + 键盘导航，零新增运行时库**；若完整过滤匹配/虚拟化成本过高，落地一个**最小可用子集**（必选），并把更广特性诚实标「目标态」。零 new 独立依赖、样式 `var(--bk-*)`。产出 `Command.tsx` + `Command.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**依赖政策结论，先读**：若 S1 放行某搜索/combobox 库则以 S1 为准且如实入 `package.json`；缺省自实现）。
- overlay 决策 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`（方案 1 自实现弹层，不引 Radix）。
- 复用既有件：`packages/ui` 的 `Popover`（portal+定位+外部点击/ESC 关闭）、`Input`（搜索框形态）、`ScrollArea`（S2，选项列表滚动，可选）。组合为「`Command` 内容放在 `Popover` 面板内」或自含弹层（按需二选一，优先复用 `Popover` 做外壳）。参考 `Dropdown` 的键盘导航（Arrow 移动 + Enter 选中）思路。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `Command`（根 + 子件如 `CommandInput`/`CommandList`/`CommandItem`/`CommandEmpty` 或单组件 props 形态任选）：输入框渲染在顶部，随输入实时过滤选项列表，列表空时显示 `CommandEmpty`；可经 `Popover` 包成 command palette 弹层（`open`/`onOpenChange`）或直接作为内嵌面板（两种用法至少支持其一，props 稳定）。
- [ ] 过滤：大小写不敏感子串/前缀匹配（任选），覆盖 label 与可选 keywords；`value`/`onSelect` 受控选中 + 回调。
- [ ] 键盘可访问：输入框 `role="combobox"`+`aria-expanded`+`aria-controls`；选项列表 `role="listbox"`/`role="option"` + `aria-selected`；`ArrowUp/Down` 移动高亮、`Enter` 选中、`Esc` 关闭、输入过滤焦点保持在输入框。自实现 active index state。
- [ ] 诚实范围：完整高级匹配/分组 headers/虚拟化大列表/多选/嵌套分组——若自实现成本超出「有限改动独立完成」，标「目标态」子集不实现，只保证最小核心（实时过滤 + 键盘选中 + 弹层组合）。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；中文 JSDoc 诚实标注目标态部分。
- [ ] `src/index.ts` 导出 + 类型。

## 硬约束（必须遵守）

- 只依赖 `react` + `react-dom`（`createPortal`，已是 peer）+ `clsx`；（仅当 S1 显式放行时才加搜索/combobox 库，缺省零新增）。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管（键盘监听、外部点击清理）。
- **不改既有 `Popover`/`Input`/`Dropdown` API**；优先 composition 复用。
- 诚实：未实现的高级特性标「目标态」，不写成已实现。
- 命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做 Async 远程搜索加载/请求（消费方接线，本包不做）、不做命令 palette 的全局快捷键注册。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/Command.tsx` + `Command.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`Command` 实现最小核心（实时过滤 + 键盘导航/选中 + 复用 Popover 弹层组合），样式全 `var(--bk-*)`、无魔法色值，既有的 `Popover`/`Input`/`Dropdown` 接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，缺省零新增运行时依赖；更广特性诚实标「目标态」。