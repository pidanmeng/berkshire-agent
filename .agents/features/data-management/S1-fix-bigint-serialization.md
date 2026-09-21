---
batch: 1
feature: fix-bigint-serialization
depends_on: []
parallel_with: [canonical-data-model, data-base-elevation]
---

# S1 · 修复桥接/快照的 BigInt 序列化报错（fail-closed）

## 包名 / 目标
修复当前真实报错 **"桥接/快照失败（fail-closed）：`JSON.stringify cannot serialize BigInt`"**。让 sidecar → 宿主的每个 json 快照（RPC 响应 + 事件推送）在任何 `bigint` 值出现时**不再静默失败**，而是以确定、可逆、fail-closed 的方式序列化。这是**落地代码修复**，不是文档/目标态产物。

## 背景与真相来源
先读以下文件，建立事实基线后再动手（不要凭仓库级 AGENTS.md 的「目标态」面猜实现）：

- 根 `AGENTS.md`（尤其「目标态 vs 已实现」「单写者」「fail-closed」约定）。
- 桥接序列化出口与 DuckDB 取数：
  - `packages/sidecar/src/protocol.ts` —— `serializeResult(id, result)` / `serializeError` / `dispatch`；`database/tables` 等走这里。
  - `packages/sidecar/src/duckdb-provider.ts` —— `query()` 用 `@duckdb/node-api` 的 `runAndReadAll(...).getRowObjects()`，某些列为 `bigint`。
  - `packages/sidecar/src/events.ts` —— 事件推送 `JSON.stringify({ event, payload })`，同样会碰 `bigint`。
  - `packages/sidecar/src/writer.ts` / `index.ts` —— ndjson 写出口。
- 现有单测（改完必须补/跑）：`packages/sidecar/test/{protocol,writer,events,process}.test.ts`。
- `docs/data-model.md §5/§6`、`docs/capability-seams.md §4`（fail-closed 语义）。

根因（已核实）：DuckDB `getRowObjects()` 对 BIGINT/UINT/HUGEINT/Decimal 等列可能在 JS 侧返回 `bigint`；`serializeResult` 与事件推送直接 `JSON.stringify`，遇 `bigint` 抛 `TypeError: Do not know how to serialize a BigInt`，被 `handleLine` 的 catch 收成 `-32603 INTERNAL`——不是崩进程，而是「本该成功的快照变成错误响应」，即用户看到的「桥接/快照失败（fail-closed）」。

## 需求明细（验收点）
- [ ] 定义一个**单一、确定性、可复现**的 JSON 安全序列化（`toSafeJsonValue`/`serializeResult` 内部），对 `bigint` 显式转换，**优先级**：能无损表示为 number（`|value| <= Number.MAX_SAFE_INTEGER`）→ number；否则 → 十进制字符串（`value.toString()`）并在结果带不可变标记（如该值为 string 时保持，不额外加字段扰乱 schema）。
- [ ] 对任意深度的对象/数组全域递归转换（`replacer` 或自行 deep-normalize），覆盖 `bigint` 嵌套在行对象、数组、metadata 里。
- [ ] 同时覆盖 **RPC 响应（`serializeResult`）** 与 **事件推送（`events.ts` 的全部 `emit(JSON.stringify(...))`）** 两条出站路径。
- [ ] `bigint` **不安全值（超出 safe 范围）不得静默四舍五入**：必须转字符串，保证精度不丢；禁止用 `Number(x)` 硬转导致精度漂移后被下游当作精确值（数据契约红线：禁止启发式/伪装）。
- [ ] 兜底 fail-closed：若某个值**无法序列化**（如循环引用、`undefined` 入 JSON），显式抛出可读错误并携带上下文，绝不写坏 ndjson 行或静默丢字段。
- [ ] 在 `duckdb-provider.ts` 的 `query()` 出口也做一次归一（可选但推荐），让 `getRowObjects` 的 `bigint` 在 Provider 边界即转 JSON-safe，双保险。
- [ ] 单测：在 `packages/sidecar/test/` 加 `serialize.test.ts`（或并入 protocol.test.ts），覆盖：安全 `bigint`→number、不安全 `bigint`→string、嵌套 `bigint`、`database/tables` 返回含 `bigint` 时的 `serializeResult` 不抛错。
- [ ] 诚实回写：改动落地后，把「现状锚点」同步到 `docs/secondary-development.md §6/§8` 与 `docs/architecture.md §11`；本修复是「已实现」。

## 硬约束（必须遵守）
- **不 import 尚不存在的 `ctx.*` / `@berkshire/cordis` 扩展 / 未落地服务**——本包只动已存在的 `packages/sidecar` 序列化层。
- **单写者**：本包不碰 DuckDB 写路径（`sync.ts` 的表写入语义）和 schema，只做入站前/出站后的序列化安全。
- **fail-closed**：任何无法确定性表示的 `bigint` 都不静默伪造；精度可保则保（safe→number，否则字符串）。
- **「模型/UI 可见 ⟺ 已记录」**：序列化转换不得让读侧和写侧对同一数值产生不同理解；number/string 的选择是稳定的。
- 注册即效应/事件 `@mode` 标注等：本包不新增事件，不动服务增强（无 `declare module` 改动）。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- 不改 `packages/core` 的 `ctx.database` 契约、不改 DuckDB schema、不改数据列类型。
- 不引入第三方序列化库（手写可控小工具，避免新依赖）。
- 不做性能优化（那归 S3-cache-performance）——本包只修正确性，保持对现有行为的最小改动面。
- 不动 `apps/berkshire-agent/src` 前端（前端本就收到错误后展示，本次让错误不再发生）。

## 产物与验证
产物：`packages/sidecar/src/protocol.ts`（`serializeResult`/安全序列化 helper，可在 `src/` 新增 `json-safe.ts`）、`packages/sidecar/src/events.ts`（事件推送走同一 helper）、可选 `duckdb-provider.ts` 出口归一、`packages/sidecar/test/serialize.test.ts`。

最小落地校验（真实存在）：
```sh
cd packages/sidecar && bun test        # 单测（含新增 serialize 用例）
cd C:\Code\berkshire-agent && bun run typecheck
git diff --check
```
不存在的命令/设施（如 Rust `cargo test -p bk-core`）一律标注「待实现」，不引用。

## 完成定义（DoD）
- 任一含 `bigint` 的 RPC 快照/事件都能成功、确定、无损地序列化并送达宿主；
- 安全 `bigint`→number、超界 `bigint`→string，无精度丢失、无静默四舍五入；
- 无法序列化的值 fail-closed 显式报错且不破坏 ndjson 流；
- 单测 + typecheck 绿；文档现状锚点同步；`git diff --check` 干净。