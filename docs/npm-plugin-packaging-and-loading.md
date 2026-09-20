# 需求文档 · 插件自打包为可发布 NPM 包 + 动态加载

> **状态：已落地（诚实标注）** · M0（自打包 NPM exports→dist 一次翻转）、M1（boot 内置动态
> `importPlugin` resolver）、M2（sidecar 去硬编码 + `$BK_HOME/cordis.yml` + 下载包动态装载）、
> M3（`bk://` Rust 协议 + **webview 半身动态拉取**）、M4（`@berkshire/cordis` vendor 迁移）
> **已全部落地并验证**（typecheck / boot 20 测 / sidecar 42 测 / webview loader 4 测 / cargo check /
> host vite build / build:packages 全绿）。
> **待运行验证接线点**：webview 共享依赖 import-map（`react`/`@berkshire/ui-slots` 等裸名 → 宿主可
> fetch ESM 地址）的 dev/prod **真实 URL 取值**——插件 client bundle 走 `--external` 保留裸 specifier，
> 宿主 [src/lib/sharedImportMap.ts](../apps/berkshire-agent/src/lib/sharedImportMap.ts) 已接入入口（默认空）、但 dev/prod 的真实 URL
> 提供仍留壳接线（§8 风险）。落地部分已同步 [architecture.md §11](architecture.md#11-关键文件索引现状--目标)
> 与 [AGENTS.md](../AGENTS.md)。

---

## 1. 背景与目标

Berkshire Agent（BK）当前是**仅由既有组件拼装、一切部件皆插件**的 Cordis 应用。v1 已落地最小核心脊
（`@berkshire/core`/`boot`/`sidecar`）与两个插件包（`notify-console`、`demo`），但对齐 DSH 后暴露了
两个结构性差距：

| 维度 | DSH（目标） | BK 当前 |
|---|---|---|
| 包形态 | 每个插件是**自打包、可发版的 NPM 包**（`lib/` `dist/` + 发布配置） | 全部 `private: true`，`main`/`exports` 直指 `./src/*.ts`（无 build、无发布） |
| 装载方式 | `Loader`/`EntryTree` **动态 `import(specifier)`**，`cordis.yml` 驱动，装 npm 即用 | `sidecar/src/index.ts` 的 `resolver` **硬编码查表** + host 对 `@berkshire/plugin-demo/client` **静态 import** |
| 新增插件成本 | 装包 + 写一行配置，零改代码 | 改 `sidecar` 源码改 resolver、改 host 源码加静态 import |

### 1.1 目标（一句话）

> 把 BK 现有全部插件改造成 **DSH 式自打包、可发版 NPM 包**，使其能**非侵入式动态加载**——
> 无论加载 NPM 包还是本地插件，都**无需改动任何硬编码代码**。

### 1.2 两条硬性验收标准

1. **非侵入式动态加载**：宿主/装配器在**不 import、不注册、不改源码**的前提下，运行时从配置装载插件。
2. **NPM 包与本地插件一视同仁**：一条装载路径同时覆盖 `import('npm包名')` 与 `import('相对路径')`，
   无 hardcode 分支；新增插件 = 「放入可解析位置 + 配置声明」，不改任何清单外的代码。

---

## 2. 现状（已实现，诚实基线）

以下均为当前真实代码，是本次改造的改造对象：

- **包形态**：`packages/core`、`packages/boot`、`packages/sidecar`、`packages/plugins/notify-console`、
  `packages/plugins/demo`、`packages/plugins/base-ui` 的 `package.json` 均 `"private": true`、`type: module`、
  `exports`（`"."`/`"./client"`）直接指向 `./src/*.ts`，**没有 build 步骤、没有 dist**。
  参考：`packages/plugins/demo/package.json`（含 `./client` 子路径 + `compile:styles` 脚本）。
- **动态加载缺口**（核心改造点）：
  - `packages/sidecar/src/index.ts`：`const resolver = (name) => ({ core, notify, demo })[name]` —— 硬编码查表。
  - `packages/boot/src/entries.ts`：`export type Resolver = (name) => unknown | Promise<unknown>` 由外部传入，
    `Boot.install` 调 `await resolver(row.name)`；**resolver 本身无内置动态实现**。
  - `apps/berkshire-agent/src/client/loader.ts`：对 `@berkshire/plugin-demo/client` 是**静态 import**（webview 半身）。
- **配置层已动态**：`packages/bundle/{base,headless,demo,demo-off}/cordis.patch.yml`
  用 `insert`/整行覆盖声明"装哪些插件"，`Boot.composeEntries` 已解析——**声明层已是文件驱动**，
  只差`名字→模块`的解析层（resolver）动态化。
- **可解析性前提缺环**：目前插件以 `@berkshire/plugin-*` 名字引用，但这些是 workspace 包（在 node_modules
  软链），且 `main` 指 `src/*.ts` —— 动态 `import(name)` 在生产环境（压缩/打包后）**不能直接解析 src TS**，
  必须先产出可发布产物。

---

## 3. 需求分级

### P0 · 可发布的自打包 NPM 包（先决条件）
- [ ] 为每个可发布包增加 `build` 步骤，产出 `dist/`（含 `index.js` + `index.d.ts`），`exports` 指向 `dist`。
- [ ] 去掉 `private: true`；补 `repository`/`license`/`files`/`peerDependencies`（`cordis` 为 peer）。
- [ ] 发布面覆盖：`@berkshire/core`、`@berkshire/boot`、`@berkshire/sidecar`、`@berkshire/ui-slots`、
  `@berkshire/theme`、`@berkshire/plugin-notify-console`、`@berkshire/plugin-demo`、`@berkshire/base-ui`。
- [ ] `@berkshire/core` 子路径导出（既有 `./services/*` 等）对 `dist` 一并生效；`@mode emit` 增强随类型包发布。

### P1 · 非侵入式动态加载解析器（对齐 DSH `tree.import`）
- [ ] `packages/boot` 内置**动态 import resolver**（作为 `Resolver` 的默认实现），行为对齐 DSH
  `loader/config/tree.ts`：
  - `name.startsWith('cordis:')` → `builtins[name.slice(7)]`（内置分支）。
  - 相对路径（`.`/`../`）→ `await import(new URL(name, baseUrl).href)`。
  - 其它（npm 名/裸名）→ `await import(name)`。
  - 统一 `unwrapExports`（默认导出/`__esModule` 归形）后过 `ctx.registry.plugin`。
- [ ] 保留「外部传入 resolver」兼容：现有 `core.test.ts`/sidecar 测试仍可传查表 resolver；未传则用内置动态实现。

### P2 · 装配声明与装载解耦（零硬编码）
- [ ] `sidecar/src/index.ts` 删除硬编码 `resolver` 表，改走内置动态 resolver + `cordis.patch.yml`（已动态）。
- [ ] host（webview）对插件 webview 半身的**静态 import 改动态拉取**：`@berkshire/plugin-demo/client`
  不再写死；改为运行时按 `client/list` 快照的 bundle 引用解析（`bk://` 或 `file:` + 运行时 import），
  这是走向目标态 `bk://` 远程 bundle 的现实中间步。
- [ ] 新增插件 = 「npm/本地目录可 `import` + `cordis.patch.yml` 加一行」，`sidecar`/`host` 代码零改动。

### P3 · 发布与分发闭环
- [ ] 本地联调路径：`file:<path>` 或本地 registry 即可装载，不改代码。
- [ ] 正式发布：npm publish（tag/版本同步，可参考 `packages/` 现有 version 0.1.0 语义）。
- [ ] `cordis.yml`/patch 引用 npm 包 + 版本，`install` 显式声明可复现版本（对齐 `PROFILE_PATCH_FILENAME` 思路）。

---

## 4. 非功能性需求（NFR）

- **Fail-closed**：解析不到 / 缺导出 / 重复插件 → 响亮失败（错误码），不静默跳行宽；沿用 `fail-closed` 纪律。
- **注册即效应**：动态装载的插件仍以 `ctx.effect` 注册，卸载逆序清理（沿用现有纪律，不改）。
- **依赖解析**：动态装载不破坏 `inject` 响应式；先装消费者后装提供者仍可（Cordis notify 保证）。
- **三进程边界不变**：动态加载只解决 sidecar 进程内"名字→模块"；webview 跨进程可见性仍走
  `client/list` + `client/changed` 现有链路，**不受本改造影响**（本轮不改进程拓扑）。
- **类型安全**：脚本化装载入口可放宽为 `unknown` 形态，但已装载插件面向业务 API 的类型增强仍走
  `declare module` 通道（不变）。
- **向后兼容**：现有 bundle（base/headless/demo/demo-off）与全部 `core.test.ts`/sidecar 测试不回归。

---

## 5. 目标架构设计

### 5.1 包形态（P0）

每个可发布包统一为：

```
packages/<scope>/<pkg>/
├── src/            # 源码（不变，v1 现状）
├── dist/           # build 产物（新增）：index.js + index.d.ts
├── package.json    # exports → dist；peerDependencies: cordis；去 private
└── scripts/build   # tsc/bun build 产出 dist
```

`@berkshire/plugin-demo` 的双入口保持：
- `.` → sidecar 半身（`dist/index.js`，含 `name/inject/Config/apply` + 注册逻辑）。
- `./client` → webview 半身（`dist/client/index.js`），且 CSS Modules 编译产物 `styles.generated.*` 一并进 dist。

### 5.2 动态装载解析器（P1）

`packages/boot/src/` 新增内置解析器（对齐 DSH，示意实现，**落地时需真实编码 + 测试**）：

```ts
// packages/boot/src/loader.ts（目标态，示意）
export async function importPlugin(specifier: string, baseUrl: string): Promise<unknown> {
  let mod: unknown
  if (specifier.startsWith('cordis:')) {
    mod = builtins[specifier.slice(7)]
  } else if (specifier.startsWith('.')) {
    mod = await import(new URL(specifier, baseUrl).href)
  } else {
    mod = await import(specifier)
  }
  return unwrapExports(mod)   // default ?? mod
}
```

`Boot.install` 的 `resolver` 缺省即用 `importPlugin`；外部传表仍兼容。

### 5.3 装配流程（P2，改造后）

```
cordis.patch.yml（声明：装哪些，已动态）
  → Boot.composeEntries（已实现）
  → Boot.install → 内置 importPlugin(name)   ← 新增：动态 import，去硬编码
  → ctx.registry.plugin(plugin, config)      （已实现）
webview：client/list 快照 → 运行时解析 bundle 引用加载半身   ← 新增：去静态 import
```

### 5.4 新增插件的最小编成（验收路径）

一个本地插件或 npm 插件要接入，唯一要做的是：
1. 能被 `import()` 解析（npm 装进 node_modules，或相对路径可 import）；
2. 其 webview 半身（如有）在 `client/list` 中声明可解析的 bundle 引用；
3. `cordis.patch.yml` 加一行声明。

**不修改** sidecar 源码、host 源码、`core.ts` 装配。

> 协议安全注（sidecar stdout 独占 ndjson）：`@berkshire/plugin-notify-console` 默认 `echo: true` 会把通知
> 打到 stdout——这与协议流冲突（M2 起 sidecar 不再用 override 强制 `echo:false`，改由用户装配声明）。
> 若启用 notify-console，需在 `$BK_HOME/cordis.yml` 对应行写 `config: { channel: console, echo: false }`
> （sidecar 测试夹具即如此），否则 `notify/send` 会污染协议流。

---

## 6. 落地步骤（里程碑，标注先后）

- **M0 · 构建与发布底座**：给各包加 `build` → `dist`；改 `exports` 指向 dist；去 private。
  验收：`bun run build` 产出各包 dist，workspace 内 `import` 仍通（bun 解析 dist 或保留 src 双通道）。
- **M1 · 动态 import 解析器**：`packages/boot` 增内置 `importPlugin` + `unwrapExports` + `builtins`；
  `Boot.install` 缺省走它。验收：新增 `loader` 单测（npm 名 / 相对路径 / cordis: 三分支 + fail-closed）。
- **M2 · sidecar 去硬编码**：删 `sidecar/src/index.ts` 的 resolver 表，改走内置解析 + patch。
  验收：`sidecar` 现有 42 测试不回归；`plugin-demo`/`notify-console` 用真实包名动态装载通过。
- **M3 · webview 半身动态化**：host 对 `/client` 的静态 import 改运行时 pull（`bk://`/`file:` + 运行时
   `import`）。**已落地**：插件运行期自报 `CLIENT_ENTRY_URL` → sidecar `client/list` 快照 → Rust
   `to_bk_url` 规范化 `bk:///…` → webview [loader.ts](../apps/berkshire-agent/src/client/loader.ts)
   `importClientModule` 运行时 `import(url)` + 具名导出 + `<style data-bk-module>` scoped 注入；
   共享裸名经 [sharedImportMap.ts](../apps/berkshire-agent/src/lib/sharedImportMap.ts) import-map 接线
   （默认空，dev/prod 真实 URL 待运行验证）。验收：demo 页/组件在动态拉取下半身出现、卸载即撤，
   `client/changed` 同步。**剩余接线点**：import-map 真实 URL 取值。
- **M4 · 发布闭环 + profile 持久化**：npm 发布脚本、版本同步、patch profile 读写（对齐 DSH
  `PROFILE_PATCH_FILENAME` 思路，`$BERKSHIRE_HOME` 下 profile）。验收：发布后从 registry 动态装载一个真实插件。

---

## 7. 验证（对齐现有测试面）

- `bunx tsc -p packages/tsconfig.json --noEmit`：全包类型体检。
- `packages/boot`: `bun test` + 新增 `loader.test.ts`。
- `packages/sidecar`: `bun test`（42 用例）+ `examples/smoke.ts` + 真实包名动态装载冒烟。
- `apps/berkshire-agent`: `bun run build`（webview 半身动态化后仍能构建）。
- 端到端冒烟：`demo` 从 npm/本地目录动态装载 → footer/toolbar/资金流向页出现 → `demo-off` 卸下即消失。

---

## 8. 风险与待决

- **生产环境 `import(name)` 的可解析性（已定 + 解）**：动态 import 裸包名仅在**可运行时解析模块**的
  环境成立。装载宿主已拍板：**sidecar（Bun）承担动态 `import(name)`**（npm 裸名→`$BK_HOME/node_modules`
  dist 绝对 import，M2 已落地）；**webview 半身走 `bk://`/`file:` 而非裸包名**（M3 已落地）。剩余接线：
  共享依赖 import-map 的 dev/prod 真实 URL 取值（`buildSharedImportMap` 为空默认，宿主入口已接入）。
- **CSS Modules/scoped 样式跨 dist 分发**：`styles.generated.ts` 进 dist 后，host 注入路径要对齐。
  （已解：插件独立打包阶段 [build-client.ts](../packages/plugins/demo/scripts/build-client.ts) 把哈希类名
  内联进单文件 ESM，sidecar 拿注入 css 经 `client/list` 下发 scoped 注入，见 architecture.md demo 行。）
- **`@berkshire/cordis` vendor**：**已落地**（M4）——`declare module` 模块名已从 `cordis` 改 scoped，
  文档与 `capability-seams.md` 已同步。
- **基线范围**：**P0–P2 全做**，已全部落地（M0/M1/M2/M3/M4）。P3（正式 npm publish）留后续。
- **进程拓扑**：本需求**不改**三进程；若未来 webview 与插件同进程，`import('npm')` 可直接到 webview，
  届时 `bk://` 变为可选——需要时再一并考虑。

---

## 9. 附 · 与现有文档的交叉引用

- 事件/服务增强现状与子路径导出：[capability-seams.md](capability-seams.md)、[architecture.md §11](architecture.md#11-关键文件索引现状--目标)。
- Cordis 方法论约束（inject/effect/fail-closed）：[secondary-development.md](secondary-development.md)。
- 插件骨架三形态：[plugin-development.md](plugin-development.md)。
- 配置分层（profile/bundle/patch）：[config.md](config.md)、[data-model.md](data-model.md)。

---

## 待确认清单（已由用户拍板，两点已落地）

1. 装载宿主：**由 sidecar（Bun）承担动态 `import(name)`；webview 半身走 `file:`/`bk://`**（`bk://` 落在 M3）。✅
2. 范围：**P0–P2 全做**（M0/M1/M2 已落地；M3 后续）。✅（M0–M2）
3. **顺带落地 `@berkshire/cordis` vendor**（M4，`declare module` 模块名迁移）。✅（决定，待 M4 执行）
4. 发布目标：**初始用本地 `file:`/registry 即可**，正式 npm 发布留 P3。
5. **配置 home**：以 `BK_HOME` 取代 `$BERKSHIRE_HOME` —— Windows `%APPDATA%\.bk`、macOS
   `~/Library/Application Support/.bk`、Linux `~/.bk`，可用环境变量 `BK_HOME` 覆盖（boot
   `defaultBkHome`，已落地 + 测试）。✅
6. **下载插件形态**：`bun add` 进 `$BK_HOME/node_modules`，sidecar 用 `importPlugin(nodeModulesDir)`
   从 `package.json` 的 exports/main 解析具体 dist 入口后绝对 `import()`（与本地/裸名同一条路径）。✅

> 原则（用户拍板）：加载只由 **Cordis.yml + 下载的 npm 包** 驱动，**零硬编码**。M2 已把 sidecar 的
> 硬编码 resolver 表删掉，装配只读 `$BK_HOME/cordis.yml`（缺失即 fail-closed）。宿主（Tauri）在
> M3 负责在首次运行 provision 初始 `cordis.yml`。