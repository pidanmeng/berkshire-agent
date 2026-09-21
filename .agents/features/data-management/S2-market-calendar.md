---
batch: 2
feature: market-calendar
depends_on: [canonical-data-model]
parallel_with: [coverage-date-registry, enriched-ohlev-indicator, dataset-extension-seam]
---

# S2 · 股票日历 + 市场时间服务（交易日/CN_TZ，定时任务的地基）

## 包名 / 目标
实现需求第 1 条的 **股票日历** 数据能力，以及定时任务（S3）必需的**市场时间/交易日地基**：A 股交易日历（`calendar` 数据集）、北京时区 `CN_TZ` 语义、交易日判定（周末/节假日/半天市探针）、「现在是否交易时段 / 收盘时刻」判断。这是 S3-sync-autopilot（启动同步 + 收盘同步）**必须先行**的能力缝。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`；`docs/data-model.md §6`（日期/交易日/时区红线：A 股统一北京时间 `CN_TZ`，分钟 naive 墙钟）、`docs/capability-seams.md`（三角色/事件 `@mode`）。
- 参考实现口径：`docs/reference/tick-stock-panel-contracts.md`（market_time.py 的 CN_TZ/cn_today、trading_day 探针链：fuyao 交易日历 → tickflow 时间戳 → 周末直判 + TTL 缓存）；本仓库 `packages/plugins/datasource-fuyao`（fuyao 有 trading_days 接口，见 provider）。
- 当前实现锚点：`packages/core/src/services/datasets.ts`（S1 契约含 `calendar` 声明）、`packages/core/src/services/database.ts`、`packages/sidecar/src/index.ts`、`packages/bundle/base/cordis.patch.yml`（fuyao 数据源）。
- 上一批契约（**前置已完成**）：`.agents/features/S1-canonical-data-model.md`（`calendar` 数据集列 `trade_date/open/close/status`、`CN_TZ` 契约可选条目）。

## 需求明细（验收点）
- [ ] **`market-time` 服务**：`CN_TZ`（Asia/Shanghai）纪元换算、`cnNow()`/`cnToday()`、交易日判定函数（周末直判 + 节假日探针 + TTL 缓存，对齐 TSP `trading_day.py` 的降档语义：休市结论短 TTL 定期复探，未知结论短 TTL 防止反复重探）。注册为 core 服务（或 sidecar 内模块），供 S3 定时任务与数据消费方使用。
- [ ] **`calendar` 数据集**：交易日历（`trade_date/open/close/status`——是否交易日、半天市、节假日/周末标记），登记进 `ctx.datasets`（复用 S1 契约），提供 provider（fuyao `trading_days()` 或内置探测回退），接入同步链路；数据经单写者落库。
- [ ] **「是否交易时段/收盘时刻」判定 + 下一触发点**：提供「开盘/收盘时间」计算（如 `isMarketClosed(now)`、`nextClose()`），支撑 S3 的「应用启动同步 + 收盘同步」调度规划。
- [ ] **探针链降档**：provider 缺失/网络失败 → 按探针链降档（周末直判 / 周几近似兜底），**任何结论可自愈**；不影响取数主链路（纯读、不落盘、短 TTL）。
- [ ] 单测：CN_TZ 换算、周末/节假日判定、半天市、TTL 缓存、探针降档。
- [ ] 诚实回写：`docs/data-model.md`（calendar 表、market-time 现状）、`docs/secondary-development.md §6/§8`、`docs/architecture.md §11`。

## 硬约束（必须遵守）
- **三角色一次性交付**（Definition/Provider/Consumer 同包）。
- **数据契约红线**：北京时间 naive 墙钟/`CN_TZ` 纪元统一；「模型/UI 可见 ⟺ 已记录」，日历也是数据、可重建。
- 探针是**纯读**：不落盘、不进主数据管道、不碰归属链路（TSP 同一纪律）。
- 注册即效应、事件 `@mode`（如需广播日历更新）。不引入重依赖。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**定时任务调度本身（启动/收盘同步的执行与驱动归 **S3-sync-autopilot**）——本包只提供日历/交易日/时段判定的「地基」与 `calendar` 数据集。
- **不做** Enriched/覆盖登记（归同批 S2 与 S3）。
- **不做**前端节假日 UI。
- 不动 S1 冻结契约；若需扩展 `market-time` 服务类型，在 core/sidecar 内 co-locate 新增强。

## 产物与验证
产物：`packages/core/src`（`market-time` 服务/工具：`CN_TZ`/`cnNow`/`cnToday`/`isTradingDay`/`isMarketClosed`/`nextClose`，co-locate 增强）、`calendar` 数据集声明 + provider + 同步接入（`packages/sidecar/src`、`packages/plugins/datasource-fuyao` 如供 `trading_days`）、对应单测。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- `market-time` 服务可用（CN_TZ/cnNow/cnToday/交易日判定/收盘时刻），探针链降档自愈；
- `calendar` 数据集声明 + 落库 + provider，经单写者；
- 三角色完整、单测绿、typecheck + build 绿；
- 文档现状锚点同步；`git diff --check` 干净；
- S3 可据此实现启动同步 + 收盘同步。