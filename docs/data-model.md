# 数据模型与数据契约

> Berkshire Agent（BK）的**基座是数据**：一切分析系统都建立在可扩展、可追溯的数据之上。本文定义 DuckDB 的目标 schema、dataset 注册表、缓存分层与**数据契约红线**。模型继承自 TSP 的投研口径（[reference/tick-stock-panel-contracts.md](reference/tick-stock-panel-contracts.md)），并在桌面场景下把“内存 DuckDB 视图”升级为“文件 DuckDB 单写者”。

## 1. 核心设计决策

1. **单写者**：只有 Rust（`db.rs`，`duckdb-rs`）写 DuckDB `.duckdb` 文件；插件/前端一律经 `ctx.database` 或 Rust command 读写。写路径：provider → 同步服务 → DuckDB（`spawn_blocking`）→ generation 原子发布 → 事件广播。
2. **物化策略二选一（每 dataset 声明）**：
   - `embedded`：直接落 `.duckdb` 表（中小型、需实时写/一致性）。
   - `parquet-view`：落 Parquet，DuckDB 用 `CREATE OR REPLACE VIEW <name> AS SELECT * FROM read_parquet('<dir>/**/*.parquet', union_by_name=true)`（大 L1 历史数据集，继承 TSP 的 parquet 分区 + 视图模式）。
3. **窄表存储 + 派生现算**：指标只存基点列，派生列按 `needed` 依赖闭包现算（继承 TSP [pipeline.py](reference/tick-stock-panel-contracts.md#4-indicator-pipeline)）。

## 2. dataset/schema 注册表（meta 表，`ctx.datasets`）

每个 dataset 登记一份声明，驱动表/视图创建、分区、物化、同步、门控，以及**覆盖日期**元模型：

```yaml
dataset:
  id: kline_daily
  materialization: parquet-view      # embedded | parquet-view
  partition: { column: date, pattern: "date=YYYY-MM-DD" }
  columns:                            # 标准列（见 §3）
    - symbol/asset_type/source/date/open/high/low/close/volume/amount/pre_close/change_pct
  columnSchema:                       # 显式列类型契约（标识/时间 VARCHAR，数值 DOUBLE）
    - { name: symbol, type: VARCHAR }
    - { name: date,   type: VARCHAR }
    - { name: close,  type: DOUBLE }
  source: { field: daily_data_provider, default: tickflow }
  sync: { cadence: daily, window: 60d, fullWindow: 60d }
  generation: true                    # 维护原子发布标记
# 覆盖日期记录 DatasetCoverage（契约类型）：
#   { dataset, minDate, maxDate, tradingDays?, rows, source, materialization,
#     recordedAt, coverageStart?, isComplete? }
```

统一交叉资产视图用 `UNION ALL BY NAME` 补字面列 `asset_type` / `source`（继承 TSP [unified views](reference/tick-stock-panel-contracts.md#1-storage--query)）。

> **已实现（契约层，S1 数据模型规范化）**：`packages/core` 已声明**八组基础数据 + 实时快照**的
> 规范化列/显式列类型（[dataContract.ts](../packages/core/src/dataContract.ts) 的 `*_COLUMNS` 常量 +
> `columnSqlType`）、`DatasetDeclaration`（`materialization`/`partition`/`generation`/`columnSchema`/`sync`，
> [services/datasets.ts](../packages/core/src/services/datasets.ts)）、以及**覆盖日期元模型
> `DatasetCoverage`**。本层只做契约/类型/声明（含 `packages/core/test/` 契约测试）；parquet-view
> 物化、generation 运行时执行、覆盖日期**运行时记录**（`S2-coverage-date-registry`）及建表/同步仍属
> 目标态（归 S2/S3）。
>
> **已实现（S2-enriched-ohlev-indicator）**：`enriched` **生成与落库已落地**——sidecar 常驻一个
> **derived provider**（[enriched.ts](../packages/sidecar/src/enriched.ts) 的 `createEnrichedProvider`）：
> `data-sources/sync` 对 `enriched` 时读已落库 `daily`（原始日K）+ `adj_factor`（除权因子）表 →
> [dataContract.ts](../packages/core/src/dataContract.ts) 的 `toEnrichedRows`（**停牌日剔除 + 前复权
> `adj=raw/Π(事件后 ex_factor)`** + 窄表基点列，派生指标不落宽表）→ 经既有单写者写路径
> （parquet-view 物化 / 覆盖登记 / `database/dataset-updated` 全部复用 runDatasetSync）。技术指标
> （MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率）由 **`ctx.indicators` 能力缝**（core
> [services/indicators.ts](../packages/core/src/services/indicators.ts) + 纯函数库
> [indicators.ts](../packages/core/src/indicators.ts)）**按需现算、不落表**，协议
> `data-sources/enriched-indicators` 提供读取面。

> **已实现（S2 扩展缝，dataset-extension-seam）**：`ctx.datasets.register(decl)` 从「只登记」升级为
> **staged 注册 + 可逆**——重复 id / 非法列名（含保留字）/ 非法物化 / 版本不匹配在**写入前**全量校验，
> 任一失败即响亮抛错、**不留半注册残留**；`register` 返回可撤销 disposer（插件卸载连带撤销其数据组）。
> 任何 Cordis 插件可经 `ctx.datasets.register` + `ctx.dataSources.register` 新增数据组，端到端落入
> 同步/查询/覆盖登记链路（参考插件 `@berkshire/plugin-datasource-example`：`sector_momentum` embedded +
> `factor_pnl` parquet-view，见 [plugin-development.md](plugin-development.md#15-加一个新数据组扩展缝)。）。
> **覆盖日期登记 seam 已落地**：core `ctx.datasets.registerCoverage/recordCoverage/reportCoverage`
> （Definition + `datasets/coverage-updated` @mode emit），sidecar
> [coverage-provider.ts](../packages/sidecar/src/coverage-provider.ts) 写 `dataset_coverage` 元表
> （单写者经 `ctx.database.exec`，幂等更新）。`sync.ts` 写路径已收敛到 `DatasetDeclaration.columnSchema`
> （接 `columnSqlType` 单一事实源），并按声明支持 **embedded**（建表 + 事务整表替换）与 **parquet-view**
> （staging 表 → `COPY` 出 parquet 快照 → `CREATE OR REPLACE VIEW ... read_parquet`）；分区多文件粒度仍 S3。
>
> **已实现（S2-coverage-date-registry）**：覆盖登记的**读 API / 手动重算 / 缺洞自检**落地——
> sidecar 协议新增 `data-sources/coverage`（全部声明数据组的覆盖快照，未登记 → `covered:false`，fail-closed
> 不伪造）、`data-sources/coverage-refresh`（[coverage-utils.ts](../packages/sidecar/src/coverage-utils.ts)
> `rescanAndRecordCoverage` 重扫实际落库表 min/max/rows 后重新登记，校准外部/旧版本写入；来源取已登记记录
> 优先否则当前可解析 provider，两者皆无可解析 → 响亮拒绝）、`data-sources/coverage-gaps`（**最小面缺洞钩子**：
> 比对目标窗口 vs 实际 `min/max` 输出缺失区间，按**日历日**粒度；**交易日语义细化**（跳过非交易日）+ 缺洞
> 驱动自动补齐执行仍属 S3）；`data-sources/list` 快照并入 `coverage`（页面一次拉齐）。webview 侧 Rust 桥新增
> `data_sources_coverage`/`coverage_refresh`/`coverage_gaps` command；数据管理页「覆盖日期」区展示每组
> min~max/行数/来源/最近登记 + 「重算」。测试 [packages/sidecar/test/coverage.test.ts](../packages/sidecar/test/coverage.test.ts)
> （真实 DuckDB：写路径登记 / 读路径 / 重复同步不累积 / 重算 / 缺洞 / fail-closed）+ `coverageGaps` 纯函数。
> 诚实边界：`generation` 原子发布、`dataset_coverage` 分区分文件、交易日语义缺洞仍 S3。

## 3. 标准/归一化列（继承 TSP schemas；S1 已在 [dataContract.ts](../packages/core/src/dataContract.ts) 声明）

| schema | 列 |
| --- | --- |
| `INSTRUMENT_COLUMNS` | `symbol, name, exchange, asset_type, source, list_date, status` |
| `DAILY_COLUMNS` | `symbol, asset_type, source, date, open, high, low, close, volume, amount, pre_close, change_pct` |
| `ADJ_FACTOR_COLUMNS` | `symbol, asset_type, source, trade_date, ex_factor` |
| `ENRICHED_STORAGE_COLS`（窄表） | `symbol, date, open, high, low, close(前复权), volume, amount, raw_close/high/low(不复权), turnover_rate, consecutive_limit_ups/downs, quote_ts` |
| `INDEX_COLUMNS` | `index_code, asset_type, source, date, open, high, low, close, volume, amount, pre_close, change_pct`（与 daily 同列族，`asset_type=index`） |
| `MINUTE_COLUMNS` | `symbol, asset_type, source, datetime, open, high, low, close, volume, amount, freq` |
| `FINANCIAL_COLUMNS` | `symbol, table, period_end, announce_date, key, value`（PIT，逐列公告日取最新） |
| `CALENDAR_COLUMNS` | `trade_date, open, close, status`（是否开盘/约半天/节假日标记） |

派生指标（MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率/信号布尔列）统一在 `ctx.indicators` 现算，不在注册表里重复存储（**S2 已落地**：core `services/indicators.ts` seam + `indicators.ts` 纯函数库，见 §2 已实现块；信号布尔列仍目标态）。

> 显式列类型契约：标识/时间列 → `VARCHAR`，数值列 → `DOUBLE`（`columnSqlType` 单一实现；sync 写路径
> 已于 S2 收敛到 `DatasetDeclaration.columnSchema`，接单一事实源，不再另写命名约定映射）。

## 4. 表集（声明层已落地，落库实现归 S2/S3）

**八组基础数据集**（`instruments`/`daily`/`adj_factor`/`enriched`/`index`/`minute`/`financial`/`calendar`）
+ 存量 `realtime` 已由 `ctx.datasets` **声明**（[BUILTIN_DATASETS](../packages/core/src/services/datasets.ts)）。

- **运行时建表/物化**：当前 sync 写路径按声明建表/物化（realtime/daily/adj_factor/financial/calendar，
  来自 fuyao 采集；`calendar` 走 fuyao `trading-days` → `calendarRow` 归一，含半天市标记，见 §6）。
  **`minute` 尚无可采集源**（fuyao 声明 `available:false`、fetch fail-closed，见 architecture §11），
  未落库。
  **`enriched` 已落地（S2）**：经 derived provider（sidecar `enriched.ts`）读 daily/adj_factor 变换，走
  runDatasetSync 的 **parquet-view** 物化 + generation 标记（分区多文件粒度仍 S3）；`index`、`instruments`
  的落库实现仍归 S2/S3。
- 其余业务表（`money_flow`/`factor`/`watchlist`/`signals`/`monitor_rules`/`alerts`/`analysis_reports`/
  `backtest_results`/`screener_results`/`sessions_log`/`settings`）仍为计划。
- **覆盖元表 `dataset_coverage` 已落地（S2 覆盖 seam）**：记录每组数据的 `min/max` 覆盖日期、行数、
  来源、物化方式、记录时刻（写入口 [coverage-provider.ts](../packages/sidecar/src/coverage-provider.ts)，
  幂等按 dataset 键更新；读经 `ctx.datasets.reportCoverage`）。第三方数据组经 `ctx.datasets.register`
  声明后，其内嵌表 / parquet-view 视图随 `data-sources/sync` 落库并自动进入 `dataset_coverage`。
  **读/重算/缺洞钩子已落地（S2-coverage-date-registry）**：协议 `data-sources/{coverage,coverage-refresh,coverage-gaps}`
  + `data-sources/list.coverage`（见 §2 已实现块），数据管理页「覆盖日期」区展示与「重算」。

## 5. 缓存分层与失效链

| 层 | 机制 | 位置 |
| --- | --- | --- |
| 持久化 | `.duckdb` 文件 / Parquet | `db.rs` / dataset 物化策略 |
| Rust 热缓存 | 内存 `Cache`（kline 最新快照、实时聚合、instruments） | `db.rs` / `ctx.market` |
| 前端 | zustand（scope 化）+ 事件失效 | webview |

**缓存失效链（写路径必须核对）**：持久化文件 → Rust 内存缓存 → generation/版本 → 事件 → 前端 query 失效。多步刷新优先**构建新快照后原子替换**，禁止“已写文件但返回旧内存对象”。同 TSP 纪律（[CONTRIBUTING §6](reference/tick-stock-panel-contracts.md#7-storage--cache)）。

> **已实现（S3-cache-performance，Node sidecar 侧）**：热读缓存层 + generation 失效链闭环落地——
> sidecar 装配期创建 **`DatasetCache`**（[cache.ts](../packages/sidecar/src/cache.ts)）：按 dataset（含虚拟元作用域 `__meta__`）维护**单调 generation**，`read(scope,key,builder)` 命中（槽 generation === 当前 generation）即原样复用缓存值（不改口径），miss → `builder()` 构建新快照后**原子替换**写入（**且只在「构建期 generation 未变」时写**——并发写不覆盖，对齐 TSP write_lock 语义）。写路径 `runDatasetSync(..., cache)` 在**数据落库成功后 bump generation** + 遍历失效元作用域（coverage 快照），并广播 `database/dataset-updated`（payload 新增可选 `generation`, core [services/database.ts](../packages/core/src/services/database.ts)）→ 前端 query 失效判据。覆盖快照（`data-sources/coverage`/`data-sources/list.coverage`）与 enriched 读路径（`computeIndicatorsFromDb`/`enrichFromDb`）走读透缓存。**parquet 原子替换**：`sync.ts` 先把 parquet 快照 `COPY` 到 `.tmp` 再 `renameSync` 落位（Windows 读锁穿透 `replaceWithRetry`），读者永远拿到整份新快照。**谓词下推**：parquet-view 视图 `read_parquet` 惰性 scan，切片查询不入全量内存。DuckDB query 出口**行对象 JSON 安全归一**（[json-safe.ts](../packages/sidecar/src/json-safe.ts)，bigint→number|string，S1 复用）。基准 [packages/sidecar/bench/cache-performance.ts](../packages/sidecar/bench/cache-performance.ts)（`cd packages/sidecar && bun run bench`）：读缓存命中 ~0.001ms vs miss ~8.6ms，谓词下推切片 ~1.25ms，写后读一致断言绿。测试 [packages/sidecar/test/{cache, cache-sync}.test.ts](../packages/sidecar/test/cache-sync.test.ts)。诚实边界：**Rust `duckdb-rs` 单写者 / Rust 内存热缓存仍目标态**，本层在 Node sidecar 侧实现；generation 是进程内失效判据（非跨进程锁）；parquet 分区多文件粒度仍目标态。

## 6. 数据契约红线（改代码必读）

继承 TSP [数据契约红线](reference/tick-stock-panel-contracts.md#8-data-contract) 并改写为 BK 语义。**边界跨层必须显式转换并有测试，禁止启发式。**

> 已实现落点（跨 provider 共享的纯工具与红线校验，见 [packages/core/src/dataContract.ts](../packages/core/src/dataContract.ts) 与各 provider 单测）：
> - `toFloat`/`volumeToHand`（股→手）/`derivePreClose`（窗口内 pre_close·change_pct **同源推导**，首行无前收 → null）为**单一实现**，fuyao/csv provider 共用，避免同口径各写一份而漂移；
> - 前复权口径 `adj = raw / Π(事件后 ex_factor)`（`forwardAdjustFactor` 后缀累乘 + `forwardAdjust`，事件当日 bar 不调整）与显式列类型契约（`columnSqlType`，八组规范化 `*_COLUMNS`）同为 **S1 契约层单一实现**（含 [packages/core/test/](../packages/core/test/) 契约回归）；`DatasetCoverage` 覆盖日期元模型类型已冻结（运行时记录归 S2）；
> - 扶摇 provider（[provider.ts](../packages/plugins/datasource-fuyao/src/provider.ts)）落地红线：change_pct 百分数→小数制（**/100**，见单测）、volume 股→手、daily **锁 adjust=none**（官方 forward 序列事件间有逐日漂移，禁止使用）、*ms 北京零点 +8h 换算、adj_factor 单事件比值（非累积）+ 涨跌停自检、空数据/缺 Key fail-closed 响亮报错（见 [test/](../packages/plugins/datasource-fuyao/test/)）；CSV provider（[provider.ts](../packages/plugins/datasource-csv/src/provider.ts)）按同一内部口径（volume 已按手填写），坏行跳过留痕。
> - **日期/交易日/时段（S2-market-calendar 已落地）**：`ctx.marketTime`（[packages/core/src/services/marketTime.ts](../packages/core/src/services/marketTime.ts)）统一 `CN_TZ`（Asia/Shanghai）纪元换算（`cnDateYMD`/`fromCnIso`/`beijingMinutesOfDay`/`msForCnDateTime`，全部由 epoch-ms 直接推导北京墙钟、不依赖宿主时区）+ 交易日判定 `isTradingDay`（**周末直判** → 注册探针 → **周几近似兜底**，TTL 缓存：休市/近似结论短 TTL 定期复探防重探）+ 交易时段/收盘判定（`nowIsTradingSession`/`isMarketClosed`）+ 下一触发点（`nextClose`/`nextOpen`，S3 定时任务地基）；交易日探针由扶摇 `tradingDays()`（`createCalendarProbe`）注册，`calendar` 数据集经 `calendarRow` 归一 `trade_date/open/close/status`（含半天市标记）接入同步。诚实：探针**纯内存读不落盘**；S3 定时器已由 sidecar [autopilot.ts](../packages/sidecar/src/autopilot.ts)（启动同步 + 收盘同步，`sync/started|completed|failed` 事件）落地，core 侧 `market/scheduler` 仍目标态。
> - **复权与派生指标（S2-enriched-ohlev-indicator 已落地）**：[dataContract.ts](../packages/core/src/dataContract.ts) 新增 `isHaltDay`/`filterHaltDays`（TSP `filter_halt_days`：`open==0 且 high==0` **或** `volume==0 且 amount==0` 判停牌，`close==0` 单列不判；缺失列 null≠0 不判）+ `groupAdjFactors` + `toEnrichedRows`（限定 `adjustPrice` 为复权单价唯一实现，`forwardAdjust` 亦复用它）：停牌日剔除后按 symbol `forwardAdjustFactor` 前复权 OHLC + 保留 `raw_*` 原始价，非可算列（turnover_rate/consecutive_limit_ups/downs/quote_ts）**如实 null**，缺 symbol/非法日期/原始价全缺 **fail-closed 抛错**；技术指标纯函数库 [indicators.ts](../packages/core/src/indicators.ts)（sma/ema/macd/boll/kdj/atr/rsiSeries/momentum/annualVolatility，窗口不足 null 不伪造；macd hist 不含 ×2 缩放、boll 用总体 std、vol 用样本 std×√252，口径在 JSDoc 明示）+ `ctx.indicators` 缝（[services/indicators.ts](../packages/core/src/services/indicators.ts)，Definition/内置 Provider/Consumer 三角色一次交付）；侧边 derived provider（[enriched.ts](../packages/sidecar/src/enriched.ts)）读 `daily`+`adj_factor`（表缺失 fail-closed，禁把「未做除权」当「无事件」）变换，经 `runDatasetSync` 单写者落库（parquet-view/覆盖登记自动协作）。单测见 [packages/core/test/](../packages/core/test/) 与 [packages/sidecar/test/enriched.test.ts](../packages/sidecar/test/enriched.test.ts)。

- **比例/百分比**：`change_pct`/`turnover_rate` 统一口径（小数制 vs 百分数值），跨边界显式转换，禁止“数值 <1 乘 100”。
- **价格与复权**：enriched OHLC 前复权；`raw_*` 不复权原始价；涨跌停判断基于原始价；指标/收益序列价格口径与现有定义一致。除权因子语义：`adj = raw / Π(事件后 ex_factor)`，`ex_factor` 为逐事件非累积。
- **日期/交易日/时区**：A 股统一北京时间（`CN_TZ`），分钟 `datetime` 为北京 naive 墙钟，入口强制归一（禁止 UTC 入库/下发）；窗口按实际交易日；股票/ETF/指数分存储路由，不凭代码格式猜资产类型。
- **历史股本/财务（PIT）**：换手率优先公告日不晚于目标交易日的历史股本；财务按 `(symbol, period_end)` 多源取并集、逐列按公告日取最新；公告前一律空值，绝不填 0。
- **fail-closed**：provider 缺能力、字段缺失、空数据必须明确提示或降级，禁止静默返回“看似合理的错误金融结果”。
- **“模型/UI 可见 ⟺ 已记录”**（照抄 dsh）：任何进入分析/AI 请求的数据必须能从数据库/日志重建；新增模型/前端可见输入必须登记对应数据事件。

## 7. 验证命令（目标）

```bash
# Rust：构建 + DuckDB 单元测试
cargo test -p bk-core
# 前端：类型 + 构建
bun --cwd apps/berkshire-agent build
# 文档锚点 / 链路一致性（实现期脚本）
git diff --check
```

> 维护约定：本文描述**目标 schema**。每有一张表/一个 dataset 落地，同步更新注册表示例与表集，保持“一直反映最新目标 + 标注哪些已实现”。