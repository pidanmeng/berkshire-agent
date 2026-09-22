---
batch: 2
feature: settings-zustand-store
depends_on: [settings-groups-seam]
parallel_with: [cordis-probe-drawer]
---

# S2-settings-zustand-store —— base-ui 提供 zustand 设置 store（双向绑定 + 对插件只读）

一句话目标：base-ui 提供一个 **zustand** 设置 store，作为设置弹窗「通用/模型 + 壳内置字段 + 主动接入面板」的**前端态唯一真源**，
与弹窗表单**双向绑定**；把**只读**视图暴露给所有插件（设置面板经槽 context；需要全局只读的插件经共享缝/导出句柄读快照）。

## 背景与真相来源（先读再动手）

- [AGENTS.md](../../../AGENTS.md)；`docs/capability-seams.md`、`docs/quick-reference.md`。
- 关键真相（已核实）：
  - base-ui `package.json` **目前无 zustand**（干净依赖）。新增依赖要在本包 `package.json` 声明，host 侧经 `sharedImportMap`（`apps/berkshire-agent/src/lib/sharedImportMap.ts`）保证共享单例。
  - 设置弹窗 `packages/plugins/base-ui/src/client/SettingsDialog.tsx`：通用/模型表单用 `usePersistedField(storage, SETTINGS_NS, …)`（`settings` ns）。持久化管线端到端已好（StorageHandle → `$BK_HOME/state/<ns>/<key>`，且经 `storage/changed` 对账）。
  - 共享缝 `@berkshire/ui-slots` 是插件共同 import 的唯一共享包；插件架构上**不 import 宿主，也不应反向 import base-ui**（依赖方向约束）。
  - `storage.ts` 的 `usePersistedField` 已把「字段 ↔ KV + 跨面板对账」封装好。
- **诚实边界（现状）**：无任何 zustand store；「双向绑定全部内容」对**插件 provider 自定义的右表单不成立**——那是插件自己的组件，base-ui 无法强制改它们的 state。本包的有效边界 = base-ui 渲染的字段 + 主动选择接入 store 的面板。

## 需求明细（验收点）

1. **zustand store（base-ui）**：新增设置 store（如 `src/client/settingsStore.ts`），state 覆盖通用/模型等壳内置字段；作为**前端态唯一真源**。表单读写均走 store。
2. **双向绑定**：
   - 表单组件从 store 订阅当前值、写 store 更新值；
   - store 变更 → 经既有 `StorageHandle` 落 KV（persist）；`storage/changed` 外部写入同键 → 对账回写 store（复用 `usePersistedField` 已有的对账思路或组合它，**避免两套前端 state 漂移**——明确 store=前端真源、KV=持久化，二者单向/双向映射的规则写进文档）。
   - 说明 store 字段的 keys 与现有 `settings` ns 的 KV keys 映射。
3. **对插件只读暴露**（依赖方向干净，二选一或两者并做）：
   - (a) **经槽 context**：`settings.section`（及必要时 `settings.cards`）context 增加一个**只读** handle（如 `settingsReadonly: { get(key); subscribe(cb); snapshot(): Record<string, unknown> }`），类型定义在 `@berkshire/ui-slots`（纯接口，不依赖 zustand），由 base-ui 注入实现——设置面板内取用；
   - (b) **全局只读**：从 base-ui client 入口导出一个**只读** selector/订阅（只暴露 get/useReadonly，不暴露 setter），供确实需要全局只读且愿意依赖 base-ui 的插件使用；或把只读订阅基座放 `@berkshire/ui-slots`（lib-free），base-ui 实现，插件经共享缝 import。
   - 类型上**只给读**：不把 `set` 暴露进只读接口。
4. **接入新 store 组**：`GeneralSettingsForm`/`ModelSettingsForm`（及新增壳字段）切到 store 驱动，同时保持持久化不回归（比较 S1 起行为）。
5. **文档诚实**：写明「双向绑定的有效边界 = base-ui 字段 + 主动接入 store 的面板；插件自定义右表单不被强制」。`zustand` 依赖变更记入 base-ui `package.json`。

## 硬约束（必须遵守）

- 依赖方向：插件**不反向 import base-ui**；只读暴露经共享缝 `@berkshire/ui-slots`（接口）或 base-ui 导出仅供明确愿意依赖者。zustand 只进 base-ui，不进 ui-slots（ui-slots 保持 lib-free 语义）。
- 持久化纪律：凭据字段仍走「只存环境变量/引用名、绝不落明文」；不因 store 改变 fail-closed/loud-fail 校验。
- 防御模式：无 handle 时降级不崩（对齐 `usePersistedField` 无 handle 退化）。
- 样式 `var(--bk-*)`；[bk-code-review](../bk-code-review/SKILL.md)；只读暴露的契约文档 [bk-doc](../bk-doc/SKILL.md)。
- 诚实：不 import 尚不存在的 `ctx.*`。

## 范围边界（明确不做什么）

- **不做**插件启停面板（S3）。
- **不做**探针 Drawer（并行包 S2-cordis-probe-drawer）。
- **不做**强制把 provider 自定义表单纳入双向绑定（明确边界）。
- **不改** sidecar/core（属 S1-seams-plugins-service）。
- **不新增**固定槽名；`FRONTEND_SLOT_NAMES` 固定。注意：与并行包 S2-cordis-probe-drawer **共享** base-ui `client/index.tsx` 导出区，各自新增导出即可，改动集中、避免互相踩。

## 产物与验证

- 产物：base-ui `src/client/settingsStore.ts`（zustand）+ `SettingsDialog.tsx` 通用/模型表单改 store 驱动 + 只读 handle 注入；`packages/ui-slots/src/types.ts`（只读接口 + `settings.section` context 扩展只读字段）若有改动；base-ui `package.json`（zustand deps）；docs。
- 验证命令（真实存在）：
  - 根：`bun run build:packages`；`bun run typecheck`；
  - `apps/berkshire-agent`: `bun run build`；
  - 手动 `bun run dev`：改通用/模型字段 → 立即落 KV；外部改写同键 → 表单对账回填；确认只读接口拿不到 setter（类型 + 运行时不暴露）。

## 完成定义（DoD）

- zustand store 就位、通用/模型字段经它双向绑定并持续化到 `$BK_HOME/state/settings/*`；
- 插件经只读 handle/订阅拿到快照且**拿不到 setter**；无 handle 降级不崩；
- store 与 `usePersistedField` 不漂移；三层 build/typecheck 绿；docs 诚实标注有效边界。