---
batch: 2
feature: cordis-probe-drawer
depends_on: [seams-plugins-service]
parallel_with: [settings-zustand-store]
---

# S2-cordis-probe-drawer —— 顶栏「Cordis 探针」Drawer（仅 dev 模式）

一句话目标：在**仅 dev 模式**下，于顶栏（StatusBar / 壳顶）增加一个「Cordis 探针」按钮，点开一个 Drawer，
展示当前**所有 Seams 与插槽**，并标注每项**来自哪个插件**。

## 背景与真相来源（先读再动手）

- [AGENTS.md](../../../AGENTS.md)；`docs/capability-seams.md`（五种缝/三角色）、`docs/quick-reference.md`。
- 关键真相（已核实）：
  - base-ui 壳：`packages/plugins/base-ui/src/client/{AppShell,StatusBar,TitleBar}.tsx`；`StatusBar` 右侧已有桥接态 + `layout.statusbar.right` 槽。顶栏按钮建议加在 `StatusBar`（或壳顶）。
  - 数据源（依赖本批次前置 S1）：`apps/berkshire-agent/src/lib/api.ts` 的 `seamsList()`（S1 提供：capabilities/slots/clientModules/services 清单）与既有 `clientList()`/`routesList()`/`capabilitiesList()`。`seamsList` 应含每项 `ownerPlugin`（来自 id `owner:` 前缀 + 插件名交叉引用）。
  - 组件库：`@berkshire/ui` 有 `Sheet`/`Dialog`/`Badge`/`Tooltip` 等原子组件，可包 Drawer；样式 CSS Modules + `var(--bk-*)`。
  - dev 判定：webview 侧用 Vite 的 `import.meta.env.DEV`（base-ui client 由 host 的 Vite build，此宏可用），无需跨边。
- **诚实边界（现状）**：能力缝类型、`client:hover`/`capabilities` 数据**存在**；但「seams 聚合快照」依赖前置包 S1（若 S1 未完成，本包先用 `capabilitiesList`+`clientList`+`routesList` 拼一个最小版本，并在文档标注为最小 MVP、待 S1 就绪后切换 `seamsList`）。

## 需求明细（验收点）

1. **dev-only 按钮**：仅在 `import.meta.env.DEV` 时，在顶栏渲染「Cordis 探针」按钮；生产构建不渲染。点击打开 Drawer。
2. **Drawer 内容**：
   - **插槽**：列出全部已知槽（`FRONTEND_SLOT_NAMES` 可用名 + 当前已注册项），每项标注 `id` 与 `ownerPlugin`；
   - **Seams（能力缝）**：列出能力清单（capabilities）+ 可用的核心服务名（seams 快照的 services）+ client 模块，各标来源；
   - 来源缺失/无法对齐时**显式展示原始 id**，不编造来源（fail-closed 精神）；有 `plugins/list`（S1）时与之交叉引用标插件名。
   - 无数据/拉取失败：显示空态/错误态（不崩）；Drawer 组件包 `ExtensionBoundary`（防御模式）。
3. **组件化**：新增 `src/client/CordisProbeDrawer.tsx` + `CordisProbeDrawer.module.css`（CSS Modules），并在 base-ui `client/index.tsx` 导出；按钮接 `@berkshire/ui` `Sheet`（滑出面板；或 `Dialog` 托盘）承载。
4. **数据接线**：经 `app` 层从 host `lib/api` 取快照（base-ui 不 import 宿主 lib/api——方案：宿主把探针所需的数据/刷新函数经 `root` 槽 context 注入，或按既有 `settings.section` 注入 storage 的同款姿势注入一个 `probe` 句柄）。选择哪种就明确做哪种，保持一致。
5. **诚实标注**：dev 工具只做呈现与枚举，不写盘、不产生业务副作用；把「探针是 dev 诊断工具、目标态」写入 JSDoc/文档。

## 硬约束（必须遵守）

- 三角色/只做 Consumer 呈现：本包是 `seams` 能力的 **Consumer**；不得重复实现 seam 聚合（交给 S1）。
- **防御模式**：坏插件/数据缺失绝不让宿主页崩（Drawer 内层级全包 `ExtensionBoundary`；拉取失败降级为错误提示）。
- 样式 `var(--bk-*)`，禁魔法色值；应用 [bk-code-review](../bk-code-review/SKILL.md)。
- 诚实：不 import 尚不存在的 `ctx.*`；S1 未就绪时用已有 `clientList/capabilitiesList` 拼最小版并在文档标「待 S1 切换 seamsList」。文案 [bk-prose-standard](../bk-prose-standard/SKILL.md)。

## 范围边界（明确不做什么）

- **不做**插件启停/管理（S3-plugin-manager-panel，勿加开关 UI）。
- **不做**运行时热装卸、不改 sidecar/core。
- **不做**生产模式显示（仅 dev）。
- **不新增**固定槽名；不依赖 zustand（那在并行包 S2-settings-zustand-store）。

## 产物与验证

- 产物：base-ui `CordisProbeDrawer.tsx`（+ css 模块 + `client/index.tsx` 导出）+ 顶栏按钮改造（StatusBar 或壳顶）+ 数据句柄接线；docs/dev 标注。
- 验证命令（真实存在）：
  - 根：`bun run build:packages`；`bun run typecheck`；
  - `apps/berkshire-agent`: `bun run build`；
  - 手动：`bun run dev`（dev 态）确认探针按钮出现、Drawer 列出 slots/seams 并标注来源；`bun run build && bun run preview`（或无 dev 的 bundle）确认按钮不出现。

## 完成定义（DoD）

- dev 构建显示探针按钮并可打开 Drawer，正确列出插槽 + Seams + 来源；生产构建不渲染按钮；
- 数据缺失/拉取失败降级不崩；来源无法对齐时显示原始 id；三层 build/typecheck 绿。