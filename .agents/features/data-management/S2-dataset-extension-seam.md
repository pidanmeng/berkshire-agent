---
batch: 2
feature: dataset-extension-seam
depends_on: [canonical-data-model]
parallel_with: [coverage-date-registry, enriched-ohlev-indicator, market-calendar]
---

# S2 · 新数据组扩展缝：基于 Cordis 让其他插件扩展数据

## 包名 / 目标
实现需求第 5 条：**「基于 Cordis，允许其他插件扩展数据。」** 把现有「dataset/provider 注册」升级为一个**完整、可扩展的数据组能力缝**：任何 Cordis 插件都能声明一个新的数据集（`ctx.datasets.register`）+ 提供一个数据源（`ctx.dataSources.register`），并接入统一的物化/查询/同步/门控链路。三角色（Definition/Provider/Consumer）同包一次性交付 + 一个**参考扩展插件**证明扩展能跑通。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`（Cordis 插件 VM、「无特权核心」、注册即效应、能力缝三角色）；`docs/capability-seams.md §2`；`docs/plugin-development.md`（插件三形态）；`docs/data-model.md §2`（dataset 注册表）。
- 现有扩展能力与缺口：`packages/core/src/services/datasets.ts`（已有 `register()`，但只登记声明，**未驱动**物化/查询/同步/门控）；`packages/core/src/seams/dataSources.ts`（`DataSourceProvider` 契约 + 按数据集路由）；`packages/sidecar/src/sync.ts`（`runDatasetSync`：建表→整表替换）。三者目前是「内置五组」的专用面，`register` 声明掉不进同步链路。
- 参考 TSP 的注册表语义：`docs/reference/tick-stock-panel-contracts.md`（`extensions/{contracts,registry,loader}.py`：staged 注册 + 版本校验 + freeze，fail 即丢弃不留半注册）；`data_providers/custom/*`（自定义源按 dataset 分；provider 缺失某 dataset 自带降级回退）。
- 上一批契约（**前置已完成**）：`.agents/features/S1-canonical-data-model.md`（`DatasetDeclaration` 含 `materialization`/`partition`/`generation`/coverage 元模型、品牌化 `DatasetId`）。建议结合 S1-data-base-elevation 的基座姿势（如已落地则参考扩展插件可作为基座样例）。

## 需求明细（验收点）
- [ ] **DatasetDeclaration 富化接入同步**：`ctx.datasets.register(decl)` 不只登记，还能**驱动**：声明列/物化 → 同步编排据此建表/挂 parquet-view → 门控（候选源）→ 覆盖登记（对接 S2-coverage-date-registry 写入口，若并行则以调用其 seam 的方式，不另写）。
- [ ] **第三方数据集可查询/可同步**：一个 Cordis 插件新增数据集 + 数据源后，能走 `data-sources/sync` 同步、能被 `ctx.datasets.list()`/快照列出、能在数据管理页展示、能被覆盖登记捕获。
- [ ] **staged 注册 + 校验 + fail-closed**：仿 TSP 扩展注册表——重复 id / 非法列名 / 版本不匹配**响亮失败**；失败的注册被丢弃，不留半注册残留；插件卸载可逆（disposer 撤销 dataset/provider/物化链路全部）。
- [ ] **物化策略通用接入**：新数据集按声明 `embedded`（内嵌表）或 `parquet-view`（read_parquet 视图）都能被同步/查询/覆盖登记正确处理。
- [ ] **参考扩展插件**：在 `packages/plugins/` 新增一个最小参考插件（如 `datasource-example`），注册 1 个自定义数据组（含声明 + provider + 可选 parquet-view 物化演示），证明端到端可跑通；文档写明「如何写一个新数据组插件」（对齐 `docs/plugin-development.md`）。若 S1-data-base-elevation 已把它归基座，则按基座姿势装载。
- [ ] 单测：注册/卸载可逆、重复 id fail-closed、staged 失败不留残留、第三方数据组同步 + 覆盖登记。
- [ ] 诚实回写：`docs/data-model.md §2`、`docs/plugin-development.md`（新增数据组扩展教程）、`docs/secondary-development.md §6/§8`、`docs/architecture.md §11`。

## 硬约束（必须遵守）
- **能力缝三角色一次性完整交付**（Definition+Provider+Consumer 同包；参考插件是 Consumer/证明面）。
- **单写者**：第三方数据组的落库仍只经 `ctx.database`（同步编排），禁止让插件裸写 DuckDB 文件——**扩展的是数据集声明/取数，不是写库权限**。
- **注册即效应 + 可逆**：一切副作用经 `ctx.effect()`/disposer；插件卸载连同其数据组/物化链路撤销。
- **fail-closed**：校验失败、字段缺失、物化不支持的组合都显式报错，不静默落「看起来已扩展」。
- 数据契约红线：第三方数据组也遵守归一化列/口令/交易日/时区纪律（参考插件要演示遵守）。
- 事件 `@mode`、`declare module` co-locate；不引入重依赖。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做** Enriched/日历/覆盖实现（归同批/下批别的包）——本包复用它们的 seam，不重复造。
- **不做** UI 大改（数据管理页新增数据组展示可最小接入）。
- **不做**性能缓存（S3）。
- 不动 S1 冻结契约（若要改 `DatasetDeclaration`，标注并回写契约包协调）。
- 不与 S1-data-base-elevation 冲突：本包参考插件若落地为新插件目录，其装载姿势与 S1 基座包协调（若 S1 尚未交付，先按现有 cordis.yml 插件姿势并标注「升基座后按之调整」）。

## 产物与验证
产物：`packages/core/src/services/datasets.ts`（`register` 富化、校验、物化/门控接入）、`packages/core/src/seams/dataSources.ts`（如需要物化 hooks）、`packages/sidecar/src/sync.ts`（通用建表/parquet-view/查询登记）、`packages/sidecar/src/protocol.ts`（可选快照扩展）、`packages/plugins/datasource-example/`（参考插件）、单测、文档教程。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd packages/plugins/datasource-example && bun test   # 若该包带测试
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- 一个 Cordis 插件能新增数据组并经 `ctx.datasets.register` + `ctx.dataSources.register` 端到端同步/查询/展示/覆盖登记；
- staged 校验 + 重复 id + 卸载可逆 + fail-closed 全绿；单写者不被扩展破坏；
- 参考插件跑通并成为教程样本；
- typecheck + build 绿；文档现状锚点 + 教程同步；`git diff --check` 干净。