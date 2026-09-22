/**
 * 默认 cordis.yml 的可选项——「首次启动选择配置」里让用户点选哪些插件。
 *
 * 诚实边界（目标态 vs 已实现）：
 * - **必装**（用户不可关）：`@berkshire/core`——headless 核心脊，`ctx.log/ctx.capabilities/
 *   ctx.notifier/ctx.slots/ctx.clientModules/ctx.dataSources/ctx.datasets/ctx.database` 的能力缝
 *   Definition 都由它提供；壳 base-ui 是宿主静态半身，不在此列。
 * - **数据基座（always-on，用户不可关）**：`@berkshire/plugin-datasource-fuyao`（扶摇数据源）、
 *   `@berkshire/plugin-datasource-csv`（CSV 数据源）、`@berkshire/plugin-data-manager`（数据管理页）
 *   已升为宿主数据平台的基座（对齐 base-ui 的宿主绑定姿势）：由 **sidecar 无条件常驻装配**，
 *   **不在**首启引导的可选项里、**不进**用户 cordis.yml 插件行——用户无法勾选/裁剪。这里只展示
 *   为锁定的「数据基座」说明，供引导如实呈现（见 steps.tsx）。
 * - 可选项（默认开）：`@berkshire/plugin-notify-console`（通知控制台）。
 * - **产品不再预装 demo**：`@berkshire/plugin-demo` 是开发/验证用的 demo 插件（能力块 A/B/C/布局
 *   挂点），不作为默认装配进产品；它仍在 `packages/plugins/demo` 保留源码，经 dev 的 demo bundle
 *   （`packages/bundle/{demo,demo-off}`）装载，不进入首启引导的选择项。
 * - 生产安装时插件需落到 `$BK_HOME/node_modules`（`bun add`）；**v1 依赖 dev workspace 解析**
 *   （boot 的 importPlugin 找不到 home 内包时回退 `import(name)` 命中 workspace 包），不跑 bun add。
 * - 扶摇需要 `FUYAO_API_KEY` 才真正取数；未配置时页面如实展示不可用（fail-closed 展示面），
 *   可在数据管理页「探测」验证，并在环境变量配置 `FUYAO_API_KEY`（不落盘明文）。
 */
import type { DefaultPluginOption } from "./types";

/** 必装插件：core 核心脊（hardcode 为 true，用户不可关——无它则无一能力可用）。 */
export const REQUIRED_PLUGIN: { id: string; name: string } = {
  id: "core",
  name: "@berkshire/core",
};

/**
 * **数据基座（always-on，升权对齐 base-ui）**：仅用于引导如实展示「数据能力是基座、不可勾选」，
 * **不写入** `DEFAULT_PLUGIN_OPTIONS`、**不进** `buildCordisYml` 生成的用户挂钩行——
 * 这些插件由 sidecar 无条件常驻装配（见 `packages/sidecar/src/index.ts` 的 BASE_DATA_PLUGINS）。
 */
export const BASE_DATA_PLUGINS: readonly DefaultPluginOption[] = [
  {
    id: "datasource-fuyao",
    name: "@berkshire/plugin-datasource-fuyao",
    label: "数据源·扶摇（行情/财务）",
    description:
      "扶摇金融数据 API 的 provider：realtime / daily / adj_factor / financial（需 FUYAO_API_KEY）。数据基座，常驻不可裁剪。",
    defaultOn: true,
  },
  {
    id: "datasource-csv",
    name: "@berkshire/plugin-datasource-csv",
    label: "数据源·CSV（本地文件）",
    description:
      "最小第二 provider：读 $BK_HOME/data/csv 的 daily/realtime/adj_factor CSV，证明按数据集多源路由。数据基座，常驻不可裁剪。",
    defaultOn: true,
  },
  {
    id: "data-manager",
    name: "@berkshire/plugin-data-manager",
    label: "数据管理页",
    description:
      "注册「数据管理」页（/data）：provider 一览、按数据集切换路由、扶摇 Key 探测（只探不存）、DuckDB 采集。数据基座，常驻不可裁剪。",
    defaultOn: true,
  },
];

/** 可选项（默认开）。新增插件选项 = 往这里加一行。 */
export const DEFAULT_PLUGIN_OPTIONS: readonly DefaultPluginOption[] = [
  {
    id: "notify-console",
    name: "@berkshire/plugin-notify-console",
    label: "通知控制台",
    description: "把 ctx.notifier 的通知转发到控制台并留 log（最小证明插件）。",
    defaultOn: true,
  },
];

/** 默认全选的勾选态初值。 */
export function defaultSelection(): Record<string, boolean> {
  return Object.fromEntries(DEFAULT_PLUGIN_OPTIONS.map((o) => [o.id, o.defaultOn]));
}