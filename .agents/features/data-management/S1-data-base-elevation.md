---
batch: 1
feature: data-base-elevation
depends_on: []
parallel_with: [canonical-data-model, fix-bigint-serialization]
---

# S1 · 数据插件升权：数据能力成为宿主绑定的基座（对齐 base-ui）

## 包名 / 目标
用户需求第 6 条：**「数据插件升权，改为和 base-ui 相同，作为整个宿主绑定的基座」**。当前数据插件（`datasource-fuyao` / `datasource-csv` / `data-manager`）是 `cordis.patch.yml` 里**可被用户裁剪/可选**的运行期插件行，由 sidecar 按 `$BK_HOME/cordis.yml` 装配；而 **base-ui 是宿主绑定的基座**（宿主静态 import `@berkshire/base-ui/client`，经共享 `root` 槽挂壳帧，不依赖 cordis.yml 插件行）。本包把**数据能力**同样升为基座级：数据 provider/数据同步/数据管理成为整个宿主**始终存在、不可剥离**的底座。本包是**装配/打包层落地**，不含新数据能力实现（那些归 S2/S3）。

## 背景与真相来源
先读，建立事实基线（区分「已是基座」与「现在仍是可选插件」）：

- 根 `AGENTS.md`（「目标态 vs 已实现」、base-ui 已作为壳插件 webview 半身、`@berkshire/base-ui/client` 经 host static import）。
- 装配与打包：
  - `packages/bundle/base/cordis.patch.yml`（**注意 base-ui 不在其中**——它由 host 静态 import；而 fuyao/csv/data-manager 在这里，是可选项）。
  - `packages/bundle/base/package.json`、`packages/bundle/{headless,demo,demo-off}`。
  - `packages/sidecar/src/index.ts`（按 `$BK_HOME/cordis.yml` 装配，`readCordisYml`/`importPlugin`）。
  - `apps/berkshire-agent/src/main.tsx`（入口，令牌根 + 挂载）、`apps/berkshire-agent/src/App.tsx`（从共享 `root` 槽取 base-ui 壳帧）、`apps/berkshire-agent/vite.config.ts`（base-ui 的 `/@fs` 别名，`@berkshire/base-ui/client`）。
  - `apps/berkshire-agent/src/onboarding/defaultOptions.ts`（base-ui 是宿主半身不在此列；数据插件现在是可勾选项）。
  - `scripts/{build-packages,modules,watch-plugins}.ts`、`packages/theme`（令牌层）。
- `docs/architecture.md §11`、`docs/config.md`（bundle/patch 语义）、`docs/secondary-development.md §6`（诚实对照）。

设计意图：base-ui 作为「壳」用 **宿主静态半身 + `root` 槽** 绑死，不进入运行时插件表。数据基座应对齐此姿势——**数据 provider / 同步 / 数据管理视为宿主数据平台的基座**，始终装配、不可卸载，且宿主不依赖外部 `bun add` 才能取数。

## 需求明细（验收点）
- [ ] 明确**数据基座的新装配形态**（写清设计并落地其一，二选一可落地且诚实标注）：
  - **姿势 A（对齐 base-ui）**：数据 provider/同步/数据管理的 **sidecar half + webview half** 都改为宿主/基座侧自带的「always-on 基座」，不再摆在 `cordis.patch.yml` 的插件行里显式勾选；宿主或基座一次性挂载。
  - 或 **姿势 B**：保留 cordis.yml 插件机制，但在 `bundle/base` 把数据插件升为「禁卸载的强制 base」，默认与 base-ui 同级、整宿主绑定。
  - **选择一种并贯彻到底**，在交付说明里写清为什么（优先推荐姿势 A：语义最贴「和 base-ui 相同」）。
- [ ] 数据 provider（fuyao/csv）、数据同步编排、数据管理页在**新的基座形态**下**始终可用**，宿主首启/装配路径不因数据插件缺省而崩。
- [ ] `onboarding/defaultOptions.ts` 与 `cordis.patch.yml` 相应调整：数据能力不再作为「用户可勾选/可裁剪」项（或明确标注强制 base 语义）。
- [ ] 升级路径诚实：老 `$BK_HOME/cordis.yml` 里已有的数据插件行如何被新基座承接/去重（不重复装配、不崩）——给出处理。
- [ ] 基座与扩展缝的关系：本包为 S3 的「新数据能力（Enriched/覆盖记录/定时任务）」进入基座**预留落点/装配入口**（可只留骨架 + 诚实标「目标态」），不实现。
- [ ] 诚实回写：更新 `docs/architecture.md §11`、`docs/secondary-development.md §6/§8`、根 `AGENTS.md`「已有」清单，标注数据能力升为基座；改 `packages/` 前先读 `docs/architecture.md`。
- [ ] 冒烟：装配后 `sidecar` 起来即含数据基座能力，`data-sources/list`、`database/tables` 在无外部插件声明时仍可用。

## 硬约束（必须遵守）
- **能力缝三角色**：即使是基座，也要保持 Definition/Provider/Consumer 三者在同一归属下完整存在（升权=常驻，不等于拆散缝）。
- **注册即效应 + 可逆**：基座装配也用 `ctx.effect()`/disposer，卸载/升级不残留。
- **单写者**：本包不绕过 `ctx.database` 直接裸写 DuckDB；不改数据 schema。
- **诚实**：所有仍目标态的（如新的数据能力进基座后的具体逻辑）明确标注；不 import 尚不存在的服务。
- 插件 client 半身仍按「独立打包 + host 只注入」纪律（CSS Modules 已落地，见 `docs/architecture.md`），升权不改变打包形态本身。
- 通过 `git diff --check`。

## 范围边界（明确不做什么）
- **不做**任何新数据能力（Enriched 生成、覆盖记录、定时任务、性能缓存——它们归 S2/S3）。
- **不动** base-ui 壳本身（它已是基座，仅作对齐参照）。
- **不改** `packages/core` 的 datasets/dataSources/database 契约类型（类型面归 S1-canonical-data-model；如确需增装配契约，只增装配层且与契约包交叉协调在 S2 后再动）。
- **不**引入新依赖。

## 产物与验证
产物：装配层改动（`packages/bundle/base/cordis.patch.yml`、`packages/sidecar/src/index.ts` 如涉及、`apps/berkshire-agent/src/onboarding/defaultOptions.ts`、可能新增的基座插件目录如 `packages/plugins/*-base` 骨架）、诚实文档回写。

最小落地校验（真实存在）：
```sh
cd C:\Code\berkshire-agent && bun run build:packages
cd apps/berkshire-agent && bun run build
bun run typecheck
git diff --check
```
未实现的命令/设施标注「待实现」；冒烟可在 `packages/sidecar` 手动 `bun src/index.ts`（配合 `$BK_HOME/cordis.yml`）观察装配日志（该冒烟依赖本地环境，标注说明）。

## 完成定义（DoD）
- 数据能力以所选姿势（A/B）升为宿主基座，宿主/装配路径不崩、无需用户勾选即可用；
- 老 cordis.yml 数据插件行与新基座无重复装配、有去重承接；
- 基座保存好扩展缝的装配落点（可标目标态）；
- 文档现状锚点 + `AGENTS.md`「已有」同步；typecheck + build 绿；`git diff --check` 干净。