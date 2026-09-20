# 并行开发计划索引：从基础设施实验切换到 release 产品开发

> 面向：把 Berkshire Agent 从「能力性基础设施搭建 + 测试代码」切换到**最终实际产品的 release 开发**。
> 本文件是**总览索引**；六个分包各自独立成文件，按执行序号 `s#` 与批次 `b#` 命名，可直接单独喂给 AI 落地。

## 依赖 DAG 与执行顺序

```
第一批(可并行)              第二批(依赖一线)            第三批(依赖二线)
WP-1 令牌扩展+组件库          WP-5 自绘标题栏           WP-6 设置弹窗改造
WP-2 持久化能力缝(独立)       WP-3 Base UI 壳重构
WP-4 宿主清理(独立)
```

- **WP-1 是总闸**：令牌冻结 + 组件库接口是壳/设置弹窗/标题栏的共同前提，务必最先启动。
- **WP-2 / WP-4 完全独立**，可与 WP-1 并行。
- **WP-3 / WP-5** 依赖 WP-1、WP-4（干净款），可并行。
- **WP-6** 依赖 WP-3、WP-1。

| 执行序 s# | 批次 b# | 文件 | 前置 |
|---|---|---|---|
| s1 | b1 | `s1-b1-wp1-令牌扩展与组件库.md` | — |
| s2 | b1 | `s2-b1-wp2-BK_HOME持久化能力缝.md` | — |
| s3 | b1 | `s3-b1-wp4-宿主清理.md` | — |
| s4 | b2 | `s4-b2-wp5-自绘标题栏.md` | WP-4 干净壳 |
| s5 | b2 | `s5-b2-wp3-BaseUI壳优化.md` | WP-1, WP-4 |
| s6 | b3 | `s6-b3-wp6-设置弹窗改造.md` | WP-3, WP-1 |

> 建议：先启动 s1（WP-1）并冻结接口；s2/s3 与 s1 并行最省时。

## 关键事实基线（每份分包都必须先读这类真相来源）

- **`design.md` 是「目标设计语言」，不是当前实现**：它引用的 `frontend/src/*`、`tailwind.config.ts`、`Layout.tsx`、`PageHeader`/`Modal`/`Toast`/`StockPanel` **在当前仓库都不存在**。当前令牌在 `packages/theme`（`--bk-*` 两层 static→alias）、壳在 `packages/plugins/base-ui`。任何包都要**把 design.md 设计语言映射到现有 `--bk-*` 令牌 + `packages/*`**，不要照抄它的路径或令牌名。
- **宿主可删的 demo/测试内容**：`apps/berkshire-agent/src/App.tsx` 的 `HomePage`（`stock-preview.footer` 槽 demo + `SidecarPanel` + 说明文案；`CORE_NAV` 含 `/theme`）、`components/SidecarPanel.tsx`（T3 demo 面板）、`onboarding/defaultOptions.ts` 的 `plugin-demo` 可选项。
- **组件库尚无独立 package**：原子组件散在 base-ui 与宿主 `components/`。
- **设置目前是路由页 `/settings`**，不是弹窗。
- **`$BK_HOME` 机制已落地**（`packages/boot/src/bk-home.ts`），但**没有持久化能力缝**（sidecar 全内存）。
- **真实命令面**（根目录）：`bun run build:packages`、`bun run typecheck`、`bun run lint:styles`、`bun test`；`cd apps/berkshire-agent && bun run build`；`cargo check -p berkshire-agent --manifest-path apps/berkshire-agent/src-tauri/Cargo.toml`；`git diff --check`。

## 交接建议

- 顺序执行 s1→s2→s3→s4→s5→s6；每份分包产出后先跑 **bk-code-review** 技能按仓库契约复核再合入。
- 任一任务发现与事实基线不符（文件不存在/命令不通），停下来诚实报告，不从目标态文档推断实现。
- **诚实是硬验收**：只有真正写出代码、能跑、能测的部分才允许标「已实现」；其余一律标「目标态 / v-next」。