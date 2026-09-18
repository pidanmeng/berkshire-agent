# 桥接协议 v1（sidecar ↔ Rust 宿主 ↔ webview）

> 本文是 **T0 定稿的桥接契约**：在 T1–T3 接线前，把「Bun sidecar ↔ Tauri Rust 宿主 ↔ React webview」三者的边界、消息格式与能力路由定死成一份可复现的协议，避免各方自造。
>
> **诚实标注**：本文件描述的是**目标协议契约**，`packages/sidecar` 的代码（长驻进程 + stdio JSON-RPC）由 **T1 落地，当前尚未实现**——现在仓库里还没有任何 sidecar 可运行。凡未落地即标「目标态/T#」，不得把本文当作可 import 的实现。

## 定位

选这一个方案的条件：你已落地 v1 headless 核心脊（`packages/core` + `packages/boot` + `packages/plugins/notify-console` + `packages/bundle/*`，见 [secondary-development.md §8](../../docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)），想把核心真正接进 `apps/berkshire-agent`，路径为 **Option B**（Rust 宿主 + Bun sidecar + React webview，见 [architecture.md §2](../../docs/architecture.md#2-运行时拓扑)）。

## Summary

协议用**换行分隔 JSON（`application/x-ndjson`）**跑在 sidecar 的 **stdio** 上：`stdout` 只承载协议（sidecar 发给宿主的响应 + 事件推送），`stdin` 只收宿主发来的请求，`stderr` 仅供日志、绝不混协议。报文是**简版 JSON-RPC 2.0 子集**（请求 `{id,method,params}`、响应 `{id,result|error}`、宿主主动事件 `{event,payload}`），第一批方法面只盖住 v1 能力（`capabilities/list`、`capabilities/usable`、`notify/send`、`log/list` + 生命周期 `shutdown`），够证明「结构对」即可，不贪多。sidecar 上报一个内部事件就推一行事件，宿主再决定是否转成 Tauri event 给 webview。

主要代价：它是**一次性进程契约**，跨进程只传 JSON、无类型化编解码（rspc/specta typed bridge 标 v2，见 [secondary-development.md §8](../../docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)）；持续高频行情不推荐逐 tick 走这条桥（见 [architecture.md §2](../../docs/architecture.md#2-运行时拓扑) 高吞吐路径）。

## 角色与边界

| 端 | 角色 | 职责 |
| --- | --- | --- |
| **进程 B · Bun sidecar** | Cordis 运行时（插件 VM） | 长驻 mount core + notify-console；读 `stdin` 请求、经 `ctx.*` 服务应答、写 `stdout` 响应/事件；只写 `stderr` 日志 |
| **进程 A · Tauri Rust 宿主** | 薄原生宿主 + 桥 | `spawn/restart` sidecar、按 `id` 做请求-响应配表、把事件转发为 Tauri event（T2） |
| **进程 C · React webview** | 消费者 | 薄客户端包装命令 + 订阅事件；坏桥不崩页（T3） |

能力缝纪律（[AGENTS.md](../../AGENTS.md)）：sidecar 侧一律经 `ctx.*` 服务调用（`ctx.capabilities` / `ctx.notifier` / `ctx.log`），**禁止直接 import 插件实现裸调**；跨边界 id 用 `Branded<T>`（v1 已落 `CapabilityId`，见 [core/src/brand.ts](../core/src/brand.ts)）。

## 传输层（ndjson + stdio 分工）

- **编码**：每个原文按 `JSON.stringify` 序列化为**一行**，行尾 `\n`；读取端按行解析，**一行一报文**。
- **`stdout`**：仅供协议——sidecar → 宿主的**响应行**与**事件推送行**。**不得**混入其他输出。
- **`stdin`**：仅供协议——宿主 → sidecar 的**请求行**。
- **`stderr`**：仅供日志——启动/装配/dispose 顺序、错误、调试。**绝不**写协议。
- **装配注意（T1）**：`notify-console` 插件默认 `echo: true` 会 `console.log` 到 **stdout**，直接污染协议流。sidecar 装配的 base bundle 里必须把 notify-console 的 `echo` 置 `false`（或把该插件的输出重定向到 `stderr`）——**stdout 独占给协议**。这是 T1 的一个装配点，此处先记入契约。
- **行缓冲/flush**：事件推送要即时可见，写 `stdout` 后尽快 flush；禁止攒批直到进程退出。

## 报文格式

### 请求（宿主 → sidecar）

```jsonc
{ "id": 1, "method": "capabilities/list", "params": {} }
```

- `id`：**自增 number**，宿主侧维护，从 1 起每发一请求 +1；sidecar 用它把响应与请求配对。允许**流水线**（宿主可不等前一个响应就发下一个）。
- `method`：字符串，见下方方法面。
- `params`：对象（可为空 `{}`）。

### 响应（sidecar → 宿主）

成功：

```jsonc
{ "id": 1, "result": [ /* … */ ] }
```

失败（JSON-RPC 标准错误对象，额外允许 `data`）：

```jsonc
{ "id": 1, "error": { "code": -32000, "message": "notify: no provider registered (fail-closed)" } }
```

- 响应**不一定按请求顺序返回**，以 `id` 配对（T2 的配表据此 settle Promise）。
- 标准错误码：`-32700` 解析错误 / `-32600` 非法请求 / `-32601` 方法未找到 / `-32602` 非法参数 / `-32603` 内部错误；业务 fail-closed 用 `-32000`（应用错误）。

### 事件推送（sidecar → 宿主，无 `id`）

```jsonc
{ "event": "capabilities/changed", "payload": { "capability": "notify-console", "usable": true } }
```

- 与请求/响应**并行交错**出现在 `stdout`；以**无 `id` + 有 `event`** 判型，不与响应混淆。
- 事件名保持域前缀（`notify` / `capabilities`），见下方事件推送节。

## 方法面（v1 最小面）

| method | params | result | 说明 |
| --- | --- | --- | --- |
| `capabilities/list` | `{}` | `{ id, label, usable }[]` | 能力快照；`usable` 是桥上投影（由 `ctx.capabilities.usable(id)` 逐项计算，非内部 `CapabilityReg` 字段） |
| `capabilities/usable` | `{ id }` | `boolean` | 门控查询；未知 id 返回 `false`（fail-closed，不抛） |
| `notify/send` | `{ message, level?, channel? }` | `string[]` | 触发 `notify/request` 事件 + 记录进 `ctx.log`；返回 `delivered[]`（实际投递成功的 provider id） |
| `log/list` | `{ event? }` | `LogEntry[]` | 追加式只读快照；`event` 缺省返回全量，否则按事件名过滤 |
| `shutdown` | `{}` | `null` | 触发 boot 逆序销毁后 `process.exit(0)`（见生命周期） |

参数/返回类型对齐 v1 类型（[core/src/types.ts](../core/src/types.ts)）：`message: string`、`level?: 'info'|'warn'|'error'`、`channel?: string`；`LogEntry = { id, event, data, at }`。

> `notify/send` 的「记录进 `ctx.log`」由已挂载插件 notify-console 对 `notify/request` 事件完成（日志事件键为 `notify/request`，data 含 `provider`/`message`/`level`）；`ctx.notifier.send()` 本身**不写日志**——T1 实现勿在桥内重复记录。

### fail-closed 映射

- `notify/send` 在**无 provider** 时 `ctx.notifier.send()` 抛错 → 桥把异常转成 `{ id, error: { code:-32000, message } }` 返回，**不吞、不静默返回看似合理的结果**（[AGENTS.md](../../AGENTS.md) fail-closed）。
- `capabilities/usable` 未知 id 返回 `false`（门控语义即 fail-closed，不是错误）。
- 解析失败 / 未知 method → 对应标准错误码返回，绝不停机或静默跳过。

## 事件推送

sidecar 订阅内部事件，以 `{ event, payload }` 推送（payload 即事件载荷）：

| event | payload | @mode | 触发时机 |
| --- | --- | --- | --- |
| `capabilities/changed` | `{ capability: CapabilityId, usable: boolean }` | emit | 能力注册（`usable:true`）/卸除（`usable:false`） |
| `notify/request` | `NotifyPayload`（`{ message, level?, channel? }`） | emit | 每次 `notify/send` 广播 |

事件定义见 [core/src/events.ts](../core/src/events.ts)，均标 `@mode emit`。

**诚实边界（不可见事件 ⇏ webview 可见）**：sidecar 只负责把事件推到 `stdout`；**是否把某事件透传成 Tauri event 给 webview，由宿主决定（T2）**。本协议先只「推」，不承诺全量订阅。

## 生命周期

- **启动**：sidecar 被 `bun run packages/sidecar/index.ts` 拉起后，先在**第一条消息前**完成装配（`boot.mountFromLayers([baseBundle], resolver)`，内部即 `composeEntries` → `installAll`，mount core + notify-console），再进入 ndjson 读循环。
- **shutdown**：宿主发一行请求 `{"id":N,"method":"shutdown","params":{}}` → sidecar 先 `boot.dispose()`（逆序清理，清理顺序写进 `stderr` 日志），再 `process.exit(0)`。
- **restart**：`restart` 是**宿主侧行为（T2）**，非 sidecar 方法——宿主负责杀掉并重新 spawn 子进程。

## 原始字节样例

下面每行是 `stdout` 上的**一条 ndjson 报文**（已去掉 `\n` 的转义展示；实际传输以 `\n` 结尾）。

请求（宿主→sidecar，一条 `stdin` 行）：

```json
{"id":1,"method":"capabilities/list","params":{}}
```

响应（sidecar→宿主，`stdout` 行，与请求按 `id` 配对）：

```json
{"id":1,"result":[{"id":"notify-console","label":"Console 通知","usable":true}]}
```

事件推送（sidecar→宿主，`stdout` 行，无 `id`，可与响应交错）：

```json
{"event":"capabilities/changed","payload":{"capability":"notify-console","usable":true}}
```

> 上例的 `notify-console` 能力与 label 来自 [plugins/notify-console/src/index.ts](../plugins/notify-console/src/index.ts) 的注册，可在 T1 实装后按此比对。

## 诚实边界（T0 不做的）

- **不接 DuckDB**：`ctx.log` 仍为进程内内存日志；`sessions_log` 持久化标 v2 目标态。
- **不接 rspc/specta**：本次用 Tauri 原生 command + Tauri events；rspc typed bridge 属 v2 差异（与 [secondary-development.md §8](../../docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊) 的 v2 标注一致）。
- **notify-console 单 provider**；per-channel 路由、并行 mode 仍 v2。
- `dump-config`、`!!js`、isolate/group、HMR 仍 v2 之后。
- **跨边界 id**：本协议只走已落地的 `CapabilityId`；`AssetId`/`DatasetId`/`SymbolId` 仍是类型占位（v2 接入业务服务时再进桥）。

## 复现与验收

- 本任务（T0）为**纯文档**，无代码可跑。
- 验收：本文含「一个请求 + 一个事件推送」两段原始 ndjson 字节样例（见上）；`git diff --check` 干净。
- 实现与可执行复现见 **T1**（sidecar 进程 + stdio JSON-RPC）之后各任务书。

## 交叉引用

- 目标拓扑： [architecture.md §2](../../docs/architecture.md#2-运行时拓扑)、§4 数据流
- v1 现状锚点： [secondary-development.md §8](../../docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)
- 能力缝三角色 & 事件： [capability-seams.md §1/§5](../../docs/capability-seams.md)
- 配置分层组合： [config.md §4](../../docs/config.md#4-怎么写一个-bundle-的-patch)（`composeEntries`/`applyEntryPatches` 见 [boot/src/entries.ts](../boot/src/entries.ts)）
- 桥接代码落地： T1（`packages/sidecar`）→ T2（Rust `bridge.rs`）→ T3（webview）→ T4（端到端验证）
