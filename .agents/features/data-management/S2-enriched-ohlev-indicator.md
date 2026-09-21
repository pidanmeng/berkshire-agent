---
batch: 2
feature: enriched-ohlev-indicator
depends_on: [canonical-data-model]
parallel_with: [coverage-date-registry, market-calendar, dataset-extension-seam]
---

# S2 · Enriched 数据集：复权 OHLCV + 技术指标现算

## 包名 / 目标
实现需求第 1 条的 **Enriched（复权 OHLCV + 技术指标）** 数据能力：把「日K原始价 + 除权因子 → 前复权 OHLC + 窄表基点列」做出来，技术指标（MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率/信号布尔列）**现算**（不落表），并作为 `enriched` 数据集接进数据模型与同步链路。继承 TSP 的「窄表存储 + 派生现算」纪律（`docs/data-model.md §1.3`、`docs/data-model.md §3` 的 `ENRICHED_STORAGE_COLS`）。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`；`docs/data-model.md §1（单写者）/§3（ENRICHED 窄表列）/§6（复权红线）`；`docs/capability-seams.md`。
- 参考实现口径（抄语义）：`docs/reference/tick-stock-panel-contracts.md`（`enriched_generation.py` 语义：窄表只存基点列 `raw_close/raw_high/raw_low` + 前复权 close，派生指标现算；除权因子 `adj = raw / Π(ex_factor)`，逐事件非累积）；对照 `apps/reference`（如无则只在 docs 参考）。
- 当前实现锚点：`packages/core/src/services/datasets.ts`、`packages/core/src/services/database.ts`、`packages/sidecar/src/sync.ts`（`runDatasetSync` 写路径），`packages/plugins/datasource-fuyao/src/provider.ts`（daily `adjust=none` 原始价 + `adj_factor` 响应），`packages/core/src/dataContract.ts`（`toFloat` 等单一实现）。
- 上一批契约（**前置已完成，必须拿到冻结接口**）：`.agents/features/S1-canonical-data-model.md`（`enriched` 数据集声明、复权列类型、物化策略）。

用户需求原话要点：**Enriched（复权 OHLCV + 技术指标）**是八组基础数据之一。

## 需求明细（验收点）
- [ ] **除权复权**：`enriched.open/high/low/close` 为前复权价；`raw_*` 为不复权原始价；复权公式 `adj = raw / Π(事件后 ex_factor)`（逐事件非累积，`docs/data-model.md §6`）。实现为纯函数 + 单测（继承 `dataContract.ts` 单一实现，不复制各写一份）。
- [ ] **Enriched 数据集接入**：把 `enriched` 登记进 `ctx.datasets`（复用 S1 契约），声明物化策略（小规模可 `embedded`，历史大 L1 用 `parquet-view`，按数据量选并诚实标注），并接入同步链路（provider 供原始日K + 除权因子 → enriched 变换现算）。
- [ ] **技术指标现算**：MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率等派生指标**按需现算**（提供 `ctx.indicators` 或 equivalent seam 的最小实现；兼容窗口/去停牌日处理）。指标是纯函数、可独立单测，不落存储（或按 `docs/data-model.md §4` 可选缓存 `indicator_<name>`，标注）。
- [ ] **停牌日/空缺**：沿用 TSP `filter_halt_days` 语义（open/high 为 0 判停牌，close 不能全零判），现算窗口对停牌日正确。
- [ ] **与覆盖记录协作**：enriched 生成/更新触发覆盖登记（对接 S2-coverage-date-registry 的写入口，若其同批并行，则以「调用其暴露的登记函数/事件」方式协作，不要自己另写一套覆盖逻辑）。
- [ ] **fail-closed**：原始价/除权因子缺失 → enriched 显式报错或标「不可生成」，禁止静默吐「看似合理」的复权价。
- [ ] 单测：复权公式、指标现算（至少 MA/MACD/RSI 对构造数据断言）、停牌日、fail-closed。
- [ ] 诚实回写：`docs/data-model.md`（enriched 落地、指标现算入口）、`docs/secondary-development.md §6/§8`、`docs/architecture.md §11`。

## 硬约束（必须遵守）
- **单写者**：enriched 落库只经 `ctx.database.exec`/同步编排，不裸写 DuckDB 文件。
- **数据契约红线（重点）**：复权口径、涨跌停/停牌判断基于**原始价**；价格/收益率序列口径与既有定义一致；分钟 `datetime` 北京 naive 墙钟（若涉及）。
- **能力缝三角色一次性交付**：若引入 `ctx.indicators` 缝，必须连 Definition/Provider/Consumer 一起给齐最小面，不拆平行包。
- 注册即效应、事件 `@mode`、`declare module` co-locate。
- 派生指标现算不落宽表（否则违反「窄表存储 + 派生现算」）。不引入重依赖。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**除权因子/日K自身的 provider 拉取改造（既有 fuyao 已供 `daily adjust=none` + `adj_factor`）。
- **不做**性能缓存/热缓存失效链（归 S3-cache-performance；本包只保证正确性与现算可用）。
- **不做**定时任务（归 S3-sync-autopilot）。
- **不**新造一套覆盖记录（与 S2-coverage-date-registry 协作，复用其 seam）。
- 不动 S1 冻结契约（若要改 `enriched` 声明类型，须标注并回写契约包协调）。

## 产物与验证
产物：`packages/core`（`enriched` 声明、`ctx.indicators` seam 最小实现 + 复权纯函数，或并入 `dataContract.ts`）、`packages/sidecar/src`（enriched 变换/写路径，可新增 `enriched.ts`）、`packages/plugins/*`（如新增 indicator 提供面）、对应单测。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- `enriched`（前复权 OHLCV + raw 原始价）可从原始日K + 除权因子正确生成；技术指标现算可用且单测绿；
- 停牌/空缺/fail-closed 处理正确；与覆盖登记协作；
- 单写者表达、三角色（若新缝）完整；
- typecheck + build 绿；文档现状锚点同步；`git diff --check` 干净。