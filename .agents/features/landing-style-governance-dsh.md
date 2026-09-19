# 落地任务书：样式体系对齐 dsh（token 分治 + 插件独立打包 CSS Modules）

> 面向：把 BK 的**样式层**从「单层 `--bk-*` + 插件运行时字符串样式」重构为对齐 dsh 的框架——**无 tailwind、无组件库、token 两层（static→alias）、字号/间距去 token 化、边框/交互态用透明度制、暗色单表、插件独立打包阶段编译 CSS Modules**。这是落地，不是文档示例。
>
> 交付形态：**分任务提示词（T#）**。每份自包含、可单独喂给一个 agent/子代理按序执行；前面的任务是最低前提，请顺序跑、别并行改同一批文件。
>
> **诚实红线（本项目第一纪律）**：本文是「落地样式体系对齐 dsh」的执行指南，面向**真正的代码落地**；但凡是这段落地里仍没做的，一律标「**目标态 / v-next**」。已有锚点见下文「共同前置」。

---

## 术语对齐（本文用词即本项目术语）

- **令牌层（`@berkshire/theme`）**：样式单一事实源，已落地——`THEME_TOKENS` 注册表 / `LIGHT_PALETTE` `DARK_PALETTE` / `bkVar` `bkVarName` / `themeRootCss()`。无 `@berkshire/core` 依赖，webview 可安全 import。
- **static/alias 两层**：`--bk-static-*`（取值层，唯一写实值）→ `--bk-*`（别名层，组件/插件只引用别名）。对齐 dsh 的两层不三层。
- **分裂交付**：插件 webview 半身分两块——组件 `.tsx` 进 host Vite 构建；样式是**运行时字符串**（`styles.ts` → sidecar `client/list` → host `<style data-bk-module>` 注入）。这是本仓库的架构事实，任何样式治理先尊重它（见 `.agents/features/bk-style-governance.prompt.md` §1）。
- **CSS Modules（host 侧）**：host 组件用 `.module.css` + clsx，构建期哈希，类名自动唯一。
- **CSS Modules（插件侧）**：插件在**独立打包阶段**编译 `.module.css`（对齐 dsh `tsdown.client.ts` 的 lightningcss 用法），产出哈希类名 + 注入代码；host 只注入、不参与哈希。
- **透明度制**：边框/交互态用 `rgba(…)` 叠层 token，叠加任意背景成立，不新造实色灰。

---

## 共同前置（每份任务书都必须遵守）

1. **先读再动手**：`docs/architecture.md`（§11 现状锚点）、`AGENTS.md`（头条约束「目标态 vs 已实现」）、`docs/secondary-development.md`（§6 诚实对照、§8 已实现锚点）、`.agents/features/bk-style-governance.prompt.md`（**必读**，样式治理硬规则）、决策记录 `.agents/notes/proposed/architecture/2026-09-19-style-system-redesign.md`。
2. **样式治理硬规则（来自 bk-style-governance.prompt §2）**：
   - 单一事实源，不复制签名：token/主题类型只有一个家，要 import 不抄。
   - 令牌优先，禁魔法值：一律 `var(--bk-*)`，禁硬编码色值/间距/圆角。
   - 作用域隔离：插件 class 带 `.bk-*` 前缀 + `data-bk-module` 归属；宿主不得依赖插件 class。
   - 维度对齐：尺寸/圆角/字体/间距落在令牌档位，不新造离散值。
   - 诚实标注：目标态 vs 已实现分清，不把 `bk://`/`ctx.theme` 当已实现。
   - fail-closed：主题/令牌 provider 缺字段显式降级。
3. **注册即效应、可逆**：一切副作用走 `ctx.effect()`/`register()` 返回 disposer；卸载逆序清理。
4. **诚实回写**：落地后只同步 `docs/secondary-development.md` 状态栏、`docs/architecture.md §11` 现状锚点、根 `AGENTS.md`「已有」；五个设计主张文档（capability-seams/data-model/config/plugin-development/quick-reference）不动设计主张。`@berkshire/theme` 是共享包，改动前先读 `docs/architecture.md`。
5. **真实现状锚点（已存在、可复现）**：
   - 令牌层：`packages/theme`（`THEME_TOKENS` 单层 `--bk-*`、`themeRootCss()`、lint `bun run lint:styles`、测试 `packages/theme/test/theme.test.ts`）。
   - 中枢样式：`apps/berkshire-agent/src/App.css`（只写 `var(--bk-*)`）。
   - 插件样式：`packages/plugins/demo/src/client/styles.ts`（运行时字符串）。
   - webview 注入：`apps/berkshire-agent/src/theme/install.ts`（`<style data-bk-theme>`）+ `theme/ThemePalettePage.tsx`（核心路由 `/theme`）。
   - 分裂交付链路：`clientModules.register({id, slot, bundle, style})` → sidecar `client/list` → host `loader.ts` `<style data-bk-module>`。

---

## 能力范围（本文把它拆成四块，任务总览对应）

| 能力块 | 含义 | 落点 |
| --- | --- | --- |
| **S. 令牌分层** | 单层 `--bk-*` → `--bk-static-*`(取值) + `--bk-*`(别名)；字号/间距去 token 化 | `@berkshire/theme` tokens/css + `themeRootCss()` |
| **R. 透明度制 + 暗色单表** | 边框/交互态用 rgba 叠层 token；暗色统一 `[data-theme='dark']` 单表、组件零主题选择器 | `@berkshire/theme` + `App.css` + 插件样式 |
| **H. host 组件 CSS Modules** | host 组件用 `.module.css` + clsx，类名构建期哈希 | `apps/berkshire-agent/src` 组件 |
| **P. 插件独立打包 CSS Modules** | 插件样式从运行时字符串 → `.module.css`，插件打包阶段编译、host 只注入 | `packages/plugins/*` + sidecar/数据打包链 |

---

## 任务总览与依赖

```
S0 令牌分两层：@berkshire/theme 拆 static/alias，target: App.css/插件引用别名层
 ├─ R1 透明度制 + 暗色单表：新增 border/hover/active 叠层 token，收敛 App.css 与插件样式
 ├─ H2 host 组件 CSS Modules：一个 host 组件示范 .module.css + clsx
 └─ P3 插件独立打包 CSS Modules：demo 插件样式迁 .module.css + 打包阶段编译 + host 只注入
 （各阶段都要保持 lint + 测试绿；v-next：JS 全量迁 CSS Modules、ctx.theme 换肤缝、bk:// 远程 bundle）
```

---

## S0 —— 令牌分两层（static → alias）+ 字号/间距去 token 化

- **目标**：把 `@berkshire/theme` 的单层 `--bk-*` 拆成「取值层 `--bk-static-*` + 别名层 `--bk-*`」，组件/插件只引用别名层；并按 dsh 决策逐步废弃 `space-*`/`radius-*`/`font-size-*` 令牌（间距 4 倍数、字号成对行高）。
- **现状**：`packages/theme/src/tokens.ts` 是单层 `--bk-*`（含 color/spacing/radius/font/shadow 五组）；`css.ts themeRootCss()` 直接写 `--bk-*: value`。
- **交付**：
  1. `packages/theme/src/tokens.ts`：定义两类——数值源 `STATIC_TOKENS`（`--bk-static-color-bg` 等，唯一写实值）与语义别名 `THEME_TOKENS`（`--bk-color-bg` 等，值引用 static）。别名层是组件/插件的引用入口。
  2. `packages/theme/src/css.ts`：`themeRootCss()` 先写 `:root { --bk-static-*: 实值 }`，再写别名取值 `--bk-*: var(--bk-static-*)`；亮/暗沿用 `[data-theme='dark']` 单表覆盖。保持 `bun run lint:styles` 能识别 static 层为「允许的魔法值出处」。
  3. 字号/间距：把 `space-*`/`radius-*`/`font-size-*` 从「每档设离散值」改为语义刻度（间距 4 倍数；字号只保 font-sans），组件改成语义刻度引用。**若改到已引用它的 App.css/插件，一并迁。**
  4. lint 更新：魔法色值 lint 认得 static 层的实值（允许出现），但别名层引用只见 `var(--bk-*)`。
- **契约**：取值只在 static 层、引用走别名层；单一事实源不破。
- **诚实边界**：`ctx.theme` 换肤缝仍目标态；正式样式文件（global.css 等价物）接管 static 层仍 v-next（现阶段 static 层仍在 TS）。
- **验收**：`bun run lint:styles` 绿；`bun test packages/theme` 绿（若断言了单层结构则同步更新到两层）；`bun run build`（tsc+vite）通过；主题对照页 `/theme` 仍正常。
- **复现**：`bun run --cwd packages/theme lint:styles`、`bun test packages/theme`、`bun run --cwd apps/berkshire-agent build`。

---

## R1 —— 透明度制边框/交互态 + 暗色单表收敛

- **目标**：新增「透明度叠层」token（边框/分隔、悬停/按下），把现有实色灰取值迁到透明度叠层；暗色统一单表、组件与插件 CSS 零 `[data-theme]` 选择器。
- **现状**：`App.css` 与插件 `styles.ts` 用 `--bk-color-border-strong`/实色灰等；暗色由 `themeRootCss()` 的 `[data-theme='dark']` 块承载（已单表）。
- **交付**：
  1. `@berkshire/theme` 新增 `--bk-border-*`/`--bk-hover-*`/`--bk-active-*`（透明度叠层，如边框 `rgba(0,0,0,.04)`、hover `rgba(0,0,0,.06)`、active `rgba(0,0,0,.1)`），叠加任意背景成立。注册进 `THEME_TOKENS`（别名层）。
  2. `App.css` 与插件 `styles.ts` 把实色灰/`border-strong` 迁到新的叠层 token。
  3. 强制「暗色只在 token 表」：扫描/评审确保组件与插件 CSS 无 `[data-theme]` 选择器（系统偏好待 toggle 层适配，不动 token 机制）。
- **契约**：色调进 token；边框/交互态用透明度而非实色；暗色单表覆盖、组件零主题感知。
- **诚实边界**：系统偏好 `prefers-color-scheme` 的 toggle 适配仍 v-next；不建组件内暗色分支。
- **验收**：`bun run lint:styles` 绿；`bun run build` 通过；渲染检查边框在亮/暗两态都成立。
- **复现**：`bun run --cwd packages/theme lint:styles`、`bun run --cwd apps/berkshire-agent build`。

---

## H2 —— host 组件 CSS Modules（+ clsx）

- **目标**：给 host 组件建立 CSS Modules 示范，验证 `在 host 侧（构建时）`.module.css` + clsx 可用`。
- **现状**：host 样式目前集中在 `App.css`（全局类），无 `.module.css` 组件样式。
- **交付**：
  1. 选一个 host 组件（建议 `theme/ThemePalettePage.tsx` 或新增最小组件），同目录建同名 `.module.css`，类名 camelCase、状态类由 `clsx` 挂载、组件透传 `className`；禁 `composes`。
  2. 加 `css-modules.d.ts` 通配 declare（对齐仓库既有类型纪律；组件数超 20 再评估 typed-css-modules）。
  3. 让该组件的颜色/圆角/动效只引 `var(--bk-*)` 别名层；`:global` 仅穿透第三方/跨包，不定义新全局类。
- **契约**：host 组件样式 = CSS Modules + clsx；禁组件库/Tailwind；不破坏现有 `App.css` 全局结构（全局工具类仍住 `App.css`）。
- **诚实边界**：动态样式走「CSS 变量桥」（JS 只写变量、规则留 CSS）；渐变端点等按主题变的值用变量桥，不写主题分支。
- **验收**：`bun run build` 通过；`bun run lint:styles` 绿；组件在亮/暗两态正常。
- **复现**：`bun run --cwd apps/berkshire-agent build`、`bun run --cwd packages/theme lint:styles`。

---

## P3 —— 插件独立打包阶段编译 CSS Modules（对齐 dsh）

- **目标**：把插件样式从「运行时字符串 + 人肉前缀」升级为「**插件 `.module.css` + 插件独立打包阶段编译**」，host 只做注入、不参与哈希——既保住分裂交付，又消掉 `.bk-demo-*` 人肉前缀维护负担。
- **现状**：插件样式是 `packages/plugins/demo/src/client/styles.ts` 字符串 → `clientModules.register({style})` → host `loader.ts` 运行时 `<style data-bk-module>` 注入；类名靠 `.bk-demo-*` 前缀人工保证唯一。参考实证（对齐 dsh）：`tsdown.client.ts` 的 `dsh-css-modules-inline` 插件在插件 bundle 内联 lightningcss 编译 `.module.css` → 哈希类名 + 注入代码，host 运行时注入 `<style data-plugin-css>`。
- **交付**：
  1. **最小验证**：demo 插件把 `styles.ts` 迁成一个 `.module.css`，`.tsx` 里 `import styles from './xx.module.css'` 拿哈希类名。
  2. **插件打包阶段编译步骤**：在插件打包链（当前 sidecar 对样式注入的处理，或未来 `bk://` 独立 bundle）加一个 `.module.css` → `{ 哈希类名 map, 注入代码 }` 的编译步骤（复用 `@berkshire/theme` 已有 lint 与令牌约束；编译可用 lightningcss/等效物）。产出经 `client/list`/`bk://` 交给 host 注入。
  3. host `loader.ts`：只负责把「已编译注入代码」塞进 `<style data-bk-module>`、卸载移除；**不参与哈希**，也不需要插件进 host Vite 构建。
  4. 插件 scope 仍由 `data-bk-module` 保证；插件不写全局选择器、不加组件专属 `[data-theme]`。
- **契约**：插件样式随 sidecar/`bk://` 走（保住分裂交付与远程 bundle 目标态）；类名构建期自动唯一（消人肉前缀）；host 只注入。
- **诚实边界**：当前 sidecar 没有 `.module.css` 编译步骤——**这是本任务要新做的**；`bk://` 远程 bundle、HMR 仍 v-next。若插件 webview 半身此刻仍经 host Vite static import（非独立打包），先以「sidecar 侧加编译步骤」落地最小件，正式的独立 `bk://` 打包标 v-next。
- **验收**：`bun run build` 通过；`bun test` 绿；demo 插件样式以哈希类名经 `client/list` 到宿主注入、`data-bk-module` 归属保留；卸载后样式移除、不残留；魔法色值 lint 绿。
- **复现**：`bun run --cwd apps/berkshire-agent build`、`bun run --cwd packages/theme lint:styles`、（demo 插件冒烟）`bun packages/plugins/demo/examples/smoke.ts`。

---

## 收口验证 + 诚实文档回写

- **目标**：样式层重构全链路可自测、可复现，并诚实落账。
- **交付**：
  1. **自动化**：`bun test` 覆盖——令牌 two-layer（static/alias 断言）、透明度 token 存在、插件样式哈希注入、卸载清理保活。
  2. **门禁**：`bun run lint:styles`（魔法色值）+ `bun run build`（tsc+vite）+ `git diff --check`。
  3. **文档诚实回写**：
     - `docs/secondary-development.md` §6/§8：把真正落地的「令牌 two-layer、透明度制、host CSS Modules、插件独立打包 CSS Modules」标为已实现；列仍目标态（`bk://`、HMR、`ctx.theme` 换肤缝、生产样式分发包）。
     - `docs/architecture.md §11`：现状锚点改真实文件行引（`@berkshire/theme` two-layer、host `.module.css`、插件编译步骤）。
     - 根 `AGENTS.md`「已有」：同步令牌 two-layer 与插件 CSS Modules 状态。
     - **五个设计主张文档不动**；样式治理 prompt `.agents/features/bk-style-governance.prompt.md` 若与落地冲突则同步（它是治理约束，落地后应反映 new modular 现状）。
  4. 决策记录回写：proposed note `.agents/notes/proposed/architecture/2026-09-19-style-system-redesign.md` → 转 `implemented/`（按实际落地更新现在时态、折入验收/风险到后果）。
- **验收**：全库 `bun test` 全绿；`git diff --check` 干净；「已实现 vs 目标」边界与代码一致（可让 **bk-code-review** 技能复核：单一事实源、令牌优先、作用域隔离、暗色单表、诚实标注）。
- **复现**：`bun test`、`bun run --cwd packages/theme lint:styles`、`bun run --cwd apps/berkshire-agent build`、`bun packages/plugins/demo/examples/smoke.ts`。

---

### 交接建议

- 顺序执行 S0→R1→H2→P3→收口；每份任务书产出后先跑 **bk-code-review** 技能按仓库契约复核再合入。
- 任一任务发现与现状锚点不符（文件不存在/命令不通），停下来诚实报告，不从目标态文档推断实现。
- **诚实是硬验收**：只有真正能跑、能测、能 lint 绿的部分才允许标「已实现」；其余一律标「目标态 / v-next」。**当前全部为目标态，本任务书是把它们翻成已实现的地图。**