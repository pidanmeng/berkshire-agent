# 落地任务书：插件定义「页面 / 样式 / 前端组件」的能力 + Demo

> 面向：把 BK 的 **client 插件（L2 前端扩展契约）**从目标态真正落地到 `apps/berkshire-agent`——让一个插件能够**声明页面、注入样式、注册前端组件**，并各自经 `ExtensionBoundary` 隔离挂进宿主壳；最后交付一个可跑 Demo。
>
> 交付形态：**分任务提示词（T#）**。每份自包含、可单独喂给一个 agent/子代理按序执行；前面的任务是最低前提，请顺序跑、别并行改同一批文件。
>
> **诚实红线（本项目第一纪律）**：本文是「落地 client 插件能力」的执行指南，面向**真正的代码落地**；但凡是这段落地里仍没做的，一律标「**目标态 / v-next**」，禁止把未实现的 `slots`/`clientModules`/router/store/DuckDB/`@berkshire/cordis`/rspc 桥当已实现。已有锚点见下文「共同前置」。

---

## 术语对齐（本文用词即本项目术语）

- **slot（前端插槽）**：宿主壳预先挖好的 UI 挂点，名字固定（`stock-preview.footer` / `analysis.menu` / `watchlist.toolbar` / `detail.tabs` / `settings.cards` / `chart.overlay` / `layout.navigation.extra`）。插件往槽里挂组件，失败时降级不崩页。
- **client 插件图（`ctx.clientModules`）**：需要富 UI 的插件在 sidecar 侧注册前端 bundle + 它占用的 slot；bundle 经宿主提供给 webview 挂载。这是「插件定义页面/组件」的载体。
- **样式注入**：插件随其 bundle 携带样式（CSS），需保证**作用域隔离、不污染宿主与其它插件**。
- **页面**：插件声明的独立路由/菜单项（`analysis.menu` 动态菜单 → 前端路由），静态路径、不覆盖核心路径。
- 上述三者的**挂点（壳）归中枢**，挂载内容归插件（见 `docs/capability-seams.md §1`）；中枢不实现任何业务 UI。

---

## 共同前置（每份任务书都必须遵守）

1. **先读再动手**：`docs/architecture.md`（§2 拓扑、§11 现状锚点）、`AGENTS.md`（头条约束）、`docs/secondary-development.md`（§4 前端扩展契约、§8 已实现 v1/T1–T3 诚实标注）、`docs/capability-seams.md`（能力缝三角色）、`docs/plugin-development.md`（§3 加分析页、§4 加 UI slot）。
2. **前端扩展契约（L2，来自 secondary-development §4）**：
   - slot 组件**始终包在 `ExtensionBoundary`**，失败降级为 null/横幅 + 控制台日志，绝不让坏插件拖垮宿主页。
   - client bundle 注册后经宿主交给 webview；路由注入须**静态路径**且**不得覆盖核心路径**。
   - id 校验、API 版本、重复 id/路径冲突在注册时**响亮拒绝**。
   - store 用 zustand 作用域化（per workspace/插件域），避免跨插件污染。
3. **注册即效应、可逆**：sidecar 侧一切注册走 `ctx.effect()` 并返回 disposer；卸载**逆序**清理；插件可热卸不泄漏。
4. **类型化**：slot 上下文用**类型化 map**（`FrontendSlotContextMap`）约束 `context` props；跨 sidecar/Rust/webview 的 id 用 `Branded<T>`。
5. **fail-closed**：缺 slot 宿主 / 路由冲突 / bundle 加载失败 → 显式失败或降级横幅，禁止静默返回“看似合理”的结果。
6. **诚实标注**：落地后只同步 `docs/secondary-development.md` 状态栏、`docs/architecture.md §11` 现状锚点、`README`；五个设计主张文档（capability-seams/data-model/config/plugin-development/quick-reference）不动设计主张。
7. **真实现状锚点（已存在、可复现）**：
   - v1 headless 核心脊：`packages/core`（log/capabilities/notifier 缝/brand/typed events）、`packages/boot`、`packages/plugins/notify-console`、`packages/bundle/{base,headless}`；`bun test packages/boot/test/core.test.ts` = 6 pass；底座为 Cordis 官方包 `cordis@4`（非 `@berkshire/cordis`）。
   - 桥接链 T1–T3：`packages/sidecar`（stdio JSON-RPC 长驻）、`src-tauri/src/bridge.rs`/`sidecar_client.rs`（Rust 宿主）、`apps/berkshire-agent/src/lib/api.ts`（薄客户端 4 command + subscribe）+ `components/SidecarPanel.tsx` + `lib/ExtensionBoundary.tsx`（最小证明面）。
   - **目标态（本次要落地的正是它的一部分）**：正式 slot 宿主、`ctx.slots`/`ctx.clientModules`、router、store、client-plugins 目录。

---

## 能力范围（本文把它拆成三块，任务总览对应）

| 能力块 | 含义 | 落点 |
| --- | --- | --- |
| **A. 前端组件（slot）** | 插件向固定槽位挂 React 组件，带类型化 context、`order` 排序、`ExtensionBoundary` 隔离 | `ctx.slots` 宿主 + `ExtensionSlot` 渲染器 |
| **B. 页面** | 插件声明独立分析菜单/路由（静态路径、不覆盖核心），前端按注册动态生成 | `analysis.menu` 动态菜单 + 路由注入 |
| **C. 样式** | 插件 bundle 携带作用域隔离的样式，不污染宿主与其它插件 | bundle 样式入口 + 加载器（scoped） |

---

## 任务总览与依赖

```
T0 slot 宿主最小落点（组件 A）：ExtensionSlot 渲染器 + slots 注册表 + 类型化 map + 降级
 ├─ T1 client 插件图接线（A+C）：sidecar 侧 clientModules 注册 → 宿主提供 bundle → webview 挂载 + 样式
 ├─ T2 页面/动态菜单（B）：analysis.menu 声明 → 前端路由注入（静态、不覆盖核心）
 ├─ T3 Demo 插件（A+B+C）：packages/plugins/demo-*，一个插件同时给出页面/样式/组件
 ├─ T4 端到端验证 + 诚实文档回写
 （T5 样式作用域升级、HMR、store 作用域：可选项 / v-next）
```

---

## T0 —— slot 宿主最小落点（前端组件能力的地基）

- **目标**：在 `apps/berkshire-agent` 里建立一个**类型化、带错误隔离**的 slot 宿主，让插件能往固定槽位挂 React 组件。这是「前端组件能力」的第一块真正的落地。
- **现状**：只有 `lib/ExtensionBoundary.tsx`（错误边界，T3 最小件）与 `components/SidecarPanel.tsx`（demo 面板）。无 slot 注册表、无 `ExtensionSlot` 渲染器、无类型化 context map。
- **交付**：
  1. `apps/berkshire-agent/src/slots/types.ts`：定义 `FrontendSlotContextMap`（slot 名 → `{...context, ...actions}` 的类型化 map，继承 TSP §6 的模型）。首批槽位至少含：`stock-preview.footer`（`{ symbol; name; view: 'daily'|'intraday' }`）、`watchlist.toolbar`（`{ symbols; viewMode; refresh: () => void }`）、`analysis.menu`（`{ }`）。类型是**契约**，不是示例。
  2. `apps/berkshire-agent/src/slots/registry.ts`：`register(name, { id, order?, component })`；**运行时校验** id 格式、重复 id 冲突、API 版本；排序按 `order ?? 100`；注册返回可撤销 disposer。
  3. `apps/berkshire-agent/src/slots/ExtensionSlot.tsx`：按槽位名渲染该槽所有注册，**每个包在 `ExtensionBoundary` 内**；`compact` 时失败降级 null，否则 muted 横幅「扩展 {id} 暂时不可用」+ 控制台日志。
  4. 在 `App.tsx`（或一个最小壳区）放一个 slot 演示点：渲染 `stock-preview.footer` 空状态（暂无注册也正常渲染空，不报错）。
- **契约**：slot 挂着的是**宿主预挖空位**，组件由插件提供；中枢不实现业务 UI。类型化 map 是下游插件的 context 契约。
- **诚实边界**：此时还**没有** sidecar→webview 的 clientModules 链路（那是 T1）；T0 用「直接注册本地组件」证明 slot 渲染器本身正确。路由、store 仍目标态。
- **验收**：`bun run build`（tsc + vite build）通过；一个本地注册组件能在 slot 里渲染、抛错组件被 `ExtensionBoundary` 降级、宿主页不崩。可加一个 `registry.test.ts`（bun test）校验重复 id 拒绝与排序。
- **复现**：`bun run build`；可选 `bun test` 贴 clean 输出。

---

## T1 —— client 插件图接线：sidecar 注册 → 宿主提供 bundle → webview 挂载 + 样式

- **目标**：把「插件在 sidecar 侧声明要挂的前端 bundle + 占用的 slot」一路接到 webview 真实挂载，并让 bundle 携带**作用域隔离的样式**（能力块 A + C 的完整链路）。
- **现状**：bridge → webview 已有四条 command + 事件订阅（`lib/api.ts`）；`ctx.capabilities`/`ctx.notifier`/`ctx.log` 是已落地的能力缝；**没有** `ctx.slots`/`ctx.clientModules`。
- **交付**：
  1. **sidecar 侧注册表（目标态 → 本次落最小件）**：在 `packages/core` 增加 `ctx.clientModules`（`class ClientModules extends Service`）+ `ctx.slots`（`class Slots extends Service`）两个**能力缝（Definition）**，经 `declare module 'cordis'` 增强；`register()` 返回 disposer，重复 id 响亮拒绝。`slots.register('stock-preview.footer', {...})`、`clientModules.register({ id, slot, bundle, style? })`（对齐 `docs/plugin-development.md §4` 示例，但**先落到真实代码**，不 import 目标态类型）。
  2. **协议/命令扩一张**：bridge 增一个「列出当前 client 注册（slot → bundle 清单）」的只读方法（如 `client/list`），把 sidecar 侧注册表的快照推给 Rust → webview（`lib/api.ts` 增 `clientList()`，订阅 `sidecar://client/changed`）。
  3. **webview 侧挂载器**：`apps/berkshire-agent/src/client/ClientModuleHost.tsx` 监听快照，对每个注册：动态加载 bundle（先做**最小加载器**：本地打包进来的模块引用；远程 `bk://`/动态 import 标 v-next）、包进 `ExtensionBoundary`、按 slot 名交给 T0 的 `ExtensionSlot` 渲染。
  4. **样式注入（能力块 C）**：`ClientModuleHost`/加载器给每个模块注入一个**作用域样式容器**——bundle 导出的样式字符串经 `<style data-bk-module="{id}">` 挂进容器，卸载时移除；实现上用**模块作用域**（scoped：类名前缀 + 卸载即删）防止污染宿主与其它插件。样式 monofile/动态注色标 v-next。
  5. 一个**真实最小 client 插件**走通链路（可先手写注册到 core 的测试 bundle，T3 再正式做业务 Demo）。
- **契约**：client bundle 与 slot 是「插件公开的 UI 面」；挂点归中枢，样式作用域归加载器责任；卸载必须带走样式与组件。
- **诚实边界**：`bk://` 自定义协议、远程 bundle 动态拉取、HMR、store 作用域均标 v-next；本任务用本地模块引用证明链路成立。
- **验收**：`bun run build` 通过；sidecar 启动后 `client/list` 返回注册快照；webview 能把注册 bundle 渲染进 `stock-preview.footer`，且其样式不泄漏到宿主；卸载/断链后样式与组件被移除、宿主页不崩。
- **复现**：`bun test`（sidecar 注册表单测）+ `bun run build`（前端 tsc/vite）+ 可选 `bun run dev` 观察挂载。

---

## T2 —— 页面与动态菜单（能力块 B）

- **目标**：让插件能声明**分析菜单项/独立页面**，前端按注册动态生成路由，用静态路径且不覆盖核心路径。
- **现状**：无 router。`App.tsx` 是单页模板（`main.tsx` 渲染单个 `App`）。
- **交付**：
  1. 引入最小 router（react-router 的 `HashRouter`/`MemoryRouter` 均可，选能在 Tauri webview 内稳定工作的）：核心路由若干（`/`、`/settings`）。
  2. `ctx.slots` 增 `analysis.menu` 语义：插件注册 `{ id, order, title, route: { path }, … }`；注册时校验**静态路径**（不含动态段 `:`）、**path 不与核心路由碰撞**、重复 path 拒绝。
  3. 前端按 `analysis.menu` 注册动态生成**导航项 + 路由**；`extension-route` 组件最终指向一个 slot 渲染器把该页内容挂上（包 `ExtensionBoundary`）。
  4. 注册冲突/路径碰撞在注册时 fail-closed（沿用 TSP registry.ts 的 finalize 语义）。
- **契约**：路由注入静态、不覆盖核心；页面内容仍是插件 UI，隔离纪律同 T0/T1。
- **诚实边界**：store、`layout.navigation.extra` 全量导航体系、懒加载分包标 v-next；本任务只覆盖「分析菜单 → 页面」这一条最小面。
- **验收**：`bun run build` 通过；插件注册一个 `analysis.menu` 项后导航出现、点击进对应页面；注册与核心路径冲突的路径被拒绝（有单测可查）。`git diff --check` 干净。
- **复现**：`bun test` + `bun run build`。

---

## T3 —— Demo 插件：一个插件同时给出 页面 / 样式 / 前端组件

- **目标**：交付一个可演示的 `demo-*` 插件，把 A/B/C 三块能力并到**一个插件**里，证明「插件定义页面 + 样式 + 前端组件」的真实落地，非文档示例。
- **交付**：
  1. 新包 `packages/plugins/demo-fund-flow`（或 `demo-*`）：`inject: ['slots','clientModules']`，注册——一个 `analysis.menu` 页面 `money-flow`（资金流向：后端/占位数据 + 前端表格）、一个 `stock-preview.footer` slot 组件、一段 scoped 样式。
  2. 后端逻辑走已有能力缝：无 database 时用 `ctx.log`/占位数据（**诚实：不走 DuckDB，那仍目标态**）。
  3. 提供**可复现开关**：在 bundle 里 enable/disable 该插件，验证「装上即出现、卸下即消失且样式不残留」。
  4. 数据展示遵守数据契约红线精神（用假数据时显式标注 demo，不冒充真实行情）。
- **契约**：一个插件 = 页面(slot menu) + 组件(slot block) + 样式(scoped)，卸载全部撤销。
- **诚实边界**：demo 用占位/静态数据，不做真实行情计算；`bk://` 远程 bundle、生产样式分发包标 v-next。
- **验收**：`bun run build` 通过；`bun run dev` 下打开应用能看到 demo 插件贡献的菜单页 + 底部组件 + 样式，切换 enable/disable 后界面相应出现/消失、样式无残留。
- **复现**：`bun run dev`（或 `bun run build`）。可在 PR/说明里贴一张界面截图路径。

---

## T4 —— 端到端验证 + 诚实文档回写

- **目标**：收口——一条「插件注册 → 宿主快照 → webview 挂载「页面/组件/样式」」全链路可自测，并诚实落账。**这是把「目标态」翻成「已实现」的关键一步，必须诚实。**
- **交付**：
  1. **自动化**：`bun test` 覆盖——slot 注册表（重复 id/排序）、clientModules 注册表（重复 id/disposer 可逆删除）、路由静态/不覆盖校验、ExtensionBoundary 降级。回归 v1(6)+sidecar(24) 用例。
  2. **手动/CI 冒烟**：`bun run dev` 打开 demo 插件贡献的页面/组件/样式，给出可复现命令与 clean 关键输出。
  3. **文档诚实回写**：
     - `docs/secondary-development.md`：在 §6/§8 把**真正已落地**的 slot 宿主、`ctx.slots`/`ctx.clientModules`（最小件）、ExtensionSlot 渲染器、样式 scoped、动态菜单标记为「已实现」，并列出**仍目标态**（`bk://`、HMR、store 作用域、生产样式分发包、`@berkshire/cordis`、DuckDB）。
     - `docs/architecture.md §11`：现状锚点改为真实文件行引（新增 `src/slots/*`、`src/client/*`、demo 插件包）。
     - `README`：加一句 client 插件能力现状。
     - **五个设计主张文档不动**。
  4. `AGENTS.md` 若把 `slots`/`clientModules` 写死「目标态」，同步改为「最小件已实现 + 其余 v-next」，与代码一致。
- **验收**：全库 `bun test` 全绿；`git diff --check` 干净；文档「已实现 vs 目标」边界与代码一致（可让 **bk-code-review** 技能复核契约级项：能力缝三角色、注册即效应、ExtensionBoundary 隔离、静态路由、样式作用域、诚实标注）。
- **复现**：`bun test`、`bun run build`、`bun run dev` 各贴关键输出。

---

## T5 —— 升级项（可选项，标记为后续，不在本次硬性验收）

- **目标态**（v-next）：① 远程 bundle 经 `bk://` 协议由宿主拉取；② 开发环境 Vite HMR 热装卸 client 插件；③ `store`（zustand）按插件域作用域化，避免跨插件污染；④ 生产样式 scoped 分发包与版本对齐；⑤ `layout.navigation.extra` 全量导航体系。
- 若时间/环境不允许，明确定为 v-next 目标并诚实标注，**不冒充已实现**。

---

### 交接建议
- 顺序执行 T0→T1→T2→T3→T4；每份任务书产出后先跑 **bk-code-review** 技能按仓库契约复核再合入。
- 任一任务发现与「共同前置 §7 现状锚点」不符（文件不存在/命令不通），停下来诚实报告，不从目标态文档推断实现。
- **诚实是硬验收**：只有真正写出代码、能跑、能测的部分才允许在 T4 里标「已实现」；其余一律标「目标态 / v-next」。