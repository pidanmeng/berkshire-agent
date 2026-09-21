---
batch: 3
feature: cache-performance
depends_on: [enriched-ohlev-indicator, coverage-date-registry, canonical-data-model]
parallel_with: [sync-autopilot]
---

# S3 · 高速读写 / 缓存 / 性能优化

## 包名 / 目标
实现需求第 3 条：**「支持高速读写、缓存、性能优化。」** 在数据组/同步链路之上建立**热读缓存 + 失效链**：热门数据集（enriched 最新日、instruments、覆盖元信息）缓存放大读吞吐，写路径**构建新快照后原子替换**、按 generation/版本失效，杜绝「已写文件但读端拿到旧内存对象」。同时优化大数据集的读写（parquet-view 物化、谓词下推式查询）。

## 背景与真相来源
先读，建立事实基线：

- 根 `AGENTS.md`（防御模式「缓存失效链」）；`docs/data-model.md §5`（**缓存分层与失效链**：持久化 → 热缓存 → generation/版本 → 事件 → 前端失效；多步刷新优先构建新快照后原子替换）。
- 参考实现：`docs/reference/tick-stock-panel-contracts.md`（TSP `repository.py` 的 Polars 缓存 + 原子替换 + `replace_with_retry`；enriched 最新日 ~5500 行 + instruments 缓存；generation 原子发布）。
- **前置已完成**（复用其生成/登记）：`S2-enriched-ohlev-indicator`（enriched 生成）、`S2-coverage-date-registry`（覆盖/元信息）、`S1-canonical-data-model`（物化/generation 声明）。
- 当前锚点：`packages/sidecar/src/duckdb-provider.ts`（`query`/`tables`，串行链 `enqueue`——性能瓶颈之一）、`packages/sidecar/src/sync.ts`（整表替换写路径）、`packages/sidecar/src/protocol.ts`、`apps/berkshire-agent/src/client/loader.ts`/`src/lib/api.ts`（宿主查询面）。
- 诚实边界：Rust `duckdb-rs` 单写者仍目标态——**性能优化当前在 Node sidecar 侧做**（热缓存原语、parquet-view、原子替换），并把 Rust 侧标注为未来承载点。

## 需求明细（验收点）
- [ ] **热读缓存层**：为高频读加内存缓存（如 enriched 最新日、instruments、coverage 快照、实时快照），读路径命中缓存、写路径失效。缓存对象**原子替换**（build-new-then-swap），绑 **generation**：写完成 bump generation，读端以 generation 判断是否复用，杜绝旧内存对象。
- [ ] **失效链闭环**：持久化写 → generation 变更 → 事件广播（`@mode emit`）→ 前端 query 失效。验证「写后读立即看到新数据」（禁「已写文件却返回旧内存对象」）。
- [ ] **写性能**：`sync.ts` 批量 VALUES 写入（`INSERT_BATCH`）分析并优化；DuckDB `query` 出口加**行对象 JSON 安全归一**（复用 S1 序列化安全，避免 `bigint` 在快照失败——联动已修 bug）。
- [ ] **大数据集读写**：对声明 `parquet-view` 的大 L1 数据集（历史日K/分钟K/Enriched 历史）用 read_parquet 视图 + 谓词下推式查询，避免把全量大表搬进内存（继承 TSP lazy scan）；原子替换 `replace_with_retry`（Windows 读锁穿透）。
- [ ] **性能基准**：给出可复现的微基准或性能断言（读缓存命中、写后读一致性、大数据集查询延迟）；`docs/data-model.md §7 验证命令`的 Rust `cargo test -p bk-core` 目标态不可用，改用 Node 侧基准脚本（标注）。
- [ ] 单测：缓存失效链、generation 原子替换、写后读一致、并发写不覆盖（对齐 TSP write_lock 语义）。
- [ ] 诚实回写：`docs/data-model.md §5`（缓存实现现状）、`docs/secondary-development.md §6/§8`、`docs/architecture.md §11`；Rust 热缓存仍标「目标态」。

## 硬约束（必须遵守）
- **单写者**：本包只做读/缓存/写路径优化，**仍只经 `ctx.database.exec`/同步编排写库**；不引入裸写。
- **缓存失效链纪律**：多步刷新**构建新快照后原子替换**，禁止「已写文件却返回旧内存对象」；generation 是失效判据，必须在写路径 bump。
- **数据契约红线**：缓存不改变口径（前复权、CN_TZ、停牌），只加速，不篡改值。
- **性能优化不动正确性语义**：任何优化都须现有单测保绿；新增基准可复现。
- 不引入重依赖；事件 `@mode`；`declare module` co-locate（如需）。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**默认调度（归 S3-sync-autopilot，可并行；如都改 `sync.ts`，本包只做写路径的性能/原子替换，调度包管触发，划分清楚）。
- **不做**新数据能力（Enriched/日历等的生成归 S2）。
- **不做**前端 zustand 缓存重写（可只保证事件驱动的失效衔接）。
- Rust `duckdb-rs`/Rust 内存热缓存**仍目标态**，不硬实现。

## 产物与验证
产物：`packages/sidecar/src`（热缓存层 `cache.ts`、generation 管理、`duckdb-provider.ts` 查询归一/性能、`sync.ts` 原子替换写、parquet-view 查询路径）、`packages/core`（generation 声明）、基准/测试脚本（`packages/sidecar/test/`）。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run typecheck
cd packages/sidecar && bun test
cd apps/berkshire-agent && bun run build
git diff --check
```

## 完成定义（DoD）
- 热读缓存命中 + generation 失效链闭环，「写后读立即一致」单测绿；
- 大数据集走 parquet-view + 谓词下推，避免全量大表进内存；
- `sync` 写路径原子替换 + Windows 读锁穿透；DuckDB 查询出口 JSON 安全归一；
- 性能基准可复现；现有单测不回归；
- 文档现状锚点同步；`git diff --check` 干净。