# 二次开发：边界、约束与验证

> 本文是 Berkshire Agent（BK）对 **downstream 开发者的契约**：哪些可以改、怎么改、验证到什么程度。**核心纪律（照抄 dsh）：“没有特权核心可打补丁”** — 你通过在已有插件旁再装载一个插件来扩展 BK；已实现的继承点与目标契约必须区分，**禁止虚构 API / 把示例当实现**。

## 1. 能力分级（L1 / L2 / L3）

| 等级 | 手段 | 风险 | 谁用 |
| --- | --- | --- | --- |
| **L1** | 配置（profile/bundle/patch）、策略/数据源文件、扩展数据 | 最低 | 终端用户/轻度二开 |
| **L2** | 前端 slot/路由/菜单注册（`ctx.slots`/`ctx.clientModules`）、后端 seam 注册/替换（`ctx.dataSources`/`ctx.indicators`/`ctx.ai`/`ctx.notifier`…） | 中 | 插件作者 |
| **L3** | 直接改核心源码（Rust `db.rs`/`bridge.rs`、Cordis 插件树编排） | 高 | 核心团队 |

> 高冲突热点（改这些必须重点复核）：`apps/berkshire-agent/src-tauri/src/{db,bridge,ipc}.rs`、Cordis 插件树 boot、前端 `router`/`lib/api`（rspc 生成）、`ctx.slots` 宿主。

## 2. Cordis 方法论约束（对 downstream 的硬规则）

继承 [cordis-methodology.md](reference/cordis-methodology.md#3-设计原则) 的九条原则，其中对插件作者最关键的：

1. **每个副作用默认可逆**。所有注册走 `ctx.effect()` 并返回 disposer；运行时在卸载时**逆序**执行清理栈（async disposer 会被 await，单发）；单个 disposer 抛错被记录、不阻断其余清理。**注册即效应**——卸载即撤销。
2. **依赖声明解析，而非手工排序**。用 `inject` 声明；加载顺序由需求表达。`Service.check` 判定可用性，**依赖消失时依赖者明确失败**（不是静默默认缺省）。
3. **选对事件领域与派发模式**。waterfall 监听器**必须调 `next()`** 委托（不调则短路）；外包/观察用 `emit`；中止型用 `serial`；竞态用 `bail`。事件是观察/拦截点：直接能力调用用服务方法，拦截/策略用事件。
4. **配置 schema 校验，fail loud**。config 用 standard-schema；无效配置在加载/最早可解析点抛出。配置原子地走 “source → spec(resolve)” 分离，不在 `apply`/`run()` 里藏隐式默认。
5. **跨边界 id 品牌化**。`AssetId`/`DatasetId`/`CapabilityId`/`SymbolId`（`Branded<T>`），绝不用裸 `string`（防止“凭代码格式猜资产类型”类 bug）。
6. **没有特权核心**。想改模型适配器/数据源/指标？mount 一个插件，而不是 patch 内核。Host 原生 provider 的替换需重编译，故其边界被刻意压到最薄。
7. **“可见 ⟺ 已记录”**。任何进入分析/AI/前端展示的数据必须能从数据库/日志重建；新增可见输入要配套登记数据事件。

## 3. 数据与跨层契约

见 [data-model.md](data-model.md#6-数据契约红线)。**红线底线**：`change_pct`/`turnover_rate` 口径、复权 vs 原始价、PIT 财务、北京时区、交易日语义、fail-closed、branded id、耐部在分析等场景显式转换并有测试。

## 4. 前端扩展契约（L2）

- **slot**：`ctx.slots` 声明 `FrontendSlot`（name 复用 `layout.navigation.extra`（侧边栏导航追加） / `layout.sidebar.footer`（侧边栏底部） / `layout.statusbar.right`（状态栏状态项） / `settings.cards`（设置页卡片） / `stock-preview.footer` / `watchlist.toolbar` / `analysis.menu` / `detail.tabs` / `chart.overlay`）。slot 组件始终包在 `ExtensionBoundary`（失败降级为 null/横幅，绝不崩宿主页）。
- **client 插件图**：富 UI 用 `ctx.clientModules` 注册 bundle，经 `bk://` 自定义协议由 Rust 提供给 webview；开发环境走 Vite HMR。路由注入须**静态路径**且**不得覆盖核心路径**；id 校验、API 版本、重复 id/路径冲突在注册时拒绝。
- **store**：zustand 作用域化（per workspace/插件域），避免跨插件污染。

## 5. 验证矩阵（改动类型 → 最低验证）

| 改动类型 | 最低验证 |
| --- | --- |
| L1 配置/数据集 YAML | `dump-config` 检查最终树；数据源连通自检（provider `check`） |
| L2 插件（无缝） | 插件单测 + 装/卸烟测（`dispose()` 后效应清空断言）+ slot 渲染烟测 |
| L2 前端 slot/页面 | `tsc`/lint + slot `ExtensionBoundary` 降级测试 + rspc 类型约束 |
| L3 核心源码 | Rust `cargo test` + DuckDB 单测 + 前端 `build` + 回归（改动域功能验证） |
| 任何改动 | `git diff --check`；跨层数据口径显式转换 + 单元测试 |

## 6. 已有 vs 目标（诚实标注）

- **未实现（目标契约，不允许 import/当已存在）**：DuckDB 写者、rspc/specta typed bridge、`bk://` 协议——仍处于本文档的“目标态”。（注：`packages/sidecar` 的 stdio JSON-RPC 长驻进程**本体已由 T1 落地**；**T2 的 Rust 宿主半边（`bridge.rs` 拉起/restart + 事件转发到 Tauri events）已落地 v1**；**T3 的 webview 薄客户端（`apps/berkshire-agent/src/lib/api.ts` + `components/SidecarPanel.tsx` + 共享缝 `@berkshire/ui-slots` 的 `ExtensionBoundary`）已落地 v1**，均见 §8。）
- **已有**：`apps/berkshire-agent` 的 Tauri 2 + React + Vite 骨架（见 [architecture.md §11](architecture.md#11-关键文件索引现状--目标)）。
- **v1 已实现（headless 最小核心脊）+ T2 Rust 宿主桥 + T3 webview 接线**：见下文 [§8](#8-v1-落地说明已实现的-headless-最小核心脊)。核心脊已落三条（`ctx.log` / `ctx.capabilities` / `ctx.notifier` 能力缝）+ 第一个插件（notify-console）+ boot 装配器；另桥接协议 sidecar 长驻进程（T1，stdio JSON-RPC）**及 T2 的 Rust 宿主桥（`src-tauri/src/bridge.rs`/`sidecar_client.rs`：拉起/restart + 事件转发到 Tauri events）**、**T3 的 webview 接线（`apps/berkshire-agent/src/lib/api.ts` 薄客户端 + `components/SidecarPanel.tsx` + 共享缝 `@berkshire/ui-slots` 的 `ExtensionBoundary`，最小证明面）**均已落地，见 §8；共享 UI 缝引擎（`@berkshire/ui-slots`，原宿主 `src/slots/*` 的 webview 本地 slot 宿主，T0 最小件，含 `useSyncExternalStore` 反应式订阅与 webview 本地 `root` 单例槽）也已落地（见 §8 下表）**。`@berkshire/cordis` vendor 重命名、DuckDB 写者仍为目标态；**T1 已把 sidecar 侧 `ctx.slots`/`ctx.clientModules` 能力缝（`packages/core`）最小件落地 + `client/list` 协议/`client_list` command + webview `ClientModuleHost`/`loader`（scoped 样式），构成 client 插件图最小链路**；**路由契约化已把「插件自声明 `route` → 动态导航/路由/页面」最小件落地**（core `Slots.routes()` 汇总任意 slot 带 `route` 的声明含 slot 归属 / `CORE_ROUTE_PATHS` 校验 + sidecar `routes/list` + Rust `routes_list` + webview `react-router-dom` `HashRouter` 与 `src/routes/{routesStore,RouteSync,ExtensionRoute}`）；**应用壳（Vercel 黑白风，可扩展侧边栏 + 右侧路由区 + 状态栏 + 侧边栏底部设置）已由 `@berkshire/base-ui` 壳插件（webview 半身 `packages/plugins/base-ui/src/client/`，壳帧经共享 `root` 槽挂载）+ 新增布局挂点落地**（见 §8 下表应用壳行）；正式 router（layout/menu 全量注入）与 store 仍目标态。**样式体系已对齐 dsh（令牌两层 static→alias、透明度制边框/交互态 + 暗色单表、host 组件 CSS Modules + clsx、demo 插件独立打包阶段编译 CSS Modules）**均已落地，见 §8 下表样式段；`ctx.theme` 换肤缝、spacing/radius/font-size 正式去 token 化、`bk://` 远程 bundle/production 样式分发包仍目标态。
- 参考复用（允许照抄契约，标注来源）：TSP 的 provider 接口、能力矩阵、slot 模型、plugin 清单、缓存失效；dsh 的插件形态、typed events、profile/bundle/patch、isolate/extend。

## 7. 关键文件索引（文档 ↔ 参考证据）

| 主题 | 本文/参考 |
| --- | --- |
| Cordis 方法论九原则 | [reference/cordis-methodology.md §3](reference/cordis-methodology.md) |
| dsh 落地模式（vendor/插件形态/事件/config） | [reference/cordis-pattern-report.md](reference/cordis-pattern-report.md) |
| TSP 契约（provider/能力/slot/数据红线） | [reference/tick-stock-panel-contracts.md](reference/tick-stock-panel-contracts.md) |
| Tauri/DuckDB/Cordis sidecar 选型 | [reference/tauri-duckdb-plugin-runtime.md](reference/tauri-duckdb-plugin-runtime.md) |
| 本架构整体 | [architecture.md](architecture.md) |
| 目标→机制速查 | [quick-reference.md](quick-reference.md) |

> 维护约定：本文的“目标态”能力一旦落地，必须同步更新 [architecture.md](architecture.md#11-关键文件索引现状--目标) 的“现状锚点”，保持“只描述真实状态、标注锚点”的纪律。

## 8. v1 落地说明（已实现的 headless 最小核心脊）

> 本节是「首批实现工程师 v1」的诚实状态栏：凡列出的对象都已**落地、可跑、可测**；未列的仍为目标态。运行期直接对 **Cordis 官方包**（`cordis`）做 `declare module`，`@berkshire/cordis` 的 vendor 重命名仍是 v2 范畴。

### 已实现（v1）

| 位置 | 实现 | 目标态对应 | 说明 / TODO（v2） |
| --- | --- | --- | --- |
| `packages/core`（`@berkshire/core`） | `ctx.log` | sessions/log 核心脊 | 追加式内存日志；**`log` 已插件化为独立 Cordis 组件 `Log`**（`services/log.ts`，`new LogService(ctx)` 自注册 `ctx.log`），可 `ctx.plugin(Log)` 随处装载（路径 A 示范，core.ts 默认装载以兼容既有消费方）；DuckDB `sessions_log` 持久化/跨重载留 v2 |
| | `ctx.capabilities` | 能力注册表与矩阵 | 注册表 + fail-closed `usable` 门控；`CAPABILITY_REGISTRY`/`build_capability_matrix` 留 v2 |
| | `ctx.notifier`（能力缝 **Definition**） | 通知能力缝 | Provider 经 `register()` 挂入、Consumer 经 `send()` 消费；duplicate/fail-closed 响亮失败 |
| | 品牌 id `CapabilityId` | 跨边界品牌化 | 已接入 `ctx.capabilities` / `capabilities/changed`；`AssetId`/`DatasetId`/`SymbolId` 为类型占位（v2 接入业务） |
| | `declare module 'cordis'` | typed events + 服务增强 | B 级已把增强 **co-locate 到所属文件**：`ctx.log`→[services/log.ts](../packages/core/src/services/log.ts)、`ctx.capabilities`+`capabilities/changed`→[services/capabilities.ts](../packages/core/src/services/capabilities.ts)、`ctx.notifier`+`notify/request`→[seams/notify.ts](../packages/core/src/seams/notify.ts)、`ctx.slots`→[services/slots.ts](../packages/core/src/services/slots.ts)、`ctx.clientModules`→[services/clientModules.ts](../packages/core/src/services/clientModules.ts)、跨服务共享事件 `client/changed`→[events.ts](../packages/core/src/events.ts)；根入口 [index.ts](../packages/core/src/index.ts) 仍全量 re-export + `import './events'` 保证 `import '@berkshire/core'` 一次性激活；`package.json` 已开子路径导出，可按服务颗粒独立 import。均标注 `@mode emit`。**路径 A**：`ctx.log` 另导出插件组件 `Log`（`services/log.ts`），示范「服务变成可随处装载的插件」 |
| | `ctx.slots` / `ctx.clientModules`（能力缝 **Definition**，T1 最小件） | sidecar 侧 slot 占用 + client 插件图 / 前端 bundle 声明 | `Slots`/`ClientModules` extends `Service`：运行时校验（未知 slot/重复 id，fail-closed）+ `client/changed` 广播 + 可逆 disposer；`ClientModuleId` 品牌化；slot 名与共享缝 `@berkshire/ui-slots` 的 `FRONTEND_SLOT_NAMES` 两端一致（共享类型层 v2；`root` 为 webview 本地 single 槽、不在 core `SLOT_NAMES`）。路由语义（任意 slot 的 title/route、静态/核心碰撞/全局 path 唯一校验）已由路由契约化落地（见下行），`bk://` 远程 bundle 留 v-next |
| | 动态路由/页面（能力块 B，路由契约化：任意 slot 的 `route` 声明） | sidecar 侧路由声明 + 前端动态路由/导航 | `Slots.routes()`（**任意 slot** 上带 `route` 的声明汇总，含 `slot` 归属；按 `order ?? 100` 排序 + 过滤空 title/path）+ `CORE_ROUTE_PATHS`（`/`、`/theme`、`/settings`）校验：路由路径须静态（无 `:`）、不得覆盖核心路由、**URL 空间全局** path 唯一（均 fail-closed）；sidecar `routes/list` 方法；Rust `routes_list` command；webview 引入 `react-router-dom` `HashRouter`（核心 `<Route>` `/`、`/theme`、`/settings`）+ `src/routes/{routesStore,RouteSync,ExtensionRoute}` 按 `routes/list` 动态生成顶栏导航与 `<Route>`，`ExtensionRoute` 按 `route.slot` 渲染 `ExtensionSlot{name:route.slot}` 并包 `ExtensionBoundary`（页面内容仍归插件，宿主不再写死 analysis.menu）。正式 layout/menu 全量注入留 v-next |
| | 应用壳（`@berkshire/base-ui` 壳插件，Vercel 黑白风，布局挂点 webview 半身） | 应用壳 UI 模块与布局缝 | `packages/plugins/base-ui/src/client/`（`AppShell` 网格 + `Sidebar` 可扩展侧边栏 + `StatusBar` 右侧路由区顶状态栏 + `SettingsPage` 设置页，壳组件用 CSS Modules + clsx、`var(--bk-*)`，只依赖 `@berkshire/ui-slots`/`react-router-dom`/`clsx`，路由与桥接态由宿主 prop 注入；壳帧 `RootShell` 经共享 `root` 槽挂载、`registerRootShell` 注册即效应）；新增布局挂点 `layout.navigation.extra` / `layout.sidebar.footer` / `layout.statusbar.right` / `settings.cards`（`@berkshire/ui-slots` `FrontendSlotContextMap` 与 core `SLOT_NAMES` 两端同一契约），侧边栏按 `RouteDescriptor.section` 分组；`ctx.slots` `register()` 校验新槽；sidecar `routes/list` 透传 `section`；demo 插件经 `client/list` 挂载布局组件（导航追加项/状态项/设置卡片）。挂点归中枢、内容归插件，每槽包 `ExtensionBoundary`。`page.header` 每页头槽、折叠态持久化、store 作用域、经 sidecar 装配可 disable 留 v-next |
| `packages/plugins/demo`（`@berkshire/plugin-demo`，T3） | **demo 插件**（能力块 A/B/C 一体化） | datasource/… 各插件（首个 client 插件） | **webview 半身随插件包走、M3 起运行时动态拉取**：页面/组件 JSX（`src/client/demo*.tsx`）+ 前端 scoped 样式为 **CSS Modules**（作者源 `src/client/*.module.css` → 插件打包阶段编译 `scripts/compile-styles.ts` 产出 `styles.generated.ts`；`.tsx` 拿哈希类名、sidecar 拿注入 css 经 `client/list` 下发）。M3 起 host 不再 static import `@berkshire/plugin-demo/client`：插件在运行期自报 `CLIENT_ENTRY_URL`（`new URL('./client/index.js', import.meta.url).href`）→ sidecar `client/list` → Rust `to_bk_url` 规范化 `bk:///…` → webview `loader.ts` 运行时 `import(url)`。sidecar 半身 `inject: ['slots','clientModules','log']`；一次注册 `stock-preview.footer` 组件（`demo-fund-flow`）+ `watchlist.toolbar` 组件（`demo-watchlist-toolbar`）+ `analysis.menu` 资金流向页（`demo-money-flow` → `/analysis/money-flow`，各带 scoped 样式）；全部经 `ctx.effect` 包裹并逆序撤销；后端走 `ctx.log` + 静态占位数据（诚实：不走 DuckDB）；Config 有 `enableFooter/enableToolbar/enableMenu/enableShellWidgets` 开关。组件跨包不 import 宿主：`FooterContext`/`ToolbarContext` 为共享缝 `@berkshire/ui-slots` `FrontendSlotContextMap` 的结构镜像（v2 共享类型层债务） |
| `packages/bundle/{demo,demo-off}`（T3） | demo bundle 开关 | bundle 分发包 | `demo` 用 `insert` 装上 demo；`demo-off` 用按 id `disabled:true` 整行覆盖关掉。叠加顺序验证「装上即出现、卸下即消失且样式不残留」（boot 级 `packages/plugins/demo/examples/smoke.ts`） |
| 样式令牌层（第一优先落地 · 已对齐 dsh 两层令牌） | `@berkshire/theme` + 中枢/插件样式治理 | 样式/主题治理 | [packages/theme](../packages/theme/src/index.ts)（无 `@berkshire/core` 依赖的令牌单一事实源：**取值层 `STATIC_TOKENS`（`--bk-static-*`，唯一写实值）+ 别名层 `THEME_TOKENS`（`--bk-*`，组件/插件唯一引用入口，值为 `var(--bk-static-*)`）**；`LIGHT_PALETTE` `DARK_PALETTE` / `bkVar` `bkVarName` / `bkStaticVar` / `themeRootCss()` 两层出口）；中枢（base-ui `installThemedRoot` 文档基础）与插件样式只写 `var(--bk-*)` 别名引用（**禁魔法色值**；间距/圆角/字号统一走 `--bk-space-*`/`--bk-radius-*`/`--bk-font-size-*`，host 与插件同源引用，正式去 token 化 v-next）；暗色单表 `[data-theme='dark']`/`prefers-color-scheme` 只覆盖取值层、组件零 `[data-theme]` 选择器；base-ui webview 半身 [installThemedRoot.tsx](../packages/plugins/base-ui/src/client/installThemedRoot.tsx)（渲染前注入 `<style data-bk-theme>`）、[ThemePalettePage.tsx](../packages/plugins/base-ui/src/client/ThemePalettePage.tsx) 主题对照页核心路由 `/theme`（色板格为 base-ui 侧 CSS Modules + clsx 组件 `TokenSwatch`）；魔法色值 lint [packages/theme/scripts/lint-styles.ts](../packages/theme/scripts/lint-styles.ts)（认得取值层实值、别名层只许 `var()`，扫描面含插件 `.module.css`）；`packages/theme/test/theme.test.ts`。`ctx.theme` 换肤缝、Tailwind 取舍、`bk://` 基底、spacing/radius/font-size 正式去 token 化、正式样式文件接管取值层均留 v-next |
| base-ui 组件 CSS Modules + clsx（H2） | 壳/基础 UI 组件用 `.module.css` + clsx | 样式/主题治理 | [packages/plugins/base-ui/src/client/TokenSwatch.tsx](../packages/plugins/base-ui/src/client/TokenSwatch.tsx)（`.module.css` 示范：类名 camelCase、状态类由 `clsx` 挂载、`className` 透传、禁 `composes`、禁魔法值）· [TokenSwatch.module.css](../packages/plugins/base-ui/src/client/TokenSwatch.module.css) · [css-modules.d.ts](../packages/plugins/base-ui/src/client/css-modules.d.ts)（通配 declare）。动态样式走 CSS 变量桥（JS 只写变量、规则留 CSS） |
| 插件独立打包阶段编译 CSS Modules（P3） | 插件样式从运行时字符串 → `.module.css` + 插件打包阶段编译 | 样式/主题治理 | demo 插件样式迁 CSS Modules：作者源 [packages/plugins/demo/src/client/*.module.css](../packages/plugins/demo/src/client/fundFlow.module.css) → 插件打包阶段编译步骤 [packages/plugins/demo/scripts/compile-styles.ts](../packages/plugins/demo/scripts/compile-styles.ts)（lightningcss，`bun run --cwd packages/plugins/demo compile:styles`）产出 **哈希类名 + 注入代码** [styles.generated.ts](../packages/plugins/demo/src/client/styles.generated.ts)；`.tsx` 组件 import 哈希类名、sidecar 半身 import 注入 css 经 `client/list` 交给 host；**host（`loader.ts`）只注入 `<style data-bk-module>`、不参与哈希**。类名构建期自动唯一（消 `.bk-demo-*` 人肉前缀）；间距/圆角/字号与 host 统一引 `--bk-space-*`/`--bk-radius-*`/`--bk-font-size-*`（不裸写 4 倍数）。`bk://` 远程 bundle、HMR、正式独立插件打包仍 v-next |
| `packages/boot`（`@berkshire/boot`） | `Boot` 装配器 | app-boot | `ctx.plugin()` 挂载、`dispose()` 逆序（后装先卸）；HMR 热装卸/sidecar 生命周期留 v2 |
| | `composeEntries`/`applyEntryPatches` | profile/bundle/patch 组合 | 仅支持 `insert` 与按 id 整行覆盖；`!!js` 惰性求值、dump-config、isolate/group 留 v2 |
| `packages/plugins/notify-console` | **第一个插件** | datasource/… 各插件 | 能力缝三角色之 **Provider**；inject 声明依赖、效应注册、卸载逆序清理 |
| `packages/bundle/base` | 插件 tree 的 enable 行 | bundle 分发包 | `insert` 核心脊 + notify-console |
| `packages/bundle/headless` | 行级 disable | bundle/patch 覆盖 | 按 id 整行把 notify-console 置 `disabled: true` |
| `packages/sidecar`（T1） | 桥接协议 sidecar 长驻进程 | 进程 B · stdio JSON-RPC 宿主桥 | 纯函数协议层 `protocol.ts` + 事件推送 `events.ts` + 行缓冲 `writer.ts`；stdout 独占协议、stderr 日志、fail-closed；**Rust 宿主桥 `bridge.rs`/`sidecar_client.rs`（拉起/restart + 事件转发到 Tauri events）已落地 v1**；**webview 接线（T3：`lib/api.ts` 薄客户端 + `components/SidecarPanel.tsx`）已落地 v1** |
| `packages/ui-slots`（`@berkshire/ui-slots`，原宿主 `src/slots/*` 迁出，T0） | 共享 UI 缝引擎（webview 本地 slot 宿主） | sidecar `ctx.slots` 能力缝 | `SlotRegistry` 运行时校验（id 格式/重复 id/API version/未知 slot，fail-closed）+ 按 `order ?? 100` 排序 + 可逆 disposer + `subscribe`/`getSnapshot`（`useSyncExternalStore` 反应式订阅）；`ExtensionSlot` 按槽渲染、每组件包 `ExtensionBoundary`（compact 降级 null 否则横幅）；`FrontendSlotContextMap` 类型化 context map + 空状态渲染 + 内置 `root` single 槽（壳帧挂载点）。T1 后经 `ClientModuleHost` 汇入 sidecar 快照。router/store/`bk://` 仍目标态 |
| `apps/berkshire-agent/src/client/*` + `packages/core`/`packages/sidecar`（T1） | client 插件图最小链路（slot→bundle + scoped 样式） | client 插件图 / 样式注入能力块 A+C | core `ctx.slots`/`ctx.clientModules`（Definition）+ `client/changed` 事件；sidecar `client/list` 方法（T1 注册的手写测试 bundle 在 T3 **已被 demo 插件接管并移除**，见下行 demo 行）；Rust `bridge.rs`/`lib.rs` `client_list` command；webview `lib/api.ts` 的 `clientList()`/`onClientChanged()` + `client/ClientModuleHost.tsx`（拉快照→loader 解析插件包 webview 半身→`slotRegistry` 挂载 + `<style data-bk-module>` scoped 注入，卸载/断链移除样式与组件、宿主页不崩）。远程 `bk://` bundle、HMR、store 作用域留 v-next |

### 已验证（`bun test packages/boot/test/core.test.ts`，6 用例）

1. 插件正序启动 + inject 依赖就绪（`ctx.notifier` provider 已注册）；
2. typed 事件触发与响应（`notify/request` 送达 provider + 追加进 `ctx.log`）；
3. 反序卸载清理（插件卸除后能力不可用、监听摘除、日志不增长、fail-closed）；
4. 禁用插件后能力不可用（fail-closed）+ `composeEntries` 层叠覆盖语义。

### 与目标态的差异（诚实标注）

- **底座**：v1 已以 scoped **`@berkshire/cordis` vendor** 为底座并对其做 `declare module`（M4 已落地，见上「M0–M4」节）；DuckDB 单写者、rspc/specta typed bridge 仍目标态。`bk://` 自定义协议已实现（Rust `bk_protocol.rs` + webview 半身动态拉取，M3，见上）。桥接协议 sidecar 进程**本体**（T1 stdio JSON-RPC）已落地；T2 的 Rust 宿主桥（`bridge.rs` 拉起/restart + 事件转发到 Tauri events）已落地 v1；T3 的 webview 接线（进程 C，`lib/api.ts` 薄客户端 + `components/SidecarPanel.tsx`，最小证明面）已落地 v1，见上表。
- **范围**：核心脊已落 sessions/log、capabilities、notifier(seam)、slots、clientModules 五条；前端 **webview 本地 slot 宿主（`apps/berkshire-agent/src/slots/*`，T0 最小件）已落地**、**T1 的 sidecar 侧 `ctx.slots`/`ctx.clientModules` 能力缝最小件 + `client/list`/`client_list` + webview `ClientModuleHost`（client 插件图最小链路）已落地**、**路由契约化（任意 slot 的 `route` → 动态导航/路由/页面，core `Slots.routes()`/`CORE_ROUTE_PATHS` + sidecar `routes/list` + Rust `routes_list` + webview `HashRouter`/`src/routes/*`）已落地**、**T3 的 demo 插件（`@berkshire/plugin-demo`，能力块 A/B/C 一体化：footer 组件 + toolbar 组件 + 资金流向页 + 应用壳布局组件 + scoped 样式，`packages/bundle/{demo,demo-off}` 开关）已落地**、**应用壳（可扩展侧边栏 + 右侧路由区 + 状态栏 + 设置页，`@berkshire/base-ui` 壳插件 + 布局挂点 `layout.navigation.extra`/`layout.sidebar.footer`/`layout.statusbar.right`/`settings.cards`，路由 `section` 分组）已落地**（见 §6/§8）；database/datasets/market/scheduler 及正式 router/store 仍为目标态。
- **配置**：`composeEntries` 只实现最小区间；`dump-config`、`!!js`、`isolate/extend`、HMR 留 v2。

### 复现命令（已在本次交付跑通）

```bash
bun install
bun run packages/boot/examples/headless.ts   # 端到端样例：enable/disable 两场景
bun test packages/boot/test/core.test.ts     # v1 自动化测试：6 pass / 0 fail
bun run packages/sidecar/examples/smoke.ts   # sidecar 桥接协议冒烟（T1）：六方法 + 事件 + fail-closed + shutdown（含 client/list、routes/list）
bun test packages/sidecar/test               # sidecar 自动化测试（T4）：协议层 + writer + 事件推送器 + 进程端到端 + dev 热更路径过滤，41 pass / 0 fail
bun test apps/berkshire-agent/src            # webview：slot 注册表（T0，7）+ client loader（T3，3）单测
cargo check -p berkshire-agent --manifest-path apps/berkshire-agent/src-tauri/Cargo.toml  # Rust 桥（含 client_list、routes_list）
bun run packages/plugins/demo/examples/smoke.ts  # demo 插件 enable/disable 复现开关（装上 3 注册 + 1 路由 / 卸下 0）
bun test                                     # 全仓：v1(6) + sidecar(41) + webview(10) = 57 pass / 0 fail
```

### v1 接线已验证（T4 收口）

- `packages/sidecar/test/*.test.ts`（bun test）：`protocol.test.ts`（协议层 26，含 `client/list`、`routes/list`）、`writer.test.ts`（行缓冲 4）、`events.test.ts`（`client/changed` 推送 3）、`process.test.ts`（spawn 真实 sidecar 的端到端：四方法 round-trip + 事件推送 + shutdown 逆序销毁顺序 + 退出码 0）、`dev_watch.test.ts`（dev 态插件热更的路径过滤 7）——共 41。
- Rust 桥侧 `cargo test --offline`：`sidecar_client.rs` 单测 2 用例（含真实 spawn round-trip）。
- 前端 `bun run build`（tsc + vite build）通过；`apps/berkshire-agent/src/lib/api.ts`、`components/SidecarPanel.tsx` 为最小证明面；共享 UI 缝引擎 `@berkshire/ui-slots`（原宿主 `src/slots/*`，T0：`SlotRegistry`/校验/`ExtensionSlot`/降级 + 反应式订阅，`bun test packages/ui-slots/test/registry.test.ts` 覆盖）已落地；**T1 已落地 sidecar 侧 `ctx.slots`/`clientModules` 缝、`client/list`/`client_list`、webview `ClientModuleHost`/`loader`（client 插件图最小链路，`bun test src/client/loader.test.ts` 覆盖）**；**路由契约化已落地：插件在任意 slot 自声明 `route` → 动态导航/路由/页面（core `Slots.routes()`/`CORE_ROUTE_PATHS` 校验含全局 path 唯一 + sidecar `routes/list` + Rust `routes_list` + webview `react-router-dom` `HashRouter` 与 `src/routes/*`，`routes/list` 协议校验含「非 analysis.menu 槽也可声明路由」在 sidecar `protocol.test.ts` 覆盖）**；**T3 已落地 demo 插件（`packages/plugins/demo`：footer/toolbar/资金流向页 + scoped 样式；`bun run packages/plugins/demo/examples/smoke.ts` 在 boot 级验证装上 3 注册 + 1 路由、卸下归 0；sidecar 装配叠入 demo bundle，`smoke.ts`/`process.test.ts` 实测 `client/list` 3 条 + `routes/list` 1 项 + 卸除顺序 demo→notify-console→core）**；**dev 态插件热更最小通路已落地（仅 dev）**：组件 `.tsx` 走 webview 的 Vite Fast Refresh（静态 import 插件包源码本就是热更图）；样式字符串 + 声明（slot/route/bundle）随 sidecar 快照走——宿主 debug 构建注入 `BK_DEV_HOTRELOAD=1`，sidecar 附 `dev_watch.ts` watcher（监控 core 编织、插件 `src/index.ts`、样式 `src/client/*.ts`、bundle patch，排除组件 `.tsx`）→ 变更推 `dev/reload-requested` → 宿主后台线程 `restart()` 重装配 → 推 `sidecar://client/changed` 让 ClientModuleHost + RouteSync 重拉新快照；release 不注入、生产 sidecar 不发此事件（惰性），行为不变（sidecar `process.test.ts` 在 debug 下带 watcher 启动仍全绿）；正式 router/store 仍目标态。

### M0–M4 · 插件自打包为可发布 NPM 包 + 动态加载（docs/npm-plugin-packaging-and-loading.md 已全部落地）

- **M0 自打包底座**：各可发布包加 `tsconfig.build.json` + `scripts/build` 产出 `dist/`，`exports`/`main`/`types` 指向 dist、去 `private: true`、补 `files`/`license`/`peerDependencies`；`scripts/build-packages.ts`（`bun run build:packages`）按依赖序产出全部 dist。覆盖 `@berkshire/core`、`@berkshire/boot`、`@berkshire/sidecar`、`@berkshire/ui-slots`、`@berkshire/theme`、`@berkshire/plugin-notify-console`、`@berkshire/plugin-demo`、`@berkshire/base-ui`。
- **M1 动态 import 解析器**：[boot/src/loader.ts](../packages/boot/src/loader.ts) 内置 `importPlugin(name,{nodeModulesDir,baseUrl})`——`cordis:` 内置 / 相对·绝对路径 / npm 裸名三分支 + `unwrapExports`，`Boot.install` 缺省走它（外部传 resolver 仍兼容）；`bun test` 覆盖（20 测含 loader）。
- **M2 sidecar 去硬编码 + `$BK_HOME`**：[boot/src/bk-home.ts](../packages/boot/src/bk-home.ts)（`$BK_HOME`：Win `%APPDATA%\.bk` / macOS `~/Library/Application Support/.bk` / Linux `~/.bk`，`BK_HOME` env 优先）+ [entries-file.ts](../packages/boot/src/entries-file.ts)（`readCordisYml`）；[sidecar/src/index.ts](../packages/sidecar/src/index.ts) 从 `$BK_HOME/cordis.yml` 声明装配（删硬编码 resolver 表、不再读 repo bundle 产物），npm 下载包与本地插件一条装载路径。
- **M3 `bk://` + webview 半身动态拉取**：Rust [bk_protocol.rs](../apps/berkshire-agent/src-tauri/src/bk_protocol.rs)（`bk:///node_modules/<pkg>/dist/…` → `$BK_HOME`，fail-closed + ESM MIME，单测绿）+ [bridge.rs](../apps/berkshire-agent/src-tauri/src/bridge.rs) `to_bk_url` 规范化；webview [loader.ts](../apps/berkshire-agent/src/client/loader.ts) `importClientModule` 运行时 `import(url)`（插件自报 `CLIENT_ENTRY_URL`，不再 static import 插件 client）+ [sharedImportMap.ts](../apps/berkshire-agent/src/lib/sharedImportMap.ts) import-map 接线（宿主 main.tsx 入口，默认空）。**待运行验证接线点**：共享裸名 → 真实可 fetch URL 的 dev/prod 取值。
- **M4 `@berkshire/cordis` vendor**：[packages/cordis](../packages/cordis/src/index.ts) `export *` 重导出官方 `cordis`，全仓 `declare module`/`import` 迁 scoped 名。

> 注：[architecture.md §11](architecture.md#11-关键文件索引现状--目标) 的“现状锚点”已把 v1 的 core/boot/plugin/bundle 更新为真实文件锚点（见上表对应行），`AGENTS.md` 的「已有 / 目标态」清单也已同步。
