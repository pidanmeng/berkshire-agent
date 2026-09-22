---
batch: 1
feature: seams-plugins-service
depends_on: []
parallel_with: [settings-groups-seam]
---

# S1-seams-plugins-service —— 「Seams / 插件」清单 + 插件启停能力缝（sidecar 底层）

一句话目标：为「Cordis 探针 Drawer（批次 S2）」「设置弹窗插件管理（批次 S3）」提供**唯一可信的数据与生效底层**——
在 `@berkshire/core` 新增 `ctx.seams`（聚合能力缝/插槽/client 模块/服务的清单，含来源插件）与 `ctx.plugins`
（声明+已装载插件清单），并经 sidecar 协议方法 + Rust command + webview `lib/api` 薄客户端打通到前端；
同时提供「插件启停」：把某插件 `disabled` 落盘到 `$BK_HOME/cordis.yml` 并**重启 sidecar 重装配**（即「保存后立即生效」的诚实语义）。

## 背景与真相来源（先读再动手，勿凭 docs 表面猜实现）

- [AGENTS.md](../../../AGENTS.md)：仓库级契约（诚实标注、能力缝三角色、注册即效应、Rust 单写者、fail-closed、命令可用性）。
- 关键真相（已核实）：
  - 插件装载**只由 `$BK_HOME/cordis.yml` 驱动**：`packages/boot/src/entries-file.ts` 解析时把 `disabled` 归一为 `boolean`（原始行类型 `disabled?: unknown`，仅 `disabled === true` 才置 `disabled: true`），`packages/boot/src/index.ts` 的 `Boot.install` 在 `row.disabled` 时**跳过**（记入 `skipped`，不 import 不挂载）。
    sidecar（`packages/sidecar/src/index.ts`）现在把 `@berkshire/core` 行与其余行分开、逐行 `boot.install`，`disabled` 行自然被跳过——**改一个插件为 `disabled: true` 即停用**。
  - 服务都存在 `packages/core/src/`：`core.ts` 直装 `Slots`/`CapabilityRegistry`/`ClientModules`/`Datasets`/`DataSources`/`DatabaseService` 等九条；`ctx.slots.claims(name)`、`ctx.slots.routes()`、`ctx.capabilities.matrix()`、`ctx.clientModules.list()` 均可枚举。
  - 「写 `$BK_HOME` 配置 + restart sidecar」的完整模板**已落地**：`apps/berkshire-agent/src-tauri/src/bridge.rs` 的 `provision_bk_home`（`std::fs::write` 写 cordis.yml → `self.restart()` → `app.emit("sidecar://client/changed", …)`）；`restart()`= stop + spawn。**Rust 侧是 cordis.yml 的单写者**（sidecar 无特权、不裸写配置）。
  - 协议层在 `packages/sidecar/src/protocol.ts`（`dispatch` switch + `ESC` 错误码），薄客户端在 `apps/berkshire-agent/src/lib/api.ts`（`withTimeout` + `invoke`），Rust command 面在 `apps/berkshire-agent/src-tauri/src/lib.rs`。
  - 插件注册 id 是 `owner:name` 命名空间式（如 demo 插件 id `demo-fund-flow`、`demo-settings-section`，owner=`demo` ≈ 来源插件名），可用作来源标注的主线索。
- **诚实边界（现状）**：`EntryRow.disabled` 与 `Boot.install` 的跳过**已实现**；但**没有任何**「枚举待装配/已装配清单」的服务，也没有「改 disabled + 重启」的 command。运行时热装卸（不重启）仍是目标态，**本包不实现**。

## 需求明细（验收点）

1. **`ctx.seams`（`@berkshire/core`）**：新增服务，聚合一份「所有 Seams/插槽/服务/事件」清单快照，至少含：
   - `capabilities`：`ctx.capabilities.matrix()` 各项 + `usable`；
   - `slots`：按 `SLOT_NAMES` 枚举，每个槽位列出已注册声明（`id`、`order`、`route?`），并标注 `ownerPlugin`（来源插件）；
   - `clientModules`：`ctx.clientModules.list()` 各项（含 slot、exportName）；
   - `services`：核心脊已装服务名清单（log/capabilities/notifier/storage/slots/clientModules/datasets/dataSources/database）。
   - `ownerPlugin` 的解析：从注册 id 的 `owner:` 前缀推导，并可与 `ctx.plugins` 的插件名交叉核对；若无法对齐则显式给出原始 id 而非编造（fail-closed 精神）。v2 建议在注册声明上带显式 `plugin` 字段，本包 MVP 用前缀推导 + 交叉引用并在文档标注该限制。
   - 该服务**只是清单聚合**，不新造业务规则；类型增强用 `declare module '@berkshire/cordis'`（`@mode` 标注任何新增事件）、co-locate 于 `services/seams.ts`，并在 `core.ts` 装载。
2. **`ctx.plugins`（`@berkshire/core`）**：新增服务，承载「插件装配清单」快照：每项 `{ id, name, disabled, active, locked? }`。
   - `active` = 实际已装载（未 disabled）；`locked` = 不允许禁用（当前 **`@berkshire/core` 必须锁定**，对应首启必装锁定，禁掉会撤掉全部能力缝）。
   - 数据源头在 sidecar/boot，core 自身不知道 cordis.yml 内容——提供一个 `ctx.plugins.sync(rows: PluginRow[])` 由 sidecar 在装配后灌入（从 `readCordisYml` + `boot.mounted` 得来），并对任何登记名与 `locked` 规则校验（fail-closed）。
3. **sidecar 协议方法**（`packages/sidecar/src/protocol.ts` 的 `dispatch`）：
   - `seams/list` → `ctx.seams` 快照；
   - `plugins/list` → `ctx.plugins` 快照。
   - 在 `packages/sidecar/src/index.ts` 装配完成后调用 `ctx.plugins.sync(...)` 灌入从 `readCordisYml(bkHome)` 得到的行 + `boot.mounted` 的 skipped/active 结果。
4. **Rust command 面**（`apps/berkshire-agent/src-tauri/src/lib.rs` + `bridge.rs`）：
   - `plugins_list` → 委托 sidecar `plugins/list`（同 `client_list` 模板）；
   - `plugins_set_enabled` → 读 `$BK_HOME/cordis.yml`（Rust 单写者，`std::fs`），按入参把对应行的 `disabled` 置位/清除（锁定项拒绝），**写回同一文件**（保留原有行与 config），随后 `self.restart()` 重装配并 `emit sidecar://client/changed`。入参形如 `{ disabled: { "<id>": boolean } }`；校验非法 id / 尝试禁核心 → 响亮错误。
   - 若决定用独立的 patch 文件（`$BK_HOME/cordis.patch.yml` overlay）承载 `disabled` 而非直写 cordis.yml：前提是 `readCordisYml` 先扩展读取管线去合并 patch。**本包默认「直写 cordis.yml 的 disabled 行」**（最小、不新增读取管线），patch 层迁移留 v2 并在文档/注释标注。
5. **webview 薄客户端**（`apps/berkshire-agent/src/lib/api.ts`）：`seamsList()` / `pluginsList()` / `pluginsSetEnabled(disabled: Record<string, boolean>)`，全部 `withTimeout` fail-closed。
6. **文档诚实标注**：在适用于的 doc 更新「目标态 vs 已实现」清单——明确「运行时热装卸插件 仍是目标态；本包落地的是『persist disabled + 重启重装配』的启停语义」。

## 硬约束（必须遵守）

- 能力缝三角色完整：Service Definition（core 类型 + `declare module` 增强）／Provider（sidecar 装配 + 灌入 + 协议方法与 Rust command）／Consumer（webview api + 后续批次面板）。三角色由**本包一次性**完成，不拆给他人。
- 注册即效应：`ctx.plugins.sync` 等用 `ctx.effect()` 包裹并返回 disposer；新增事件标 `@mode`。
- **Rust 单写者**：`$BK_HOME/cordis.yml` 的写只发生在 Rust command，**不得**让 sidecar 写配置。
- fail-closed：`plugins_set_enabled` 对未知 id / 禁核心 / 文件坏 json 一律响亮报错；`seams/plugins list` 出错显式 reject。
- 跨边界 id 用既有品牌类型（`CapabilityId`/`ClientModuleId`/`StorageNamespaceId`）；新增 owner 解析不破坏现有 id 品牌。
- 诚实：不 import 尚不存在的 `ctx.*`；运行时热装卸标注目标态不实现。命令引用必须真实存在。
- 追加文案遵守 [bk-prose-standard](../bk-prose-standard/SKILL.md)、[bk-trim-cot-leakage](../bk-trim-cot-leakage/SKILL.md)。

## 范围边界（明确不做什么）

- **不做**前端 UI（探针 Drawer 归 S2、插件管理面板归 S3）——本包只到 webview `lib/api` 薄客户端为止。
- **不做**运行时热装卸/即时 install-uninstall（目标态）。
- **不做** `settings.section` 分组扩展（那在并行包 S1-settings-groups-seam，勿改 ui-slots/base-ui 的 SettingsDialog）。
- **不改** `EntryRow` 数据结构（`disabled` 已存在）；如需仅可在 boot 层改读取/合并逻辑，不重写 `readCordisYml` 语义。
- **不动**演示插件 demo 的注册（来源标注只读取，不改成显式 `plugin` 字段——留 v2）。

## 产物与验证

- 产物：`packages/core/src/services/{seams,plugins}.ts`（含 `declare module` 增强 + 事件）+ `packages/core/src/core.ts` 装载；`packages/sidecar/src/{protocol,index}.ts` 方法 + 灌入；`apps/berkshire-agent/src-tauri/src/{lib,bridge}.rs` command；`apps/berkshire-agent/src/lib/api.ts` 三个函数；相关 docs 的诚实清单更新。
- 验证命令（真实存在，按目录）：
  - 根：`bun run build:packages`（重建 core→boot→sidecar 链）；
  - 根：`bun run typecheck`；
  - `apps/berkshire-agent`: `bun run build`；
  - `apps/berkshire-agent/src-tauri`: `cargo check`；
  - `packages/sidecar`/`packages/boot`：现有 `bun test` 需保持绿（`bun run test` 在根）。
  - 手动冒烟：`bun run dev`，用 `pm`/Tauri 唤起 `plugins_list`、`plugins_set_enabled` 后观察 sidecar `activeCount` 变化与事件推送。

## 完成定义（DoD）

- `ctx.seams`/`ctx.plugins` 三角色齐、`seams/list`+`plugins/list` 经 sidecar→Rust→api 全链路跑通；
- `plugins_set_enabled` 能禁/启一个非核心插件并**重启后生效**（`active` 变化、`client/changed` 已推）、禁核心被拒；
- 三层 typecheck/build/cargo/test 绿；docs 目标态清单已诚实更新。