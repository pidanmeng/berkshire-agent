# AGENTS.md

Berkshire Agent（下称 **BK**，A 股投研桌面工作台）是一个**仅由既有组件拼装、一切部件皆插件**的 Cordis 应用。本文件是仓库级约定，约束所有 AI 开发者在此仓库写出的代码、文档、测试都必须符合本架构契约。

改动 `packages/` 前先读 [docs/architecture.md](docs/architecture.md)；改动文档请遵守 [docs/ 文档集](docs/) 的「诚实标注」纪律；改能力缝/服务见 [docs/capability-seams.md](docs/capability-seams.md)。

## 目标态 vs 已实现（最重要的一条——诚实）

本仓库的 `docs/` 描述的是**设计契约（目标态）**，不是当前已实现代码。**任何 AI 都不得把 docs 里的示例当实现、不得 import 尚不存在的 `ctx.*`/`@berkshire/cordis` 或未落地的 `packages/*` 服务**（已落地的 `packages/core`/`packages/boot`/`packages/plugins/notify-console` 除外，见下文「已有」）。当前真实状态：

- **已有**：`apps/berkshire-agent` 的 Tauri 2 + React 19 + Vite 骨架（详见 [docs/architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标)）；以及 **headless 最小核心脊 v1**（`packages/core` `@berkshire/core`、`packages/boot`、`packages/plugins/notify-console`、`packages/bundle/{base,headless}`），提供 `ctx.log`/`ctx.capabilities`/`ctx.notifier`/`ctx.storage`（能力缝，`ctx.storage` 经 `$BK_HOME/state/` 轻量 JSON 持久化，明确非 DuckDB）+ `declare module 'cordis'` 类型化事件（`@mode emit`，已 **B 级 co-locate**：各服务/事件增强分散到所属文件 `services/*.ts`/`seams/{notify,storage}.ts`，跨服务共享事件 `client/changed` 在 `core/src/events.ts`；`package.json` 已开子路径 `exports`，可按服务颗粒 `import '@berkshire/core/services/log'` 等，根入口仍全量 re-export 一次激活）＋**路径 A**：`ctx.log` 另导出插件组件 `Log`（`services/log.ts`，`super(ctx,'log')` 自注册，可 `ctx.plugin(Log)` 随处装载；core.ts 默认装载以兼容既有 `inject:['log']` 消费方，示范「服务随处定义随处消费」的装配形态），可跑可测（见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)）；以及 **样式令牌层（第一优先、零破坏，已对齐 dsh 两层令牌）已落地**：共享包 [packages/theme](packages/theme)（`@berkshire/theme`，**无 `@berkshire/core` 依赖**的令牌单一事实源：**取值层 `STATIC_TOKENS`（`--bk-static-*`）+ 别名层 `THEME_TOKENS`（`--bk-*`）/ `LIGHT_PALETTE` `DARK_PALETTE` / `bkVar` `bkVarName` `bkStaticVar` / `themeRootCss()`**），中枢与插件样式均只写 `var(--bk-*)` 引用、**禁魔法色值**；令牌根样式/文档基础与主题对照页 `ThemePalettePage`（核心路由 `/theme`）由 **`@berkshire/base-ui`** webview 半身 `installThemedRoot()`（`<style data-bk-theme>` 渲染前注入，经 `@berkshire/base-ui/client` 入口）承载；魔法色值 lint [packages/theme/scripts/lint-styles.ts](packages/theme/scripts/lint-styles.ts)；以及 **React 原子组件库 `@berkshire/ui`（`packages/ui`：Button/Input/Select/Dropdown/Modal/Toast/Notification/Badge/Tooltip/EmptyState，全部 CSS Modules + `var(--bk-*)`、无 `@berkshire/core` 依赖、可打包可测）已落地**；以及桥接协议 sidecar **T1**（`packages/sidecar`，stdio JSON-RPC 长驻进程，见 [packages/sidecar/README.md](packages/sidecar/README.md)）+ **T2 的 Rust 宿主桥**（`apps/berkshire-agent/src-tauri/src/bridge.rs`、`sidecar_client.rs`：拉起/restart sidecar + 经 Tauri events 把事件转发到 webview，并暴露最小 `tauri` command 命令面）；以及 **T3 的 webview 接线**（`apps/berkshire-agent/src/lib/api.ts` 薄客户端：包装 `capabilities_list`/`client_list`/`routes_list` command + 订阅 `sidecar://capabilities/changed`、`sidecar://client/changed`，外包超时 fail-closed；`notify_send`/`log_list`（支撑 `ctx.notifier`/`ctx.log`）与 `capabilities_usable` 目前无 webview 消费者、薄客户端不包装（Rust 侧命令面保持完整）；共享缝 `@berkshire/ui-slots` 的 `ExtensionBoundary` 错误边界为最小证明面（宿主 T3 demo 面板 `SidecarPanel` 已于 WP-4 宿主清理移除）；**共享 UI 缝引擎 `@berkshire/ui-slots`（自宿主 `src/slots/*`、`lib/ExtensionBoundary*` 迁出：`SlotRegistry`/`ExtensionSlot`/类型化 `FrontendSlotContextMap`/`ExtensionBoundary` 降级，T0 最小件，带 `useSyncExternalStore` 反应式订阅，含 webview 本地 `root` single 槽，宿主与所有插件共同 import）已落地**；**T1 的 sidecar 侧能力缝最小件已落地**：`packages/core` 增 `ctx.slots`/`ctx.clientModules`（能力缝 Definition，`ClientModuleId` 品牌化 + `client/changed` 事件），`packages/sidecar` 增 `client/list`/`routes/list` 方法（注册样例后由 T3 的 demo 插件接管），Rust `bridge.rs`/`lib.rs` 增 `client_list`/`routes_list` command，webview 增 `lib/api.ts` 的 `clientList()`/`onClientChanged()`/`routesList()` + `src/client/{ClientModuleHost,loader}`（模块映射 + `<style data-bk-module>` scoped 注入宿主；**组件源码从插件包取**，见下方 T3 的 webview 半身），构成「sidecar 注册 → client/list 快照 → webview 挂载 + scoped 样式」最小链路；**动态路由/页面（能力块 B）已落地，路由契约化**：core `Slots.routes()` 汇总**任意 slot** 上带 `route` 的声明（含 `slot` 归属）+ `CORE_ROUTE_PATHS` 校验（静态路径、不覆盖核心、URL 空间**全局** path 唯一），sidecar `routes/list` 方法（样例路由由 T3 的 demo 插件提供：`/analysis/money-flow`），Rust `routes_list` command，webview 引入 `react-router-dom` `HashRouter`（核心路由 `/`、`/theme`、`/settings`）+ `src/routes/{routesStore,RouteSync,ExtensionRoute}` 按 `routes/list` 动态生成导航与路由、`ExtensionRoute` 按 `route.slot` 渲染对应槽并包 `ExtensionBoundary`（**不再写死 analysis.menu**）；**T3 的 demo 插件（能力块 A/B/C 一体化）已落地**：`packages/plugins/demo`（`@berkshire/plugin-demo`）经 `inject: ['slots','clientModules','log']` 一次注册 `stock-preview.footer` 组件 + `watchlist.toolbar` 组件 + `analysis.menu` 资金流向页（`/analysis/money-flow`，含后端占位数据走 `ctx.log`），各带 scoped 样式（**CSS Modules**：作者源 `*.module.css` → 插件打包阶段编译出哈希类名 + 注入代码，`src/client/styles.generated.ts`；`.tsx` 拿哈希类名、sidecar 拿注入 css），**webview 半身（页面/组件 JSX + 前端样式）随插件包走、经 `@berkshire/plugin-demo/client` 入口 static import**，卸载整体撤销；**应用壳（Vercel 黑白风）已落地**：下沉为 **`@berkshire/base-ui`** 插件 webview 半身 `packages/plugins/base-ui/src/client/`（`AppShell` 网格 + `Sidebar` 可扩展侧边栏 + `StatusBar` 右侧路由区顶状态栏 + `SettingsPage` 设置页，壳组件用 CSS Modules + clsx、`var(--bk-*)`，只依赖 `@berkshire/ui-slots`/`react-router-dom`/`clsx`，路由与桥接态由宿主 prop 注入；壳帧 `RootShell` 经共享 `root` 槽挂载，宿主 `App.tsx` 从 root 槽取壳帧）＋布局挂点 `layout.navigation.extra` / `layout.sidebar.footer` / `layout.statusbar.right` / `settings.cards`（与 core `SLOT_NAMES` 两端同一契约）＋路由 `section` 分组（侧边栏按组展示，sidecar `routes/list` 透传），demo 插件证明性挂载布局组件（导航追加项/状态项/设置卡片）；**dev 态插件热更最小通路已落地（仅 dev）**：组件 `.tsx` 归 webview 的 Vite Fast Refresh；样式字符串 + 声明随 sidecar 快照走——宿主 debug 构建注入 `BK_DEV_HOTRELOAD=1` → sidecar 附 `dev_watch.ts` watcher（core 编织/插件 `src/index.ts`/样式 `src/client/*.ts`（含编译产物 `styles.generated.ts`，作者源 `*.module.css` 经 `compile:styles` 重生成后驱动）/bundle patch，排除组件 `.tsx`）→ 变更推 `dev/reload-requested` → 宿主后台线程 `restart()` 重装配 + 推 `sidecar://client/changed`；release/生产不发事件（惰性），行为不变（T5 正式 bundle 注入/`bk://` 远程拉取 + HMR 仍目标态）；`packages/bundle/demo`（enable）+ `demo-off`（disable）提供可复现开关，sidecar 装配时叠入 demo bundle（T1/T2 的手写测试 bundle 已移除）；router/store/client-plugins 目录仍目标态，见 [apps/berkshire-agent/src](apps/berkshire-agent/src)）。**M2 插件装载去硬编码 + `@berkshire/cordis` vendor（M4）+ `bk://` Rust 协议（M3，仅 Rust 侧）已落地**：`packages/boot` 新增 `$BK_HOME`（Windows `%APPDATA%\.bk` / macOS `~/Library/Application Support/.bk` / Linux `~/.bk`，`BK_HOME` 环境变量优先；`defaultBkHome`/`setBkHome`/`cordisYmlPath`/`nodeModulesDir`/`readCordisYml`）+ 内置动态 `importPlugin(name,{nodeModulesDir,baseUrl})`（`cordis:` 内置 / 相对·绝对路径 / npm 裸名→`$BK_HOME/node_modules` 解析 dist 三分支，**npm 包与本地插件一条路径**，fail-closed）；`packages/sidecar` 改为从 `$BK_HOME/cordis.yml` 声明装配（不再硬编码插件表、不再读 repo bundle 产物）；`@berkshire/cordis` vendor 包（`packages/cordis-vendor`，`export *` 重导出官方 `cordis`）+ 汇入 `packages/tsconfig.json` `paths` + `build:packages`，全仓 `declare module`/`import` 统一改走 scoped `@berkshire/cordis`（依赖已加进 core/boot/sidecar/notify-console/demo；typecheck + boot/sidecar 测试 + host build 复验绿）；`apps/berkshire-agent/src-tauri` 增 `bk_protocol.rs` 注册 `bk://` 自定义协议（`bk:///node_modules/<pkg>/dist/…` 映射 `$BK_HOME` + 目录穿越 fail-closed + ESM MIME，cargo check + 单测绿）；**M3-webview 半身动态拉取已落地**：host 不再 static import 插件 client 半身，插件运行期自报 `CLIENT_ENTRY_URL`（两态探测：`./client/index.js` 落盘命中否则源态 `./client/index.tsx`，见 [packages/plugins/demo/src/index.ts](packages/plugins/demo/src/index.ts)），sidecar `client/list` 快照携带它，Rust `bridge.rs` `to_bk_url` 按 `$BK_HOME` 规范化成 `bk:///…`，webview [src/client/loader.ts](apps/berkshire-agent/src/client/loader.ts)（`importClientModule`）运行时 `import(url)` + 取具名导出 + `<style data-bk-module>` scoped 样式注入（`ClientModuleHost.tsx`），共享裸名经 [src/lib/sharedImportMap.ts](apps/berkshire-agent/src/lib/sharedImportMap.ts) 的 import-map 解析（宿主 [src/main.tsx](apps/berkshire-agent/src/main.tsx) 入口接线，默认空——dev/prod 真实 URL 取值仍为待运行验证接线点）；**dev workspace 插件的 client 半身已接线**：`$BK_HOME` 外（workspace 解析）的 `file://` 入口由 [src/client/loader.ts](apps/berkshire-agent/src/client/loader.ts) 的 `normalizeClientUrl` 在浏览器内重写为 Vite `/@fs/<abs>` 交给 dev server serve（组件 `.tsx` 归 Vite Fast Refresh，Node/测试环境保留 `file://` 直连），demo 的 `CLIENT_ENTRY_URL` 两态探测（已构建 `./client/index.js` 落盘命中否则退回源态 `./client/index.tsx`，因 bun 把 workspace 插件解析到 `src/index.ts`）。
- **已落地：首启供给/首次启动引导（v1，pre-config）**：`$BK_HOME/cordis.yml` 缺失时 sidecar 不再崩溃，进入 provisioning 保活应答 `boot/status`；Rust `provision_bk_home` 命令把用户选择的 cordis.yml 写盘并 restart；webview `useAppPhase`+`OnboardingGate` 全屏向导（`src/onboarding/`，**步骤缝 seam**，v1 单内置步骤：`@berkshire/core` 必装锁定 + `plugin-notify-console` 用户勾选）。诚实：首启发生在 cordis.yml 之前，故引导是宿主侧 pre-config、非 cordis.yml 装载的插件；v1 依赖 dev workspace 解析（不跑 `bun add`）。详情见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊) 与 [architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标)。
- **目标态/未实现**：DuckDB 写出、rspc/specta typed bridge、以及 `database/datasets/market/scheduler` 核心服务、**正式 router/store/client-plugins 目录**。**这些仍处于文档计划阶段，未落地、未导入、未调用。**（注：`@berkshire/ui-slots` 的 **共享 UI 缝引擎**（原宿主 `src/slots/*` 的 webview 本地 slot 宿主，T0）与 `packages/core` 的 **sidecar 侧 `ctx.slots`/`ctx.clientModules` 能力缝**（T1 最小件）均已落地，其中**路由契约化**已把「插件自声明 `route` → 动态路由/导航/页面」最小面跑通（见上文「已有」）；**webview 半身动态拉取（loader 去静态 import / 经 `bk://` 动态 `import`）也已落地**（M3，见上文「已有」）——「正式挂载体系（store/生产样式分发/全量 layout·menu 注入）」仍是目标态，勿混淆。）

每一项能力是否落地，以 [docs/secondary-development.md §6](docs/secondary-development.md#6-已有-vs-目标诚实标注) 的诚实对照为准；落地后必须同步更新 [architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标) 的「现状锚点」。

## 仓库布局

```
berkshire-agent/
├── AGENTS.md                # 本文件：仓库级 AI 契约
├── .agents/                 # AI 工作流（本技能集）
│   ├── README.md            #   技能/命名对照表 + 已强制 vs 待实现 诚实矩阵
│   ├── notes/               #   Agent Notes 决策记录（中文单语，附 bun 校验门禁）
│   └── skills/<bk-*>/SKILL.md   #   技能（中文优先）
├── apps/
│   └── berkshire-agent/     # Tauri 壳（现有骨架）+ React 前端
│       ├── src-tauri/src/   #   main/lib.rs + bridge.rs/sidecar_client.rs（T2 桥）；db/ipc/providers 为计划
│       ├── src-tauri/tauri.conf.json, capabilities/default.json
│       └── src/             #   webview: main.tsx（入口：令牌根注入 + 挂载）、App.tsx（从共享 root 槽挂 base-ui 壳帧）+ client/（ClientModuleHost/loader 模块映射宿主，T1 链路）+ routes/（HashRouter 核心路由 + 插件自声明动态路由/导航，路由契约化）+ components/lib（薄客户端/桥接态探测）；store/client-plugins 为计划，slot 引擎与壳分居 packages/ui-slots、packages/plugins/base-ui
├── docs/                    # 目标架构文档集（中文）+ diagrams(archify 图) + reference(审计/研究)
└── packages/                # v1：headless 核心脊（@berkshire/core、@berkshire/boot）+ 插件 notify-console + demo（client 插件图：页面/组件/样式）+ 共享 UI 缝引擎 ui-slots（@berkshire/ui-slots，宿主与插件共同 import）+ 壳插件 base-ui（@berkshire/base-ui，应用壳 webview 半身）+ 样式令牌层 theme + bundle/{base,headless,demo,demo-off}；其余服务仍计划
```

`packages/` 的设计布局见 [docs/architecture.md §3](docs/architecture.md#3-模块地图monorepo计划布局)。

## 命令（bun 版）

当前真实可用命令（在哪个目录执行、是否真实存在，已如实标注）：

```sh
# 仓库根——根脚本可代理到重要子项目（真实存在，见各 package.json #scripts）
bun install                 # 安装依赖（bun workspaces: apps/*）
bun run dev                 # 先 build:packages（插件先于宿主）→ 代理 → apps/berkshire-agent dev（Vite，端口 1420）
bun run dev:docs            # 代理 → apps/docs dev
bun run dev:plugins         # 插件源码构建 watcher：监听 packages/*/src 变更 → 重构建属主包 dist（配合 dev 做 HMR，见 scripts/watch-plugins.ts）
bun run build               # 先 build:packages（插件先于宿主）→ 代理 → apps/berkshire-agent build（tsc && vite build）
bun run build:packages      # 全量包构建到 dist（scripts/build-packages.ts：依赖拓扑 cordis→core→boot→sidecar→theme→ui-slots→三插件）
bun run build:plugins       # 仅插件链构建到 dist（bun scripts/build-packages.ts plugins，不含 sidecar）
bun run build:docs          # 代理 → apps/docs build
bun run tauri:dev           # 先 build:packages → 代理 → apps/berkshire-agent tauri:dev（Tauri dev 窗口；debug 侧含 BK_DEV_HOTRELOAD 热更）
bun run bundle              # 先 build:packages → 代理 → apps/berkshire-agent bundle（tauri build：安装包 + 可执行文件）
bun run bundle:dir          # 先 build:packages → 代理 → apps/berkshire-agent bundle:dir（tauri build --no-bundle：仅可执行文件）
bun run publish:plugins     # 发布 @berkshire/* 到 npm（scripts/publish-plugins.ts：依赖序 + workspace:* 改写 + 幂等；CI 在 release.yml）
bun run test                # 代理 → packages/boot test（bun test）
bun run typecheck           # tsc -p packages/tsconfig.json --noEmit
bun run verify:agent-notes  # 校验 Agent Notes 格式+分类（手动门禁；verify:agent-note-format/classification/archived 同族见 scripts/）
bun run lint:styles         # 魔法色值 lint（令牌治理，手动；代理 → packages/theme lint:styles）

# apps/berkshire-agent（前端 + Tauri）—— 真实存在
cd apps/berkshire-agent
bun run dev                 # 启动 Vite 开发服务器（Tauri 前端，端口 1420）
bun run build               # tsc && vite build（前端类型检查 + 构建）——最常用的落地校验
bun run preview             # vite preview
bun run tauri               # Tauri CLI 直接入口（透传：tauri dev / tauri build / …）
bun run tauri:dev           # tauri dev：调试窗口，改动前端/壳热更新
bun run bundle              # tauri build：生产构建 + 打包安装程序（含可执行文件）
bun run bundle:dir          # tauri build --no-bundle：仅产出原始可执行文件，不生成安装包
bun run bundle:debug        # tauri build --debug：调试版可执行文件
```

以下命令属于 docs 描述的目标能力，**当前不存在，不可当真实可用命令运行**（标注待实现）：

- `cargo test -p bk-core`（[data-model.md §7](docs/data-model.md#7-验证命令目标)；`bk-core` 尚无）
- `bk --profile desktop --dump-config`（[config.md §5](docs/config.md#5-用户如何覆盖无需写代码)；`bk` CLI / boot 尚无）
- 数据源连通自检 `provider check`（[secondary-development.md §5](docs/secondary-development.md#5-验证矩阵改动类型--最低验证)）

> 在文档里引用命令时，先确认它**当前真实存在**再写；不存在的命令要标注「待实现」，禁止当作已可用命令写进教程。

## Secrets / 配置密钥

A 股数据源与 AI 适配器需要凭据（如 `FUYAO_API_KEY`、`TUSHARE_TOKEN`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`）。凭据的读取纪律（目标态，[plugin-development.md §5](docs/plugin-development.md#5-加一个-ai-适配器)、[data-model.md §6](docs/data-model.md#6-数据契约红线改代码必读)）：

- **经 `ctx.credentials` 读取，绝不把明文密钥写进代码或 YAML**；`Config` 只存「环境变量/引用名」，provider 在运行时取值。
- 任何时候**不打印、不提交、不落盘密钥值**；`.env` 不入库（见 `.gitignore`）。
- `$BERKSHIRE_HOME`（默认 `~/.berkshire`）下用户的 `cordis.patch.yml` 也用于覆盖 provider/密钥所引用的环境变量，而非承载明文。

## 约定（Conventions）

每条约定的出处交叉引用到本仓库文档，外加技能的落地检查：

- **「无特权核心」，没有核心可打补丁**：想改能力，mount 一个新插件而不是改内核；Cordis 是插件 VM、Rust 是薄原生宿主（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [secondary-development.md §1](docs/secondary-development.md#1-能力分级-l1--l2--l3)、[capability-seams.md](docs/capability-seams.md)。
- **能力缝必须"三角色"完整**：Service Definition / Service Provider / Consumer，单一角色不算缝；新增一种能力意味着三者一起设计（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [capability-seams.md §1](docs/capability-seams.md#1-服务角色速览)。
- **注册即效应（Registrations are effects）**：每个副作用经 `ctx.effect()`/`ctx.on()` 注册并返回 disposer；`register()` 返回可撤销 disposer；清理顺序重要时放同一 effect（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [secondary-development.md §2](docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)、[plugin-development.md §0](docs/plugin-development.md#0-插件骨架三形态)。
- **依赖声明解析而非手工排序**：插件用 `inject` 声明依赖，加载顺序由需求表达；`Service.check` 判定可用性，依赖消失时依赖者**明确失败**而非静默默认缺省（[secondary-development.md §2](docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)）。
- **事件用 `declare module` 合并 + `@mode` 标注**：`declare module '@berkshire/cordis'` 增强 `Context`/`Events`；每个事件在 JSDoc 里显式标 `@mode emit|waterfall|parallel|serial|bail`，并 `@param` 载荷字段（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [capability-seams.md §5](docs/capability-seams.md#5-事件类型化五种派发模式)。
- **Waterfall 监听器必须 `next()`**：不调 `next()` 即短路链条（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [capability-seams.md §5](docs/capability-seams.md#5-事件类型化五种派发模式)、[secondary-development.md §2](docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)。
- **Plugins, not loop changes**：新行为放在文档化扩展点（能力缝/事件/slot/config），不写进「循环/核心编排」；改核心编排需先更新 architecture.md/diagrams（[secondary-development.md](docs/secondary-development.md)）。
- **配置错误 loud-fail**：`Config` 用 standard-schema（zod），无效配置在加载/最早可解析点**响亮失败**，绝不静默跳过缺失引用；默认值走显式 `resolve`（[secondary-development.md §2](docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)、[config.md](docs/config.md)、[plugin-development.md §0](docs/plugin-development.md#0-插件骨架三形态)）。
- **跨边界不透明 id 用 Branded**：`AssetId`/`DatasetId`/`CapabilityId`/`SymbolId`（`Branded<T>`），绝不用裸 `string`（防止「凭代码格式猜资产类型」类 bug）（[secondary-development.md §2](docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)、[capability-seams.md](docs/capability-seams.md)）。
- **数据契约红线**：比例/百分比口径、前复权 vs 原始价、PIT 财务、北京时区、交易日语义、fail-closed、`可见 ⟺ 已记录`——跨层必须显式转换并有测试，禁止启发式（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。见 [data-model.md §6](docs/data-model.md#6-数据契约红线改代码必读)。
- **单写者**：只有 Rust 写 DuckDB；插件/前端一律经 `ctx.database`/Rust command 读写，禁止绕过直接裸写 DB（[architecture.md §4](docs/architecture.md#4-端到端数据流主路径)）。见 [data-model.md §1](docs/data-model.md#1-核心设计决策)。

「新行为放哪」的速查直接见 [docs/quick-reference.md](docs/quick-reference.md)——**大多数修改的第一个决定就是选对扩展点**。

## 防御模式

改动前端 slot / 日志、或计划中的生命周期/并发/teardown/子进程代码前，通读并遵守：

- **slot 组件包在 `ExtensionBoundary` 内**，坏插件绝不让宿主页崩；失败降级为 null/横幅 + 控制台日志（[plugin-development.md §4](docs/plugin-development.md#4-加一个-ui-slot)、[secondary-development.md §4](docs/secondary-development.md#4-前端扩展契约l2)）。
- **缓存失效链**：DuckDB → Rust 热缓存 → generation → 事件 → 前端失效；写路径多步刷新构建新快照后**原子替换**，禁止「已写文件却返回旧内存对象」（[data-model.md §5](docs/data-model.md#5-缓存分层与失效链)）。
- 配置/密钥错误与数据缺口一律 **fail-closed**，禁止静默返回「看似合理的错误金融结果」（[data-model.md §6](docs/data-model.md#6-数据契约红线改代码必读)、[capability-seams.md §4](docs/capability-seams.md#4-能力注册能力矩阵与-fail-closed)）。

## 类型安全与文档

- 一切 TypeScript 在根 `tsconfig.json` 的 `strict: true` + `noUncheckedIndexedAccess` + `noImplicitOverride` 下编译；应用内另有 `apps/berkshire-agent/tsconfig*.json`。类型相关约定映射见 [secondary-development.md](docs/secondary-development.md)。
- **跨边界 id 品牌化**、**事件类型化**、**服务经 `declare module` 增强到 `Context`** 均已在上文约定与对应 docs 中定义；v1 已在 `packages/core` 落地（`CapabilityId` 品牌化、`@mode emit` 事件、`declare module '@berkshire/cordis'` 服务增强）；其余业务侧 id（`AssetId`/`DatasetId`/`SymbolId`）落地时代码必须遵循（当前仍为类型占位）。
- 文档以**中文为主**。文档必须诚实区分「目标态」与「已实现」，不得把示例当实现；写文档的运行/命令类声明必须可复现（[skill: bk-doc](.agents/skills/bk-doc/SKILL.md)、[skill: bk-prose-standard](.agents/skills/bk-prose-standard/SKILL.md)）。
- 术语保持本项目统一：`能力缝 seam`、`三角色 (Service Definition/Provider/Consumer)`、`dispatch 模式 (@mode)`、`profile/bundle/patch`、`单写者`、`fail-closed` 等，见 [docs/quick-reference.md](docs/quick-reference.md) 与各 doc 首部术语表。

## 如何编辑本文件

- 本文件是根级 AI 契约，改动需经评审（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。规则保持自洽且通过交叉链接指向 `docs/*.md` 或 `.agents/` 说明；不要在本文件重复展开大量实现细节。
- 每个约定都浓缩为「一条可执行的精神 + 交叉引用出处」，读者点了链接即可拿到全文证据。
- 保持「已实现 vs 目标态」诚实：本文上文「目标态 vs 已实现」的「已有/目标态」清单即本文件的已实现断言，**不在本文件重复**（完整诚实对照见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)）。能力一旦落地，同步把该项目标态改为「已实现」，并更新 [architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标) 的「现状锚点」。