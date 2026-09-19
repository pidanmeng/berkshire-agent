---
name: bk-archive-agent-notes
description: 维护本仓库的决策记录（Agent Notes）生命周期——新增/审计/精简/归档/删除/恢复。仓库已有 `.agents/notes/` 决策记录体系（中文单语单文件 + 封闭分类 + bun 校验门禁，参照上游 dsh-archive-agent-notes 移植）；本技能是服从该规则的校准工作流。
---

# 维护 Berkshire Agent 决策记录（Agent Notes）

压缩活跃决策语料，而不抹掉仍能指导工作的历史。逐条语义判断；字数与存续时间是发现辅助，绝不是归档标准。

本仓库已落地 `.agents/notes/` 决策记录体系：**中文单语单文件**（每篇 `foo.md`，无 `.zh.md`/`.i18n.yaml` 双语三元组，见 `bk-translate-docs` 待实现），路径编码 `{lifecycle}/{class}/yyyy-mm-dd-topic.md`，封闭分类由 `scripts/agent-note-tree.ts` 承载，`bun` 校验门禁见下方「验证与报告」。

## 读契约

分类前先读 [Agent Note 规则](../../notes/README.md)、[归档说明](../../notes/archived/AGENTS.md) 与该分类的 active 生命周期说明。用当前代码、配置、包文档、更新文档、较新的 Agent Note 与入链，来确定某个理由是否仍拥有或约束任何东西。

## 新增时查超驰（supersession）

每份新 Agent Note 触发一次对覆盖同一决策/机制/被拒备选的活动记录做的限定审计。写新记录的同时，分类每项全/部分超驰：把符合归档条件的 `implemented` 记录在同一 PR 内归档；部分超驰或独立有用的理由保留并交叉链接；过时的提案转 `rejected`；不再防住诱惑错误的 `rejected` 记录删除。当新持有者吸收全部独有命题时应用合并条款；不要把一个已知匹配推迟到语料审计。

## 按未来价值分类

- **已实现——保留 active**：其理由/备选/负向保证/耐久或协议语义/归属边界/安全规则/回引条件是未来变更可能受益的。长度无所谓。
- **已实现——归档**：交付决策完整且正文不太可能指导未来，例如一次性 UI 镀层、窄适配器、已关闭的次要 bug、被新实现取代的细节、或当前行为已在他处显而易见的流程史。
- **提议——永不归档**：保留活动提议；若不再值得继续，就用诚实的理由转 `rejected` 并满足 rejected 生命周期格式。
- **被拒——仅保留为护栏**：仅当失败方案仍是一个诱人且影响重大的错误、且记录解释了为何失败才保留。
- **被拒——删除**：失败想法已过时/被取代/不再可能/不再防住重开争论时，删除该文件（中文单语体系下即单个 `foo.md`）并修复或删除入链。

不要为了凑数归档。逐条语义判断，同类同原则，真正的 borderline 案例记下来移交。

## 校准示例

下列示例定下判类标尺；字数展示「大小不是测试」。（示例取自上游 dsh 语料以说明同一原则，本仓库语料尚新、无需套用具体文件名。）

归档 implemented（如）：已折叠的侧栏控制轨（一次性 UI）、Commander 参数适配器（大量实现细节、未来设计杠杆低）、文档图册（其生成器已是权威）。

保留 implemented（如）：事件溯源会话（基础权威与持久性边界）、单一 home 解析器（跨产品归属规则）、项目会话目录（耐久存储与身份策略）、并行推送前门禁（borderline，但仍指导门禁调度与资源调优）、已删除的图像内容块（保留到多模态落地，因为陈述了协调好的回引条件）。

被拒记录：保留「合并包拆分」的诱惑（合并包的诱惑仍在）、删除「经工具调用流式推进工作流进度」（其 ACP/UI 前提过时）、删除「丢弃 ACP 终端元数据」（事后自动化 ACP 决策已解决该问题）。

## 归档一份 implemented 记录

1. 把 `foo.md` 从 `implemented/<class>/` 移到 `archived/<class>/`；归档路径有意省略 `implemented`。
2. 正文零编辑。只在 `Status: implemented` 下方插入 `Archived: YYYY-MM-DD`（归档日期）。其余不动。
3. 用 `bun run verify:archived-agent-notes:write` 重新封存（append-only：先证明每个既有封条仍匹配，再只追加新工件哈希）。
4. 搜索活跃正文的入链。重定向到当前权威；仅当有意引用历史时才重定向到归档路径；或删除。绝不检查或修复从归档记录发出的链接。
5. 封存后跑常规校验 `bun run verify:archived-agent-notes`。

封存后，**永不编辑/移动/翻译/重新格式化/删除**该归档记录。归档记录仍是合法的入链目标，但它是历史快照，不是当前行为权威。

## 验证与报告

- 格式 + 分类门禁：`bun run verify:agent-notes`
- 归档门禁：`bun run verify:archived-agent-notes`（常规）/ `bun run verify:archived-agent-notes:write`（封存新工件）
- 追加 `git diff --check`；其他最小证据参照 [bk-pre-push-checks](../bk-pre-push-checks/SKILL.md)。

报告：保留的 active implemented、归档的 implemented、保留/删除的被拒、被转 `/拒绝` 的提议，以及每个真正 borderline 案例的字数与所选方案。不要声称归档出站链接有效：归档校验从不检查它们。

## Dev Note

本技能自 2026-09-19 起已落地（体系建立——见 `.agents/notes/implemented/process/2026-09-19-agent-notes-system.md`）。此后不再是无动作的占位技能。