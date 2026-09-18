# berkshire-agent

基于 Tauri 2 + Rust + Bun(Cordis) + DuckDB + React(zustand/ECharts) 的**全插件化** A 股投研桌面系统（目标态设计）。

## 文档（设计目标态，中文）

从 [docs/architecture.md](docs/architecture.md) 开始读，它给出进程拓扑（Tauri Rust 宿主 + Bun sidecar 运行 Cordis + React webview）、模块划分、数据流与事件域，并索引其余文档。

| 文档 | 主题 |
| --- | --- |
| [architecture.md](docs/architecture.md) | 总览、Option B 拓扑、模块图、生命周期、文件索引 |
| [capability-seams.md](docs/capability-seams.md) | 「无特权核心」能力缝 + 三角色模型 + 5 种事件派发 |
| [plugin-development.md](docs/plugin-development.md) | 插件骨架 + 5 个落地教程（数据源/指标/菜单页/UI 槽/AI） |
| [config.md](docs/config.md) | profile / bundle / patch 分层配置、`dump-config` |
| [data-model.md](docs/data-model.md) | DuckDB 单写者、数据集注册、标准列、6 条数据红线 |
| [secondary-development.md](docs/secondary-development.md) | L1/L2/L3 分级、约束矩阵、诚实标注（已实现 vs 目标） |
| [quick-reference.md](docs/quick-reference.md) | 「新行为放哪」速查表 + 事件域×派发方式速查 |

### 图（可视化，查看对应 HTML）

- [架构图](docs/diagrams/architecture.html)
- [数据流](docs/diagrams/dataflow.html)
- [插件生命周期](docs/diagrams/lifecycle.html)
- [时序图（一次刷新分析）](docs/diagrams/sequence.html)

> 图由 archify 生成并已通过 showcase 校验与 4 视口 containment 可视化检查；`.candidate.json` 为可修改的源规格。

## 开发

To install dependencies:

```bash
bun install
```

根目录脚本可代理到重要子项目（真实存在，见各 `package.json`）：

```bash
bun run dev            # 代理 → apps/berkshire-agent dev（Vite，端口 1420）
bun run build          # 代理 → apps/berkshire-agent build（tsc && vite build）
bun run dev:docs       # 代理 → apps/docs dev
bun run tauri:dev      # 代理 → Tauri dev 窗口
bun run bundle         # 代理 → tauri build（安装包 + 可执行文件）
bun run bundle:dir     # 代理 → tauri build --no-bundle（仅可执行文件）
bun run test           # 代理 → packages/boot test
bun run headless       # 代理 → packages/boot/examples/headless.ts
```

To run:

```bash
bun run index.ts
```

> 现有可运行脚手架仅有 `apps/berkshire-agent`（Tauri 2 + React 19 + Vite）。上文「文档」描述的是**目标态设计**，尚未实现，secondary-development.md 会诚实标注每一分层当前状态。

## v1 现状

已落地一个 **headless 可跑的最小核心脊**（Cordis 官方包底座）；并已接上 sidecar → Rust 宿主桥 → webview 的最小链路（T2/T3）：

- `packages/core`（`@berkshire/core`）：`ctx.log`、`ctx.capabilities`、`ctx.notifier` 能力缝（Service Definition）+ `declare module 'cordis'` 类型化事件（`@mode emit`）。
- `packages/boot`（`@berkshire/boot`）：`Boot` 装配器 + `composeEntries`（profile/bundle/patch 最小子集），`dispose()` 逆序清理。
- `packages/plugins/notify-console`：第一个插件（能力缝 Provider），`packages/bundle/{base,headless}` 承载 enable/disable。
- 验证：`bun run packages/boot/examples/headless.ts`（端到端样例）；`bun test packages/boot/test/core.test.ts`（6 pass）。详见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)。

> Tauri 端与 React 端的最小接线（sidecar ⇄ Rust 桥 ⇄ webview）已落地（v1，见 [architecture.md §11](docs/architecture.md#11-关键文件索引现状--目标)）；DuckDB 单写者、rspc/specta typed bridge、`@berkshire/cordis` vendor、sidecar 打包 externalBin 仍为 **v2 目标态**。详见 [secondary-development.md §8](docs/secondary-development.md#8-v1-落地说明已实现的-headless-最小核心脊)。

---

本项目由 `bun init` 于 bun v1.2.17 创建。参考：Cordis 文档见 `docs/reference/cordis-methodology.md`。
