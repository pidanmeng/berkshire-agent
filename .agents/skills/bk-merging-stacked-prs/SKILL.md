---
name: bk-merging-stacked-prs
description: （待实现/适用性存疑）落地一组有依赖关系的 GitHub PR（A←B←C）。依赖 GitHub 官方的 stacked-PR 能力（`gh stack` 扩展）。本仓库当前只用标准 PR 流程、未确认采用官方 stack 特性——因此本技能仅在团队确认启用 `gh stack` 后才适用，未确认前不当作可用流程。
---

# 落地 GitHub PR stack（待实现）

> **⚠ 状态：待实现 / 适用性存疑。** 本仓库（`.github/workflows/release.yml` 为合并 `main` 后发布）当前**未确认采用 GitHub 官方 stacked-PR 特性**（`gh stack`），也无相关 Git 历史纪律（合并方式、rebase/merge-forward 约定）的明确记录。因此本技能描述的完整流程**当前不适用**；若仓库仍用普通逐个 PR 流程，本技能应忽略。仅当团队明确决定用官方 stack 特性后，才按下列流程运行（诚实见 [AGENTS.md](../../../AGENTS.md)）。

## 处置原则

- **仓库现状**：标准 PR → 合并 `main` → [release.yml](../../../.github/workflows/release.yml) 自动构建发布。无 stack 分层的既定工作流。
- **未引入 stack 前**：有依赖关系的 PR 按正常合并顺序逐个处理，逐个验证，不模拟 stack 语义（不用 `gh pr merge`+`gh pr edit` 去重造 stack）。
- **将来若启用**：走 GitHub 原生 stack 对象与 `gh stack merge`，**不要**用逐个 merge+retarget 重造 stack 语义。

## 若启用原生 stack：流程（假设性）

1. **先验能力**：`gh stack --version` 可用、每个 head 分支同仓库，才继续；否则硬停，不降级到逐个 merge/retarget。
2. **确认栈序**：用 `gh pr view` 读实时 metadata 与 head OID（不信分支名/旧报告）；查询 `PullRequest.stack`/`stackEntry.position` 确认官方栈成员，从实时 base 建立自底向上顺序（底部指 trunk，高者指其下层 head）。
3. **补齐缺失成员**：同作者链自动 `gh stack link`；作者不同/不可得则问用户。从不自动解散/重建既有栈。
4. **仅需时刷新**：不因存在刷新机制就重写分支。需更新 trunk 时选原生级联 rebase（`gh stack sync`，完成后立即逐层验证）或增量 merge-forward（自底向上逐层合入父并 push）。任何历史重写后重取精确 head，重审未决 thread/批准/可合并性/检查。**禁用裸 `--force`。**
5. **合并前预检**：重查官方栈，要求每个选定 PR open、非 draft、顺序正确、满足仓库 review/check 要求；独立看待每层状态。
6. **经 stack API 合并**：`gh stack merge <stack-number> --yes --merge`（整栈）或对显式边界 PR（部分落地，含自底到边界）。不 `--delete-branch`、不手动 retarget、不逐 PR merge。
7. **验证落地态**：等每个选定 PR `MERGED`；部分落地后重查剩余 PR 仍按原序指向栈 trunk 或下层。删分支只在对应 PR `MERGED` 且无 open PR 仍以它为 base 后进行（`gh pr list --state open --base <branch> --json number --jq length` 为 0）。

## 完整性检查清单

- [ ] 团队已明确采用官方 `gh stack`；本技能才适用。
- [ ] 每层改动都过了 [bk-pre-push-checks](../bk-pre-push-checks/SKILL.md) 的最小证据。
- [ ] 合并 cadence：逐个 PR（现状）或原生 stack（启用后）。

## Dev Note

本技能为占位/适用性澄清。仓库当前不需要 stack 工作流；启用前不产生可执行动作。