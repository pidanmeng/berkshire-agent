# 数据模型与数据契约

> Berkshire Agent（BK）的**基座是数据**：一切分析系统都建立在可扩展、可追溯的数据之上。本文定义 DuckDB 的目标 schema、dataset 注册表、缓存分层与**数据契约红线**。模型继承自 TSP 的投研口径（[reference/tick-stock-panel-contracts.md](reference/tick-stock-panel-contracts.md)），并在桌面场景下把“内存 DuckDB 视图”升级为“文件 DuckDB 单写者”。

## 1. 核心设计决策

1. **单写者**：只有 Rust（`db.rs`，`duckdb-rs`）写 DuckDB `.duckdb` 文件；插件/前端一律经 `ctx.database` 或 Rust command 读写。写路径：provider → 同步服务 → DuckDB（`spawn_blocking`）→ generation 原子发布 → 事件广播。
2. **物化策略二选一（每 dataset 声明）**：
   - `embedded`：直接落 `.duckdb` 表（中小型、需实时写/一致性）。
   - `parquet-view`：落 Parquet，DuckDB 用 `CREATE OR REPLACE VIEW <name> AS SELECT * FROM read_parquet('<dir>/**/*.parquet', union_by_name=true)`（大 L1 历史数据集，继承 TSP 的 parquet 分区 + 视图模式）。
3. **窄表存储 + 派生现算**：指标只存基点列，派生列按 `needed` 依赖闭包现算（继承 TSP [pipeline.py](reference/tick-stock-panel-contracts.md#4-indicator-pipeline)）。

## 2. dataset/schema 注册表（meta 表，`ctx.datasets`）

每个 dataset 登记一份声明，驱动视图/表创建、分区、同步与门控：

```yaml
dataset:
  id: kline_daily
  materialization: parquet-view      # embedded | parquet-view
  partition: { column: date, pattern: "date=YYYY-MM-DD" }
  columns:                            # 标准列（见下）
    - symbol/asset_type/source/date/open/high/low/close/volume/amount/pre_close/change_pct
  source: { field: daily_data_provider, default: tickflow }
  sync: { cadence: daily., window: 60d }
  generation: true                    # 维护原子发布标记
```

统一交叉资产视图用 `UNION ALL BY NAME` 补字面列 `asset_type` / `source`（继承 TSP [unified views](reference/tick-stock-panel-contracts.md#1-storage--query)）。

## 3. 标准/归一化列（继承 TSP schemas）

| schema | 列 |
| --- | --- |
| `DAILY_COLUMNS` | `symbol, asset_type, source, date, open, high, low, close, volume, amount, pre_close, change_pct` |
| `ADJ_FACTOR_COLUMNS` | `symbol, asset_type, source, trade_date, ex_factor` |
| `INSTRUMENT_COLUMNS` | `symbol, name, exchange, asset_type, source, list_date, status` |
| `MINUTE_COLUMNS` | `symbol, asset_type, source, datetime, open, high, low, close, volume, amount, freq` |
| `ENRICHED_STORAGE_COLS`（窄表） | `symbol, date, open, high, low, close(前复权), volume, amount, raw_close/high/low(不复权), turnover_rate, consecutive_limit_ups/downs, quote_ts` |

派生指标（MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率/信号布尔列）统一在 `ctx.indicators` 现算，不在注册表里重复存储。

## 4. 表集（计划）

`instruments` / `kline_daily` / `kline_minute` / `adj_factor` / `money_flow` / `indicator_<name>`(可选缓存) / `factor` / `watchlist` / `signals` / `monitor_rules` / `alerts` / `analysis_reports` / `backtest_results` / `screener_results` / `sessions_log` / `settings`。

## 5. 缓存分层与失效链

| 层 | 机制 | 位置 |
| --- | --- | --- |
| 持久化 | `.duckdb` 文件 / Parquet | `db.rs` / dataset 物化策略 |
| Rust 热缓存 | 内存 `Cache`（kline 最新快照、实时聚合、instruments） | `db.rs` / `ctx.market` |
| 前端 | zustand（scope 化）+ 事件失效 | webview |

**缓存失效链（写路径必须核对）**：持久化文件 → Rust 内存缓存 → generation/版本 → 事件 → 前端 query 失效。多步刷新优先**构建新快照后原子替换**，禁止“已写文件但返回旧内存对象”。同 TSP 纪律（[CONTRIBUTING §6](reference/tick-stock-panel-contracts.md#7-storage--cache)）。

## 6. 数据契约红线（改代码必读）

继承 TSP [数据契约红线](reference/tick-stock-panel-contracts.md#8-data-contract) 并改写为 BK 语义。**边界跨层必须显式转换并有测试，禁止启发式。**

> 已实现落点（跨 provider 共享的纯工具与红线校验，见 [packages/core/src/dataContract.ts](../packages/core/src/dataContract.ts) 与各 provider 单测）：
> - `toFloat`/`volumeToHand`（股→手）/`derivePreClose`（窗口内 pre_close·change_pct **同源推导**，首行无前收 → null）为**单一实现**，fuyao/csv provider 共用，避免同口径各写一份而漂移；
> - 扶摇 provider（[provider.ts](../packages/plugins/datasource-fuyao/src/provider.ts)）落地红线：change_pct 百分数→小数制（**/100**，见单测）、volume 股→手、daily **锁 adjust=none**（官方 forward 序列事件间有逐日漂移，禁止使用）、*ms 北京零点 +8h 换算、adj_factor 单事件比值（非累积）+ 涨跌停自检、空数据/缺 Key fail-closed 响亮报错（见 [test/](../packages/plugins/datasource-fuyao/test/)）；CSV provider（[provider.ts](../packages/plugins/datasource-csv/src/provider.ts)）按同一内部口径（volume 已按手填写），坏行跳过留痕。

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