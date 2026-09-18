# 能力缝与核心服务（`ctx.*`）

> 这是 Berkshire Agent 的**能力缝目录（目标态）**：哪些服务是核心脊柱（不可换），哪些是可替换的能力缝（seam，三角色模型），以及各自的责任、实现与消费者。结构照抄 dsh 的 [capability-seams 文档](reference/cordis-pattern-report.md#9-printed-guidance) 与 TSP 的能力注册表模型（[tick-stock-panel-contracts.md §3](reference/tick-stock-panel-contracts.md#3-capability-registry))。
>
> **能力缝 = Service Definition（服务定义，声明接口）+ Service Provider（服务提供者，实现它）+ Consumer（消费者，使用它）**。单一角色不构成缝；新增一种能力意味着把三者一起设计，否则它只是一个未落地的接口。一个 provider 的替换改变整个依赖它的产品。**Owner（=Service Definition，接口归谁声明）并不固定在中枢**：中枢只持有少量跨插件共享的产品级插口与 UI 挂点宿主，业务能力的 Definition 由对应插件端到端持有（见 §3「Definition 归属」）。

## 1. 服务角色速览

- **core（核心脊柱）**：进程必须存在、通常不可热换的通用服务；它们本身也常是“编排中枢”，不提供可替换能力。
- **seam（能力缝）**：可替换能力；通过 provider 注册（`ctx.<seam>.register(...)` 返回可撤销 disposer）。
- **Owner / Service Definition（缝的持有者）**：接口契约归谁声明。并非所有缝的 Owner 都在中枢——中枢只拥有“跨插件共享的产品级插口”（如 `ctx.ai`/`ctx.notifier`/`ctx.dataSources`/`ctx.storage`）与 **UI 挂点宿主**；领域自主能力（选股/回测/行业分析/图表…）的 Definition 由对应插件持有，其他插件仅消费（见 §3「Definition 归属」）。
- **bundle（组合点）**：只负责把一组行装进 profile 的组合插件。

> **中枢最小能力集原则**：中枢的缝尽量收缩——只固定「数据契约层（core）+ UI 挂点/路由宿主 + 少量跨插件共享的能力缝 Definition」；一切业务能力、具体页面、具体设置项、具体数据源一律由插件定义。中枢拥有的是**挂点与契约**，不是**页面/设置/功能的内容**。

## 2. 核心脊柱服务（core）

| ctx key | 责任 | 说明 |
| --- | --- | --- |
| `ctx.database` | DuckDB 访问（Rust 侧桥接 seam） | 单写者；插件/前端经它读写。返回 `ds`/datatable，覆盖 dataset 视图 |
| `ctx.datasets` | dataset/schema 注册表 | 声明 dataset_id、列定义、分区、物化策略、source、同步状态、generation marker |
| `ctx.capabilities` | 能力注册表与矩阵 | `CAPABILITY_REGISTRY` + `build_capability_matrix`；`usable` 是通用门控（继承 TSP） |
| `ctx.market` | 市场环境 / 交易日历 / symbol 解析 / 行情扇出 | 交易日、A 股北京时间、symbol↔asset_type 归属 |
| `ctx.sessions` / `ctx.log` | 追加式工作/事件日志 | 在途工作耐久记录，跨重载存活 |
| `ctx.slots` | 前端 slot 注册表 | 声明 UI slot（见 §5） |
| `ctx.clientModules` | client 插件图宿主 | 需要富 UI 的插件注册前端 bundle，经 `bk://` 提供 |
| `ctx.scheduler` | 调度 | 基于 Cordis timer 感知清理的 cron / interval / debounce |

## 3. 能力缝（seam）目录

“Owners/Providers/Consumers”三列即三角色模型。Providers 各是独立可替换包。

| ctx key | 角色 | 责任 | Providers（计划） | Consumers |
| --- | --- | --- | --- | --- |
| `ctx.dataSources` | seam | 行情/财务数据提供方统一接口 | `datasource-tickflow`、`datasource-fuyao`、`datasource-tushare`、`datasource-akshare`(python)、用户 YAML 通用 HTTP provider | 同步 job、`ctx.market`、backtest |
| `ctx.indicators` | seam | 指标/信号注册与现算 | `indicators-base`（内建 MA/EMA/MACD/BOLL/KDJ/ATR/RSI…）、用户自定义 | `ctx.screener`、`ctx.strategy`、`ctx.backtest`、图表 |
| `ctx.screener` | seam | 选股引擎（预设 + 自定义 SQL） | `screener-sql` | 前端 `/screener` |
| `ctx.strategy` | seam | 策略引擎（文件系统/注册表加载） | `strategy-builtin`、用户策略 | `ctx.backtest`、`ctx.monitor` |
| `ctx.backtest` | seam | 回测/挖掘引擎 | `backtest-local` | 前端 `/backtest`、`/mining` |
| `ctx.analysis` | core | 个股/概念/行业分析聚合（TSP 服务域迁移） | — | AI 分析、报告落盘 |
| `ctx.ai` | seam | LLM 适配器注册表 + 流式 | `ai-deepseek`、`ai-openai-compat`、`ai-ollama` | `ctx.analysis`、刷屏报告、AI 复盘 |
| `ctx.notifier` | seam | 通知渠道 | `notify-tray`、`notify-wecom`、`notify-telegram`、`notify-webhook` | 监控、同步告警、AI 复盘 |
| `ctx.monitor` | seam | 监控规则引擎 + 告警记录 | `monitor-rule-engine` | `ctx.notifier` |
| `ctx.storage` | seam | 非行情持久状态（watchlist/策略文件/报告/设置） | `storage-duckdb`、`storage-file` | 各服务 |
| `ctx.jobs` | seam | 后台任务注册表（长任务/矿工/回测） | `jobs-local` | 工具/前端 |
| `ctx.quotes` | seam | 实时行情摄入 + 扇出（批量/定节奏） | `quotes-poll`、`quotes-push` | 前端图表、`ctx.monitor` |
| `ctx.python` / `ctx.subprocess` | seam | 拉起 Python/子进程 provider（AkShare、脚本） | `runner-local` | `ctx.dataSources`（python 源）、脚本型策略 |
| `ctx.chart` | seam | 前端图表渲染器 | `chart-echarts`（默认）、`chart-lightweight`(K 线) | 前端图表组件 |

### Definition（Owner）归属：中枢 vs 插件

「Owner 归谁」按『是否跨插件共享的产品级插口 + 中枢编排是否要用』判定。中枢只持有**少量**缝的 Definition；业务能力由对应插件自行定义（仍是“无特权核心”——插件作 Owner 也只是普通插件，只是它拥有这条缝的接口，其他插件仅消费）。

| Definition 归属 | 缝 | 理由 |
| --- | --- | --- |
| **中枢**（`packages/core`） | `ctx.ai`、`ctx.notifier`、`ctx.dataSources`、`ctx.storage` | 多方消费者共享（`ctx.market`/backtest/前端都要用）、中枢编排要路由它们；接口不可热换 |
| **中枢（core，非缝）** | `ctx.market`、`ctx.datasets`、`ctx.capabilities`、`ctx.slots`/`ctx.clientModules`、`ctx.scheduler`、`ctx.log`、`ctx.analysis` | 必须在、不可热换、常是纯编排中枢 |
| **插件** | `ctx.indicators`、`ctx.screener`、`ctx.strategy`、`ctx.backtest`、`ctx.monitor`、`ctx.jobs`、`ctx.quotes`、`ctx.python`、`ctx.chart` | 领域自主能力；Definition + 参考实现 + 约定由对应插件包端到端拥有，其他插件仅消费 |

> 其中 `ctx.slots`/`ctx.clientModules` 的**挂点（壳）归中枢，挂载的 slot 组件内容归插件**：中枢定「东西挂在哪、叫什么、接口长什么样」，不实现任何业务 UI。

> 注：`ctx.analysis`/`ctx.market`/`ctx.datasets` 等标 core 的服务，其“外部数据/模型行为”仍应通过 seam 提供（如分析调用 `ctx.ai`、市场读取 `ctx.dataSources`），从而保持“核心脊柱只编排、不闷头实现某个厂商能力”。

## 4. 能力注册、能力矩阵与 fail-closed

**能力 = 一个标准化数据集**（继承 TSP [capabilities.py 语义](reference/tick-stock-panel-contracts.md#3-capability-registry)）。每个能力独立路由（无“跟随日K”耦合）。

- `CAPABILITY_REGISTRY`：能力 id → dataset、展示元数据、路由偏好字段、可用级。能力集（计划）：`daily / adj_factor / realtime / minute / depth5 / financial / full_minute`。
- `build_capability_matrix(current, tier)`：合并注册表 + 每个 provider 声明的 `datasets` + 当前偏好 → 每个能力 `{usable, effective, candidates, pending}`。
  - `candidates` = 现在真正提供该能力的源；`pending` = 已注册但未就绪（缺依赖/未配 key）并给理由；`usable` = effective 源是否在 candidates 中。
  - **所有功能门控以 `usable` 为准**，而非某个 tier/计划视图。
- **fail-closed 红线**：provider 缺能力/字段缺失/空数据时必须显式提示或降级，**禁止静默返回看似合理的错误金融结果**。

## 5. 事件（类型化，五种派发模式）

用 `declare module '@berkshire/cordis'` 增强 `interface Context` 与 `interface Events`，并用 `@mode` JSDoc 标注派发模式（照抄 dsh [typed events](reference/cordis-pattern-report.md#5-typed-events))：

```ts
declare module '@berkshire/cordis' {
  interface Context { dataSources: DataSourceSeam }
  interface Events {
    /**
     * 数据源同步完成后的耐久事件。
     * @mode emit
     */
    'market/kline-updated'(payload: { dataset: DatasetId; symbol: SymbolId; latestDate: string }): void
    /**
     * 一次行情请求/同步前的拦截点（策略/策略门控）。
     * @mode waterfall
     */
    'datasource/pre-fetch'(payload: FetchRequest, next: () => Promise<FetchResult>): Promise<FetchResult>
  }
}
```

| 模式 | 是否 await | 语义 | 典型 |
| --- | --- | --- | --- |
| `emit` | 否 | 所有监听器观察 | `market/kline-updated`、`market/quote-updated` |
| `waterfall` | 否 | 管道，监听器必须 `next()` 委托 | `datasource/pre-fetch`、`ai/pre-request`、`backtest/pre-run` |
| `parallel` | 是 | 并发，全部 settle | `notify/broadcast`、`indicator/synced` |
| `serial` | 是 | 按序，直到返回 bail 值中止 | `analysis/run`（首个确定结果即停）|
| `bail` | 否 | 同步竞态，任一确定即停 | `datasource/authenticate`（多个源都能认证）|

事件域三层（耐久 / 在途 / 能力策略）见 [architecture.md §5](architecture.md#5-事件领域三层分明)。对 downstream 的约束（waterfall 必须 `next()` 等）见 [secondary-development.md](secondary-development.md)。