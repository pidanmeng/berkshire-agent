# WP-4（第一批 · 独立可并行）：宿主清理（删 demo/测试代码 + 测试端 Seam）

## 目标
在 `apps/berkshire-agent`（宿主）中移除所有 demo 测试代码与「测试端的 Seams」，让宿主只剩干净的骨架与必要的正式 Seam。从本提交起一切面向 release 产品。

## 背景与真相来源
先读：
- 根 `AGENTS.md`。
- `apps/berkshire-agent/src/App.tsx`（`HomePage` 含 `stock-preview.footer` 槽 demo + `SidecarPanel` + 说明文案；`CORE_NAV` 含 `/theme`）。
- `apps/berkshire-agent/src/components/SidecarPanel.tsx` + `.module.css`（T3 最小 demo 面板）。
- `apps/berkshire-agent/src/onboarding/{defaultOptions,steps,OnboardingGate,useAppPhase,buildCordisYml}`（首启供给，含 `plugin-demo` 可选项）。
- `apps/berkshire-agent/src/routes/*`、`src/client/*`、`src/lib/*`（区分「正式机制」vs「测试/demo」）。
- `packages/plugins/demo/**`、`packages/bundle/{demo,demo-off}`。
- `docs/secondary-development.md` §8、`docs/architecture.md` §11。

## 需求明细（验收点）
1. **删宿主 demo 代码**：移除 `HomePage` 里的 slot demo 区块（`stock-preview.footer` 演示）、`SidecarPanel` demo 面板（及其 import/样式/说明文案），或将其收敛为正式状态指示器；清掉残留的说明性演示 h1/p。
2. **移除测试端 Seam**：识别并移除宿主侧仅为测试/demo 暴露的 seam（如 demo 专属 slot 挂载、demo bundle 装载、`/theme` 对照页若视为 dev-only 可移出核心导航或保留为正式能力——按产品取舍，写明理由）。
3. **报名/导航清理**：`CORE_NAV`、`StatusBar` 的 `CORE_TITLES`、core `SLOT_NAMES`/`CORE_ROUTE_PATHS` 同步到一个「干净、面向产品」的集合。
4. **onboarding 清理**：`defaultOptions.ts` 里的 `plugin-demo` 改为默认关或移除（产品不再预装 demo）。
5. 确认 release 装配 `$BK_HOME/cordis.yml` 默认**不含 demo**；`packages/bundle/{base,headless}` 语义与本需求对齐。

## 硬约束
- 诚实：区分「正式机制」与「测试/demo」，删 demo 但保留正式能力缝（slots/services/路由）骨架。
- 不得删掉正式 Seam/Services（`ctx.log`/`ctx.capabilities`/`ctx.slots`/路由是产品能力）。
- 删除后 `bun run typecheck` + `cd apps/berkshire-agent && bun run build` 必须绿，不留断引用。
- 同步更新诚实锚点与 AGENTS「已有」清单。

## 范围边界（明确不做）
- 不改 `@berkshire/theme` / 组件库（WP-1）。
- 不重写壳/设置页（WP-3/WP-6）。
- 不删 `packages/plugins/demo` 源码（它是 demo 插件，可保留供开发/文档，只是不再默认装配进产品；若决定保留需写明）。

## 产物与验证
- 修改 `apps/berkshire-agent/src/**`、`packages/plugins/base-ui`（若涉及）、`packages/bundle/*`、`apps/berkshire-agent/src/onboarding/*`。
- 运行：`cd apps/berkshire-agent && bun run build`、`bun run typecheck`、`git diff --check`、`bun test`（宿主侧 loader/slots 单测若被删需同步）。

## 完成定义（DoD）
- 宿主源码不再含 demo 测试组件/文案/测试 Seam；release 装配默认不装 demo；build/typecheck 绿；docs 诚实标注。