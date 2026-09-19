# AGENTS.md — Implemented Agent Notes

这些 Agent Note 描述的是已交付的决策。遵循[根指令](../../../AGENTS.md)、[仓库文档标准](../../../docs/README.md)（以文档集实际为准）与 [Agent Note 格式](../README.md#文件格式)；`bun run verify:agent-notes` 门禁生命周期特定的结构。

## 让 implemented Agent Note 与实际交付内容保持同步

在改变路径、符号、默认值与机制的同一个变更中，保持它们为最新。就地改写过时事实；不要追加变更历史。

当一条已交付记录不太可能再指导未来工作时，通过 [`bk-archive-agent-notes`](../../skills/bk-archive-agent-notes/SKILL.md) 归档它，而不是继续维护。

### 这不是改写*决策*的许可

就地更新事实性实现。推翻决策本身或其依据需要新 Agent Note 并交叉链接；被完全取代的旧记录只有通过 [Agent Note 规则](../README.md) 的合并条款才可删除。