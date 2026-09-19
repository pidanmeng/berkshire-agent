# `.agents/` —— Berkshire Agent 的 AI 工作流

本目录是 Berkshire Agent（下称 **BK**）的 **AI 开发者约束与规范化工作流**：把 dsh（DeepSeek Harness）的技能形态**去敏、换型、翻译为中文**后，按 BK 的真实业务（A 股投研、能力缝三角色、DuckDB 单写者、Tauri Rust 宿主 + Bun sidecar 的 Cordis 插件、`apps/`+`packages/` 布局、bun 命令）重建。

- **决策记录（Agent Notes）在 [`.agents/notes/`](notes/README.md)**（中文单语单文件，参照上游 dsh 生命周期模型移植，附 bun 校验门禁）；维护工作流见 [`bk-archive-agent-notes`](skills/bk-archive-agent-notes/SKILL.md)。

- 装载形态（dsh 规则）：**dsh 只从仓库根 `.agents/skills/` 读取技能并加载其中的 `SKILL.md`**。因此这里**只有技能，不交付 Command 命令集，也不交付 Subagent 定义**——一切「原本想做成命令的校验」都封装进了对应技能的可执行步骤里。
- 根 `AGENTS.md` 是项目全局约束，dsh 读取它；本文档是其「已强制 vs 仅文档/待实现」的诚实对照来源。

## 一、技能/命名对照表（dsh → BK）

前缀统一为 `bk-`，与本仓库整体命名自洽。

| dsh 原技能 | BK 技能（目录名） | 中文定位 | 状态 |
| --- | --- | --- | --- |
| `dsh-pre-push-checks` | [`bk-pre-push-checks`](skills/bk-pre-push-checks/SKILL.md) | 推送前最小证据选择；诚实核对命令真实性 | ✅ 已落地（按仓库真实命令改写） |
| `dsh-code-review` | [`bk-code-review`](skills/bk-code-review/SKILL.md) | 按 BK 契约（目标态诚实/三角色/注册即效应/数据红线/Branded）审查改动 | ✅ 已落地 |
| `dsh-doc` | [`bk-doc`](skills/bk-doc/SKILL.md) | 中文文档标准（受众优先/诚实标注/事实可复现/一个事实一个家） | ✅ 已落地（按仓库真实设施简化） |
| `dsh-find-simplifications` | [`bk-explain-simplifications`](skills/bk-explain-simplifications/SKILL.md) | 找简化；把宽泛请求转成有证据、可落地的提案 | ✅ 已落地 |
| `dsh-prose-standard` | [`bk-prose-standard`](skills/bk-prose-standard/SKILL.md) | 中文文风/术语标准（保留完整命题、删推理痕迹） | ✅ 已落地 |
| `dsh-trim-cot-leakage` | [`bk-trim-cot-leakage`](skills/bk-trim-cot-leakage/SKILL.md) | 防推理过程泄漏；守护「目标态 vs 已实现」诚实 | ✅ 已落地（含 BK 特有红线） |
| `dsh-ci-test-reliability` | [`bk-ci-test-reliability`](skills/bk-ci-test-reliability/SKILL.md) | 可靠测试设计准则（针对 BK 关键面：单写者/侧车子进程/网络 provider） | ⚠️ 待实现（仓库无测试框架/CI 车道） |
| `dsh-speed-up-perf` | [`bk-speed-up-perf`](skills/bk-speed-up-perf/SKILL.md) | 性能调查/优化（测量优先、拒绝无据优化） | ⚠️ 部分待实现（前端骨架可测；DuckDB/sidecar/基准待落地） |
| `dsh-translate-docs` | [`bk-translate-docs`](skills/bk-translate-docs/SKILL.md) | 中英对照文档翻译 | ⚠️ 待实现（仓库无双语配对设施；当前中文单语体） |
| `dsh-merging-stacked-prs` | [`bk-merging-stacked-prs`](skills/bk-merging-stacked-prs/SKILL.md) | 落地 GitHub PR stack | ⚠️ 不适用/待实现（`gh stack` 未确认启用） |
| `dsh-archive-agent-notes` | [`bk-archive-agent-notes`](skills/bk-archive-agent-notes/SKILL.md) | 决策记录生命周期维护 | ✅ 已落地（`[.agents/notes/](notes/README.md)` 中文单语体系 + bun 门禁） |
| `record-browser-gif` | —（不交付） | GUI 演示 GIF 录制/发布 | ❌ 取舍：不交付（见下方说明） |

**不做对照、明确不交付的技能**：

- `record-browser-gif`：其值是「把产品-可见 GUI 行为录成 GIF 作为 PR 证据」。BK 当前 GUI 只有 `apps/berkshire-agent` 的空壳骨架，DuckDB/Cordis/rspc 均未落地，录制无产品行为可展示；且所需基建设施（浏览器控制工作流、Playwright、`gh --attach` 的媒体上限）与 BK 现状无关。等 BK 有真实产品-可见交互后再按需补，现标「不适用」而非谎称可用。

## 二、已强制 vs 仅文档/待实现（诚实对照）

以下每行都如实区分「本工作流当前能强制的」与「仅在参考文档里、尚未有设施/命令可强制的」。对应 dsh → BK 映射中的「状态」列 + 根 [AGENTS.md](../AGENTS.md)。

| 能力 | 当前能否强制 | 说明 |
| --- | --- | --- |
| 目标态诚实（`ctx.*`/`@berkshire/cordis`/`packages/` 不可当已实现） | ✅ 能（原则性强制） | `bk-code-review` 首要阻塞项；`bk-trim-cot-leakage` 特有红线；根 AGENTS.md 头条 |
| 引用命令必须真实存在、待实现命令须标注 | ✅ 能 | `bk-doc`/`bk-pre-push-checks`；命令清单见 [AGENTS.md 命令节](../AGENTS.md#命令bun-版) |
| 能力缝三角色完整 | ⚠️ 文档强制（代码未落地） | `bk-code-review` 阻塞项；落地前无真实代码可查 |
| 注册即效应 / 事件 `@mode` / waterfall `next()` / Branded id / 配置 loud-fail | ⚠️ 文档强制 | 能力缝未落地，属目标态；见 capability-seams/plugin-development |
| 数据契约红线 + 显式转换 + 测试 | ⚠️ 测试未落地 | `bk-ci-test-reliability` 待实现；`bk-code-review` 阻塞项 |
| 前端 `bun run build` / Rust `cargo check` | ✅ 能（骨架可跑） | `bk-pre-push-checks` 最小证据 |
| CI 测试车道 / 基准设施 | ❌ 无设施 | `bk-ci-test-reliability`/`bk-speed-up-perf` 标「待实现」 |
| decision records（`.agents/notes/`） | ✅ 已落地 | `bk-archive-agent-notes` 已落地；`bun run verify:agent-notes` + `verify:archived-agent-notes` |
| 中英对照 / PR stack | ❌ 无设施/未启用 | `bk-translate-docs`/`bk-merging-stacked-prs` 标「待实现/不适用」 |

> 本表必须与仓库实际同步更新：某项目标态一旦落地（出现真实代码/命令），把对应行从「待实现」改为「已强制」，并在 [architecture.md §11](../docs/architecture.md#11-关键文件索引现状--目标) 同步「现状锚点」。

## 三、自检：一个新 AI 能否据此落地一个「bk- 能力缝 provider 插件」

**问题：** 用这套工作流 + 根 AGENTS.md，一个新 AI 能否正确落地「新增一个 `bk-` 能力缝 provider 插件」？

**自检结论：能（且能规避本仓库最致命的坑），步骤映射如下。**

1. **先定扩展点**：打开 [quick-reference.md](../docs/quick-reference.md)，认出「换 provider」是能力缝三角色替换 → 标记为设计「Service Definition / Provider / Consumer」三者（[capability-seams.md](../docs/capability-seams.md)）。
2. **诚实判定当前状态**：读 [secondary-development.md §6](../docs/secondary-development.md#6-已有-vs-目标诚实标注) + [AGENTS.md](../AGENTS.md) 头条——**写这步时 `packages/`、`ctx.*` 尚未落地 ⇒ 新 AI 应判明「这是目标态设计」，只写设计方案+文档，不 import 不存在的类型**。这正是新 AI 最容易犯、而这套工作流显式堵住的错误。
3. **读插件写法**：按 [plugin-development.md](../docs/plugin-development.md) 的骨架（`inject`/`Config`/`apply` 三件套 + return disposer）设计插件结构，作为「将来落地」的契约示例，并标注目标态。
4. **过 bk-code-review 契约**：三角色完整、注册即效应、事件 `@mode`、Branded id、配置 loud-fail、数据红线、单写者——逐条过一遍（现在作为对设计文档的审查）。
5. **过 bk-prose-standard / bk-doc / bk-trim-cot-leakage**：中文文风、术语统一、诚实标注、无推理泄漏、不把目标态当已实现。
6. **选最小证据**：若只是文档/设计 → 链接锚点 + `git diff --check`；若碰了真实骨架 → `cd apps/berkshire-agent && bun run build`。不臆造 `cargo test -p bk-core`/`bk --dump-config` 当已验证。

**结论**：工作流保证了「新 AI 知道往哪个扩展点放、如何诚实标注、审查哪几类契约、用哪些真实命令验证」。**关键缺口（诚实声明）**：因能力缝/测试未落地，新 AI 无法提交一个「能通过单测的能力缝 provider」——那是待实现的能力，工作流不谎称它能做。一旦 `packages/` 落地，`bk-code-review`/`bk-pre-push-checks` 的「文档」检查自动升级为「代码」检查。

## 四、相对 dsh 的差异点

1. **去敏换型**：所有 dsh 专有实体（`dsh`/`dsh-*`、ACP、SessionEventMap、`DEEPSEEK_API_KEY`、session JSONL、`cordis.yml 的 !!js` 等）已替换为 BK 实体：A 股数据源 provider（tickflow/fuyao/tushare/akshare）、指标 `ctx.indicators`、能力缝（dataSources/indicators/analysis/ai/notifier…）、DuckDB 单写者、Tauri Rust 宿主 + Bun sidecar 的 Cordis 插件、`apps/`+`packages/{boot,core,datasource,indicators,domain,ai,notify,client,bundle}`、bun 命令、`.bundle`/`patch` 配置。
2. **无 Command / Subagent 交付**：`bk-pre-push-checks` 等把「校验命令」封装成技能内步骤，不交付独立命令集（符合 dsh 装载规则）。
3. **主语言中文**：SKILL.md 均为中文；不复制 dsh 的 `references/*.md` + `.i18n.yaml` 双语排版（`bk-translate-docs` 因此标待实现）。
4. **诚实优先重构**：本仓库是「目标态设计 + 骨架」，所以 `bk-code-review` 把「目标态 vs 已实现」列为首个阻塞项；`bk-trim-cot-leakage` 加了一条 BK 特有红线（不得把目标态当已实现）。
5. **按缺设施降级**：测试/基准/双语/notes/stack 相关技能因前置条件不存在，全部显式标「待实现/不适用」，不谎称可用。
6. **命令面极小**：当前真实可跑命令只有 `bun install`、`bun run dev/build/preview/tauri`、`cargo check`；`bk-pre-push-checks` 据此选最小证据，不照搬 dsh 的 pnpm 全量脚本集。

## 五、维护约定

- 新增/修改技能：遵循 `bk-doc`/`bk-prose-standard`；技能触发条件写进 frontmatter `name`/`description`（中文）。
- 某项目标态落地后：更新本表、「状态」列、根 [AGENTS.md](../AGENTS.md) 的诚实标注，以及 [architecture.md §11](../docs/architecture.md#11-关键文件索引现状--目标)。
- 本目录只承载技能（SKILL.md）；不放置可执行命令集或 subagent（dsh 不加载它们）。