# AGENTS.md

Berkshire Agent（下称 **BK**，A 股投研桌面工作台）是一个**仅由既有组件拼装、一切部件皆插件**的 Cordis 应用。本文件是仓库级约定，约束所有 AI 开发者在此仓库写出的代码、文档、测试都必须符合本架构契约。

改动 `packages/` 前先读 [docs/architecture.md](docs/architecture.md)；改动文档请遵守 [docs/ 文档集](docs/) 的「诚实标注」纪律；改能力缝/服务见 [docs/capability-seams.md](docs/capability-seams.md)。

## 目标态 vs 已实现（最重要的一条——诚实）

本仓库的 `docs/` 描述的是**设计契约（目标态）**，不是当前已实现代码。**任何 AI 都不得把 docs 里的示例当实现、不得 import 尚不存在的 `ctx.*`/`@berkshire/cordis` 或未落地的 `packages/*` 服务**（已落地的 `packages/core`/`packages/boot`/`packages/plugins/notify-console` 除外，见下文「已有」）。当前真实状态：

- **已有**：`apps/berkshire-agent` 的 Tauri 2 + React 19 + Vite 骨架（详见 [docs/architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标)）；以及 **headless 最小核心脊 v1**（`packages/core` `@berkshire/core`、`packages/boot`、`packages/plugins/notify-console`、`packages/bundle/{base,headless}`），提供 `ctx.log`/`ctx.capabilities`/`ctx.notifier`（能力缝）+ `declare module 'cordis'` 类型化事件（`@mode emit`），可跑可测（见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)）；以及桥接协议 sidecar **T1**（`packages/sidecar`，stdio JSON-RPC 长驻进程，见 [packages/sidecar/README.md](packages/sidecar/README.md)）+ **T2 的 Rust 宿主桥**（`apps/berkshire-agent/src-tauri/src/bridge.rs`、`sidecar_client.rs`：拉起/restart sidecar + 经 Tauri events 把事件转发到 webview，并暴露最小 `tauri` command 命令面）；以及 **T3 的 webview 接线**（`apps/berkshire-agent/src/lib/api.ts` 薄客户端：包装 `capabilities_list/usable`、`notify_send`、`log_list` 四条 command + 订阅 `sidecar://notify/request`、`sidecar://capabilities/changed`，外包超时 fail-closed；`components/SidecarPanel.tsx` 最小 demo 面板、`lib/ExtensionBoundary.tsx` 错误边界——均为最小证明面，正式 slot/router/clientModules 仍目标态，见 [apps/berkshire-agent/src](apps/berkshire-agent/src)）。
- **目标态/未实现**：DuckDB 写出、rspc/specta typed bridge、`bk://` 协议、`@berkshire/cordis` vendor、以及 `database/datasets/market/slots/clientModules/scheduler` 诸核心服务。**这些仍处于文档计划阶段，未落地、未导入、未调用。**

每一项能力是否落地，以 [docs/secondary-development.md §6](docs/secondary-development.md#6-已有-vs-目标诚实标注) 的诚实对照为准；落地后必须同步更新 [architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标) 的「现状锚点」。

## 仓库布局

```
berkshire-agent/
├── AGENTS.md                # 本文件：仓库级 AI 契约
├── .agents/                 # AI 工作流（本技能集）
│   ├── README.md            #   技能/命名对照表 + 已强制 vs 待实现 诚实矩阵
│   └── skills/<bk-*>/SKILL.md   #   技能（中文优先）
├── apps/
│   └── berkshire-agent/     # Tauri 壳（现有骨架）+ React 前端
│       ├── src-tauri/src/   #   main/lib.rs + bridge.rs/sidecar_client.rs（T2 桥）；db/ipc/providers 为计划
│       ├── src-tauri/tauri.conf.json, capabilities/default.json
│       └── src/             #   webview: main.tsx, App.tsx（router/store/slots/client-plugins 为计划）
├── docs/                    # 目标架构文档集（中文）+ diagrams(archify 图) + reference(审计/研究)
└── packages/                # v1：headless 核心脊（@berkshire/core、@berkshire/boot）+ 插件 notify-console + bundle/{base,headless}；其余服务仍计划
```

`packages/` 的设计布局见 [docs/architecture.md §3](docs/architecture.md#3-模块地图monorepo计划布局)。

## 命令（bun 版）

当前真实可用命令（在哪个目录执行、是否真实存在，已如实标注）：

```sh
# 仓库根——根脚本可代理到重要子项目（真实存在，见各 package.json #scripts）
bun install                 # 安装依赖（bun workspaces: apps/*）
bun run dev                 # 代理 → apps/berkshire-agent dev（Vite，端口 1420）
bun run dev:docs            # 代理 → apps/docs dev
bun run build               # 代理 → apps/berkshire-agent build（tsc && vite build）
bun run build:docs          # 代理 → apps/docs build
bun run tauri:dev           # 代理 → apps/berkshire-agent tauri:dev（Tauri dev 窗口）
bun run bundle              # 代理 → apps/berkshire-agent bundle（tauri build：安装包 + 可执行文件）
bun run bundle:dir          # 代理 → apps/berkshire-agent bundle:dir（tauri build --no-bundle：仅可执行文件）
bun run test                # 代理 → packages/boot test（bun test）
bun run typecheck           # tsc -p packages/tsconfig.json --noEmit

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
- **跨边界 id 品牌化**、**事件类型化**、**服务经 `declare module` 增强到 `Context`** 均已在上文约定与对应 docs 中定义；v1 已在 `packages/core` 落地（`CapabilityId` 品牌化、`@mode emit` 事件、`declare module 'cordis'` 服务增强）；其余业务侧 id（`AssetId`/`DatasetId`/`SymbolId`）落地时代码必须遵循（当前仍为类型占位）。
- 文档以**中文为主**。文档必须诚实区分「目标态」与「已实现」，不得把示例当实现；写文档的运行/命令类声明必须可复现（[skill: bk-doc](.agents/skills/bk-doc/SKILL.md)、[skill: bk-prose-standard](.agents/skills/bk-prose-standard/SKILL.md)）。
- 术语保持本项目统一：`能力缝 seam`、`三角色 (Service Definition/Provider/Consumer)`、`dispatch 模式 (@mode)`、`profile/bundle/patch`、`单写者`、`fail-closed` 等，见 [docs/quick-reference.md](docs/quick-reference.md) 与各 doc 首部术语表。

## 如何编辑本文件

- 本文件是根级 AI 契约，改动需经评审（[skill: bk-code-review](.agents/skills/bk-code-review/SKILL.md)）。规则保持自洽且通过交叉链接指向 `docs/*.md` 或 `.agents/` 说明；不要在本文件重复展开大量实现细节。
- 每个约定都浓缩为「一条可执行的精神 + 交叉引用出处」，读者点了链接即可拿到全文证据。
- 保持「已实现 vs 目标态」诚实：**本文件当前可断言 `apps/berkshire-agent` 骨架 + `packages/` headless 核心脊 v1（`core`/`boot`/`plugins/notify-console`/`bundle`）+ 桥接协议 sidecar **T1**（`packages/sidecar`）+ **T2 的 Rust 宿主桥（`src-tauri/src/bridge.rs`/`sidecar_client.rs`）**+ **T3 的 webview 接线（`apps/berkshire-agent/src/lib/api.ts` 薄客户端 + `components/SidecarPanel.tsx` + `lib/ExtensionBoundary.tsx`，最小证明面）**为已实现**；`@berkshire/cordis` 等仍为目标态。能力一旦落地，同步把上文由「目标态」改为「已实现」并更新「现状锚点」（见 `docs/architecture.md §11`）。