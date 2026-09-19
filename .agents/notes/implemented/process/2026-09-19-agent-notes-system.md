# Agent Note: 决策记录体系（Agent Notes）的建立与中文单语适应

Status: implemented

## 问题

本仓库的历史决策理由（为何选 A 而非 B、放弃了什么）此前分散在 PR 描述、`docs/` 目标架构文档集与 `docs/reference/` 的横向可见处，没有一种耐久、可检索、随生命周期进退的形式来承载「某次权衡/备选/放弃的独有理由」。每次权衡往往只在当事 PR 内可见，事后维护者与 AI 需重新推导，或无法追溯为何排除某条诱人的替代方案。上游 dsh 以 `dsh-archive-agent-notes` 技能 + `.agents/notes/` 决策记录体系解决了这个问题，但该体系原样是英文主单语 + `.zh.md`/`.i18n.yaml` 双语三元组，与本仓库「主语言中文」、当前无双语配对设施（`bk-translate-docs` 待实现）的现状不匹配。

## 决策

建立本仓库自己的 `.agents/notes/` 决策记录体系，参照 dsh 的生命周期模型，并按仓库约定做**中文单语适应**。

- **路径编码**：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`；活跃生命周期为 `proposed/`、`implemented/`、`rejected/`，历史 `implemented` 归档到 `archived/`。
- **中文单语单文件**：每份记录就是单个 `foo.md`，无 `.zh.md`/`.i18n.yaml` 三元组。头部令牌 `# Agent Note:` 与 `Status:` 保持英文原样，结构章节使用中文规范名（`## 问题`、`## 决策`、`## 曾考虑的替代方案`、`## 后果` 等）。
- **封闭分类**：`feature`/`bug-fix`/`simplification`/`architecture`/`process`/`testing`，全部由 `scripts/agent-note-tree.ts` 这个单一事实源承载。
- **校验门禁（bun 形态）**：`bun run verify:agent-notes`（分类 + 格式）与 `bun run verify:archived-agent-notes[:write]`（append-only 冻结 manifest）。
- **生命力规则**：每个非平凡变更在同一 PR 内新增或更新记录；新增记录触发对同主题活跃记录的超驰审计；已交付记录按其理由是否仍指导未来工作决定保留或归档；被拒记录仅当其仍防住诱人的错误才保留，否则删除。
- **归档冻结**：归档变更只移动文件、插入 `Archived: YYYY-MM-DD`、重封 manifest、修复入站链接；封存后永不可编辑。

这套体系的规则与格式细节以 `.agents/notes/README.md` 为唯一权威，维护工作流见[技能 `bk-archive-agent-notes`](../skills/bk-archive-agent-notes/SKILL.md)。

## 曾考虑的替代方案

- **只依托 `docs/` 目标架构文档集承载全部理由**：否决。`docs/` 是「已提交事实」的目标态契约，聚焦于机制与现状/目标对照，不是决策档案；把贯穿生命周期、随时间进退的「为什么放弃 X」塞进去会破坏文档结构，也无法做 lifecycle 门禁。
- **原样移植 dsh 的英文主单语 + `.zh.md`/`.i18n.yaml` 双语**：否决。本仓库主语言中文且当前无双语配对设施（`bk-translate-docs` 待实现），建立 `.md`+`.zh.md`+`.i18n.yaml` 三元组需要翻译一致性校验基建，超出本次落地范围且违背「主语言中文」约定。
- **只留在 git 历史 / PR 描述**：否决。正是这条现状造成了理由追溯困难；决策记录的价值在于耐久、可检索、可门禁的生命周期。
- **全文英文（与 dsh README 一致）**：否决。与本仓库「文档以中文为主」（根 AGENTS.md）冲突。

## 后果

- **代价**：新增了三个 bun 校验脚本与一份规则文档；每个非平凡变更多承担一次记录责任；分类是封闭集合，新增分类需同时改脚本与文档。
- **收益**：历史权衡有了耐久家；「目标态 vs 已实现」诚实纪律之外，现在还能保留「为何排除某方案」的独有理由；验证可从 `.agents/README.md` 的「待实现」状态直观看出本体系已落地。

## 相关

- 规则与格式：`.agents/notes/README.md`
- 工作流：技能 [`bk-archive-agent-notes`](../skills/bk-archive-agent-notes/SKILL.md)
- 移植来源对照：`.agents/README.md` 技能/命名对照表