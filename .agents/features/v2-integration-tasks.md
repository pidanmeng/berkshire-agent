# v2 集成任务书：把 v1 headless 核心接进 berkshire-agent（Bun sidecar + Tauri 桥）

> 面向：把已落地的 v1 核心脊（`packages/core` + `packages/boot` + `packages/plugins/notify-console` + `packages/bundle/*`）按**目标拓扑 option B**（Tauri Rust 宿主 + Bun sidecar 跑 Cordis + React webview）真正接入 `apps/berkshire-agent`。
>
> 交付形态：**分任务的任务书**。每份 T# 独立、自包含、可单独喂给一个 agent/子代理按序执行；前面的任务是最低前提，请顺序跑、别并行改同一批文件。
>
> **诚实红线**：本文是「把已有 v1 接进真实应用」的执行指南，**不是目标态设计稿**。凡未做的一律标「目标态 / v3」，禁止把 `database`/`datasets`/`market`/`slots`/`clientModules`/DuckDB 写者/rspc 桥/`@berkshire/cordis` 当作已实现。

---

## 共同前置（每份任务书都必须遵守）

1. **先读再动手**：`docs/architecture.md`（§2 拓扑、§4 数据流、§11 现状锚点）、`AGENTS.md`、`docs/secondary-development.md`（尤其 §8 已实现的 v1 + 诚实标注）、`docs/capability-seams.md`（能力缝三角色）。
2. **能力即服务**：服务用 `class X extends Service` + `super(ctx,'key')` + `declare module 'cordis'` 挂到 ctx；消费走 `ctx.inject`，禁止直接 import 第三方服务实现。
3. **可逆效应**：所有副作用经 `ctx.effect` 包裹自带 disposer；卸载**逆序**清理；插件可热卸、不泄漏。
4. **类型化事件**：事件在 `declare module 'cordis'` 增强并标 `@mode`（现 v1 有 `notify/request`、`capabilities/changed`，均为 `emit`）；派发走事件系统，不用裸回调跨层。
5. **跨边界 id 品牌化**：跨 sidecar/Rust/webview 的 id 用 `Branded<T>`（`CapabilityId` 已落地；新增 `AssetId`/`DatasetId`/`SymbolId` 入类型层）。
6. **配置分层**：sidecar 启动组合 profile/bundle/patch 用现成 `composeEntries`；插件 enable/disable 走 bundle。
7. **fail-closed**：配置/缺依赖/无 provider 一律显式失败，禁止静默返回“看似合理”的结果。
8. **诚实标注**：改文档只动 `secondary-development.md` 状态栏与 `architecture.md §11` 现状锚点、`README`；五个设计主张文档（capability-seams/data-model/config/plugin-development/quick-reference）不得改设计主张。
9. **v1 现状锚点（已存在、可复现）**：`packages/core`（log/capabilities/notifier 缝/brand/typed events）、`packages/boot`（Boot + composeEntries 最小子集）、`packages/plugins/notify-console`、`packages/bundle/{base,headless}`；`bun test packages/boot/test/core.test.ts` = 6 pass；`cordis@4.0.0-rc.10` 官方包底座（非 `@berkshire/cordis`）。

---

## 任务总览与依赖

```
T0 定稿桥接协议（前提，先做）
 ├─ T1 sidecar 进程：长驻 core/boot + stdio JSON-RPC 服务
 ├─ T2 Rust 宿主：spawn/管理 sidecar + 命令 + Tauri events 透传
 ├─ T3 webview：最小消费（capabilities / notify / log 面板，坏桥不崩页）
 └─ T4 端到端验证 + 诚实文档回写（依赖 T1–T3）
（T5 打包为外部 binary：可选项、后续）
```

---

## T0 —— 桥接协议与切面定稿

- **目标**：在下游 agent 动手接线前，把「sidecar ↔ Rust ↔ webview 三者的边界、消息格式、能力路由」定死成一份可复现的协议文档，避免各方自造。
- **现状**：v1 sidecar 侧核心已可跑，但只是 `examples/headless.ts` 一次性脚本；尚无任何 stdio RPC、无 Rust、无 webview。
- **必选结论（本任务产出，须写进 `packages/sidecar/README.md`）**：
  1. **传输**：换行分隔 JSON（`application/x-ndjson`）走 sidecar stdio：sidecar `stdout`=发给宿主（响应+事件推送），`stdin`=宿主发来的请求。`stderr` 仅日志（不得混协议）。
  2. **协议**：简版 JSON-RPC 2.0 子集——请求 `{id, method, params}`，响应 `{id, result|error}`，宿主主动事件推送 `{event, payload}`（无 id）。id 用自增 number。
  3. **方法面**（第一批盖住 v1 能力，够证明「结构对」即可，别贪多）：
     - `capabilities/list` → `CapabilityReg[]`（含 usable）
     - `capabilities/usable` `{id}` → boolean
     - `notify/send` `{message,level?,channel?}` → `delivered[]`（触发 `notify/request` + log 记录）
     - `log/list` `{event?}` → `LogEntry[]`
  4. **事件推送**：sidecar 内部 `notify/request`、`capabilities/changed` 经桥以 `{event, payload}` 推给宿主（宿主再决定是否转 Tauri events 给 webview）。这是「不可见事件 ⇏ webview 可见」的诚实边界：先只推、不承诺全量订阅。
  5. **生命周期**：sidecar 支持 `shutdown` 一行（host 发）触发 boot 逆序销毁后退出码 0；host 侧有 `restart`。
- **诚实边界**：不接 DuckDB（仍目标态）；不接 rspc（本次用 Tauri 原生 command + Tauri events，rspc/specta typed bridge 标 v3 差异）；`dump-config`、`!!js`、isolate/group、HMR 仍 v2 之后。
- **验收**：协议文档含 一个请求样例 + 一个事件推送样例 的原始 ndjson 字节；`git diff --check` 干净。
- **复现**：无代码，仅文档。

---

## T1 —— sidecar 进程：长驻核心 + stdio JSON-RPC 服务

- **目标**：把一次性的 core/boot 变成可被宿主拉起、可对话的常驻进程。
- **现状**：`packages/boot` 提供 `Boot`（`mountFromLayers` + `composeEntries`）+ `dispose()`；`ctx.*` 核心服务可用；`packages/bundle/*` 是可复现配置层。
- **交付**：
  1. 新包 `packages/sidecar`（`@berkshire/sidecar`），入口 `src/index.ts`：`bun run packages/sidecar/index.ts` 可启动。
  2. 启动即按 `composeEntries([baseBundle])` 挂载 core + notify-console（BaseBundle 由 sidecar 显式引用真实 bundle 的 patch 文件或模块）；第一条消息前完成装配。
  3. ndjson 读循环：`readline` 逐行；解析成功 → 分发到上面四个方法（经 `ctx.*` 服务调用，不直连实现）；解析失败/未知方法 → `{id, error}`（fail-closed，不吞）。
  4. 事件推送：订阅 `ctx.on('notify/request')` / `ctx.on('capabilities/changed')`，即时写 `{event, payload}` 到 stdout（注意行缓冲/flush）。
  5. `shutdown`：先 `boot.dispose()`（逆序清理，验证顺序写在日志），再 `process.exit(0)`。
  6. 单独可测的协议层：把「一行请求 → 一行响应/错误/推送」抽成纯函数 `handleLine(netline, deps)`，便于 T4 单测。
- **契约**：能力经 `ctx.*` 服务；neither 直接 import 插件实现裸调；事件标 `@mode`；品牌 id 用于跨 id。
- **诚实边界**：均为内存实现；持久化目标态。进程只由宿主拉起（本任务先支持手动 `bun run` 冒烟，宿主拉起在 T2）。
- **验收**：`echo '<req>\n' | bun run packages/sidecar/index.ts` 能回一个响应行；`shutdown` 后退出码 0。**自行写冒烟脚本**覆盖四方法。
- **复现**：`bun install` → 冒烟脚本 → 贴 terse 输出。

---

## T2 —— Rust 宿主：spawn/管理 sidecar + 命令 + Tauri events 透传

- **目标**：Tauri 进程能拉起 sidecar、发请求、收响应/事件，并暴露给 webview。
- **现状**：`apps/berkshire-agent/src-tauri/src/lib.rs` 仅默认 `greet`；`main.rs` 标准模板；`tauri.conf.json` + `capabilities/default.json` 为脚手架默认。
- **交付**：
  1. `apps/berkshire-agent/src-tauri/src/bridge.rs`：管理 sidecar 子进程（`std::process::Command` 起 `bun run packages/sidecar/index.ts`，或经 `tauri-plugin-shell`），持有子进程句柄与读写 sidecar stdio 的线程；提供 `start/stop/restart` 与**带 id 的请求-响应配表**（发请求挂 Promise，收到响应/错误按 id settle）。
  2. `lib.rs`：注册以下 Tauri command（走 bridge）: `capabilities_list`、`capabilities_usable(id)`、`notify_send(payload)`、`log_list(event?)`；bridge 启动由 `app.setup` 触发。
  3. **Tauri events 透传**：bridge 收到 sidecar 的 `{event,payload}` 推送 → `app_handle.emit("sidecar://<event>", payload)`；事件名保持域前缀（`notify`/`capabilities`）。
  4. `linker_demo`：让 `greet` 场景保留即可；新命令作为 v1 接线的最小面，不加 rspc。
  5. 权限：`capabilities/default.json` 若用 `tauri-plugin-shell` 才需要新增 shell 权限；仅当用 shell 时才引入该插件（能不用则用原生 `Command` 最小化）。
- **诚实边界**：DuckDB 单写者仍目标态；rspc/specta 仍目标态（本次用原生 command+event，差异记入 secondary-development §8）；sidecar 的打包 externalBin 属 T5。
- **验收**：`cargo build`（或 `bun run tauri dev`）通过；Rust 侧有对 bridge 的 spawn/round-trip 单测（或用 `tauri-driver`/集成冒烟）——若环境不便跑 GUI，则提供 `#[cfg(test)]` 对「一行 ndjson 请求→响应」的逻辑单测。
- **复现**：`cargo build -p berkshire-agent` 与 bridge 单测的干净输出。

---

## T3 —— webview 最小消费：capabilities / notify / log 面板（坏桥不崩页）

- **目标**：证明核心真的为前端所用，且坏插件/断桥绝不拖垮页面（slot 纪律）。
- **现状**：`apps/berkshire-agent/src/` 仅 `main.tsx`/`App.tsx` 默认模板，无 router/store/api。
- **交付**：
  1. `apps/berkshire-agent/src/lib/api.ts`：薄客户端包装四个 command + 订阅 `sidecar://*` Tauri events（typed）。
  2. 一个**极简 demo 面板**组件（可放 `App.tsx` 或独立组件）：渲染 `capabilities/list`，一个按钮触 `notify/send`，并显示最近 `log/list`；把 sidecar 推送的 `notify/request` 事件实时追加显示。
  3. **ExtensionBoundary 纪律**：整个面板包在错误边界内；bridge 断/超时 → 显示「bridge 不可用」横幅 + console.warn，**绝不崩宿主页**（沿用 plan 中 `ExtensionBoundary` 精神，先简单实现）。
  4. 类型：跨边界 payload 用共享类型（品牌 id），v1 的 `CapabilityId` 已接。
- **诚实边界**：这不是正式 slot/router（那些是目标态）；仅是「核心→前端可用」的最小证明面。
- **验收**：`bun run build`（tsc + vite build）通过；dev 下面板能列出能力并触发一次 notify、看到 log 增长、断桥时页面仍可交互。
- **复现**：`bun run dev`（或 `bun run build`）输出。

---

## T4 —— 端到端验证 + 诚实文档回写

- **目标**：收口——一条真实请求从 webview → Rust → sidecar → 核心 → 事件回推 webview 全链路可自测；并落账。
- **交付**：
  1. **自动化**：`packages/sidecar/test/*.test.ts`（bun test）覆盖——spawn 后四个方法 round-trip、事件推送、`shutdown` 逆序销毁顺序；延续 v1 已通过的 6 用例做回归。
  2. **手动/CI 冒烟**：`bun run tauri dev` 下点一遍面板，截图输出不在本仓库要求，但给出可复现命令与 clean 关键输出。
  3. **文档**：回写 `docs/secondary-development.md` 新增/更新 §8（把 sidecar/Rust bridge/webview 面板标记为「已实现 v2」，DuckDB/rspc/`@berkshire/cordis`/packaging 仍目标态或 v3）；更新 `architecture.md §11` 现状锚点为真实文件行引；`README` 加 v2 现状一句。五个设计文档不动设计主张。
  4. AGENTS.md 若把 `packages/` 仍写死「目标态」的表述，同步改为「核心脊 v1 已实现 + v2 已接线」。
- **验收**：全仓库 `bun test`（v1 6 用例 + sidecar 新增）全绿；`git diff --check` 干净；文档的「已实现 vs 目标」边界与代码一致（可让 bk-code-review 技能复核）。
- **复现**：`bun test`、`cargo build -p berkshire-agent`、`bun run build`、`bun run dev` 各贴关键输出。

---

## T5 —— 打包外部 binary（可选，标记为后续，不在本次硬性验收）

- 目标态：把 sidecar 从 `bun run .../index.ts` 升为 Tauri externalBin（`sidecar` 节 + capabilities 访问白名单 + 版本对齐），配 `tauri.conf.json` 注入 `${sidecarName}` 启动参数。若时间/环境不允许，明确定为 v3 目标并诚实标注，**不冒充已实现**。

---

### 交接建议
- 顺序执行 T0→T1→T2→T3→T4；每份任务书产出后先跑「bk-code-review」技能按仓库契约复核再合入。
- 任一任务若发现与上述「现状锚点」不符（文件不存在/命令不通），停下来诚实报告，不要从目标态文档推断实现。