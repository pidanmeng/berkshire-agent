# Agent Note: 样式体系重构——对齐 dsh（无 tailwind、无组件库、token 分治 + 插件独立打包 CSS Modules）

Status: implemented

## 问题

BK 中枢 webview 的样式层此前已落地 `@berkshire/theme` 令牌层（单层 `--bk-*` 令牌 + `var()` 引用 + 主题对照页 + 魔法色值 lint），但存在三个待决框架问题：

1. **tailwind 是否落地**：仓库 `apps/docs` 有 `tailwindcss@4.3.3` 先例，但那是文档站、非产品前端。经评估，tailwind 与 BK 的 Cordis 架构不匹配（见「曾考虑的替代方案」），决定放弃。
2. **字号/间距/圆角是否 token 化**：现状把 spacing/radius/font 都 token 化，与 dsh「字号/间距不 token 化、成对行高 + 4 倍数纪律」矛盾。
3. **插件样式的组织方式**：现状插件 `styles.ts` 是运行时字符串、靠 `.bk-demo-*` 人肉前缀 + 与 `data-bk-module` 对齐来保证作用域。CSS Modules 能自动做类名哈希，但依赖构建期——而插件样式当时没有构建期。

## 决策

**放弃 tailwind**；样式层定位为 **CSS token（两层）+ CSS Modules + 无组件库**，与 dsh 一致。已落地以下四项：

### S0：令牌分两层（static → alias）+ 字号/间距去 token 化筹备

`@berkshire/theme` 从单层 `--bk-*` 拆成**取值层 `--bk-static-*` + 别名层 `--bk-*`**：

- **取值层** `STATIC_TOKENS`：唯一写实值的地方（`light`/`dark` 每套实际色板/阴影/档位值）；
- **别名层** `THEME_TOKENS`：组件/插件**唯一引用入口**，值为 `var(--bk-static-<ref>)`，别名层不写实值。

`themeRootCss()` 先写 `:root { --bk-static-*: 实值 }`，再写别名层 `--bk-*: var(--bk-static-*)`；亮/暗沿用 `[data-theme='dark']`/`@media (prefers-color-scheme: dark)` **单表只覆盖取值层**。`LIGHT_PALETTE`/`DARK_PALETTE` 现为「别名 id → 解析后实值」（供对照页/测试读取），`bkVar`/`bkVarName` 仍是别名层引用，新增 `bkStaticVar`/`bkStaticVarName`。魔法色值 lint 改为读取值层 `STATIC_TOKENS` 为「允许的魔法值出处」，别名层引用只许 `var()`；扫描面含插件 `.module.css`。spacing/radius/font-size 仍以别名层暴露以兼容现状宿主，**正式去 token 化（组件写 4 倍数/成对行高、弃用这些令牌）标 v-next**。

### R1：透明制边框/交互态 + 暗色单表

新增透明度叠层 token：`border`/`border-strong`（边框/分隔）、`hover`/`active`（交互态），均用 `rgba(…)` 叠加任意背景，不新造实色灰。`App.css` 把 `color-border`/`color-border-strong`/`color-pressed-bg` 迁到新的叠层别名（`--bk-border`/`--bk-border-strong`/`--bk-active`）。暗色只在 token 表（取值层暗值），**组件与插件 CSS 零 `[data-theme]` 选择器**（系统偏好 toggle 适配仍 v-next）。

### H2：host 组件 CSS Modules + clsx

host 建立 CSS Modules 示范：[TokenSwatch.tsx](../apps/berkshire-agent/src/theme/TokenSwatch.tsx) + 同目录 [TokenSwatch.module.css](../apps/berkshire-agent/src/theme/TokenSwatch.module.css) + [css-modules.d.ts](../apps/berkshire-agent/src/css-modules.d.ts)（通配 declare）。类名 camelCase、状态类由 `clsx` 挂载、组件透传 `className`、禁 `composes`；颜色/圆角只引 `var(--bk-*)` 别名层；动态样式走 **CSS 变量桥**（JS 只写 `--swatch-light/--swatch-dark` 变量、规则留 CSS）。host 全局工具类仍住 `App.css`。

### P3：插件独立打包阶段编译 CSS Modules（对齐 dsh）

demo 插件样式从运行时字符串迁到 **CSS Modules**：

- 作者源 `packages/plugins/demo/src/client/*.module.css`（`fundFlow`/`watchlistToolbar`/`moneyFlow`，只写 `var(--bk-*)`）；
- **插件打包阶段编译步骤** [packages/plugins/demo/scripts/compile-styles.ts](../packages/plugins/demo/scripts/compile-styles.ts)（lightningcss `cssModules`，`bun run --cwd packages/plugins/demo compile:styles`）产出**哈希类名 + 注入代码** [styles.generated.ts](../packages/plugins/demo/src/client/styles.generated.ts)；
- `.tsx` webview 半身 import 该模块拿哈希类名（`className={fundFlow.classNames.fundFlow}`）；sidecar 半身 import 同一模块的 `css` 作为注入代码经 `client/list` 交给 host；
- **host（`loader.ts`）只把 css 塞进 `<style data-bk-module>`、不参与哈希**；类名构建期自动唯一（消掉 `.bk-demo-*` 人肉前缀）。插件 scope 仍由 `data-bk-module` 归属保证。

`library/client` 入口同时 re-export 三个 `CompiledModuleStyle`（含 classNames 与 css）。

## 曾考虑的替代方案

- **落地 tailwind**：否决。tailwind 是构建时扫描生成工具类，与 BK「插件样式经 sidecar/`bk://` 运行时注入」的分裂交付**根本冲突**——插件侧写不了 `@apply`/utility；走「插件 `.tsx` 进中枢构建」的路径 A 又与 `bk://` 远程 bundle 的独立打包冲突。结论：不引入，样式一致性由 token + CSS Modules 承载（与 dsh 一致）。
- **落地 tailwind + shadcn/ui**：否决。shadcn 强依赖 tailwind，且组件 copy 进项目后 maintenance 面大；其语义变量若接进 `--bk-*` 徒增一层映射，若另起一套则违背单一事实源。
- **插件继续用运行时字符串 + 人肉前缀（不引入 CSS Modules 构建期）**：否决。与 dsh 实证（插件 bundle 内联 lightningcss 编译 CSS Modules）相比，人肉前缀 + 字符串对齐维护成本高、且作用域靠约定不靠构建保证；给插件补独立打包阶段的 CSS Modules 既不破坏分裂交付，又把这层自动化。
- **插件用 clsx + CSS Modules（host 同款）**：暂不。插件 bundle 走运行时注入链路，不依赖 React class 拼接管线；用 clsx 徒增依赖而无净收益。host 仍用 clsx，插件保持纯 CSS Modules + `var(--bk-*)`。
- **保持现状单层 `--bk-*`、字号/间距继续 token 化**：否决。与 dsh 实证（成对行高 + 4 倍数即可收敛）冲突；token 表膨胀会稀释颜色 token 的权威性。
- **暗色用 `prefers-color-scheme` 或组件内分支**：否决。属性选择器整表覆盖让组件零感知；系统偏好可后续在 toggle 层适配。
- **token 权威继续放 TS、不走 CSS 文件**：暂保留。`@berkshire/theme` 是 TS 生成 `themeRootCss()`，先维持 TS 为权威、在生成出口拆 static/alias；待正式样式文件（global.css 等价物）落地再迁（见「后果」）。

## 后果

- **收益**：样式层对齐 dsh 框架——无 tailwind/组件库、token 两层、字号/间距向语义刻度收敛、边框/交互态透明制、暗色单表组件零感知、插件样式构建期自动唯一类名；host/插件分界清晰。
- **代价**：P3 给插件打包链新增一个 lightningcss 编译步骤（`compile-styles.ts`）+ 提交一份生成产物 `styles.generated.ts`（需在改动 `.module.css` 后 `compile:styles` 重生成、保持与 `.tsx`/sidecar 同源）；host/插件仍是两套书写方式（host 用 clsx、插件不用），需以文档规则固守分界线。
- **仍目标态（v-next）**：`ctx.theme` 换肤能力缝（三角色）、`bk://` 远程 bundle + HMR、生产样式分发包、spacing/radius/font-size 正式去 token 化、正式样式文件（global.css 等价物）接管取值层。这些在本文档与「目标态 vs 已实现」锚点中均如实标注。

## 相关

- 现状锚点：`docs/architecture.md §11` · `docs/secondary-development.md §6/§8` · 根 `AGENTS.md`「已有」
- 样式治理约束：`.agents/features/bk-style-governance.prompt.md`
- 参考：dsh `2026-07-19-web-styling-system` RFC 及其 `--dsw-*` 两层 token 更新；DSH 插件打包实证 `packages/client/tsdown.client.ts`（`dsh-css-modules-inline` 插件、`clientBundle()` 预设、`staticLinked` 预设）