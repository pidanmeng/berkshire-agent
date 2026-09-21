---
batch: 4            # 批次号：同号可并行；此号依赖 S1（依赖政策）+ S3 弹层（Popover）+ 既有 Input
feature: date-picker
depends_on: [shadcn-import-decision, alert-dialog, drawer-sheet, hover-card, resizable, sidebar-primitive]
parallel_with: [command, data-table]
---

# S4 · `@berkshire/ui` 新增 `DatePicker`（shadcn 移植）

## 目标

在 `packages/ui`（`@berkshire/ui`）新建 shadcn 风格的 `DatePicker`（日期选择：输入/按钮触发弹出日历格网，选日期回填）。按 [S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md) 依赖政策决定：**缺省自实现日历格网（无 date-fns），零新增运行时库**；若完整日历（月切换/周起始/范围选择/国际化）成本过高，落地**最小可用子集**（必选：单日期、月视图、前后月切换），并把更广特性（范围/周视图/多日/本土化）诚实标「目标态」。样式 `var(--bk-*)`。产出 `DatePicker.tsx` + `DatePicker.module.css` + `src/index.ts` 导出 + 中文 JSDoc。

## 背景与真相来源（先读）

- 根 [AGENTS.md](../../../AGENTS.md)、[S1-shadcn-import-decision.md](./S1-shadcn-import-decision.md)（**依赖政策结论，先读**：若 S1 放行 date-fns 则按之且如实入 `package.json`；缺省自实现）。**注意时区/日期红线的仓库纪律**（`docs/data-model.md` 数据契约红线里「北京时区」「交易日语义」——本组件为纯展示选日期，需明确本地时区语义并在 JSDoc 说明，避免把本地 Date 当 UTC 传递）。
- overlay 决策 `.agents/notes/implemented/architecture/2026-09-21-overlay-primitives.md`（方案 1 自实现弹层）。
- 复用既有件：`packages/ui` 的 `Popover`（portal 面板外壳）、`Input`/`Button`（触发器）、`Card`（日历面板结构可选）、`Calendar`（若本包内实现）。参考 `Popover` 定位模式。
- 设计档位：`docs/ui-design-language.md`；令牌 `packages/theme/src/tokens.ts`。
- 构建管线：`packages/ui/`。

## 需求明细（验收点）

- [ ] `DatePicker`：触发器（`Input` 显示选中日期或 Button）+ 弹出日历面板；选中日期回填并 `onChange(date: Date | null)` / ISO 字符串（在 JSDoc 固定交付形态）。
- [ ] **日历格网**（自实现，缺省零依赖）：月视图格子布局（周起始可定，默认按 S1/仓库惯例）；`role="grid"`/`role="cell"` + `aria-selected`/`aria-label`（完整日期文案）、键盘 `Arrow/Home/End` 格间移动 + `Enter`/`Space` 选 + `Esc` 关；今天高亮可选。
- [ ] 月导航（前一月/后一月按钮，`aria-label`），受控 `value`/`min`/`max` 钳制可选。
- [ ] 诚实范围：日期**范围选择**、多日、视口/周视图、周起始可配置国际化、禁用日集合——若自实现成本超出「有限改动独立完成」，标「目标态」子集不实现，只保证**单日期 + 月格网 + 月导航 + 键盘选中**。
- [ ] 样式全 `var(--bk-*)`、零魔法色值、暗色单表、组件零主题选择器；中文 JSDoc 诚实标注目标态 + 本地时区语义说明。
- [ ] `src/index.ts` 导出 + 类型。

## 硬约束（必须遵守）

- 只依赖 `react` + `react-dom`（`createPortal`，已是 peer）+ `clsx`；（仅当 S1 显式放行 date-fns 时才加，缺省零新增）。日历计算用原生 `Date` + 自实现月算法，禁魔法色值。
- **日期语义诚实**：JSDoc 明确本地时区 vs UTC（不搞隐性转换）；不把本地 Date 当已 UTC 序列化。
- 只写冻结 `var(--bk-*)`，禁魔法色值；effect 遵循「注册即效应 + disposer」自管。
- **不改既有 `Popover`/`Input`/`Button`/**`Card` API；优先 composition 复用。
- 诚实：未实现的高级日期功能标「目标态」，不写成已实现。
- 命名以 S1 决策为准。

## 范围边界（明确不做什么）

- **不**做日期范围/区间选择、时区转换管线、交易日历集成（A 股交易日语义是消费方/数据层红线，本组件不做）。
- **不**改 `packages/theme`、base-ui 壳、插件、宿主源码。

## 产物与验证

- `packages/ui/src/DatePicker.tsx` + `DatePicker.module.css` + `src/index.ts` 导出更新。
- 运行（真实存在）：
  - `cd packages/ui && bun run build`。
  - `bun run typecheck`（根）+ `bun run lint:styles`（根）+ `git diff --check`。

## 完成定义（DoD）

`DatePicker` 实现最小核心（单日期 + 月格网 + 月导航 + 键盘选中，复用 Popover 外壳），样式全 `var(--bk-*)`、无魔法色值、日期语义在 JSDoc 明确，既有组件接口零破坏，`packages/ui` 构建 + root typecheck/lint 绿，缺省零新增运行时依赖；范围/本土化等诚实标「目标态」。