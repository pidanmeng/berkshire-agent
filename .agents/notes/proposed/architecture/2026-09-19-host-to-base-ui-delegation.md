# Agent Note: 宿主空心化——样式与布局下沉到 base-ui 插件（对齐 dsh）

Status: proposed

## 问题

主宿主 `apps/berkshire-agent`（Tauri + React 19 webview）目前仍是一**承载实现**的宿主而非纯入口：

1. **样式/布局归宿主**：应用壳（`src/layout/*`：`AppShell` 网格 + `Sidebar` + `StatusBar` + `SettingsPage`）与全局样式（`App.css`、theme/install.ts）全部写在宿主 `apps/berkshire-agent/src`，宿主掌控主导航、设置页、状态栏与页面路由占位。
2. **slot 宿主与宿主耦合**：`src/slots/*`（`SlotRegistry`/`ExtensionSlot`）、`src/lib/ExtensionBoundary.tsx`、slot 上下文契约 `slots/types.ts` 都是**宿主私有代码**——插件包无法 import，也无法定义新缝。
3. **能力缝只由 core 提供（约定如此，非必然）**：`ctx.slots`/`ctx.clientModules`/`ctx.log`/`ctx.capabilities`/`ctx.notifier` 全定义在 `packages/core`，尚无「插件自定义 Seam / 插件当别的插件 Seam 的 Provider」的实证。

dsh 的实证目标是：**宿主只留一个入口、零 React/零样式**，全部 UI 与基础布局被 UI 插件接管。本提案把 BK 对齐到这个模型，并先回答三个待确认问题（插件能否定义 Seam、能否当别的插件 Seam 的 Provider、ExtensionSlot 是否要抽出来）——结论都是「能 / 能 / 要」，依据 dsh 源码（`C:\Code\deepseek-harness`）。

## 提案

把宿主空心化成**入口 + 挂载接缝**，样式与布局下沉到新插件包，分四步，每步保持可验证、不一次改写全部：

### 关键决策（依据 dsh 取证）

- **插件能定义 Seam（含 UI 与逻辑）——是的。** dsh 里 `ctx.layout`（ui-layout）、`ctx.theme`（ui-theme）、`ctx.conversation`（ui-conversation）、`ctx.uiWorkspace`、`ctx.modelDirectories` 等 UI 缝与逻辑缝同样写在一个非 core 的 `packages/client/*` 插件里，公式都是 `class X extends Service { constructor(ctx){ super(ctx, 'name') } }` + `declare module '@deepseek-ai/cordis' { interface Context { name: X } }`（`vendor/cordis/src/context.ts:…` 明说了 Context 接口被 core 服务与插件一起增强）。**UI 缝不是特殊物**。故 BK 的 base-ui 插件**应当做缝的 Provider**（如提供 `ctx.layout`），不只是一个 Consumer。
- **插件能当别的插件 Seam 的 Provider——是的。** 服务是 ctx 上**按名字键控**的值（`super(ctx,name)` → `ctx.reflect.provide(name, self, check)`，`vendor/cordis/src/service.ts:57`、`reflect.ts:277`）。dsh 实例：`ui-sidebar`/`ui-sidebar-right` 各自 `inject: ['slots','layout',…]` **消费**单独的 `ui-layout` 插件提供的 `layout`；`ui-model-selection` 里 `ctx.get('conversation')` 消费别的插件缝。三角色的三个角色与包边界解耦。注意：dsh 无 `ctx.union`，作用域用 `ctx.isolate(name,label)`/`Service` 的 filter guard（`service.ts:61`）——BK 的 `ctx.union` 映射到隔离/作用域模型而非真 `union()`。
- **ExtensionSlot 应该抽出来——是的，这是本次的关键点。** dsh 把 slot 体系抽成**独立的纯共享包** `@deepseek-ai/dsh-client-ui-slots`（`SlotCore` 运行时注册表 + `SlotMap`/`ComposedProps`/`renderSlot`/`SlotKind='single'|'list'|'keyed'|'chain'`/`SlotScope='root'|'session-maybe'|'session'`，零运行时依赖），再由 `ui-renderer` 的 `SlotRegistry extends Service` 包一层并暴露 `renderSlot('root')`。slot 契约类型靠 `declare module '@deepseek-ai/dsh-client-ui-slots' { interface SlotMap { 'root': … } }` 在**共享包里声明合并**，宿主办不泄漏、插件能 import。BK 现在把 `SlotRegistry`/`ExtensionSlot`/`ExtensionBoundary` 留在宿主，正是堵塞 base-ui 下沉的结构性原因——插件不能依赖宿主代码。必须抽到共享包。

### 四步迁移（目标态）

1. **（已完成先导）宿主样式全部 CSS Modules**：`App.css` 的 `.container` 等全局 class 迁入各组件 `*.module.css`（`App`/`SidecarPanel`/`ThemePalettePage`/`ExtensionRoute`/`ExtensionSlot`/`ExtensionBoundary`），宿主 0 字符串 className；`App.css` 仅留 `:root`/`body` 全局基。已在本次会话交付。
2. **抽共享 UI 缝引擎 `@berkshire/ui-slots`**：把 `src/slots/*`、`src/lib/ExtensionBoundary.tsx`、`slots/types.ts` 的上下文契约迁到共享纯包（`SlotCore` + `SlotMap` + 类型化 `context` map + `declare module` 声明合并 + `ExtensionSlot`/`ExtensionBoundary` 渲染件），宿主与插件共同 import。新增内置 `root` 槽（single，`SlotKind='single'`），作为「shell 帧」的挂载点。
3. **建 `@berkshire/base-ui` 插件**：webview 半身 `src/client/` 承载应用壳（`AppShell`/`Sidebar`/`StatusBar`/`SettingsPage` + 各自 `*.module.css`，走 demo 同款 `compile-styles.ts` 出 `styles.generated.ts`）；sidecar 半身 `src/index.ts` 经 `ctx.slots`/`ctx.clientModules` 把 frame 注册进 `root` 槽、声明并承载 `layout.navigation.extra`/`layout.sidebar.footer`/`layout.statusbar.right`/`settings.cards` 等子槽、`ctx.reflect.provide('layout', …)` 提供 `ctx.layout` 缝；全局/主题 CSS（`App.css` 基、theme 注入）归 base-ui（对齐 dsh `ui-layout` 壳 + `ui-theme` 全局 CSS/token）。
4. **宿主空心化为入口**：`main.tsx` 只做「boot Context 式 web 宿主 + 拉起 base-ui web 半身」，经一个 `uiRenderer` 式 mount 接缝（`ctx.inject(['uiRenderer'], …)`，对齐 dsh `web/src/mount.ts`）把 `renderSlot('root')` 挂到 `#root`；`/`、`/settings`、`/theme` 页面也下沉为 base-ui 提供的路由内容；`RouteSync`/`ClientModuleHost` 等扩展宿主件保留为宿主侧薄调度（或并入共享引擎）。宿主从零样式/零布局变成纯入口。

### 当前交付进度（诚实标注）

- **step 1（宿主样式全 CSS Modules）已交付**：`App.css` 的 `.container` 等全局 class 迁入各组件 `*.module.css`（`App`/`SidecarPanel`/`ThemePalettePage`/`ExtensionRoute`/`ExtensionSlot`/`ExtensionBoundary`），宿主 0 字符串 className；`App.css` 仅留 `:root`/`body` 全局基。已随本提案落地。
- **step 2（抽共享 `@berkshire/ui-slots`）已交付**：slot 注册表（`SlotRegistry`/`slotRegistry`/`SLOT_API_VERSION`/`SlotComponent`/`SlotRegistration`）、渲染器（`ExtensionSlot`/`ExtensionBoundary`）、类型化槽契约（`FrontendSlotContextMap`/`FrontendSlotName`/`FRONTEND_SLOT_NAMES`）与对应 `*.module.css` 从宿主 `apps/berkshire-agent/src/{slots,lib}` 迁至 `packages/ui-slots`；宿主改为 `import … from "@berkshire/ui-slots"`，原 `src/slots/*`/`src/lib/ExtensionBoundary*` 删除，`registry.test.ts` 随包迁至 `packages/ui-slots/test`。为此在根 `tsconfig.base.json` 增 `jsx: "react-jsx"`（仓库已发 React 客户端包 demo/ui-slots，packages typecheck 现会跟进而入 `.tsx`）。验证：`bun run build`（app，exit 0）、`bun run typecheck`（packages，exit 0）、`bun test` 根套件 6/6、`packages/ui-slots/test/registry.test.ts` 8/8、魔法色 lint 通过。
- **step 3a（`@berkshire/base-ui` 壳插件 webview 半身）已交付**：`AppShell`/`Sidebar`/`StatusBar`/`SettingsPage` 及各自 CSS Modules 从宿主 `apps/berkshire-agent/src/layout/*` 迁至 `packages/plugins/base-ui/src/client/`；`Sidebar`/`StatusBar` 改由 **prop 注入**（`routes`/`bridgeOnline`）宿主数据——不再依赖宿主 stores/`lib/api`，插件只依赖共享 `@berkshire/ui-slots` + `react-router-dom`/`clsx`。宿主 `App.tsx` 改渲 base-ui `<AppShell>`（新增 `src/lib/useBridgeStatus.ts` hook 探测桥接态 prop 注入）、`/settings` 渲 base-ui `SettingsPage`，宿主 `src/layout/*` 整体删除。验证：app build exit 0（69 modules）、`bun run typecheck` exit 0、根测试 6/6、魔法色 lint 通过。
- **step 3c（核心路由 `/theme` 主题对照页下沉）已交付**：`ThemePalettePage`/`TokenSwatch` 及各自 `.module.css` 从宿主 `src/theme/` 迁至 base-ui `src/client/`（依赖 `@berkshire/theme` 加入 base-ui）；宿主 `App.tsx` 的 `/theme` 改渲 base-ui `ThemePalettePage`，宿主 `src/theme/` 仅剩 `install.ts`（令牌根样式注入引导）。验证：app build exit 0、`bun run typecheck` exit 0、根测试 6/6、魔法色 lint 通过。
- **step 3b（壳帧经共享 `root` 槽挂载已交付）**：`@berkshire/ui-slots` 新增内置 `root` 槽（`ShellRouteInfo` 上下文 `routes`/`bridgeOnline` + `renderApp` 渲染 prop——壳帧无法以 children 收宿主内容，故宿主把 `<Routes>` 渲染封装进 context）与承接语义 `SlotKind='single'|'list'`（`SLOT_KINDS` 表，现 `root`=single，重复注册 fail-closed 拒绝，对齐 dsh `SlotCore`）。base-ui 新增 `RootShell`（root 槽壳帧组件，把 context 解包成 `AppShell` prop 并渲染 `renderApp()`）+ `registerRootShell`（幂等注册即效应，返回 disposer）；宿主 `App.tsx` 改经 `<ExtensionSlot name="root" context=…/>` 挂载壳帧，宿主只注入 `routes`/`bridgeOnline`/`renderApp`（本宿主的 `<Routes>`），不再静态渲染 `<AppShell>`。验证：app build exit 0（71 modules）、typecheck exit 0、根级 `bun test` 全仓 **72/72（9 files，含 ui-slots 10）**、根代理套件 6/6。
- **step 3b 余下（经 sidecar bundle 装配、可 disable）与 step 4（宿主空心化为纯入口：`uiRenderer` 式 mount 接缝 + 剩余页面/路由/`App.css :root/body` 与 `install.ts` 一并归位）仍待交付**：是后续 rounds/专项。全部落地后才把本记录从 `proposed` 转 `implemented` 并同步 `docs/architecture.md §11`/`docs/secondary-development.md §6/§8`/根 `AGENTS.md` 锚点。

- **step 3d（主题根 + 文档基础样式下沉，宿主零样式已交付）**：`theme/install.ts` 的令牌根注入与 `App.css` 的 `:root`/`body` 文档基础合并为 base-ui webview 半身 `installThemedRoot()`（`<style data-bk-theme>` 渲染前注入，对齐 dsh `ui-theme`/`boot-theme`）；`main.tsx` 改经 `@berkshire/base-ui/client` 调用；宿主删除 `src/App.css` 与 `src/theme/`。宿主现在**零样式**（只剩 `App.module.css` 给宿主自有 demo 页 Home/404 的 scoped class）。验证：app build exit 0（CSS 包 7.00→6.69 kB）、typecheck exit 0、全仓 `bun test` 72/72（9 files）、根代理 6/6、魔法色 lint 通过。
- **step 4 的诚实边界**：宿主仍保有「路由/数据接线」（`routesStore`/`lib/api`/`useBridgeStatus` + 自有 demo 页 Home/404/SidecarPanel）与 `App.module.css` 页面 class；把它们全部迁走使宿主成为**零 React 纯入口**，需要 BK 目标态的 `bk://`/bundle 装载 + mount 接缝架构（见 AGENTS.md「目标态/未实现」），非当前落地基线——属独立专项，留后续。

### 对齐 dsh 的分治

- 空宿主入口 ↔ dsh `apps/web/src/main.ts`（6 行 `new AppWebEntry(#root).run()`）。
- mount 接缝 ↔ dsh `packages/client/web/src/mount.ts`（`ctx.inject(['uiRenderer'], mount)`）。
- root 槽 ↔ dsh `packages/client/ui-slots` 内置 `record('root')` + `ui-layout` 注册 `AppFrame`。
- 壳插件 ↔ dsh `@dsh-client-ui-layout`（`AppFrame` 三栏 + 子槽声明 + `ctx.layout`）。
- 全局样式/token ↔ dsh `@dsh-client-ui-theme` + `@dsh-client-ui-primitives`。
- slot 契约共享 ↔ dsh `@deepseek-ai/dsh-client-ui-slots` 的 `SlotMap` 声明合并。

## 曾考虑的替代方案

- **宿主继续持有 `AppShell` 直渲，仅把布局样式搬进 base-ui 包（静态 import 即可）**：否决。这样宿主仍然「写死」了壳结构，只是把文件搬了家；base-ui 不是经 slot/mount 接缝成为真插件，hook/slot 语义不成立，不符合「宿主空心化」目标。
- **不做 ExtensionSlot 抽取、继续留宿主**：否决。这是结构性死结——插件包不能 import 宿主，base-ui 想要在壳内开 `layout.*`/页面槽就得复制一份 slot 宿主；与 dsh「slot 体系是独立共享包」的实证相悖。
- **一次性把整套下沉做完**：延后。步骤多、跨 sidecar 装配/协议/loader/宿主重写/测试，一次改写风险大且违背「目标态 vs 已实现」诚实；按四步逐项可验证推进。
- **`ctx.union` 解决缝可见性**：否决/映射。dsh 实证无 `ctx.union`，用 `ctx.isolate`/作用域；BK 若需要按能力/作用域过滤，走隔离模型而不是造 `union()`。

## 验收标准

- `apps/berkshire-agent/src` 下无应用壳/布局/页面 UI 组件与样式源码（`layout/`、`theme/` 的 UI 组件、`App.css` 基、`components/SidecarPanel*` 等全部下沉到 base-ui 或共享引擎）；宿主只剩入口、route/事件薄调度与桥接线。
- `@berkshire/base-ui` 是经 bundle/sidecar 装配的**真插件**：disable 时宿主显示 root fallback、Enable 时出现完整壳；子槽（导航/状态栏/设置/页面）由 demo 等下游插件经共享 `@berkshire/ui-slots` 注册进。
- `@berkshire/ui-slots` 被宿主与插件共同校验通过（`declare module` 声明合并的类型契约），`ExtensionSlot`/`ExtensionBoundary` 不再宿主私有。
- `bun run build`（tsc + vite）、`bun run test`（packages/boot + sidecar）、`bun run typecheck` 全绿；魔法色值 lint 通过。

## 风险

- **重构面大**：涉及新包、sidecar bundle/协议批配、loader、宿主重写与测试，是 multi-stage 工程；本提案按 step 2/3/4 逐项落地每项独立可验证，避免一次改写全量。
- **`root` 槽的 single 语义与现 `ExtensionSlot` 的 list 语义不同**：shell 帧必须唯一。需在共享 `SlotCore` 里区分 `SlotKind='single'` 与 list（对齐 dsh 四态），否则多 shell 会互叠。
- **路由所有权**：`/`、`/settings`、`/theme` 从宿主下沉到 base-ui 后，`CORE_ROUTE_PATHS` 与宿主核心 `<Route>` 双端一致性风险转移为「base-ui 声明 vs core 校验」的同一契约问题，需保持 `CORE_ROUTE_PATHS` 为新缝校验源。
- **主题/全局注入所有权**：`theme/install.ts` 与 `App.css :root/body` 归 base-ui 后，需保证在 base-ui 装配前首屏无令牌白屏的边界（对齐 dsh `boot-theme.ts` 渲染前注入）。
- **诚实标注**：在 step 3/4 落地前，本文档是 `proposed`；把项目标态改成「已实现」并同步 `docs/architecture.md §11` / `docs/secondary-development.md §6/§8` / 根 `AGENTS.md` 锚点，只发生在对应步骤真实交付时。
- **与既有决定的关系（超驰交叉引用）**：本提案下沉 `App.css`/`theme/install.ts` 的样式·令牌根**归属**，与已 implemented 的 `implemented/architecture/2026-09-19-style-system-redesign`（`@berkshire/theme` 令牌语义）有交接面但不构成全超驰——命名/令牌语义以该记录为准、样式归属以本记录为准，二者须保持交叉引用防「一个事实两个家」漂移。