---
name: bk-code-review
description: 审查本仓库的改动（改动 `apps/berkshire-agent` 骨架、docs 目标架构增补，或将来落入 `packages/` 的插件）——按本仓库的架构契约（目标态诚实、能力缝三角色、注册即效应、数据契约红线、跨边界品牌化 id）逐项核对；它能给出任何纯代码/纯文档都发现不了的契约级检查。
---

# 审查一次 Berkshire Agent 改动

本技能是**审查指引，不是穷尽清单**。BK 尚处于「设计契约 + 骨架可运行」阶段，审查必须区分两个动作域：**文档/目标态增补** 与 **已实现骨架/将来插件代码**。每次审查先确认改动的真实状态，再跑对应检查。

## 真相来源（Sources of truth）

- 根 [AGENTS.md](../../../AGENTS.md)：仓库级契约（目标态诚实、约定、防御、命令）。
- [docs/architecture.md](../../../docs/architecture.md)：进程拓扑、模块地图、事件域、生命周期、「现状 vs 目标」锚点表。
- [docs/capability-seams.md](../../../docs/capability-seams.md)：能力缝目录、「三角色模型」（Service Definition / Provider / Consumer）。
- [docs/secondary-development.md](../../../docs/secondary-development.md)：L1/L2/L3 分级、Cordis 方法论硬约束、验证矩阵、诚实标注。
- [docs/data-model.md](../../../docs/data-model.md)：DuckDB 单写者、标准列、缓存失效链、6 条数据红线。
- [docs/plugin-development.md](../../../docs/plugin-development.md)：插件三形态 + 5 个落地教程（作为「将来代码怎么写」的契约）。
- [docs/quick-reference.md](../../../docs/quick-reference.md)：「新行为放哪」速查——先据此判断改动的扩展点是否正确。
- 技能侧：`bk-prose-standard`（文档/JSDoc 文案）、`bk-doc`（文档结构/诚实标注）、`bk-ci-test-reliability`（若涉及测试）、`bk-trim-cot-leakage`（防推理过程泄漏进文档）。

## 首要阻塞项（目标态诚实——本仓库特有的红线）

1. **不得把目标态当已实现**：新增代码/示例不能 `import` 尚不存在的 `ctx.*`、`@berkshire/cordis`、`packages/*`、`bk://`、rspc 客户端；不得调用不存在的 `cargo test -p bk-core`、`bk --profile ... --dump-config`。若 PR 是纯文档，逐条核对它与 [docs/secondary-development.md §6](../../../docs/secondary-development.md#6-已有-vs-目标诚实标注) 一致。
2. **不得虚构 API / 把文档示例当实现**：`docs/` 是目标契约。任何写进代码或写进教程的行为，只能建立在真实存在的文件（`apps/berkshire-agent/src/...`、`src-tauri/...`）之上，或明确标注为「目标态示例」。
3. **docs 示例需与目标态文档自洽**：改 `plugin-development.md` 的某个示例，若它依赖 `capability-seams.md` 的能力定义或 `data-model.md` 的 schema，三处必须同步、术语一致、引用不悬空。

## 阻塞项（契约级——适用于任何落地代码）

1. **能力缝三角色完整**：新增/替换一种能力（数据源/指标/分析/AI/通知/图表），必须同时提供 Service Definition、Service Provider、Consumer 三者；只有接口定义不算缝（[capability-seams.md §1](../../../docs/capability-seams.md#1-服务角色速览)）。
2. **注册即效应**：每个注册走 `ctx.effect()`/`ctx.on()` 并返回 disposer；`register()` 返回可撤销 disposer；清理顺序重要时放进同一 effect，卸载逆序执行（[secondary-development.md §2](../../../docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)）。
3. **配置 loud-fail + 显式 resolve**：`Config` 用 standard-schema（zod）；无效配置在加载/最早可解析点响亮失败；默认值走显式 `resolve`，不在 `apply`/`run()` 里藏 `?? default`（[secondary-development.md §2](../../../docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)、[plugin-development.md §0](../../../docs/plugin-development.md#0-插件骨架三形态)）。
4. **Waterfall 监听器必须 `next()`**：`@mode waterfall` 的事件监听器若不调 `next()` 就短路；逐个核对（[capability-seams.md §5](../../../docs/capability-seams.md#5-事件类型化五种派发模式)）。
5. **跨边界 id 品牌化**：`AssetId/DatasetId/CapabilityId/SymbolId`，绝不用裸 `string`（[secondary-development.md §2](../../../docs/secondary-development.md#2-cordis-方法论约束对-downstream-的硬规则)）。
6. **数据契约红线有测试**：比例/百分比口径、前复权 vs 原始价、PIT 财务、北京时区、交易日、fail-closed——跨层显式转换**且**有单元测试，禁止启发式（[data-model.md §6](../../../docs/data-model.md#6-数据契约红线改代码必读)）。
7. **单写者**：任何写 DuckDB 的路径只能经 Rust（`db.rs`）+ `ctx.database`；插件/前端禁止绕过直接裸写（[architecture.md §4](../../../docs/architecture.md#4-端到端数据流主路径)）。

## 手动检查（Manual checks）

- **目标态 vs 已实现锚点更新**：若某能力在代码里落地，检查对应 PR 是否更新了 [architecture.md §11](../../../docs/architecture.md#11-关键文件索引现状--目标) 的「现状锚点」，以及 secondary-development §6 的诚实标注。
- **扩展点选择**：用 [quick-reference.md](../../../docs/quick-reference.md) 对照——动的是数据（dataSources/datasets/scheduler）、逻辑（indicators/screener/strategy/backtest）、界面（slots/clientModules/chart）、外部能力（ai/notifier/datasource provider）还是「只换默认」（profile/bundle/patch）？放错扩展点即架构缺陷。
- **事件域与派发模式**：选中哪一层事件（耐久 `market/*` / 在途 `sync|analysis|backtest|screen` / 能力策略 `datasource|indicator|ai|notify`）+ 哪种 `@mode`（emit/waterfall/parallel/serial/bail）。选错领域/模式是大多数插件 bug 的来源（[architecture.md §5](../../../docs/architecture.md#5-事件领域三层分明)、[capability-seams.md §5](../../../docs/capability-seams.md#5-事件类型化五种派发模式)）。
- **生命周期与电动化（Fiber）**：计划内改动涉及 `ctx.plugin()`/fiber `dispose/restart/update`、HMR 原位热更新时，核对可逆效应与逆序清理（[architecture.md §8](../../../docs/architecture.md#8-插件形态与生命周期)）。
- **前端扩展契约**：slot 名复用（`stock-preview.footer`/`analysis.menu`/`chart.overlay`…）；组件包 `ExtensionBoundary`；client bundle 经 `bk://` 协议、开发走 Vite HMR；路由须静态、不覆盖核心路径；id/路径冲突注册时拒绝（[secondary-development.md §4](../../../docs/secondary-development.md#4-前端扩展契约l2)、[plugin-development.md §4](../../../docs/plugin-development.md#4-加一个-ui-slot)）。
- **配置分层**：若改 bundle/patch，核对 layer 顺序（bundle→profile→home→`--patch`）、按 `id` **整体替换**而非深合并、`dump-config` 与挂载路径共用同一组合算法（[config.md](../../../docs/config.md)）。
- **缓存失效链**：写路径多步刷新应「构建新快照后原子替换」，禁止「已写文件却返回旧内存对象」（[data-model.md §5](../../../docs/data-model.md#5-缓存分层与失效链)）。
- **凭据安全**：key 经 `ctx.credentials`，`Config` 只存引用名；审查是否有人把明文密钥写进代码/YAML/打印（[plugin-development.md §5](../../../docs/plugin-development.md#5-加一个-ai-适配器)）。
- **诚实标注动作域**：纯文档改动按 `bk-doc`/`bk-prose-standard`/`bk-trim-cot-leakage` 复审；含代码改动则补以上契约检查，并按 [secondary-development.md §5](../../../docs/secondary-development.md#5-验证矩阵改动类型--最低验证) 选择最低验证命令。

## 报告发现（Reporting findings）

按「缺陷—位置—影响—证据」四要素陈述；局部缺陷标在最小相关 diff 行，跨域架构问题用 PR 级评论。阻塞项与建议分开，已被绿灯门禁（如 `bun run build`、`git diff --check`）强制的事项不再重复列出。收到审查意见时，逐条核对事实后以技术理由回应或修复，不做表演式附和。