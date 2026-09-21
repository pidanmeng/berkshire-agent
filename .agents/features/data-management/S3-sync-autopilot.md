---
batch: 3
feature: sync-autopilot
depends_on: [market-calendar, coverage-date-registry, enriched-ohlev-indicator, canonical-data-model]
parallel_with: [cache-performance]
---

# S3 · 默认定时任务：应用启动同步 + 收盘同步

## 包名 / 目标
实现需求第 4 条：**「默认定时任务（应用启动同步，收盘同步）。」** 把「应用启动时自动同步就近数据」「收盘后自动同步当日数据」做成**默认的开箱即用行为**，驱动各数据组（daily/adj_factor/enriched/index/minute/financial/calendar…）同步，并在同步后触发覆盖登记与事件广播。这是把 S2 各能力（market-calendar 的交易日/收盘时刻 + coverage 登记 + 同步编排）**编织成默认调度**的集成包。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`；`docs/architecture.md`（进程拓扑、生命周期、sidecar）；`docs/data-model.md §4/§5`（表集、失败链）；`docs/capability-seams.md`（事件 `@mode`）。
- **前置已完成**（必须先拿到交付）：
  - `S2-market-calendar`：`market-time`（`isTradingDay`/`isMarketClosed`/`nextClose`/`CN_TZ`）；`calendar` 数据集。
  - `S2-coverage-date-registry`：`dataset_coverage` 写入口 / `data-sources/coverage` API。
  - `S2-enriched-ohlev-indicator`：enriched 生成入口。
  - `S1-canonical-data-model`：八组 `ctx.datasets` 声明与同步接口。
- 参考实现：`docs/reference/tick-stock-panel-contracts.md`（`jobs/daily_pipeline.py` + TSP 盘后管道、启动预热；交易日探针）。
- 当前锚点：`packages/sidecar/src/index.ts`（装配/生命周期：启动即装配、shutdown 逆序）、`packages/sidecar/src/sync.ts`（`runDatasetSync` 单写入口）、`packages/sidecar/src/protocol.ts`（`data-sources/sync`）、`packages/plugins/datasource-fuyao`。
- S1-data-base-elevation 的基座姿势（如已落地，调度器/同步常驻进数据基座；如未落地，先按 sidecar 常驻并标注承接到基座）。

## 需求明细（验收点）
- [ ] **应用启动同步**：sidecar 装配完成（ready）后，**默认**就近同步一次各基础数据组（按需/全组，用 `market-time` 判断交易日，节假日不盲拉全量）。启动同步失败降级不阻塞应用进入 ready（fail-closed 但可自愈），覆盖登记随之更新。
- [ ] **收盘同步**：按 `isMarketClosed`/`nextClose` 在收盘后（含周末节假日前的最后一个交易日收盘后）触发当日各数据组同步；交易日判定用日历探针降档。
- [ ] **默认编排**：明确「默认定时任务 = 启动同步 + 收盘同步」的触发源与频率；可配置（沿用 `Config`/storage 偏好，loud-fail，不 `?? default` 藏值），但**默认开箱即用**。
- [ ] **与覆盖登记协作**：每次同步后更新该组 `dataset_coverage`（复用 S2 seam，不另写）。
- [ ] **事件**：同步开始/完成/失败广播事件（`@mode emit`，如 `sync/started`/`sync/completed`/`sync/failed`），宿主/数据管理页可订阅刷新。
- [ ] **幂等与失败可见**：重复触发（多次启动/测重）幂等；失败组 WARNING 可见、不静默（对齐 TSP「部分失败可见化」纪律）。
- [ ] 诚实回写：`docs/architecture.md §11`、`docs/data-model.md`、`docs/secondary-development.md §6/§8`（market/scheduler 核心服务现状锚点相应更新）。官文 `cargo test -p bk-core` 仍标注「待实现」（调度编排当前在 Node sidecar 侧，Rust 单写者目标态）。

## 硬约束（必须遵守）
- **单写者**：调度只驱动 `runDatasetSync`（同步编排）→ 经 `ctx.database.exec` 落库；调度器本身不裸写 DuckDB。
- **市场时间红线**：同步窗口按实际交易日；收盘同步只在中国市场收盘后触发，节假日不盲拉。
- **fail-closed + 自愈**：单组失败不拖垮整条链、可重试/自愈，绝不静默（失败要可见）。
- **注册即效应**：调度器/定时器经 `ctx.effect()`/disposer 注册，shutdown 逆序清理不残留 tick。
- **诚实**：若 S2 某些能力尚未落地，本包在交付说明标注依赖缺口，不 import 尚不存在的接口硬编。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**新数据能力的取数/生成（那是 S2 provider/enriched 的职责，本包只编排调度）。
- **不做**性能缓存/热缓存失效链（归 S3-cache-performance，可并行，但调度相关的事件广播与缓存失效如需衔接，标注协同）。
- **不做**前端调度设置 UI（可留 storage/config 偏好 + 文档）。
- 不动 S1 冻结契约；不与 S3-cache-performance 抢同一批文件（若两者都改 `sync.ts`，划分好：本包管调度触发 + 覆盖协作，缓存包管读热/失效）。

## 产物与验证
产物：`packages/sidecar/src`（新增 `scheduler.ts`/`autopilot.ts`：启动同步 + 收盘同步触发编排，挂到 `index.ts` ready 生命周期）、事件定义、配置偏好接入、与覆盖登记/事件广播协作、单测（`packages/sidecar/test/`：触发源、幂等、次日判定、失败可见）。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- 应用 ready 后默认就地同步一次基础数据组；收盘后（交易日）自动同步当日数据组；
- 按交易日/日历探针判定，节假日不盲拉；同步幂等、失败可见可自愈；
- 同步后覆盖登记 + 事件广播正确；偏好可配置（默认开箱即用）；
- 单测 + typecheck + build 绿；文档现状锚点同步；`git diff --check` 干净。