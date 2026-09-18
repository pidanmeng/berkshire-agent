---
name: bk-pre-push-checks
description: 在本仓库推送、标记就绪、或声称校验通过之前，选择覆盖本次改动最小范围的落地检查，无需默认跑全量套件；并核对「目标态 vs 已实现」诚实、命令是否真实存在。CI（release.yml）归 GitHub Actions，本地只复现最小证据。
---

# Berkshire Agent 推送前检查

用一次最小范围的本地证据覆盖向外改动。BK 目前真正的可运行面只有 `apps/berkshire-agent`（Tauri 2 + React + Vite 骨架）；`packages/`、`ctx.*` 为目标态，不可在真实命令里依赖。CI（[release.yml](../../../.github/workflows/release.yml)）拥有穷尽覆盖与平台矩阵；本地不复现整套套件。

## 检查向外改动

1. 确认 checkout 与分支：

```sh
git status --short --branch
git rev-parse --show-toplevel
```

2. 查清改动范围：对未推送的提交/未暂存改动，用 `git diff <base>..HEAD` / `git diff --stat` 列出受影响路径，据此判断用哪类证据。BK 暂无 `change-scope` 命令，**不要臆造**不存在的命令（诚实见 [AGENTS.md](../../../AGENTS.md)）。

## 选择最小相关证据

只有两个真实命令面可覆盖，按改动面选：

- **`apps/berkshire-agent` 前端/TS 骨架改动**：跑 `cd apps/berkshire-agent && bun run build`（= `tsc && vite build`，类型检查 + 构建）。这是最常见的落地校验。
- **Rust 骨架改动（`src-tauri`，现仅 `lib.rs` greet + `main.rs`）**：跑 `cargo check`（在 `apps/berkshire-agent/src-tauri`），需要 Rust 工具链；`cargo test` 目前没有 test 目标，**不要外推成已存在**。
- **文档/目标态改动（`docs/`、`.agents/`、`AGENTS.md`）**：无独立文档门禁脚本。核对链接锚点不悬空、术语统一、并把「目标态 vs 已实现」与命令真实可用性如实标注（跑 [bk-doc](../bk-doc/SKILL.md)、[bk-prose-standard](../bk-prose-standard/SKILL.md)、[bk-trim-cot-leakage](../bk-trim-cot-leakage/SKILL.md)）。
- **任何改动**：`git diff --check`（空行尾随、无白斑）。

**不要**仅因「要推送」就手动重跑已在本地通过的检查。不要臆造待实现命令（`cargo test -p bk-core`、`bk --dump-config`、`provider check`）当已验证证据。

## 诚实核对（BK 特有）

推送前过一遍：
1. 改的是不是「目标态文档」？若是，是否把 `ctx.*`/`@berkshire/cordis`/`packages/`/DuckDB 当作已存在？（[AGENTS.md](../../../AGENTS.md)、[secondary-development.md](../../../docs/secondary-development.md)）
2. 引用的命令是否当前真实存在？不存在的一律标「待实现」。
3. 若声称落地了某个能力，是否同步更新了 [architecture.md §11](../../../docs/architecture.md#11-关键文件索引现状--目标) 的「现状锚点」？

## 处理失败

若最小证据失败：停下、修复或说明阻塞；**不要推上去指望 CI 不同**。若失败看似环境特定，记录确切命令/失败/平台差异，确认相关非平台证据。绕过本地检查仅在用户显式要求/同意时，并如实报告失败项与为何预期 CI 不同。

## 推送流程

1. 跑一次选定的最小证据。
2. 正常提交（推送前 `git diff --cached --check` 过）。
3. 推送或正常 PR；对本仓库 [release.yml](../../../.github/workflows/release.yml) 的 CI，推送后查看 CI：失败先归因到分支/环境，不要让本地最小证据与 CI 角色混淆。

> 无独立 pre-push hook（仓库未配置）；本技能的「推送前检查」在提交/推送前手动执行。各项校验命令是否真实存在以 [AGENTS.md 命令节](../../../AGENTS.md#命令bun-版) 为准。