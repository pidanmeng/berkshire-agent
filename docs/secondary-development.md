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

- **slot**：`ctx.slots` 声明 `FrontendSlot`（name 复用 `layout.navigation.extra` / `stock-preview.footer` / `watchlist.toolbar` / `analysis.menu` / `detail.tabs` / `settings.cards` / `chart.overlay`）。slot 组件始终包在 `ExtensionBoundary`（失败降级为 null/横幅，绝不崩宿主页）。
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

- **未实现（目标契约，不允许 import/当已存在）**：`ctx.*` 服务、`packages/`、Cordis sidecar、DuckDB 写者、rspc 桥、`bk://` 协议——均处于本文档的“目标态”。
- **已有**：`apps/berkshire-agent` 的 Tauri 2 + React + Vite 骨架（见 [architecture.md §11](architecture.md#11-关键文件索引现状--目标)）。
- **v1 已实现（headless 最小核心脊）**：见下文 [§8](#8-v1-落地说明已实现的-headless-最小核心脊)。核心脊已落三条（`ctx.log` / `ctx.capabilities` / `ctx.notifier` 能力缝）+ 第一个插件（notify-console）+ boot 装配器；`@berkshire/cordis` vendor 重命名、DuckDB 写者、Tauri 接线仍为目标态。
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
| `packages/core`（`@berkshire/core`） | `ctx.log` | sessions/log 核心脊 | 追加式内存日志；DuckDB `sessions_log` 持久化/跨重载留 v2 |
| | `ctx.capabilities` | 能力注册表与矩阵 | 注册表 + fail-closed `usable` 门控；`CAPABILITY_REGISTRY`/`build_capability_matrix` 留 v2 |
| | `ctx.notifier`（能力缝 **Definition**） | 通知能力缝 | Provider 经 `register()` 挂入、Consumer 经 `send()` 消费；duplicate/fail-closed 响亮失败 |
| | 品牌 id `CapabilityId` | 跨边界品牌化 | 已接入 `ctx.capabilities` / `capabilities/changed`；`AssetId`/`DatasetId`/`SymbolId` 为类型占位（v2 接入业务） |
| | `declare module 'cordis'` | typed events + 服务增强 | `'notify/request'`、`'capabilities/changed'` 均标注 `@mode emit` |
| `packages/boot`（`@berkshire/boot`） | `Boot` 装配器 | app-boot | `ctx.plugin()` 挂载、`dispose()` 逆序（后装先卸）；HMR 热装卸/sidecar 生命周期留 v2 |
| | `composeEntries`/`applyEntryPatches` | profile/bundle/patch 组合 | 仅支持 `insert` 与按 id 整行覆盖；`!!js` 惰性求值、dump-config、isolate/group 留 v2 |
| `packages/plugins/notify-console` | **第一个插件** | datasource/… 各插件 | 能力缝三角色之 **Provider**；inject 声明依赖、效应注册、卸载逆序清理 |
| `packages/bundle/base` | 插件 tree 的 enable 行 | bundle 分发包 | `insert` 核心脊 + notify-console |
| `packages/bundle/headless` | 行级 disable | bundle/patch 覆盖 | 按 id 整行把 notify-console 置 `disabled: true` |

### 已验证（`bun test packages/boot/test/core.test.ts`，6 用例）

1. 插件正序启动 + inject 依赖就绪（`ctx.notifier` provider 已注册）；
2. typed 事件触发与响应（`notify/request` 送达 provider + 追加进 `ctx.log`）；
3. 反序卸载清理（插件卸除后能力不可用、监听摘除、日志不增长、fail-closed）；
4. 禁用插件后能力不可用（fail-closed）+ `composeEntries` 层叠覆盖语义。

### 与目标态的差异（诚实标注）

- **底座**：v1 以 Cordis 官方包 `cordis` 为底座并对 `'cordis'` 做 `declare module`；目标态的 `@berkshire/cordis` vendor、DuckDB 单写者、Tauri（进程 A）接线、webview（进程 C）、rspc 桥、`bk://` 协议**均未实现**（v2）。
- **范围**：核心脊只落 sessions/log、capabilities、notifier(seam) 三条；database/datasets/market/slots/clientModules/scheduler 仍为目标态。
- **配置**：`composeEntries` 只实现最小区间；`dump-config`、`!!js`、`isolate/extend`、HMR 留 v2。

### 复现命令（已在本次交付跑通）

```bash
bun install
bun run packages/boot/examples/headless.ts   # 端到端样例：enable/disable 两场景
bun test packages/boot/test/core.test.ts     # 自动化测试：6 pass / 0 fail
```

> 注：[architecture.md §11](architecture.md#11-关键文件索引现状--目标) 的“现状锚点”已把 v1 的 core/boot/plugin/bundle 更新为真实文件锚点（见上表对应行），`AGENTS.md` 的「已有 / 目标态」清单也已同步。