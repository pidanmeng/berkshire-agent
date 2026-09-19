# Agent Note: 样式体系重构——对齐 dsh（无 tailwind、无组件库、token 分治 + 插件独立打包 CSS Modules）

Status: proposed

## 问题

BK 中枢 webview 的样式层已落地 `@berkshire/theme` 令牌层（令牌单一事实源 + `var(--bk-*)` 引用 + 主题对照页 + 魔法色值 lint），但存在三个待决框架问题：

1. **tailwind 是否落地**：仓库 `apps/docs` 有 `tailwindcss@4.3.3` 先例，但那是文档站、非产品前端。经评估，tailwind 与 BK 的 Cordis 架构不匹配（见「曾考虑的替代方案」），决定放弃。
2. **字号/间距/圆角是否 token 化**：现状已把 spacing/radius/font 都 token 化，与 dsh「字号/间距不 token 化、成对行高 + 4 倍数纪律」矛盾。
3. **插件样式的组织方式**：现状插件 `styles.ts` 是运行时字符串、靠 `.bk-demo-*` 人肉前缀 + 与 `data-bk-module` 对齐来保证作用域。CSS Modules 能自动做类名哈希，但依赖构建期——而插件样式目前没有构建期。

本 note 参考 dsh 的 [2026-07-19-web-styling-system RFC]（及其 2026-07-22 `--dsw-*` 两层 token 更新）重新设计框架，并把 dsh「插件 bundle 内联 lightningcss 编译 CSS Modules」的实证映射到 BK 具体约束上。

## 提案

**放弃 tailwind**；样式层定位为 **CSS token + CSS Modules + 无组件库**，与 dsh 一致。关键洞察（来自对 DSH 源码 `packages/client/tsdown.client.ts` 的调研）：**插件可以在自己独立打包的阶段处理 CSS Modules，宿主只做注入，不参与哈希、也不要求插件进宿主构建**——这既保住分裂交付，又消除了「人肉前缀 + 字符串对齐」的维护成本。

### 框架五条（映射 dsh，附 BK 适配）

| # | 裁决 | dsh | BK 适配 |
|---|---|---|---|
| 1 | 视觉基线 | 对齐 Chat，取值有出处、偏离需记录 | **暂定现状语义色板为基线**（无调研参考物，先记录为基线；补一张「偏离表」登记偏离，产品雏形成型再换基线） |
| 2 | token 两层不三层 | static→alias 两层，全住 global.css | **拆分 `--bk-static-*`（取值层）→ `--bk-*`（别名层）**；组件与插件只引用别名层。组件专属槽位（`--bg-sidebar` 等）按需新增、归别名层。权威先留在 `@berkshire/theme`（TS 生成 `themeRootCss()`），待正式样式文件（global.css 等价物）落地再迁 |
| 3 | 字号/间距不 token 化 | 字号组件里写 px、成对写行高（16/24、14/22、12/18）；间距 4 的倍数 | **逐步废弃 `space-*`/`radius-*`/`font-size-*` 令牌**，改成语义刻度（间距 4 倍数、行高成对）。font-sans / shadow 保留为 token |
| 4 | 边框/交互态用透明度制 | 边框 `rgba(0,0,0,.04/.1)`、hover/active `rgba(38,49,72,.06/.1)` | **新增透明度叠层 token**：边框/分隔 `--bk-border-*`、悬停/按下 `--bk-hover-*`/`--bk-active-*`，叠加任意背景成立，不新造实色灰 |
| 5 | 暗色只在 token 表做 | `:root` 亮 + `[data-theme]` 覆盖同名变量；组件零主题选择器 | **保留现状** `[data-theme='dark']`（现状已满足），并把「组件/插件 CSS 零 `[data-theme]` 选择器」固化为硬规则；系统偏好可后续在 toggle 层适配，不动 token 机制 |

### 插件 CSS Modules：独立打包、宿主只注入（对齐 dsh）

现状与 dsh 的分歧在「插件有没有构建期」。DSH 的答案（证据：`packages/client/tsdown.client.ts`）是：**每个插件 `clientBundle()` 独立打包，`.module.css` 在插件自己的构建里经 lightningcss 哈希为 `[hash]_[local]` 类名并生成注入代码**（`dsh-css-modules-inline` 插件），宿主 loader 运行时把编译好的样式注入 `<style data-plugin-css>`、卸载时移除。宿主**不参与哈希**，也**不需要插件进宿主 Vite 构建**——插件 bundle 仍随 `/plugins`/远程分发。

**对 BK 的落地路径**：在插件打包链（当前 sidecar 侧对 `styles.ts` 的运行时注入，或未来 `bk://` 的独立 bundle）里补一个「CSS Modules 编译步骤」：对插件的 `.module.css`（替代现在的 `styles.ts` 字符串）做一次 lightningcss/等效构建，产出 `{ 哈希类名 map, 注入代码 }`，然后照旧经 `client/list`/`bk://` 把「已编译注入代码」交给 webview 运行时注入。

- 插件样式**仍然**随 sidecar/`bk://` 走 → **保住分裂交付与远程 bundle 目标态**；
- 但样式在**插件打包时**就被 CSS Modules 处理了 → host 只做注入，依旧不碰哈希；
- 类名由构建期自动唯一 → 消掉 `.bk-demo-*` 人肉前缀 + 字符串对齐那层维护负担。

> **示例（BK demo 插件适配后）**：`styles.ts` 改为 `styles.module.css`，`.tsx` 里 `import styles from './styles.module.css'` 拿 `styles.fundFlow`（哈希类名）；sidecar 打包时编译注入代码，host 注入 `data-bk-module` 归属不变。

### host/插件分治（对齐 dsh 后）

- **host 组件**：CSS Modules + clsx（同目录同名 `.module.css`、类名 camelCase、状态类由 clsx 挂载、组件透传 `className`；禁 `composes`；`:global` 只穿透第三方/跨包）。
- **插件**：同样用 **CSS Modules**（构建期由插件独立打包处理），但**不用 clsx**（插件 bundle 走运行时注入，不依赖 React 运行时的 class 拼接管线）；插件仍只引用 `--bk-*` 别名层，scope 由 `data-bk-module` 保证，保持 `data-bk-module` 归属，不触碰全局选择器、不加组件专属 `[data-theme]` 选择器。

### 动态样式 & 迁移纪律

- 动态样式走 **CSS 变量桥**：JS 只写 `style={{ '--bk-*': v }}`，规则留在 CSS；禁止 TSX 拼样式对象做主题/状态分支。
- 过渡一律 `var(--dur*) var(--ease)` 且只过渡 opacity/transform/背景色/阴影。
- 迁移按令牌组分批：先合入「透明度制 + 别名分离」，再逐步淘汰字号/间距 token，最后给插件链补 CSS Modules 编译、host 组件逐部切 CSS Modules。每步保持 lint（魔法色值）绿、测试绿。

## 曾考虑的替代方案

- **落地 tailwind**：否决。tailwind 是构建时扫描生成工具类，与 BK「插件样式经 sidecar/`bk://` 运行时注入」的分裂交付**根本冲突**——插件侧写不了 `@apply`/utility；走「插件 `.tsx` 进中枢构建」的路径 A 又与 `bk://` 远程 bundle 的独立打包冲突。结论：不引入，样式一致性由 token + CSS Modules 承载（与 dsh 一致）。
- **落地 tailwind + shadcn/ui**：否决。shadcn 强依赖 tailwind，且组件 copy 进项目后 maintenance 面大；其语义变量若接进 `--bk-*` 徒增一层映射，若另起一套则违背单一事实源。
- **插件继续用运行时字符串 + 人肉前缀（不引入 CSS Modules 构建期）**：否决。与 dsh 实证（插件 bundle 内联 lightningcss 编译 CSS Modules）相比，人肉前缀 + 字符串对齐维护成本高、且作用域靠约定不靠构建保证；给插件补独立打包阶段的 CSS Modules 既不破坏分裂交付，又把这层自动化。
- **插件用 clsx + CSS Modules（host 同款）**：暂不。插件 bundle 走运行时注入链路，不依赖 React class 拼接管线；用 clsx 徒增依赖而无净收益。host 仍用 clsx，插件保持纯 CSS Modules + `var(--bk-*)`。
- **保持现状单层 `--bk-*`、字号/间距继续 token 化**：否决。与 dsh 实证（成对行高 + 4 倍数即可收敛）冲突；token 表膨胀会稀释颜色 token 的权威性。
- **暗色用 `prefers-color-scheme` 或组件内分支**：否决。属性选择器整表覆盖让组件零感知；系统偏好可后续在 toggle 层适配。
- **token 权威继续放 TS、不走 CSS 文件**：暂保留。现状 `@berkshire/theme` 是 TS 生成 `themeRootCss()`，先维持 TS 为权威、在生成出口拆 static/alias；待正式样式文件（global.css 等价物）落地再迁（见「后果」）。

## 验收标准

- 仓库 `apps/berkshire-agent` 无 tailwind / postcss 依赖与配置（现状已成立，作为回归门禁）。
- `@berkshire/theme` 暴露 static 层（`--bk-static-*`）与别名层（`--bk-*`）；组件与插件只引用别名层。
- `space-*`/`radius-*`/`font-size-*` 令牌从像素档位改为语义刻度或废弃；字号成对行高、间距 4 倍数。
- 新增透明度制边框/交互态 token；既有实色灰取值迁到透明度叠层。
- **插件样式从 `styles.ts` 运行时字符串迁到 `.module.css` + 插件独立打包阶段编译（产出哈希类名 + 注入代码）**，经 `client/list`/`bk://` 交给宿注入；host 不参与哈希。
- host 组件开始使用 CSS Modules + clsx（至少一个组件示范）；插件用 CSS Modules（不用 clsx），维持 `var(--bk-*)` 与 `data-bk-module` 归属。
- 魔法色值 lint 与测试保持通过；暗色仍由 `[data-theme='dark']` 单表覆盖、组件 CSS 零主题选择器。

## 风险

- **给插件补 CSS Modules 编译步骤是新工程投入**：需在 sidecar/bundle 打包链加一个 `.module.css` → 哈希+注入代码 的步骤（对齐 dsh 的 lightningcss 用法）。缓解：先以 demo 插件做最小验证（一个 `.module.css` 样例），再推广；编译能力复用 `@berkshire/theme` 已有 lint/令牌约束。
- **host/插件分治仍有两套书写方式**：host 用 CSS Modules + clsx、插件用 CSS Modules（无 clsx）。缓解：把分界线写成持久文档规则，review 用同一张对照表。
- **字号/间距去 token 化是减配，可能被误读为「退步」**：dsh 实证此路径能收敛；需在迁移说明里讲清动机，避免回潮。
- **基线「现状即基线」无外部出处**：token 取值可能被质疑「凭感觉」。缓解：现状记录为基线+偏离表，产品雏形成型再换可溯源基线。
- **迁移分批跨多 commit**：若中途停手，会停留在「别名层已拆、字号/间距还没淘汰」的中间态。缓解：明确各批次完成定义与门禁（lint+test 绿）。

## 相关

- 正在做的样式治理约束：`.agents/features/bk-style-governance.prompt.md`（§1 分裂交付、§2 硬规则、§3.2 `ctx.theme` 待落地）
- 现状令牌层：`docs/architecture.md §11` · `docs/secondary-development.md §6` · 根 `AGENTS.md`「已有」
- 参考：dsh `2026-07-19-web-styling-system` RFC 及其 `--dsw-*` 两层 token 更新；DSH 插件打包实证 `packages/client/tsdown.client.ts`（`dsh-css-modules-inline` 插件、`clientBundle()` 预设、`staticLinked` 预设）