# WP-5（第二批 · 可并行）：自绘 Windows 标题栏

## 目标
把当前「Windows 原生拖动栏」替换为**手动实现的自绘标题栏**（更大气、统一 in-app 视觉），可拖动、可最小化/最大化/关闭、贴合 `@berkshire/theme` 视觉。前置：WP-4（干净壳）。

## 背景与真相来源
先读：
- 根 `AGENTS.md`。
- `apps/berkshire-agent/src-tauri/tauri.conf.json`（确认当前是否原生标题栏：`app.windows[].decorations`；若要自绘需设 `decorations:false` + 手动标题栏）。
- `apps/berkshire-agent/src-tauri/src/bridge.rs`/`main.rs`（窗口管理 command 面）。
- `apps/berkshire-agent/src-tauri/Cargo.toml`（是否已有 `window`/`window-state` plugin）。
- 壳组件 `packages/plugins/base-ui/src/client/AppShell.tsx`/`StatusBar.tsx`（标题栏放哪）。
- Tauri 2 的 drag region（`data-tauri-drag-region`）+ window 最小化/最大化/关闭 API。
- `docs/architecture.md`、`docs/secondary-development.md` §8。

## 需求明细（验收点）
1. **方案确认**：确认当前是原生标题栏（`decorations` 未设/为 true）。若是，设 `tauri.conf.json` 的 `decorations:false` 并自绘标题栏。
2. **自绘组件**：在 base-ui 壳（或宿主标题栏组件）实现标题栏：品牌区 + 可拖动区（`data-tauri-drag-region`）+ 窗口控制按钮（最小化/最大化/还原/关闭），配色/圆角/字号全用 `var(--bk-*)`，风格大气（对齐 WP-1 令牌）。
3. **Rust 侧 command**：补最小化/最大化/关闭 command（或走 `@tauri-apps/api/window`），打包进 bridge；macOS/Linux 为平台分支写好（聚焦 Windows，代码跨平台或有明确关注）。
4. **与壳衔接**：标题栏接入 AppShell/RootShell 布局（grid 或 flex 顶部条），去掉原生标题栏后内容区不抖动。
5. **可访问性/边界**：双栏布局、窗口控制按钮有 aria-label、焦点处理。

## 硬约束
- 诚实：这是 Windows 平台目标；macOS/Linux 拖拽需按平台区分，写清「聚焦 Windows、其余标记/降级」。
- 样式 `var(--bk-*)`，禁魔法色值；组件包 `ExtensionBoundary`（如涉及挂槽）。
- 改动 tauri 配置后重跑宿主 build /（如有）cargo 校验；确认不破坏窗口尺寸/初始大小。

## 范围边界（明确不做）
- 不做正式设置弹窗内容（WP-6）。
- 不改 `@berkshire/theme`（若缺令牌依赖 WP-1 冻结接口即可，回退用现有 tokens）。
- 不引入与「大文件依赖」冲突的方案。

## 产物与验证
- 修改 `apps/berkshire-agent/src-tauri/**`（`tauri.conf.json`、`bridge.rs`/`main.rs`、`Cargo.toml` 视需要）+ base-ui/host 标题栏组件 + `.module.css`。
- 运行：`bun run build:packages`、`cd apps/berkshire-agent && bun run build`、`cargo check -p berkshire-agent --manifest-path apps/berkshire-agent/src-tauri/Cargo.toml`、`git diff --check`。
- 手动/冒烟验证拖拽与三个窗口按钮（若环境可跑 Tauri）。

## 完成定义（DoD）
- 无原生标题栏、自绘标题栏可拖动 + 最小化/最大化/关闭可用；样式令牌合规；build/cargo 绿。