---
batch: 1
feature: settings-groups-seam
depends_on: []
parallel_with: [seams-plugins-service]
---

# S1-settings-groups-seam —— 设置弹窗「左栏分组可插件贡献 + 右表单 provider 自定义 + 每插件 KV」契约

一句话目标：把 `SettingsDialog` 的左侧分组从**硬编码**（现为 `general/model/plugins` 写死在 `SettingsDialog.tsx`）改成**可由插件贡献**：
插件经共享缝 `@berkshire/ui-slots` 声明「设置分组描述符（id/label/order）+ 该组右表单组件」，base-ui 弹窗动态组成左栏分组、一一对应渲染右表单，
并在**协议上保证**插件设置项最终落到 `$BK_HOME/state/<插件自己的 ns>/<key>.json`。

## 背景与真相来源（先读再动手）

- [AGENTS.md](../../../AGENTS.md)；重点 `docs/quick-reference.md`（新行为放哪）、`docs/capability-seams.md`（三角色）。
- 关键真相（已核实）：
  - `packages/plugins/base-ui/src/client/SettingsDialog.tsx`：`GROUPS` 在 **44-49 行硬编码**（general/model/plugins），`active` state 定当前组；右栏 `general/model/plugins` 三分支；`PluginsSettingsPanel` 用 `<ExtensionSlot name="settings.section" context={{ storage }} />` 在「插件设置」组聚合展示全部面板。
  - `packages/plugins/base-ui/src/client/settingsGroups.ts`：`DEFAULT_SETTINGS_GROUPS`（general/model）是唯一分组骨架来源。
  - `packages/ui-slots/src/types.ts`：`FrontendSlotContextMap["settings.section"]` 目前只有 `storage: StorageHandle`；`SettingsGroup` 接口已存在；`FRONTEND_SLOT_NAMES` 是**固定数组**（fail-closed 校验未知槽），`root` 是 single、其余 list。
  - `packages/ui-slots/src/registry.ts`：`SlotRegistration` 支持 `id/order/apiVersion/component`；`slotRegistry.getSnapshot(name)` 返回含完整注册项的只读快照，可被消费者读取以做分组。
  - `packages/ui-slots/src/storage.ts`：`usePersistedField(storage, ns, key, opts)` = 「一个字段一键 KV + 同钥跨面板对账」；StorageHandle 已端到端落 `$BK_HOME/state/<ns>/<key>`。
  - demo 已有 `settings.section` 注册证明（`packages/plugins/demo/src/index.ts`：`demo-settings-section` + `DemoSettingsSection`）。
- **诚实边界（现状）**：持久化与 settings.section 槽**已实现**；缺的是「左侧分组可扩展」与「每面板自带分组元数据」以及「协议上强制插件用自己 ns」。

## 需求明细（验收点）

1. **`@berkshire/ui-slots` 扩展（契约层）**：
   - 导出 `SettingsGroupDescriptor { id; label; order; description? }`（可复用/扩展既有 `SettingsGroup`）；
   - `SlotRegistration` 增加可选 `group?: SettingsGroupDescriptor`（供 `settings.section` 注册项声明所属分组）；
   - `FrontendSlotContextMap["settings.section"]` 增加 `pluginNs: StorageNamespaceId`（**协议字段**：本面板所属插件的持久化命名空间）。
   - 保持 `FRONTEND_SLOT_NAMES` **固定**（不新增动态槽名；分组靠 list 槽的元数据，不建 `settings.group.*` 动态槽）。
2. **base-ui `SettingsDialog` 动态分组**：
   - 左侧分组 = `DEFAULT_SETTINGS_GROUPS` + 各 `settings.section` 注册项声明的 `group`（经 `slotRegistry.getSnapshot("settings.section")` 读取，去重、按 order 排序）；
   - 右栏 = 当前组对应的 `settings.section` 面板；未声明 `group` 的面板落入缺省「插件设置」组兜底；
   - 移除 44-49 行的硬编码三组 + active 三分支，改为按上述动态构造。每个面板仍包 `ExtensionBoundary`（坏插件不崩弹窗）。
   - 通用/模型组仍为壳自带面板（右侧表单不变）。
3. **持久化协议（每插件 KV 保证）**：设置弹窗把 `{ storage, pluginNs }` 随 `settings.section` 槽注入；每份 provider 面板**必须**用 `usePersistedField(storage, <自己的 pluginNs>, key, …)` 把**每个表单项落成一个 KV**（`$BK_HOME/state/<pluginNs>/<key>.json`）。协议层：面板不得在他人 ns 落键、必须有合法命名空间名（id 品牌规则）；弹窗/共享缝提供默认 `pluginNs` 读取（宿主注入）。
4. **demo 示例更新**：`DemoSettingsSection` 改为经 `pluginNs`（= `demo`）落自己的 KV；新增一个演示分组（如 `enabled: { id:'demo-extra', label:'演示扩展', order: 30 }`）验证「插件贡献一个左栏分组 + 自定义右表单」。
5. **文档诚实标注**：确认「settings.section 分组可扩展」落地；同时明确「新增跨 slot 动态槽名」**未做**（槽位保持固定，分组是 list 槽元数据，非新 slot）。

## 硬约束（必须遵守）

- 三角色完整：Definition（ui-slots 类型/契约）／Provider（插件注册 `settings.section` 项 + 声明 group）／Consumer（base-ui SettingsDialog 消费分组并注入 `pluginNs`）。
- 注册即效应：`settings.section` 注册/卸除即对应对账（client/changed）——装上即出现在左栏、卸下即消失。
- fail-closed：未知/非法分组 id、插件面板在非己 ns 落键、缺 storage/pluginNs 的行为要显式处理或响亮失败，不静默吞。
- 跨边界 id 品牌：`pluginNs` 用 `StorageNamespaceId` 品牌化。
- 前端样式用 `var(--bk-*)`、禁魔法色值；逻辑改动经 [bk-code-review](../bk-code-review/SKILL.md) 自查。文档遵守 [bk-doc](../bk-doc/SKILL.md)/[bk-prose-standard](../bk-prose-standard/SKILL.md)。

## 范围边界（明确不做什么）

- **不做** zustand store（归属 S2-settings-zustand-store，勿在 base-ui 加 zustand 依赖）。
- **不做**插件管理「启停面板」（归属 S3-plugin-manager-panel；本包只扩展分组机制）。
- **不改** core sidecar（`ctx.seams`/`ctx.plugins` 属并行包 S1-seams-plugins-service，不要在此动 sidecar）。
- **不新增**动态 slot 名（`FRONTEND_SLOT_NAMES`/`SLOT_NAMES` 保持固定）。
- **不动**通用/模型表单的字段集合语义（只改分组编排）。

## 产物与验证

- 产物：`packages/ui-slots/src/{types,registry,index}.ts`（`SettingsGroupDescriptor`/`group`/`pluginNs`/导出）；`packages/plugins/base-ui/src/client/settingsGroups.ts`、`SettingsDialog.tsx`（动态分组）；`packages/plugins/demo/src/index.ts` + `src/client/demoShellWidgets.tsx`（`pluginNs` 落 KV + 演示分组）；相关 docs。
- 验证命令（真实存在，按目录）：
  - 根：`bun run build:packages`；`bun run typecheck`；
  - `apps/berkshire-agent`: `bun run build`；
  - 手动：`bun run dev` 打开设置弹窗，确认 demo 演示分组出现在左栏、右表单可用、字段落 `$BK_HOME/state/demo/*.json`。

## 完成定义（DoD）

- 插件能经 `settings.section` 贡献一个新左栏分组 + 自定义右表单，且字段落**自己 ns** 的 KV；
- 未声明分组的旧面板仍落在缺省「插件设置」组（向后兼容）；卸载面板同步从左栏消失；
- 三层 build/typecheck 绿；docs 已诚实标注（分组可扩展已落地、动态槽未做）。