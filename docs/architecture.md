# Berkshire Agent 架构文档

> 本文档是 **Berkshire Agent**（下称 **BK**，A 股投研桌面工作台）的**目标架构目录**：描述计划中的系统整体架构、运行时拓扑、模块地图、数据流、事件、存储、可扩展模型与生命周期。本文以 **Cordis 方法论**（时空可组合性）为内核，复用 [DeepSeek Harness (dsh)](../README.md) 的 Cordis 落地模式，并继承 [Tick Stock Panel (TSP)](reference/tick-stock-panel-contracts.md) 的投研领域模型与数据契约。
>
> - 本文描述的是**设计契约（目标态）**，不是当前已实现代码。仓库现有内容为 Tauri 2 + React 骨架（`apps/berkshire-agent`）+ headless 最小核心脊 v1（`packages/core`、`packages/boot`、`packages/plugins/notify-console`、`packages/bundle/{base,headless}`，见 [secondary-development.md §8](secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)）+ 桥接协议 sidecar **T1**（`packages/sidecar`，stdio JSON-RPC 长驻进程，见 [packages/sidecar/README.md](../packages/sidecar/README.md)）+ **T2 的 Rust 宿主桥**（`apps/berkshire-agent/src-tauri/src/bridge.rs`/`sidecar_client.rs`：拉起/restart sidecar + 把事件转发到 Tauri events）；`packages/` 的其余布局仍为计划。**不得把本文示例当实现**；能力边界与二开契约见 [secondary-development.md](secondary-development.md)。
> - 证据与锚点：Cordis 方法论见 [reference/cordis-methodology.md](reference/cordis-methodology.md)（已随任务提供）；dsh 的模式审计见 [reference/cordis-pattern-report.md](reference/cordis-pattern-report.md)；TSP 契约审计见 [reference/tick-stock-panel-contracts.md](reference/tick-stock-panel-contracts.md)；Tauri/DuckDB/运行时选型研究见 [reference/tauri-duckdb-plugin-runtime.md](reference/tauri-duckdb-plugin-runtime.md)。

## 0. 文档目录

| 文档 | 受众 | 说明 |
| --- | --- | --- |
| [architecture.md](architecture.md)（本文） | 开发者 | 运行时拓扑、模块地图、数据流、事件、存储、扩展模型、生命周期 |
| [capability-seams.md](capability-seams.md) | 开发者 | `ctx.*` 能力缝目录（三角色模型） |
| [plugin-development.md](plugin-development.md) | 插件作者 | 5 个上手教程：加数据源 / 加指标 / 加分析页 / 加 UI slot / 加 AI 适配器 |
| [config.md](config.md) | 开发者/用户 | profile / bundle / patch 组合配置层 |
| [data-model.md](data-model.md) | 开发者 | DuckDB schema、dataset 注册表、缓存分层、数据契约红线 |
| [secondary-development.md](secondary-development.md) | 开发者 | 下游开发约束、L1/L2/L3 分级、验证矩阵 |
| [quick-reference.md](quick-reference.md) | 开发者 | “新行为放哪”速查表（目标 → 机制/扩展点） |

## 1. 定位与技术栈

BK 是自托管、桌面优先的 A 股「投研 + 选股 + 回测」工作台：多数据源按能力独立路由、分钟级数据管道、全时段异动监控、AI 辅助研究。**一切部件都是插件**：数据源、指标、选股/回测策略、分析页、图表渲染器、AI 适配器、通知渠道都可从配置替换。

| 层 | 选型 |
| --- | --- |
| 桌面壳（宿主进程） | **Tauri 2**（Rust）——窗口、webview、唯一 DuckDB 写者、原生能力提供者 |
| 持久化/查询 | **DuckDB**（`duckdb` crate，`bundled` 特性，`spawn_blocking`） |
| 插件内核 | **Cordis**（vendor 为 scoped `@berkshire/cordis`），运行在 **Bun 编译的 sidecar** 内 |
| 前端 | React 19 · TypeScript · Vite · **zustand** · **ECharts**（默认图表）+ `ctx.chart` 自定义渲染器 |
| 前后端桥 | **rspc/specta**（`specta-rs/tauri2`，类型化 invoke）+ Tauri events（高吞吐流） |
| sidecar ↔ Rust | 换行分隔 JSON-RPC（stdio），经 `tauri-plugin-shell` 拉起并受 capabilities 约束 |
| Python 能力（可选） | 经 `ctx.subprocess`/`ctx.python` seam 拉起（AkShare 等 Python-only 数据源） |

**为什么是“Rust 宿主 + 三进程”而不是纯 Rust 插件内核**：Cordis 的“运行时不重启热装卸 + 可逆效应 + 响应式 DI”是 JS 生态的成熟成果；而 Rust 动态库插件受“无稳定跨 crate ABI”约束，等价实现要手写 FFI 契约 + DI + 效应追踪，代价极高（研究结论见 [tauri-duckdb-plugin-runtime.md](reference/tauri-duckdb-plugin-runtime.md#4-a-rust-native-plugin-runtime--realistic)）。故 Rust 是**安全宿主 + 原生 provider + 分析/存储层**，Cordis 是**插件 VM**。这正是 dsh 用 Electron/Node 承载 Cordis 的模式平移到 Tauri。

## 2. 运行时拓扑

```
┌────────────────────────────────────────────────────────────────────────┐
│ 进程 A · Tauri 2 Rust 宿主                                              │
│  ├─ 窗口/托盘/通知/文件选择器（原生）                                    │
│  ├─ db.rs    —— duckdb-rs 单写者（spawn_blocking, 持有 .duckdb 文件）    │
│  ├─ providers/{fs,net,sched,notify}.rs —— 原生能力 provider             │
│  ├─ ipc.rs   —— rspc/specta 类型化命令 + Tauri event 广播               │
│  └─ bridge.rs —— 管理 sidecar 生命周期 + stdio JSON-RPC                │
└───────────▲───────────────────────────▲─────────────────────────────────┘
            │ rspc invoke / Tauri events  │ stdio JSON-RPC（newline JSON）
┌───────────┴────────────────┐   ┌─────────┴───────────────────────────────┐
│ 进程 C · React webview     │   │ 进程 B · Bun sidecar · Cordis 运行时      │
│  zustand 状态 / ECharts    │   │  new Context() + loader/HMR              │
│  slots(UI 插槽) / client    │   │  插件树 / ctx.* 服务注册表 / 类型化事件   │
│  插件图(bk:// 协议)         │   │  ctx.effect 可逆效应 / inject 响应式依赖   │
└────────────────────────────┘   │  profile/bundle/patch 配置组合            │
                                 └──────────────────────────────────────────┘
```

- **进程 B（Cordis 运行时）**是插件的“大脑”与唯一编排者；**进程 A（Rust）**独占 DuckDB（单写者），并实现原生能力 provider。
- 进程间的“能力缝”三角色：**Service Definition**（在 Cordis 侧声明接口）→ **Service Provider**（在 Rust provider 或 Cordis 插件中实现）→ **Consumer**（多为模型/前端/策略使用的对象）。一次 provider 替换改变整个产品。
- 高吞吐行情：**不在每个 tick 全链路推送**，批量落库 + 固定节奏发序列（Rust → Tauri event → webview zustand → ECharts）；避免 sidecar 多一跳的逐 tick 开销（研究结论 [§5](reference/tauri-duckdb-plugin-runtime.md#5-data-flow-for-streaming-quotescharts)）。

**进程 B 与进程 A 的归属原则（无特权核心）**：进程 B 负责一切“可被插件替换的逻辑”（数据源、指标、策略、分析、AI、通知），进程 A 只保留“不可/不需热换的薄原生”与“单写者存储”。Host 侧也保持可换——但换 Host provider 需重编译，故其边界被刻意压到最薄。

### 备选：Option A（文档附录，不在本期实现）

详见 [tauri-duckdb-plugin-runtime.md](reference/tauri-duckdb-plugin-runtime.md#recommendation-sketch)：若“数据 + UI 插件同进程一致性”的收益大于“Rust 独占 DB”，可退化为 `DuckDB-Wasm + Cordis 全在 webview` 的单进程方案；代价是可能引入双数据库引擎。本期以 **Option B**（本拓扑）为准。

## 3. 模块地图（monorepo，计划布局）

```
berkshire-agent/
├── docs/                      # 本文档集 + diagrams(archify 图) + reference(审计/研究)
├── apps/
│   └── berkshire-agent/       # Tauri 壳（现有骨架）+ React 前端
│       ├── src-tauri/src/     #   main/lib.rs, db.rs, bridge.rs, ipc.rs, providers/
│       ├── src-tauri/tauri.conf.json, capabilities/default.json
│       └── src/               #   webview: main.tsx, router, lib/api(rspc), store(zustand), slots/, client-plugins/
└── packages/                  # v1：headless 核心脊（core/boot/plugins/notify-console/bundle）已落地；其余仍为计划（scoped @berkshire/*）
    ├── boot/                  #   app-boot(profile/bundle/patch 组合 + dump-config)
    ├── core/                  #   database, datasets, capabilities, market, sessions/log, slots, clientModules, scheduler
    ├── datasource/            #   ctx.dataSources seam + providers(tickflow, fuyao, tushare, akshare…)
    ├── indicators/            #   ctx.indicators seam + 内置指标
    ├── domain/                #   screener, strategy, backtest, analysis, monitor
    ├── ai/                    #   ctx.ai seam + adapters(deepseek, ollama…)
    ├── notify/                #   ctx.notifier seam + providers(wecom, telegram, webhook, tray)
    ├── client/                #   client 插件图宿主 + slot 声明(sidecar→webview 转发)
    ├── sidecar/               #   Bun sidecar 长驻进程 + stdio JSON-RPC（T1 物化；桥接协议 T0 契约见 packages/sidecar/README.md）
    └── bundle/                #   base / desktop-app / headless / sdk-minimal(profile 模板)
```

布局取舍照抄 dsh 的模式（[reference/cordis-pattern-report.md](reference/cordis-pattern-report.md#2-how-cordis-is-vendored--used)）：**Cordis 以 scoped 名 vendored**（`@berkshire/cordis`，绝不裸 `cordis`），并结合 `packages/*/*` 两级分类。

> 注意：v1 为落地最小核心脊**暂以官方包 `cordis` 为底座**并对 `'cordis'` 做 `declare module`；`@berkshire/cordis` vendor 重命名属 v2，差异见 [secondary-development.md §8](secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)。

## 4. 端到端数据流（主路径）

```
数据源 provider（tickflow / fuyao / tushare / akshare / 用户YAML）
  --ctx.dataSources--> 同步 job（订 ctx.scheduler）--> 校验/归一化（统一 schema）
  --> ctx.database（Rust duckdb-rs，单写者，spawn_blocking）--> generation marker 原子发布
  --> ctx.market 广播 market/kline-updated（耐久事件）
  --> ctx.indicators 现算派生指标（needed 依赖闭包裁剪）
  --> ctx.screener / ctx.strategy / ctx.backtest 消费
  --> 热路径：Rust emit → Tauri event → webview zustand → ECharts（批量/定节奏）
```

- **禁止**绕过 `ctx.dataSources`/`ctx.database` 直接读外部源或裸写 DuckDB；API/RPC 层是薄胶水。
- **缓存失效链（写路径必须核对）**：DuckDB 文件 → Rust 热缓存（kline 最新快照/实时聚合）→ generation → 事件 → 前端 query 失效。多步刷新优先构建新快照后原子替换，禁止“已写文件但返回旧内存对象”（继承 TSP 红线，见 [data-model.md](data-model.md#缓存失效链)）。

## 5. 事件领域（三层分明）

事件是扩展点，**选中对的领域是大多数修改的第一个决定**（照抄 dsh 三层模型，[architecture.md 引用](reference/cordis-pattern-report.md#9-printed-guidance)）：

- **耐久数据事件**：`market/*`（`kline-updated`、`quote-updated`、`calendar-changed`）→ 落库/日志，跨重载存活；用于必须跨 reload 存活的事实。
- **在途工作事件**：`sync/*`、`analysis/*`、`backtest/*`、`screen/*` → 携带活句柄；用于观察或拦截在途工作。
- **能力策略事件**：`datasource/*`、`indicator/*`、`ai/*`、`notify/*` → 把策略与适配器挂到能力缝而不引循环。

**派发模式**（Cordis 五种，`declare module` 增强 + `@mode` JSDoc 标注）：`emit`（观察）/`waterfall`（管道，监听器必须 `next()`）/`parallel`（并发）/`serial`（按序中止）/`bail`（竞态即停）。详见 [capability-seams.md](capability-seams.md#事件)。

## 6. 存储与缓存分层

| 层 | 机制 | 位置 |
| --- | --- | --- |
| 持久化 | DuckDB `.duckdb` 文件（单写者，Rust）；大 L1 数据集可选 Parquet + `CREATE VIEW ... read_parquet` 视图 | `db.rs` + dataset 物化策略 |
| dataset/schema 注册表 | meta 表：dataset_id、列定义、分区、物化策略、source、同步状态、generation | `ctx.datasets` |
| 仓库热缓存 | Rust 内存缓存（kline 最新快照、实时聚合） | `db.rs`/`ctx.market` |
| 指标 | 窄表存储基点 + 指标现算（needed 闭包裁剪） | `ctx.indicators` |
| 前端 | zustand（scope 化）+ Tauri event 失效 | webview |

完整 schema 与数据契约红线见 [data-model.md](data-model.md)。

## 7. 扩展模型（三端可扩展，达成“一切都可扩展”）

| 扩展维度 | 机制 | 落地文档 |
| --- | --- | --- |
| 数据可扩展 | dataset 注册（`ctx.datasets`）+ 数据源 provider（`ctx.dataSources` seam）+ 同步 job + 指标插件（`ctx.indicators`） | [data-model.md](data-model.md)、[plugin-development.md](plugin-development.md#加一个数据源) |
| 界面可扩展 | Declarative slot（`ctx.slots`，`ExtensionBoundary` 隔离）+ client 插件图（`ctx.clientModules`，`bk://` 协议）+ 图表 seam（`ctx.chart`）+ router/menu 注入 | [plugin-development.md](plugin-development.md#加一个-ui-slot) |
| 能力可扩展 | 能力缝三角色模型（Service Definition / Provider / Consumer）+ 类型化事件 + 受 capabilities 约束的 Rust 命令 | [capability-seams.md](capability-seams.md)、[quick-reference.md](quick-reference.md) |
| 配置可扩展 | profile / bundle / patch 分层叠加 + `dump-config` 等价命令 | [config.md](config.md) |

**黑盒纪律**：一个 provider 的替换改变整个产品（如换掉 `ctx.dataSources` provider，日K/分钟/实时/除权一起迁移），这是能力缝设计的收益而非缺陷。

## 8. 插件形态与生命周期

插件三种形态（函数 / 类 Service / 对象），核心是 `inject` + `Config` + `apply`，照抄 dsh 模式（[cordis-pattern-report.md](reference/cordis-pattern-report.md#4-plugin-metadata)）：

```ts
import { z } from 'zod'
export const inject = ['database', 'datasets']
export const Config: z.ZodType<Config> = z.object({ ... })   // standard-schema 校验，fail loud
export function apply(ctx: Context, config: Config) {
  ctx.provide('myService', ...)                 // 服务用 key 暴露
  ctx.on('market/kline-updated', cb)            // 事件即注册（effect）
  return () => { /* disposer */ }               // 必须返回清理函数（可逆效应）
}
```

**Fiber 状态机**（`ctx.plugin()` 返回 Fiber）：`PENDING`（依赖未齐，静默等待）→ `LOADING` → `ACTIVE` → `UNLOADING → DISPOSED`，任何失败/依赖消失均回 `FAILED/UNLOADING`。`fiber.dispose()/restart()/update(config)` 支撑运行时不重启热装卸。本图见 [diagrams/lifecycle.html](diagrams/lifecycle.html)。

## 9. 配置层（profile / bundle / patch）

运行中的 BK 是启动时由有序层组合出的插件树。用户/开发者只需在自己的 `$BERKSHIRE_HOME` 里叠加 patch。

- **profile**：命名的组合（`desktop` / `headless` / `sdk-minimal` 为模板），列出叠加的 bundle、持有的外部插件、用户自己的 `cordis.patch.yml`。
- **bundle**：Cordis 配置行 + 所挂代码的分发格式，保证其插入的行可被上方层 patch（层叠顺序：bundle 顺序 → profile patch → home 层 → `--patch` overlay；patch 按 `id` **整体替换**该行配置或插入新行）。
- **`dump-config` 等价命令**：打印某台机器/Agent 启动时加载的插件树；打印出的任一行都可用自己的 patch 覆盖。

详见 [config.md](config.md)。运行机制见 [diagrams/sequence.html](diagrams/sequence.html)。

## 10. 生命周期与调度

- 启动：Rust 宿主拉起 → 开 DuckDB → 拉起 sidecar（Cordis boot，组合 profile/bundle/patch）→ 服务就绪（`inject` 反应式激活）→ webview 挂载。
- 同步调度：`ctx.scheduler`（基于 Cordis timer）驱动数据源同步 job（交易日维度同步、盘后管道、周期能力重探测）；交易日历由 `ctx.market` 提供。
- 关闭：sidecar tremor 清理栈（逆序跑每个 disposer）→ Rust 落 DuckDB checkpoint → 关 webview/窗口。
- 热更新：plugin 文件变化 → HMR 驱动器原位 fiber `restart/update`，进程不重启、无泄漏。

## 11. 关键文件索引（现状 → 目标）

| 主题 | 现状锚点 | 目标位置（计划） |
| --- | --- | --- |
| Tauri 装配 | [lib.rs](../apps/berkshire-agent/src-tauri/src/lib.rs) · [main.rs](../apps/berkshire-agent/src-tauri/src/main.rs) · [bridge.rs](../apps/berkshire-agent/src-tauri/src/bridge.rs) · [sidecar_client.rs](../apps/berkshire-agent/src-tauri/src/sidecar_client.rs)（T2 桥） | + `db.rs` / `ipc.rs` / `providers/` |
| Tauri 配置/能力 | [tauri.conf.json](../apps/berkshire-agent/src-tauri/tauri.conf.json) · [capabilities/default.json](../apps/berkshire-agent/src-tauri/capabilities/default.json) | + sidecar/externalBin + 自定义协议 `bk://` |
| 前端壳 + T3 webview 接线（v1） | [src/main.tsx](../apps/berkshire-agent/src/main.tsx) · [src/App.tsx](../apps/berkshire-agent/src/App.tsx) · [src/lib/api.ts](../apps/berkshire-agent/src/lib/api.ts)（含 `clientList()`/`onClientChanged()`/`routesList()`）· [src/lib/ExtensionBoundary.tsx](../apps/berkshire-agent/src/lib/ExtensionBoundary.tsx) · [src/components/SidecarPanel.tsx](../apps/berkshire-agent/src/components/SidecarPanel.tsx)（薄客户端 + 最小 demo 面板） | + store / client-plugins 目录 |
| webview 本地 slot 宿主（T0） | [src/slots/](../apps/berkshire-agent/src/slots/)（`SlotRegistry`/校验/`ExtensionSlot`/降级 + `useSyncExternalStore` 反应式订阅 · 类型化 context map）`bun test src/slots/registry.test.ts` | + store 作用域 |
| client 插件图最小链路（T1） | [src/client/](../apps/berkshire-agent/src/client/)（`ClientModuleHost.tsx`/`loader.ts`：模块映射 + `<style data-bk-module>` scoped 注入宿主；demo 组件源码的**家在插件包**，见下行）· [packages/core/src/services/{slots,clientModules}.ts](../packages/core/src/services/clientModules.ts)（`ctx.slots`/`ctx.clientModules` Definition + `client/changed`）· sidecar `client/list` · Rust `client_list` command | + `bk://` 远程 bundle / HMR / 生产样式分发 |
| 动态路由/页面（能力块 B，路由契约化） | [src/routes/](../apps/berkshire-agent/src/routes/)（`routesStore`/`RouteSync`/`ExtensionRoute`，`useSyncExternalStore` 反应式）· [src/main.tsx](../apps/berkshire-agent/src/main.tsx)（`HashRouter`）+ [src/App.tsx](../apps/berkshire-agent/src/App.tsx)（核心路由 `/`、`/settings` + 插件自声明动态路由）· [packages/core/src/services/slots.ts](../packages/core/src/services/slots.ts)（`Slots.routes()`：**任意 slot** 带 `route` 的声明汇总，含 slot 归属 + `CORE_ROUTE_PATHS`/静态/全局 path 唯一校验）· sidecar `routes/list` · Rust `routes_list` command | **已知限制（最小件）：`ExtensionRoute` 渲染 `route.slot` 槽的并集、不按 `route.id` 筛选——同一个 slot 被多个带 `route` 声明复用时各页内容互串**，见 [src/routes/ExtensionRoute.tsx](../apps/berkshire-agent/src/routes/ExtensionRoute.tsx)，v-next 修；另有 `CORE_ROUTE_PATHS` 与 webview 核心路由双端各一份的一致风险。+ 全量 layout/menu 注入 / store 作用域 |
| demo 插件（T3，能力块 A/B/C 一体化） | [packages/plugins/demo/src/index.ts](../packages/plugins/demo/src/index.ts)（`@berkshire/plugin-demo`：footer + toolbar 组件 + 资金流向页 + scoped 样式，`inject: ['slots','clientModules','log']`）· [packages/bundle/demo/cordis.patch.yml](../packages/bundle/demo/cordis.patch.yml)（enable）+ [packages/bundle/demo-off/cordis.patch.yml](../packages/bundle/demo-off/cordis.patch.yml)（disable）· [packages/plugins/demo/examples/smoke.ts](../packages/plugins/demo/examples/smoke.ts)（boot 级 enable/disable 复现）· **webview 半身随插件包走**：[packages/plugins/demo/src/client/](../packages/plugins/demo/src/client/demoFundFlow.tsx)（`DemoFundFlow`/`DemoWatchlistToolbar`/`DemoMoneyFlow` + 前端 scoped 样式单一来源 `styles.ts`，经 `@berkshire/plugin-demo/client` 入口 static import；style 也经 sidecar 注册进 `client/list`）。sidecar 装配叠入 demo bundle（`packages/sidecar/src/index.ts`），`process.test.ts` 断言卸除顺序 `demo -> notify-console -> core` | + `bk://` 远程 bundle / HMR / 生产样式分发包 |
| 组件库依赖 | [package.json](../apps/berkshire-agent/package.json) | + zustand / echarts / rspc 客户端 |
| dev 态插件热更（仅 dev，T3-dev） | [packages/sidecar/src/dev_watch.ts](../packages/sidecar/src/dev_watch.ts)（`fs.watch` 递归监控 core 编织/插件 `src/index.ts`/样式 `src/client/*.ts`/bundle patch，排除组件 `.tsx`）· [packages/sidecar/src/index.ts](../packages/sidecar/src/index.ts)（`BK_DEV_HOTRELOAD=1` 时附加 watcher，变更推 `dev/reload-requested`）· [bridge.rs](../apps/berkshire-agent/src-tauri/src/bridge.rs)（后台线程收事件 → `restart()` 重装配 → 推 `sidecar://client/changed`）· [sidecar_client.rs](../apps/berkshire-agent/src-tauri/src/sidecar_client.rs)（debug 构建注入 `BK_DEV_HOTRELOAD`）。组件 `.tsx` 归 webview Vite Fast Refresh（不经此）；release/生产不注入、不发事件（惰性） | + 正式 bundle 注入 / `bk://` 远程拉取 + HMR |
| 核心脊装配（v1 headless） | [core/src/core.ts](../packages/core/src/core.ts) · [boot/src/index.ts](../packages/boot/src/index.ts) | + Cordis vendor 重命名（v2） |
| 桥接协议 sidecar（T1 落地） | [packages/sidecar/src](../packages/sidecar/src/index.ts) · [examples/smoke.ts](../packages/sidecar/examples/smoke.ts)（含 `client/list`、`routes/list`） | （T3 webview 接线已落地；T4 完整 E2E） |
| T2 Rust 宿主桥（落地 v1） | [bridge.rs](../apps/berkshire-agent/src-tauri/src/bridge.rs) · [sidecar_client.rs](../apps/berkshire-agent/src-tauri/src/sidecar_client.rs)（拉起/restart + 事件转发到 Tauri events + 最小 `tauri` command 命令面） | + rspc/specta typed bridge |
| `ctx.log`（v1 内存） | [core/src/services/log.ts](../packages/core/src/services/log.ts) | + DuckDB `sessions_log` 持久化 / 跨重载（v2） |
| `ctx.capabilities`（v1） | [core/src/services/capabilities.ts](../packages/core/src/services/capabilities.ts) | + `CAPABILITY_REGISTRY` / `build_capability_matrix`（v2） |
| `ctx.notifier` 能力缝（v1） | [core/src/seams/notify.ts](../packages/core/src/seams/notify.ts) · [plugins/notify-console/src/index.ts](../packages/plugins/notify-console/src/index.ts) | + per-channel 路由 / 并行 mode（v2） |
| 类型化事件 / 服务增强 | [core/src/events.ts](../packages/core/src/events.ts)（`declare module 'cordis'`） | 迁到 scoped `@berkshire/cordis`（v2） |
| bundle 配置层（v1） | [bundle/base/cordis.patch.yml](../packages/bundle/base/cordis.patch.yml) · [bundle/headless/cordis.patch.yml](../packages/bundle/headless/cordis.patch.yml) | + `!!js` / dump-config / isolate（v2） |
| Cordis 底座 | 官方包 `cordis`（v1，见 §8 差异） | `vendor/cordis`（scoped `@berkshire/cordis`） |
| 能力缝目录 | — | capability-seams.md |
| 插件教程 | — | plugin-development.md |

> 维护约定：本文描述**目标架构**；当某能力落地到代码后，应把“现状锚点”栏更新为真实 `文件:行号`，保持“一直反映最新目标 + 标注哪些已实现”的纪律。