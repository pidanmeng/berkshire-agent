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

To run:

```bash
bun run index.ts
```

> 现有可运行脚手架仅有 `apps/berkshire-agent`（Tauri 2 + React 19 + Vite）。上文「文档」描述的是**目标态设计**，尚未实现，secondary-development.md 会诚实标注每一分层当前状态。

---

本项目由 `bun init` 于 bun v1.2.17 创建。参考：Cordis 文档见 `docs/reference/cordis-methodology.md`。
