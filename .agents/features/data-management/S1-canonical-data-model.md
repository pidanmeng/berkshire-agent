---
batch: 1
feature: canonical-data-model
depends_on: []
parallel_with: [fix-bigint-serialization, data-base-elevation]
---

# S1 · 数据模型规范化契约：8 组基础数据集 + 覆盖日期元模型

## 包名 / 目标
把当前数据层从「realtime/daily/adj_factor/financial/minute 五个内嵌表」扩展到需求要求的**八组基础数据**，并为其定义**规范化列契约、跨边界品牌化 id、物化策略、覆盖日期（coverage）元模型**。这是后续所有数据能力包（覆盖记录、Enriched 生成、定时任务、扩展缝）复用的**共享底层契约**，务必把接口冻结清楚。**本包只做契约/类型/声明层（落地 TS 类型 + core 服务声明 + 测试），不做同步落库实现**。

## 背景与真相来源
先读，建立事实基线（尤其区分「已实现 vs 目标态」，基础是 `docs/secondary-development.md §6`）：

- 根 `AGENTS.md`；`docs/data-model.md`（目标 schema、§2 dataset 注册表、§3 标准列、§4 表集、§5 缓存、§6 数据契约红线）；`docs/capability-seams.md`（能力缝三角色、事件 `@mode`）。
- 参考项目的契约（抄口径、不抄代码面）：`docs/reference/tick-stock-panel-contracts.md`，以及已审计的 TSP 口径。
- 当前实现锚点：`packages/core/src/services/datasets.ts`（`DatasetDeclaration` + `BUILTIN_DATASETS`），`packages/core/src/brand.ts`（`DatasetId`/`DataSourceId` 品牌化），`packages/core/src/dataContract.ts`（`toFloat`/`volumeToHand`/`derivePreClose` 单一实现），`packages/core/src/services/database.ts`（`DatabaseProvider`/`DatabaseTableInfo`），`packages/sidecar/src/duckdb-provider.ts`，`packages/sidecar/src/sync.ts`（`TEXT_COLUMNS` 类型映射，**当前每列按命名约定 VARCHAR/DOUBLE，本包要契约化**）。

需求要点（用户原话）：
> 基础数据包括个股维表、日K、除权因子、Enriched（复权 OHLCV + 技术指标）、指数、分钟K、财务数据、股票日历；每组数据记录覆盖日期。

## 需求明细（验收点）
- [ ] **八组数据集规范声明**：在 `BUILTIN_DATASETS`（或新的规范声明源）补齐/对齐以下八组，每组带标准化列、说明性 `sync.window`、可选的 `materialization`：
  1. `instruments`（个股维表）：symbol/name/exchange/asset_type/source/list_date/status（继承 `INSTRUMENT_COLUMNS`）；
  2. `daily`（日K，原始价）：symbol/asset_type/source/date/open/high/low/close/volume/amount/pre_close/change_pct；
  3. `adj_factor`（除权因子）：symbol/asset_type/source/trade_date/ex_factor（逐事件非累积）；
  4. `enriched`（复权 OHLCV + 技术指标）：窄表基点列 symbol/date/open/high/low/close(前复权)/volume/amount/raw_close/raw_high/raw_low/turnover_rate/consecutive_limit_ups/downs/quote_ts（派生指标现算，不落表）；
  5. `index`（指数日K）：与 daily 同列族 + `index_code`/asset_type=index 语义；
  6. `minute`（分钟K）：datetime 北京 naive 墙钟 + OHLCV + amount + freq；
  7. `financial`（财务，PIT）：symbol/table/period_end/announce_date/key/value + 逐列公告日取最新语义；
  8. `calendar`（股票日历/交易日）：trade_date/open/close/status（交易日、是否约半天、节假日标记）。
- [ ] **跨边界品牌化 id**：为数据集/资产/符号补齐或使用 Branded `DatasetId`/`AssetId`(stock/index/etf)/`SymbolId`；新增数据组 id 沿用 `DatasetId` 品牌，绝不裸 `string`。
- [ ] **类型映射契约化**：把 `sync.ts` 目前的 `TEXT_COLUMNS` 命名约定升级为「每 dataset 显式列类型声明」（标识/时间列 VARCHAR，数值列 DOUBLE，价格/量/比率口径在 `dataContract.ts` 单一实现），避免悄悄改口径。
- [ ] **物化策略声明**：`DatasetDeclaration.materialization` 明确 `'embedded' | 'parquet-view'`（大 L1 历史用 parquet-view，继承 TSP parquet 分区 + DuckDB 视图模式）；`partition`（date=YYYY-MM-DD）与 `generation`（原子发布标记）字段在类型层登记。
- [ ] **覆盖日期（coverage）元模型**：新增一份「每组数据覆盖日期」的**契约**（目标态实现归 S2-coverage-date-registry），定义 `DatasetCoverage`：`{ dataset, minDate, maxDate, tradingDays?, rows, source, materialization, recordedAt, coverageStart? , isComplete? }`；写进 `DatasetDeclaration` 或独立 seam 类型，供 UI 与后续「缺洞修复」使用。
- [ ] 契约层单元测试：`dataContract` 的类型映射/复权口径不回归。
- [ ] 诚实回写：更新 `docs/data-model.md §2/§3/§4` 到「反映最新目标 + 标注已实现」，同步 `docs/architecture.md §11` 现状锚点与 `AGENTS.md`；沿用「目标态 vs 已实现」措辞，不把未实现当已实现。

## 硬约束（必须遵守）
- **能力缝三角色一次性完整**：本包是数据能力的**定义面（Definition + 契约类型）**；占位 Provider/Consumer 由同批/后续包实现——但如果你在本包内引入新的能力缝，必须连 Provider/Consumer 一起给最小桩，不允许只写一角。
- **不 import 不存在的服务**：不外联 `ctx.market`/`ctx.indicators`（目标态）去硬实现；只负责类型/声明。
- **数据契约红线**（继承 TSP，`docs/data-model.md §6`）：价格复权 `adj=raw/Π(ex_factor)`、etf 独立存储路由、北京时间 naive 墙钟、PIT 财务、fail-closed；`dataContract.ts` 单一实现，不各写一份。
- **`declare module` 增强 + `@mode emit`**：若扩展 `Context`/事件，按既有 co-locate 纪律在所属 `services/*.ts`/`seams/*.ts` 内增强，事件标注 `@mode`。
- 通过 `git diff --check`；文档诚实标注。

## 范围边界（明确不做什么）
- **不做同步/落库实现**：不写 fetch、不建 DuckDB 表、不改 `sync.ts` 写路径（那归 S2 packages）。
- 不做 Enriched 指标现算引擎（归 S2-enriched-ohlev-indicator）。
- 不做覆盖日期的运行时记录（归 S2-coverage-date-registry）。
- 不做定时任务（归 S3-sync-autopilot）。
- 不引入新依赖；不改前端 UI（归数据管理页后续）。
- 不与 S1-fix-bigint-serialization 冲突：本包不动序列化层；S1-data-base-elevation 装配层与本包类型面正交，但若都要改 `cordis.yml`/bundle 请本包不要碰装配（ascend：装配归 elevation 包）。

## 产物与验证
产物：`packages/core/src/brand.ts`（新 DatasetId 常量/品牌）、`packages/core/src/services/datasets.ts`（八组声明 + `materialization`/`partition`/`generation`/coverage 类型）、`packages/core/src/services/database.ts`（如 `DatabaseTableInfo` 补充）、`packages/core/src/dataContract.ts`（若需补类型映射）、对应测试（`packages/core` 暂无 test 目录——**请你新建 `packages/core/test/`** 并用 bun test）。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/core && bun test          # 新增 core 契约测试（如无 package test 脚本，bun test 直接跑）
cd apps/berkshire-agent && bun run build
git diff --check
```
注：`cargo test -p bk-core` 是目标态，**不可引用**。

## 完成定义（DoD）
- 八组基础数据集的规范化列/类型/物化声明齐备且经 typecheck；
- 覆盖日期与物化/generation 的契约类型冻结，供 S2/S3 引用；
- 品牌化 id 全覆盖，无裸 string 数据集 id；
- 契约测试 + typecheck + host build 绿；文档现状锚点同步；`git diff --check` 干净。