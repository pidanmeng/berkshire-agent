---
batch: 2
feature: coverage-date-registry
depends_on: [canonical-data-model]
parallel_with: [enriched-ohlev-indicator, market-calendar, dataset-extension-seam]
---

# S2 · 覆盖日期注册表：每组数据记录覆盖日期（coverage）

## 包名 / 目标
把需求第 1 条的「**每组数据记录覆盖日期**」从契约（S1-canonical-data-model 已定义 `DatasetCoverage` 元模型）落成**完整能力缝**：每完成一次数据同步，就记录该数据组的 `min/max` 覆盖日期、行数、来源、物化方式、记录时刻；可查询、可展示、可驱动「缺洞自检/补齐」。这是一个**三角色一次交付**的能力缝（Definition/Provider/Consumer 不拆给多方）。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`；`docs/data-model.md §2/§4/§5`（dataset 注册表、表集、缓存失效链、generation 原子发布）；`docs/capability-seams.md §2`（能力缝三角色）。
- 上一批契约（**前置已完成，必须拿到其冻结接口**）：`.agents/features/S1-canonical-data-model.md` 产出——`DatasetDeclaration`（含 `materialization`/`partition`/`generation`）、`DatasetCoverage` 元模型、品牌化 `DatasetId`。
- 参考实现：`docs/reference/tick-stock-panel-contracts.md`（TSP 的 `get_regime_coverage`/`max(date)` 是「临时算一次」，本包要做成**持续登记**）；`packages/core/src/services/datasets.ts`、`packages/core/src/services/database.ts`、`packages/sidecar/src/sync.ts`（`runDatasetSync` 是每次写库的**单一写入口**，覆盖记录的挂载点）、`packages/sidecar/src/protocol.ts`（`data-sources/list` 快照、新增 coverage API）。
- `packages/plugins/data-manager/src/client/DataManagerPage.tsx` 与 `src/index.ts`（数据管理页展示面）。

设计意图：TSP 只在个别组（regime）临时算覆盖；本设计把它做成**通用、持续、写路径自动登记**的覆盖注册表——同步完成即登记（或缺洞标记），页面上每个数据组能看「覆盖到哪天」。

## 需求明细（验收点）
- [ ] **Definition**：实现 `ctx.datasets.coverage`（或在 `ctx.dataSources`/`ctx.database` 之下新增 `Coverage` seam），类型 `DatasetCoverage`（沿用 S1 元模型）：`{ dataset, minDate, maxDate, rows, source, materialization, recordedAt, tradingDays? , isComplete?, lastSyncAt }`。为空组/未同步组返回明确的「未覆盖」态（fail-closed，不伪造）。
- [ ] **Provider / 落库**：覆盖记录落到 DuckDB（单写者经 `ctx.database.exec`），作为一张 `dataset_coverage` 元表（或 registry 系表）。每次 `runDatasetSync` 成功后取 `min(date)`/`max(date)`/行数/来源写入（`isComplete` 语义可后续 S3 校验）。
- [ ] **Consumer / 读 API**：sidecar `protocol.ts` 增 `data-sources/coverage`（或并入 `data-sources/list` 快照），返回全部数据组覆盖信息；`data-manager` 页展示每个数据组的覆盖日期（min~max、最近同步时刻）。
- [ ] **覆盖自检钩子**：预留「缺洞检测」接口（比对目标窗口 vs 实际 `min/max`，输出缺失区间列表）——可先落最小面 + 标「目标态」进阶。
- [ ] 支持**手动刷新/重算覆盖**（重新扫描已落库的该 group 的 date 范围，用于数据被外部/旧版本写入后校准）。
- [ ] 事件：写入后按既有 `@mode emit` 广播（对齐 `database/dataset-updated`，可用同事件或新增 `datasets/coverage-updated`，标注 `@mode`）。
- [ ] 单测：写路径登记、读路径、空组 fail-closed、去重（重复同步同组覆盖只更新不累积）。
- [ ] 诚实回写：`docs/data-model.md §4`（加 `dataset_coverage` 表）、`docs/secondary-development.md §6/§8`、`docs/architecture.md §11`。

## 硬约束（必须遵守）
- **三角色一次性完整**（Definition/Provider/Consumer 在一个包交付，禁止拆给多个并行的 AI 各写一角）。
- **单写者**：覆盖写入只经 `ctx.database.exec`，不裸写 DuckDB 文件。
- **数据契约红线**：`min/max` 用北京交易日口径（对齐 `CN_TZ`/日历语义，见同批 S2-market-calendar——若其尚未落地，先用 TSP 驾驶口径并诚实标注依赖）；不伪造「看起来完整」的覆盖。
- **fail-closed**：数据组未同步/无数据 → 明确「未覆盖」，绝不猜测给个日期。
- 注册即效应、事件 `@mode`、`declare module` 增强 co-locate（在所属 `services/*.ts`/`sidecar` 内）。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**定时任务/启动·收盘同步（归 S3-sync-autopilot）——本包只登记与查询，不调度。
- **不做**覆盖缺洞的自动补齐执行（可留接口/目标态）。
- **不做** Enriched 生成、性能缓存（归同批/下批）。
- 不动 `S1-canonical-data-model` 冻结的契约（若要改其类型，须先在交付说明标注并回写契约包，避免并行冲突）。
- 不引入新依赖；不改 CSS/主题。

## 产物与验证
产物：`packages/core/src`（新增/扩展 `Coverage` 服务与类型，或并入 datasets）、`packages/sidecar/src/sync.ts`（写路径挂覆盖登记）、`packages/sidecar/src/protocol.ts`（coverage API）、`packages/plugins/data-manager`（页面对覆盖展示）、对应单测（`packages/sidecar/test/`、如有 core 则 `packages/core/test/`）。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- 每次同步后对应数据组覆盖日期被自动登记（min/max/rows/source/记录时刻），不重复累积；
- `data-sources/coverage` 可查全部数据组覆盖；数据管理页展示覆盖日期；
- 空组 fail-closed 明确「未覆盖」；覆盖写经单写者路径；
- 三角色完整 + 单测 + typecheck + build 绿；文档现状锚点同步；`git diff --check` 干净。