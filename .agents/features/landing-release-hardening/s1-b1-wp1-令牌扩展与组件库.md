# WP-1（第一批 · 总闸）：令牌扩展 + 原子组件库 `@berkshire/ui`

## 目标
在 `packages/` 下新建一个**独立可打包发布**的 React 原子组件库 `@berkshire/ui`（`packages/ui`），沉淀 Dropdown（下拉框）、Notification（Toast）、Modal（弹窗）、Button、Input、Select、Badge 等原子组件；并**先扩展 `@berkshire/theme` 令牌层**，补上 design.md 强调而当前缺失的语义令牌（bull/bear 价格红绿、accent 强调蓝、等宽数字字体、dialog 大圆角等）。所有组件只写 `var(--bk-*)`，不硬编码色值/圆角/字号。

## 背景与真相来源
先读：
- 根 `AGENTS.md`（诚实纪律、令牌两层 static→alias、禁魔法色值、防御模式、命令面）。
- `design.md`（§1 设计语言 / §2.1 色板 / §2.2 字体 / §2.3 圆角 / §5.2 反馈组件——**只当设计语言对照，不照抄令牌名与 `frontend/` 路径**）。
- `packages/theme/src/tokens.ts`（现有 `STATIC_TOKENS` + `THEME_TOKENS` 写法）、`packages/theme/src/css.ts`、`packages/theme/scripts/lint-styles.ts`（魔法色值 lint 规则）。
- `packages/plugins/base-ui/src/client/TokenSwatch.tsx` + `.module.css`（CSS Modules + clsx 示范）、`packages/plugins/demo/src/client/*.module.css`（插件打包阶段编译样式示范）。
- `docs/secondary-development.md` §8、`docs/capability-seams.md`（若涉及能力缝三角色）。
- `packages/tsconfig.json` 的 `paths`、根 `scripts/modules.ts`（**新增可发布包要在此登记**，供 `build-packages.ts`/`publish-plugins.ts` 自动跟随）、根 `tsconfig.base.json`。

## 需求明细（验收点）
1. **令牌扩展**：在 `STATIC_TOKENS` + `THEME_TOKENS` 各加一组语义令牌（取值只在 static 层，别名层 `var()` 引用）：
   - 价格语义：`--bk-color-bull`（红涨）/ `--bk-color-bear`（绿跌），亮暗两套值参照 design.md §2.1。
   - 强调色：`--bk-color-accent`（电光蓝）+ accent-soft/hover/focus。
   - 等宽数字字体：`--bk-font-mono`（JetBrains Mono 栈）+ 字号档（如需）。
   - 圆角：`--bk-radius-dialog`（弹窗档，对齐 design.md `rounded-dialog` 12px）。
   - 补齐 UI 状态语义色（success/info/warning/danger 已有，补 accent/bull/bear）。`DARK_PALETTE`/`LIGHT_PALETTE` 由 tokens 自动派生，`ThemePalettePage` 应能显示新增令牌组。
2. **组件库 package**：新建 `packages/ui`（`@berkshire/ui`），含 index + 至少以下原子组件（类型良、可访问性基础：aria-label / focus / ESC 关闭 / 禁用态）：
   - `Button`（变体 primary/ghost/danger，尺寸，loading/disabled）
   - `Input` / `Select`（下拉框）/ `Dropdown`（菜单下拉）
   - `Modal` / `Dialog`（overlay + ESC 关闭 + 焦点陷阱 + 遮罩点击，参照 design.md §5.1 Modal 可访问性）
   - `Notification` / `Toast`（error/success/info kind）
   - `Badge`、`Tooltip`、`EmptyState`（视需要）
   - 若需隔离坏插件，复用 `@berkshire/ui-slots` 的 `ExtensionBoundary`（不强制）。
3. **接口冻结**：组件命名、props 形状稳定，JSDoc 中文 + 诚实标注；组件可独立使用（不 import 宿主/base-ui/core 的运行时）。
4. **可独立打包发布**：按现有 pattern 配 `tsconfig.build.json` + `build` 产出 `dist/`，`exports`/`main`/`types` 指 dist、去 `private`、补 `files`/`license`/`peerDependencies`(react)；在 `scripts/modules.ts` 的 `MODULES` 登记（`pluginChain: true`）。
5. **样式纪律**：全部 `*.module.css` + clsx，只写 `var(--bk-*)`，禁魔法值；通过 lint。

## 硬约束
- 诚实：不得把 design.md 的 `frontend/*`/旧令牌当已存在；不得 import 尚不存在的 `ctx.*`/`packages/*` 服务；只加已有两层体系的条目。
- 禁魔法色值：颜色/圆角/字号一律来自 `--bk-*`；提交前跑 `bun run lint:styles`。
- 令牌单向：取值只在 static 层、引用走别名层；组件零主题选择器（暗色只在 static 层覆盖）。
- 新能力若属目标态需在文档标注；不改核心编排。
- 前端 slot/组件包 `ExtensionBoundary`（如涉及挂槽）。
- 类型严格（根 `strict`）。

## 范围边界（明确不做）
- 不改 `apps/berkshire-agent` 宿主、不改 `@berkshire/base-ui` 壳（除非加依赖）。
- 不做主题换肤联动（`ctx.theme` 目标态）。
- 不做业务组件（StockPanel 等目标态，不在本包）。
- 不新建第二套令牌体系。

## 产物与验证
- 新增 `packages/ui/**`（源码 + css + package.json + tsconfig.build.json + 至少一个冒烟/单测）。
- 修改 `packages/theme/src/tokens.ts`（+`css.ts` 若需导出）、根 `scripts/modules.ts`。
- 运行（仓库根）：`bun run build:packages`、`bun run typecheck`、`bun run lint:styles`；包内 `bun test`（若真实存在）；`git diff --check`。

## 完成定义（DoD）
- 新增令牌在 `ThemePalettePage`/lint 均可见且合法；组件库独立构建出 dist、可被宿主与插件 import；全部 `bun run typecheck` + `lint:styles` + `build:packages` 绿。