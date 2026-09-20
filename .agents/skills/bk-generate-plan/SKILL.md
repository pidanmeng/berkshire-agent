---
name: bk-generate-plan
description: 在本仓库收到一批开发任务/需求后，不直接动手实现，而是先通读项目建立事实基线，再把需求拆成若干「自包含提示词」，逐份落盘到 `.agents/features/S<批次>-<feature名>.md`（同一批次号=可并行开发，批次号越小越先做），并给出执行顺序表。适用于「我接下来要干一批活，先帮我拆成并行开发计划并保存成文件」类请求。
---

# 把一批需求拆成可并行开发的提示词 + 执行顺序

本技能的核心铁律是：**收到需求先不写代码，先产出「并行开发包」**。你的职责是「把一组需求切分、编码成若干份**自包含**的提示词，并排出执行顺序」，让用户能把每份提示词各自丢给一个独立 AI 去落地。技能交付的是**计划与提示词**，不是实现。

## 铁律：不直接实现

- 用户列出一批需求后，你**不得**动手实现这些需求——即不改业务代码、不动 `packages/`、不改 docs 来"完成"它们（见第 0 步，唯一的落盘写入是**计划产物** `.agents/features/S<批次>-*.md`，属规划输出而非实现）。
- 你的全部产出 = 落盘到 `.agents/features/` 的若干份提示词文件 + 本会话里的执行顺序说明。每份提示词必须**自包含**（不依赖本会话上下文，能直接复制给一个从未看过本对话的 AI 去独立执行）。
- 若某需求明显是「个别、独立、不劳拆分的单点琐事」，可以在计划里标注"可直接单发给一个 agent"，但技能本身不替你实现它。

## 先通读项目，建立事实基线

拆包前必须先对仓库形成真实认识（不要凭 docs 表面猜实现）。至少：

- 读根 [AGENTS.md](../../../AGENTS.md)：仓库级契约——尤其「目标态 vs 已实现」清单、命令面、约定、防御模式。
- 读 [docs/architecture.md](../../../docs/architecture.md)（模块地图/进程拓扑/事件域/生命周期 + §11 现状锚点）、[docs/secondary-development.md](../../../docs/secondary-development.md)（§6 诚实对照、L1/L2/L3 分级）、[docs/capability-seams.md](../../../docs/capability-seams.md)（能力缝三角色）。
- 按需求落点读对应文档：[docs/quick-reference.md](../../../docs/quick-reference.md)（"新行为放哪"）、[docs/plugin-development.md](../../../docs/plugin-development.md)（插件写法）、[docs/data-model.md](../../../docs/data-model.md)（数据契约红线）、[docs/config.md](../../../docs/config.md)。
- 需要时用 glob/read 核实 `apps/berkshire-agent/src`、`packages/**/src` 里真实存在的入口与标识符；查命令是否真实存在（[AGENTS.md 命令节](../../../AGENTS.md#命令bun-版)），不存在的命令要在提示词里标注"待实现"。

读完后在心里形成一张「哪些已落地、哪些是目标态」的事实表——这是切包的依据，也是每份提示词里"诚实约束"的原料。

## 拆包步骤

### 0. 准备 `.agents/features/` 目录

- 拆包产物统一落盘到 `../../features/`（即仓库根的`.agents/features/`）。若目录不存在则先创建。
- 每份提示词独占一个 Markdown 文件。**文件名 = `S<批次>-<feature名>.md`**：
  - **批次（批次号）**：一个数字，表示该工作包属于哪个执行批次。批次号**越小越先执行**；**同一批次号 = 可并行开发**；批次号 N 的包依赖所有更小批次（<N）的包（或其明确列出的前置包）先完成。
  - **feature 名**：简短、小写、连字符分隔的英文特性名（对齐本仓库 package 命名风格），一眼能看出该包做什么。
- 示例：
  - `S1-typings-core.md`（第一批：底层类型，先行）
  - `S1-plugin-demo-slot.md`（第一批：与上面同为 S1 → 可与 `S1-typings-core` 并行）
  - `S2-market-datasource.md`（第二批：依赖 S1 的底层类型先落地）

> 文件名里的批次号是**唯一**让你和并行 AI 一眼看出依赖关系的载体，务必来自依赖 DAG，而不是按用户给需求的先后顺序编号。

### 1. 归并需求为工作包并识别依赖

- 把用户需求逐条整理成结构化清单（编号、一句话需求、落点猜测：前端/Rust/插件/文档/测试）。
- 合并强耦合的条项成**一个包**：例如「能力缝三角色（Service Definition/Provider/Consumer）」必须由**同一**落地方一次性完成，绝不能拆成三个人各写一角（[docs/capability-seams.md](../../../docs/capability-seams.md)）。数据契约红线的显式转换 + 测试也要同包。
- 识别包间依赖：A 是否被 B 引用/import？B 是否依赖 A 的接口先行定义？共享底层（类型定义、令牌、slice、公共契约）往往是多数包的前置。
- 输出一份**依赖 DAG**（可标注的先后/并行关系），哪怕很简单：

```
第一批(可并行)    第二批(依赖一线)     第三批(依赖二线)
WP-1 底层类型     WP-4 依赖 WP-1        WP-7 依赖 WP-4,WP-5
WP-2 文档/契约     WP-5 依赖 WP-1
WP-3 独立界面      WP-6 依赖 WP-2,WP-3
```

### 2. 为每个工作包写一份「自包含提示词」

每份提示词按下方【提示词模板】写。重点：把它写成「一个从未见过本对话的 AI 拿到就能干」的完整委托，包含**足够的真相来源指针**（让它自己读 AGENTS.md/docs）、**明确的验收点**、**硬约束**、**不越界边界**、**产物与验证**。

### 3. 排批次（执行顺序）

- 根据依赖 DAG 给每个工作包分配**批次号**：
  - **第一批（批次 S1，可并行）**：互相无依赖、或只依赖仓库既有事实基线（真实存在的代码/命令）的包。共享底层类（类型定义/令牌/能力缝契约/路由契约定义）通常放第一批并标注「强烈建议最先启动、先定接口冻结」。
  - **第二批及之后（批次 S2/S3/…，依赖前置）**：明确写出「前置 = 哪个更小批次已落地」。
- 批次号规则：**同号并行、小号先做**；N 号包依赖所有 <N 号的包（或其中明确指定的前置包）。把此规则写进每个文件的头部，并写进每份提示词，让并行 AI 也知道自己能/不能依赖什么。
- 对每一份提示词给出：批次号 + 是否可并行 + 前置包（编号/文件名）。

### 4. 交付输出格式

- **把每份提示词落盘为一个独立文件**：`../../features/S<批次>-<feature名>.md`（绝对路径 `[.agents/features/](../features/)`），内容为该包完整提示词全文（见【提示词模板】），**本身就是可独立执行的委托，不依赖本会话**。
- 同时在本会话回复里给出：
  - **并行开发计划概要**：依赖 DAG（文字/简单图）+ 总览（先行 S1 的哪些、第二批可并行哪些、后续依赖哪些）；
  - **执行顺序表**：批次、包、文件名、可否并行、前置；
  - **全部落盘文件的路径清单**，方便你开启新会话时逐个直接引用。

## 提示词模板

每份提示词应包含以下要素（用中文，面向一个全新 AI）：

1. `# 包名 / 目标`：一句话说清要让该 AI 完成什么、产出在哪个路径。
2. `背景与真相来源`：指示先读哪些文件（AGENTS.md + 相关 docs + 相关目录），给出可点相对路径；不要替它把内容抄进来。
3. `需求明细（验收点）`：逐条可勾选的完成标准（行为、接口、产物文件）。
4. `硬约束（必须遵守）`：从 [AGENTS.md](../../../AGENTS.md) 抽取对本包最相关的契约，例如：
   - 诚实：不得把目标态当已实现，不得 import 尚不存在的 `ctx.*`/`@berkshire/cordis`/`packages/*` 服务，不得调用不存在的命令；
   - 目标态新能力需在文档标注"待实现/目标态"；
   - 能力缝三角色完整；注册即效应（`ctx.effect()`/`ctx.on()` + disposer）；事件 `@mode` 标注；waterfall 监听器必须 `next()`；跨边界 id 品牌化；配置 loud-fail；数据红线；单写者；
   - 前端 slot 组件包 `ExtensionBoundary`；样式用 `var(--bk-*)`，禁魔法色值。
5. `范围边界（明确不做什么）`：列清本包**不**动的文件/领域，防止并行 AI 互相踩脚。
6. `产物与验证`：期望产出物（文件/改动）+ 最小落地校验命令（只写真实存在的，如 `cd apps/berkshire-agent && bun run build`、`bun run typecheck`、`git diff --check`；不存在的测试/命令标"待实现"）。如需 `bun run build:packages` 等，注明在哪个目录跑。
7. `完成定义（DoD）`：怎样算"这一包干完了"。

> 提示词要**限制单包规模**：一个包应能在有限改动内独立完成并自证，避免"巨型包"吞掉多个可并行项。

## 诚实与契约红线（写提示词时必须代入）

- 因本仓库处于「目标态设计 + 骨架已跑」阶段，**绝大多数"造新功能"需求其实落在目标态**。对应提示词应让那个 AI **产出设计方案/契约/目标态文档**，而非 `import` 尚不存在的东西去硬实现。是否真落地以 [docs/secondary-development.md §6](../../../docs/secondary-development.md#6-已有-vs-目标诚实标注) 为准。
- 分解时不得推荐违反仓库契约的做法（例如插件绕过 `ctx.database` 裸写 DuckDB、把能力缝拆给多方各写一角、用 `?? default` 藏配置默认值）。
- 命令引用必须真实存在；待实现的命令/设施（`x` 文件里标注）。
- 文案/文档类包遵守 [bk-doc](../bk-doc/SKILL.md)、[bk-prose-standard](../bk-prose-standard/SKILL.md)、[bk-trim-cot-leakage](../bk-trim-cot-leakage/SKILL.md)；涉及审查用 [bk-code-review](../bk-code-review/SKILL.md)；涉及落地校验用 [bk-pre-push-checks](../bk-pre-push-checks/SKILL.md)——在对应包的提示词里引用这些技能名即可，无需内联展开。

## 输出与落盘格式

最后产出两部分：

**A. 落盘文件（必须写盘）**——每个工作包一个文件：

```
.agents/features/
├── S1-typings-core.md
├── S1-plugin-demo-slot.md
└── S2-market-datasource.md
```

每个文件开头放一个简短头部：

```markdown
---
batch: 1            # 批次号：同号可并行，此号依赖所有更小批次
feature: typings-core
depends_on: []      # 直接前置包（文件名或编号），首批为空
parallel_with: [plugin-demo-slot]   # 同批次可并行的包
---

<完整提示词全文，见【提示词模板】>
```

**B. 会话内回复**——给出计划概要、执行顺序表、以及全部落盘文件路径清单，方便你新开会话时逐个引用：

```markdown
## 并行开发计划概要
- 依赖 DAG（文字/简单图）
- 总览：先行 S1（typings-core, plugin-demo-slot）；后续依赖 S2（market-datasource）...

## 执行顺序
| 批次 | 包文件 | 可并行 | 前置 |
| S1 | features/S1-typings-core.md | 可并行(S1) | — |
| S1 | features/S1-plugin-demo-slot.md | 可并行(S1) | — |
| S2 | features/S2-market-datasource.md | — | S1 先落地 |

## 落盘文件
- .agents/features/S1-typings-core.md
- .agents/features/S1-plugin-demo-slot.md
- .agents/features/S2-market-datasource.md
```

> 交付后技能职责结束——不执行这些提示词，除非用户明确说「现在开始执行」。

## 验证本技能自身

本技能是纯编辑产出一个工作流文档，可跑 `git diff --check` 确认无尾随空白/白斑；按 [bk-doc](../bk-doc/SKILL.md)/[bk-prose-standard](../bk-prose-standard/SKILL.md) 自查中文文风与诚实措辞。