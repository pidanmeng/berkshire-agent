---
batch: 3
feature: plugin-manager-panel
depends_on: [seams-plugins-service, settings-groups-seam, settings-zustand-store]
parallel_with: []
---

# S3-plugin-manager-panel —— 设置弹窗「插件管理」面板：开关 + 保存即生效

一句话目标：在设置弹窗内新增「插件」设置分组：列出当前装配声明里**所有插件**（含禁用项），逐个开/关；点保存后
把 `disabled` 落盘到 `$BK_HOME/cordis.yml` 并**重启 sidecar 重装配**，即「保存后立即生效」。

## 背景与真相来源（先读再动手）

- [AGENTS.md](../../../AGENTS.md)；[AGENTS.md](../../../AGENTS.md) 顶部「目标态 vs 已实现」诚实纪律。
- 关键真相（已核实）：
  - 前置包 S1 已提供：`apps/berkshire-agent/src/lib/api.ts` 的 `pluginsList()`（声明+已装配清单，含 `{ id, name, disabled, active, locked? }`）与 `pluginsSetEnabled(disabled: Record<string, boolean>)`（Rust 读 `$BK_HOME/cordis.yml` → 置 `disabled` → 单写者写回 → `restart()` 重装配 → 推 `client/changed`）。
  - `EntryRow.disabled` + `Boot.install` 跳过（`packages/boot/src/index.ts`）已实现；`@berkshire/core` 是**必装锁定**（禁它会撤掉全部能力缝）。
  - 前置 S1-settings-groups-seam 已把左栏分组扩展好：本面板可作为**一个设置分组**接入（用分组机制声明「插件」分组 + 面板）。
  - 前置 S2-settings-zustand-store 已把只读 store 就位：本面板可读它（也可不依赖）。
- **诚实边界（现状→本包）**：**没有**任何插件管理 UI；「立即生效」= **重启 sidecar 重装配**（当前无运行时热装卸）。本包落地这一持久化+重启语义的 UI 与状态呈现。

## 需求明细（验收点）

1. **「插件」设置分组**：在设置弹窗新增「插件」分组（经 S1-settings-groups-seam 的分组机制声明），放管理面板组件（base-ui 持有一个，或经 `settings.section` 由 base-ui 作 provider 贡献）。
2. **列表与开关**：`pluginsList()` 拉取全部插件，每行显示插件名（name/id）、是否已激活、开关（Switch/Toggle）。
   - **锁定项**（`locked=true`，如 `@berkshire/core`）禁用开关、标注「必装不可禁用」。
   - 仅启停，不新增/删除插件声明（那仍走 `bun add` + 手改 cordis.yml / 未来包管理）。
3. **保存即生效**：点保存 → 由受影响项组 `disabled` map → 调 `pluginsSetEnabled(...)` → 前端显示「正在重装配…」状态，收到 `client/changed` / 重拉后的 plugins 快照回填激活态；失败 loudly 提示（不静默）。
   - 若用前置 store：把「待保存开关态」放 store 作为草稿，保存提交；也读取它做面板只读态。
4. **文档诚实**：明确「立即生效 = 重启 sidecar 重装配；运行时热装卸为目标态未实现」。pending 变更未保存即关弹窗时给出与 `StorageHandle` 一致的对账/未保存提示。

## 硬约束（必须遵守）

- 仅做 Consumer（调用 S1 提供的 `pluginsList`/`pluginsSetEnabled`）；不重复实现 sidecar/rust 逻辑。
- **不会破坏锁定项**：`pluginsSetEnabled` 对核心禁用的拒绝由 S1 保证，前端也必须禁用不可点。
- **防御模式**：面板组件包 `ExtensionBoundary`；拉取/保存失败降级为错误态，不崩弹窗/宿主。
- 样式 `var(--bk-*)` 禁魔法色值；[bk-code-review](../bk-code-review/SKILL.md)、[bk-prose-standard](../bk-prose-standard/SKILL.md)。
- 诚实：不 import 尚不存在的 `ctx.*`；把「立即生效=重启」与目标态热装卸分开陈述。

## 范围边界（明确不做什么）

- **不做**运行时热装卸 / 免重启即时切换（目标态，明确不实现）。
- **不做**包的安装/卸载（`bun add` / 从 cordis.yml 增删插件声明）。
- **不改** sidecar/core（S1 已提供后端）；**不改** `ctx.seams`/`ctx.plugins` 服务。
- **不新增**固定槽名。

## 产物与验证

- 产物：base-ui 新增插件管理面板组件（名单 + 开关 + 保存/重装配状态）+ 以「插件」分组接入设置弹窗（如需）+ 待保存草稿的 store 接线（如需）；docs（立即生效语义、锁定项）。
- 验证命令（真实存在）：
  - 根：`bun run build:packages`；`bun run typecheck`；
  - `apps/berkshire-agent`: `bun run build`；
  - 手动 `bun run dev`：在设置里禁用一个非核心插件 → 保存 → sidecar 重启，确认其 slots/clientModules 消失、重启后仍保持禁用；核心行开关不可点；错误路径有提示。

## 完成定义（DoD）

- 设置弹窗「插件」分组列出全部插件含禁用项、开关能保存并**重启生效**（active 变化 + client/changed 已推）；
- 锁定项不可禁用；错误 loud-fail；重启态有呈现；三层 build/typecheck 绿；docs 如实描述「立即生效=重启、热装卸待实现」。