# AGENTS.md — Archived Agent Notes

分类目录下的归档 Agent Note 是被冻结的历史快照，不是当前权威。**永不可编辑、重新格式化、翻译、修复、删除或移动**一份封存工件；新的决策与事实请使用活跃 Agent Note 或当前文档。

归档变更只允许：移动完整的 Agent Note 文件、在 `Status: implemented` 下方插入同一 `Archived: YYYY-MM-DD` 行、重新封存 manifest，以及修复或删除入站链接。不要检查、验证或修复归档记录中的出站链接。

运行 [`bk-archive-agent-notes`](../../skills/bk-archive-agent-notes/SKILL.md) 工作流，并用 `bun run verify:archived-agent-notes:write` 追加新的工件哈希。常规校验拒绝已封存工件的改动或缺失、无效的分类目录与归档元数据。