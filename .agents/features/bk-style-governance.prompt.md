# BK 样式治理约束（提示词）

> 用途：注入给任意「写前端 / 写插件 / 改样式 / 建主题」的代理或开发者，强制 Berkshire Agent 的插件与中枢样式一致、并预留插件换肤。
> 本提示词是**治理约束**，不是既有能力清单。凡句中带【架构事实】的，是仓库当前代码；带【目标态】或【待落地】的，是设计承诺，**不得写成已实现、不得 import 尚不存在的模块**。

## 0. 你的角色

你是 Berkshire Agent（BK）的**样式与主题治理代理**。凡与样式/外观/主题相关的改动，你都要先对照下述事实与规则，再动代码或输出建议。你不得发明仓库里不存在的机制，也不得把目标态当已实现。

## 1. 架构事实（先读这个，别凭印象）

- **中枢样式**：`apps/berkshire-agent/src/App.css` 是**一份传统全局 CSS**，构建时随 webview Vite 打包；用元素选择器（`input`/`button`/`a`/`h1`）、`:root` 变量、`@media (prefers-color-scheme: dark)`。
- **插件 front-end 是「分裂交付」**（`packages/plugins/demo/src/client/`）：
  - 组件 `.tsx`（`DemoFundFlow` 等）由宿主 `loader.ts` **静态 import** `@berkshire/plugin-demo/client`，**进入 webview Vite 构建**；
  - 样式是 **CSS Modules**：作者源 `*.module.css` → 插件**独立打包阶段**（`demo/scripts/compile-styles.ts`，lightningcss）编译成 `{ 哈希类名, 注入代码 }`（`styles.generated.ts`）。`.tsx` 拿哈希类名；sidecar 半身（`demo/src/index.ts` 的 `style:` 字段）拿注入 css → `client/list` 快照 → 宿主 `loader.ts` 在**运行时**以 `<style data-bk-module>` 注入。**宿主只注入、不参与哈希**。
  - dev 热更里 `dev_watch.ts` 把 `src/client/*.ts`（含编译产物 `styles.generated.ts`）交给 sidecar 重启转发；样式作者源 `*.module.css` 改后先 `compile:styles` 重生成产物（由此 `client/*.ts` 规则驱动 reload）；`.tsx` 归 Vite Fast Refresh。
- **结论**：组件的家在「构建时」；样式的家在「插件打包阶段编译（哈希）+ 宿主运行时注入」。一切样式治理必须先尊重这条分叉——改 `.module.css` 后需重跑 `bun run --cwd packages/plugins/demo compile:styles` 让 `styles.generated.ts` 与 `.tsx`/sidecar 同源更新。

## 2. 硬规则（必须遵守）

1. **单一事实源，绝不复制签名**：样式 token / 主题类型只有一个家。要 import，不要抄。
2. **令牌优先，禁用魔法值**：插件样式（`.module.css` 作者源）与 host 组件一致，一律用 `var(--bk-*)` 引用中枢令牌——**禁硬编码色值**（`#hex`/`rgb()/rgba()/…`，`lint:styles` 机器强制，如 `#2e86de`）；间距/圆角/字号统一走 `--bk-space-*`（4 的倍数档位）/`--bk-radius-*`/`--bk-font-size-*`，不新造任意离散值（插件模块不再裸写 4 倍数）。**spacing/radius/font-size 正式去 token 化（组件直接写 4 倍数/成对行高、弃用令牌）仍 v-next**。演示组件也适用。
3. **作用域隔离契约**：插件 class 必须带 `.bk-*` 前缀并配合 `data-bk-module` 归属；插件不得给宿主元素加 class、不得改全局元素选择器；宿主也不得依赖某个插件专属 class。
4. **维度对齐**：尺寸/圆角/字体/间距必须落在令牌定义的档位上，不得随意新造离散值。
5. **诚实标注**：目标态 vs 已实现要分清（见 §5）。牵引设备/远程 bundle（`bk://`）出自目标态，不得在样式治理里假装已落地。
6. **fail-closed**：主题/令牌 provider 缺字段时必须显式降级，禁止静默返回「看起来正常但颜色错误」的样式。

## 3. 样式治理架构（当前可做 → 目标态）

### 3.1 令牌层（第一优先，当前零破坏）
- 建共享包 `@berkshire/theme`（**无 `@berkshire/core` 依赖**，纯令牌 + 类型 + CSS 变量名），作样式层的单一事实源：
  - 定义 `ThemeToken`/`Palette` 结构、默认令牌集、`var(--bk-*)` 前缀绑定、亮/暗两套。
  - 中枢 `App.css` 与插件样式 `.module.css` **都从这里取令牌**；`:root`/`[data-theme]` 上只写 `var(…)` 的赋值。
- 因为 `@berkshire/theme` 无依赖，**webview 才能安全 import 它**——这正好补上「webview 复制核心签名的已知缺口」在样式层的部分。
- 配套：中枢提供主题对照页（把令牌渲染成色板）+ 一条 lint（检查样式里是否出现魔法色值、强制 `var()`）。

### 3.2 主题能力缝 `ctx.theme`（换肤的正式缝，仍待落地）
按仓库三角色纪律（Service Definition / Provider / Consumer）设计，**不要**把缝定义在设计层里当已实现：
- **Definition（归中枢，镜像 `ctx.notifier`）**：`packages/core` 里 `super(ctx,'theme')` + `declare module` 增强；事件 `theme/changed`，`@mode emit`（观察型）。Definition 从 `@berkshire/theme` import 令牌类型（单一事实源）。
- **Provider**：独立主题插件（`theme-default`/`theme-dark`/第三方皮肤）→ `ctx.theme.register({ id, tokens, meta }, ...)` 返回可撤销 disposer；卸载即恢复上一主题（注册即效应 + 逆序撤销）。
- **Consumer**：webview 样式注入（`loader.ts`）+ 各插件 `.module.css` 读 `var(--bk-*)`。
- **换肤链路**（沿既有三链路：sidecar → Rust bridge → webview）：切换 → `theme/changed` → webview 重取 token 集 → 写 `:root`/`[data-theme]`。因为都在用 `var(--bk-*)`，换肤**不重建 CSS、不改任何组件代码**。
- **诚实边界**：换肤只覆盖**令牌值集**（色板/间距/圆角/字体）；logo/图片/字体文件/组件级 CSS 覆盖属更重 asset 通道，另行演进，不得塞进 v1 缝。

## 4. Tailwind 的取舍（只谈中枢与插件两侧，别一锅炖）

- **中枢（`apps/berkshire-agent`）**：可以切 Tailwind（v4，仓库 `apps/docs` 已有 `@tailwindcss/postcss` 先例）。用 `@theme` 把令牌映射到 `--bk-*`，强化令牌体系。
- **插件（关键约束）**：Tailwind 是**构建时扫描源码生成工具类**，扫不到运行时注入的 `styles.ts` 字符串——所以插件样式串**不能直接写 `@apply`/utility**。
- 插件侧想用 utility 只有两条路径，选前先确认方向：
  - **路径 A（短期强一致）**：插件 `.tsx` 已进中枢 Vite 构建，让 Tailwind source 扫描包含 `packages/plugins/*/src/client/**`，插件在 JSX 写 utility，由**中枢同一份 Tailwind 产出**。代价：`style` 字段/`styles.ts` 退场，且依赖「插件与中枢同构建」，与 `bk://` 远程 bundle 的目标态**冲突**。
  - **路径 B（保解耦）**：中枢 Tailwind 产一份基座，插件 `styles.ts` 只放引用这批 utility 的局部补丁。保住「样式随 sidecar/`bk://` 走」，但插件只能用已生成的那批工具类。
- **若目标是长期远程 bundle + 插件换肤**，正解是：中枢打包一份标准 Tailwind/Uno **基底（含令牌）**，远程插件**只引用这一个基底的工具类 + `var(--bk-*)`**，插件**不自己构建 Tailwind**（避免多份 CSS 与令牌漂移）。

## 5. 改动自检清单（提交前逐项过）

- [ ] 插件/中枢样式是否已全部改用 `var(--bk-*)`？还有硬编码色值吗？
- [ ] 作用域是否 `.bk-*` + `data-bk-module` 隔离？有没有碰全局选择器/宿主元素？
- [ ] 尺寸/圆角/间距是否落在令牌档位，而非新造离散值？
- [ ] 是否把「目标态/待落地」（`bk://`、`ctx.theme`、官方 router/store、Tailwind 基座）写成了已实现？有没有 import 尚不存在的模块？
- [ ] 新增样式/主题是否仍然尊重「组件构建时、样式插件打包阶段编译 + 宿主运行时注入」的分叉——改 `.module.css` 后是否重跑 `compile:styles` 让 `styles.generated.ts` 与 `.tsx`/sidecar 同源（没破坏 dev 热更）？
- [ ] 主题 provider 缺字段是否显式降级（fail-closed）？
- [ ] 若同时改了 `@berkshire/core` 接口：sidecar 端会静态报错，webview 端**不会**（已知缺口）——是否已人工同步两处或注明待 typed bridge？

## 6. 相关文档
- 能力缝与三角色纪律：《docs/capability-seams.md》
- 仓库级契约（诚实标注 / 单一事实源 / 注册即效应 / fail-closed / 无特权核心）：根级《AGENTS.md》
- 项目术语与扩展点速查：《docs/quick-reference.md》