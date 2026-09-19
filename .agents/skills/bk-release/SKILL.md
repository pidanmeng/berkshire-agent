---
name: bk-release
description: 在 Berkshire Agent 仓库执行一次发版（release）：同步三处版本号、核对变更、打 v* tag 触发 CI 正式发布、并在 GitHub Releases 页核验各平台安装包下载链接。仓库当前 release 由 .github/workflows/release.yml 的 tag 触发驱动，本技能是「发版前的确认流程 + 触发 + 事后核验」，不是替代 CI。
---

# Berkshire Agent 发版（release）

把「已合并到 main 的改动」固化为一次可下载的正式 Release。本仓库的发版完全由 CI 驱动：[release.yml](../../../.github/workflows/release.yml) **只在推送 `v*` tag 与手动 `workflow_dispatch` 时触发**，不再监听 main 分支（避免每次合并都建一个和正式发布无关的草稿 Release）。因此「发版」对 AI 而言=**确认版本号→核对变更→打 tag→推 tag→核验发布产物**。

## 前置事实（诚实标注）

- **版本号三处需同步**，当前都是 `0.1.0`：
  - [apps/berkshire-agent/src-tauri/tauri.conf.json](../../../apps/berkshire-agent/src-tauri/tauri.conf.json) 的 `version`（**tauri-action 用这个解析 `v__VERSION__`**，务必先改它）
  - [apps/berkshire-agent/src-tauri/Cargo.toml](../../../apps/berkshire-agent/src-tauri/Cargo.toml) 的 `[package] version`
  - [apps/berkshire-agent/package.json](../../../apps/berkshire-agent/package.json) 的 `version`
- **release.yml** 已配置：`releaseDraft: false` + `prerelease: false`，4 个 matrix job（macOS arm64 / macOS x86_64 / ubuntu / windows）共用同一 tag 各自追加资产 → 推 tag 后即**正式发布**，公开 Releases 页出现全部下载链接。
- **本仓库当前没有 CHANGELOG 文件**，也没有「git 自动收集提交生成 release notes」的脚本；releaseBody 只写死了一行占位文案。若要求详细变更说明，需在 release.yml 或发版时补齐——不要把不存在的步子当已实现。

## 发版步骤

### 0. 前置核对（无效则不发版）

1. 确认要发版的改动已合并到 `main` 且 `git status` 干净。
2. 核对提交的语义、合规与文档诚实：跑 [bk-code-review](../bk-code-review/SKILL.md)、[bk-trim-cot-leakage](../bk-trim-cot-leakage/SKILL.md) 的诚实核对，确认没有把目标态当已实现、没有把不存在的命令/能力写进产物。
3. 决定新版本号（语义化版本），据此确定一个 tag 名，例如 `v0.2.0`。

### 1. 同步三处版本号

把三处 `version` 一起改成新版本号，保持完全一致。**必须同时改、值一致**，否则 tauri-action 解析的 tag 与 Cargo/前端版本对不上。

### 2. 核对变更（验证证据）

跑最小的本地证据，确认这次发版包含的改动不破坏构建：

```sh
cd apps/berkshire-agent && bun run build   # tsc && vite build（前端类型 + 构建）
git diff --check                            # 白斑/空行尾随
```

Rust 侧若有 `src-tauri` 改动：`cd apps/berkshire-agent/src-tauri && cargo check`。**不要**臆造测试命令（本仓库无测试车道，见 `bk-ci-test-reliability`）。

### 3. 打 tag 提交

先提交版本号同步改动（可单独一个 commit，命名建议 `chore: bump version to <n>`），再打 tag 并推送：

```sh
git add apps/berkshire-agent/src-tauri/tauri.conf.json \
        apps/berkshire-agent/src-tauri/Cargo.toml \
        apps/berkshire-agent/package.json
git commit -m "chore: bump version to <新版本>"
git tag v<新版本>
git push origin main
git push origin v<新版本>
```

> tag 必须落在包含版本号更新的提交上。只推 main 不推 tag 不会触发 release（release.yml 只看 `v*` tag）。

### 4. 触发并等待 CI

推 tag 即自动触发 `Release` workflow（GitHub Actions）。到仓库 Actions 页确认该 run 的 4 个 matrix job 均通过。也可手动触发：Actions → Release → Run workflow（`workflow_dispatch`），用于不配 tag 的临时发包。

诚实注意：钉在 `tauri-apps/tauri-action@v0` 时，首次给一个新 tag 建 release 存在窄竞态——两个 matrix job 几乎同时 getReleaseByTag 拿 404 后都调 createRelease，后到者会因 422 失败；release 一旦建好，后续 job 只做资产 append，不会再撞。因此**首次发某个新版本时若看到个别 job 因「release 已存在」失败，重跑该 run 兜底**，不是 CI 配置错误。

### 5. 事后核验（外部状态，别信自报）

打开仓库 Releases 页，**以「看得见的下载产物」为准**核验：
- 该版本 Release 标题为 `berkshire-agent v<版本>`，状态为**正式发布**（非 Draft、非 pre-release）；
- 出现 **4 类平台安装包下载链接**：`.dmg`（macOS x86_64）、`.dmg`（macOS arm64）、`.deb`/`.AppImage`（Linux）、`.msi`/`.exe`（Windows）——至少每平台各一个有链接；
- 点开任意资产链接能触发下载（不是 404），证明资产确实上传到了该 tag。

若缺链接、或 Release 是草稿、或资产 404：停下，回查 CI 是否全部通过、tag 是否落在含版本更新的提交上、`tauri.conf.json` 版本是否与 tag 一致，**修好再发布，不要把「看不到下载链接」当临时异常略过**（草稿正是 [release.yml](../../../.github/workflows/release.yml) 在 2026-09-19 修复的原始痛点：之前 main 合并会把 Release 建成草稿，草稿不出现在公开 Releases 界面、也没有下载链接）。

## 验证与报告

- 发版前：`cd apps/berkshire-agent && bun run build` + `git diff --check`；相关证据按 [bk-pre-push-checks](../bk-pre-push-checks/SKILL.md) 选最小范围。
- 发版后：以 GitHub Releases 页的实际下载链接与 CI 通过为准，报告确切的 tag 名、各平台产物是否可见、以及是否有未覆盖平台。
- 诚实标注：本仓库无 `bump` 脚本、无 CHANGELOG、无自动生成 release-notes；版本同步靠手动这三处文件。若用户要求「自动 bump 多包版本」或在 releaseBody 里注入真实变更列表，这些需另加脚本/改 CI——不是本技能现成能力。
