# WP-3（第二批 · 可并行）：Base UI 壳优化（大气 + grid 布局 + 通用/模型设置分组）

## 目标
优化 `@berkshire/base-ui` 应用壳：**(a)** 只留最干净的底座与必要 Seam；**(c)** 基础布局改为基于 **grid**；**(b)** 参考 design.md 让「投研工作台」看起来更大气。并在此落地「通用设置、模型设置」等设置分组骨架（设置弹窗本体在 WP-6）。前置：WP-1、WP-4。

## 背景与真相来源
先读：
- 根 `AGENTS.md`。
- `design.md`（§1 设计语言、§2 令牌、§7 页面布局——**翻译为现有 `--bk-*` 令牌**）。
- `packages/plugins/base-ui/src/client/{AppShell,RootShell,Sidebar,StatusBar,SettingsPage,index,registerRootShell}.tsx/x` + 各 `.module.css`。
- `packages/ui-slots/src/{types,index,ExtensionSlot,ExtensionBoundary}.ts(x)`（slot 缝）。
- `apps/berkshire-agent/src/App.tsx`（宿主如何把 routes/bridgeOnline/renderApp 注入 root 槽；WP-4 后此处应已干净）。
- `packages/theme/src/tokens.ts`（WP-1 之后的新令牌都可用）。
- `docs/secondary-development.md` §8、`docs/capability-seams.md`。

## 需求明细（验收点）
1. **仅留干净底座 + 必要 Seam**：精简 AppShell/Sidebar/StatusBar，去掉纯 demo/测试壳件，只保留产品必备底座与「布局挂点」Seam（`layout.navigation.extra` / `layout.sidebar.footer` / `layout.statusbar.right` / `settings.*`）。
2. **grid 布局**：把 AppShell 改成**基于 grid 的三区域骨架**（左导航 / 顶栏 / 内容区；或按产品需要 grid-template-areas）。
3. **大气视觉**：按 design.md 把暗色优先终端风格落到 `--bk-*` 令牌：品牌区、等宽数字、克制的层级（边框分层、少用阴影）、语义色只用对的地方（bull/bear 仅价格，UI 状态用 accent/success/warning/danger）。不引入魔法色值/圆角。
4. **通用/模型设置分组**：在壳里留出设置分组的一种承载（分组 id、label、顺序）——真正 UI 由 WP-6 弹窗消费；本包只给出设置分组的**契约/占位 Seam**（写明是占位、UI 在 WP-6）。
5. **挂点保留**：所有布局挂点在清理后仍可用、每槽包 `ExtensionBoundary`；用 WP-1 的组件替换壳里的手写按钮/状态条。

## 硬约束
- 样式全 `var(--bk-*)`、CSS Modules + clsx，禁魔法值；组件包 `ExtensionBoundary`；壳帧经共享 `root` 槽 single 语义（不重复注册）。
- 诚实：本包不与 WP-6 抢设置弹窗，只做壳与设置分组契约/占位；目标态能力标「待实现」。
- 同步 core `SLOT_NAMES` / `FrontendSlotContextMap`（若增删布局槽，两端同一契约）。
- build/typecheck/lint 绿，不动核心编排。

## 范围边界（明确不做）
- 不做完整设置弹窗/表单（WP-6 专属）。
- 不改 `@berkshire/theme`（WP-1 已冻结）。
- 不删正式 Seam/Services。

## 产物与验证
- 修改 `packages/plugins/base-ui/src/client/**`、`packages/ui-slots/src/types.ts`（如增删槽）、core `SLOT_NAMES`（如增删布局槽）、`apps/berkshire-agent/src/App.tsx`（注入若变）。
- 运行：`bun run build:packages`、`bun run typecheck`、`bun run lint:styles`、`cd apps/berkshire-agent && bun run build`、`git diff --check`。

## 完成定义（DoD）
- 壳是干净、grid 三区域、大气令牌合规的底座；布局挂点可用且 fail-closed；设置分组占位契约就位；build/typecheck/lint 绿。