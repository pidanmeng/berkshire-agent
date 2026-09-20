# WP-2（第一批 · 独立可并行）：`$BK_HOME` 持久化能力缝

## 目标
在既有 `$BK_HOME`（`packages/boot` 已落地）之上设计并落地一套**持久化方案**：让每个插件都能把结构化的键值/文档信息持久化到磁盘并随时读取，构成一个能力缝（capability seam，三角色：sidecar 侧 Service Definition / Provider / Consumer）。

## 背景与真相来源
先读：
- 根 `AGENTS.md`（诚实纪律、能力缝三角色、注册即效应、品牌化 id、loud-fail、单写者边界、配置红线）。
- `docs/capability-seams.md` §1（三角色速览）、§4（fail-closed）。
- `packages/boot/src/bk-home.ts`（现 `$BK_HOME` 解析：Win `%APPDATA%\.bk` 等）。
- `packages/core/src/services/*.ts`（`ctx.capabilities`/`ctx.log` 等已有能力缝的 Definition/Provider/Consumer 写法 + `declare module '@berkshire/cordis'` 增强 + `@mode emit` 事件）。
- `packages/sidecar/src/{protocol.ts,index.ts}`（JSON-RPC 协议层 + 装配入口，当前全内存）。
- `apps/berkshire-agent/src-tauri/src/bridge.rs` + `sidecar_client.rs`（Rust 桥 command 面）。
- `apps/berkshire-agent/src/lib/api.ts`（webview 薄客户端）。
- `docs/architecture.md` §11、`docs/secondary-development.md` §8。

## 需求明细（验收点）
1. **设计持久化位置与格式**：在 `$BK_HOME` 下规划持久化目录（如 `$BK_HOME/state/`），每个插件有自己的命名空间（基于插件 id → 文件/目录映射）；选型 JSON 文件写入（明确**不是** DuckDB——DuckDB 单写者/表结构仍目标态）。
2. **能力缝三角色完整**：
   - **Definition**：core 增 `ctx.storage`（或 `ctx.store`）能力缝定义，`declare module` 增强 + 类型化方法（`get<T>(ns,key)` / `set(ns,key,value)` / `remove` / `list`），`@mode emit` 事件（如 `storage/changed`）。
   - **Provider**：sidecar 侧实现，读写 `$BK_HOME/state/<ns>/...`，校验命名空间合法（防目录穿越）、fail-closed、串行写、原子改名写（临时文件 + rename，避免半写坏文件）。
   - **Consumer**：至少一个已有插件（notify-console 或 demo）演示挂载时读写一条配置并在 log 留痕；写测试。
3. **跨边界接线**：sidecar 增协议方法（如 `storage_get` / `storage_set` / `storage_remove` / `storage_list`），Rust 增对应 command（`storage_*`）贴 `bridge.rs`；webview 薄客户端 `lib/api.ts` 增对应包装 + 订阅 `storage/changed` 事件。
4. **品牌化 / 类型**：命名空间 id 用 Branded 类型（参照 `CapabilityId`），禁裸 `string` 跨边界。
5. **测试**：boot/sidecar 层加持久化读写 / 命名空间校验 / 坏文件恢复的单测（`bun test`）。

## 硬约束
- 诚实：DuckDB 写者仍目标态，本方案是 `$BK_HOME/state` 的轻量持久化，不得声称是正式 DB。
- 能力缝必须三角色齐全（Definition/Provider/Consumer 一次完成，不拆给多方）。
- 注册即效应：副作用经 `ctx.effect()`/`ctx.on()`，`register()` 返回可逆 disposer；事件 `@mode` 标注。
- 跨边界 id 品牌化；配置/路径错误 loud-fail；fail-closed；不许把密钥明文落盘（AGENTS secrets 纪律）。
- 目录/路径校验防穿越；写文件原子（临时文件 + rename）。

## 范围边界（明确不做）
- 不做 DuckDB、事务、复杂查询、schema 迁移、正式 table 建模。
- 不把能力缝只做成核心的内部对象（必须三角色 + 文档 + 测试）。

## 产物与验证
- `packages/core` 增 storage 能力缝 Definition；`packages/sidecar` 增 Provider + 协议方法；Rust 增 command；`lib/api.ts` 增薄客户端；一个 demo/notify-console Consumer。
- 运行：`bun run build:packages`、`bun run typecheck`、`bun test`、`cargo check -p berkshire-agent --manifest-path apps/berkshire-agent/src-tauri/Cargo.toml`、`git diff --check`。
- 同步更新诚实锚点（architecture.md §11 / secondary-development.md §6/§8）。

## 完成定义（DoD）
- 插件经 `ctx.storage` 能持久化并重启后读回；目录越权/坏文件 fail-closed；三角色均有测试通过；文档诚实更新。