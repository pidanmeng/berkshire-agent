# WP-6（第三批）：设置弹窗改造 + 插件设置 Seam

## 目标
把**当前的设置路由页（`/settings` → `SettingsPage`）改为点击设置弹出的弹窗**：弹窗左侧一个 sidebar（通用设置、模型设置、插件设置等分组），右侧是对应模块的设置表单；其中「插件设置」要**流出 Seam（slot）供其他插件贡献自己的设置表单**。前置：WP-3、WP-1。

## 背景与真相来源
先读：
- 根 `AGENTS.md`。
- 现有设置页：`packages/plugins/base-ui/src/client/SettingsPage.tsx` + `.module.css`（当前是路由页 + `settings.cards` 槽）；core `CORE_ROUTE_PATHS` 含 `/settings`；宿主 `App.tsx` 里 `<Route path="/settings" element={<SettingsPage/>}>`；`Sidebar.tsx` 底部设置入口。
- WP-1 的 Dialog/Modal 组件、WP-3 的 shell 与设置分组契约（前置必须已落地）。
- `packages/ui-slots/src/{types,...}`（如何定义设置表单 slot）。
- `docs/capability-seams.md`（能力缝三角色）。
- `docs/secondary-development.md` §8。

## 需求明细（验收点）
1. **改为弹窗**：设置不再是 `/settings` 路由页，而是点「设置」弹出的 Modal/Dialog（用 WP-1 组件）。核心路由 `/settings` 若不再需要，从 `CORE_ROUTE_PATHS` 与宿主 `<Route>`、`StatusBar`/`Sidebar` 引用移除并同步。
2. **弹窗内左 sidebar + 右表单**：左侧列分组（通用设置、模型设置、插件设置、…），右侧渲染当前分组表单；分组加/排序可扩展。
3. **插件设置流出 Seam**：定义一个新的前端设置 slot（如 `settings.plugin` / `settings.section` 或复用 `settings.*`），插件可把自己的「设置表单组件」注册进弹窗对应分组；`FrontendSlotContextMap` 补类型、`ui-slots` 注册表与 core `SLOT_NAMES` 两端同步；每槽包 `ExtensionBoundary`。提供一个示例消费者证明「装上即出现在设置弹窗对应分组、卸下即消失」。
4. **通用/模型设置内容**：落地通用设置（主题、语言、时区/数字格式等）与模型设置（模型选择、API 基址/Key 引用——**不落明文，遵守 secrets 纪律，只存 env 引用名**）的**表单骨架**，字段用 WP-1 组件，值存 `ctx.storage`/持久化（若 WP-2 已落地则接进去；否则标待接线）。
5. **数据契约/密钥纪律**：模型设置绝不落明文 key，只存环境变量/引用名，loud-fail 校验缺失引用。

## 硬约束
- 能力缝完整（若新增设置注册缝：Definition + Provider/宿主持有 + Consumer 示例，三角色齐全）。
- 注册即效应/可逆 disposer；事件 `@mode`；slot 组件包 `ExtensionBoundary`；样式 `var(--bk-*)`/组件复用 WP-1。
- 诚实：路由 `/settings` 移除则同步 core `CORE_ROUTE_PATHS` 与宿主/壳；模型设置若接 WP-2 持久化要按契约，未接则标「待接线」。
- 不落明文密钥；禁魔法色值。
- 改 slot 名/路由契约两端同步（ui-slots + core）。

## 范围边界（明确不做）
- 不做 DuckDB/正式 DB。
- 不改壳的 grid 视觉（WP-3）；只做弹窗 + 设置分组 + 插件设置 Seam。
- 不做大量业务设置项，聚焦「通用/模型/插件」三组骨架 + Seam。

## 产物与验证
- 修改 `packages/plugins/base-ui/src/client/{Settings*,…}.ts(x)`、`packages/ui-slots/src/types.ts`（新增设置 slot 类型/名）、`packages/core/src/services/slots.ts`（`SLOT_NAMES`/`CORE_ROUTE_PATHS` 同步）、宿主 `App.tsx`（去 `/settings` 路由或改弹窗触发）、`Sidebar/StatusBar` 设置入口。
- 运行：`bun run build:packages`、`bun run typecheck`、`bun run lint:styles`、`cd apps/berkshire-agent && bun run build`、`git diff --check`。
- 若接 WP-2 `ctx.storage`：`bun test`。

## 完成定义（DoD）
- 设置是弹窗（左 sidebar 分组 + 右表单），`/settings` 路由移除；插件能经设置 Seam 往对应分组注册自己的设置表单并装/卸生效；通用/模型设置骨架就位且不落明文；build/typecheck/lint 绿。