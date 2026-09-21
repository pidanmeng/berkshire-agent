/**
 * 默认 cordis.yml 的可选项——「首次启动选择配置」里让用户点选哪些插件。
 *
 * 诚实边界（目标态 vs 已实现）：
 * - **必装**（用户不可关）：`@berkshire/core`——headless 核心脊，`ctx.log/ctx.capabilities/
 *   ctx.notifier/ctx.slots/ctx.clientModules/ctx.dataSources/ctx.datasets/ctx.database` 的能力缝
 *   Definition 都由它提供；壳 base-ui 是宿主静态半身，不在此列。
 * - 可选项（默认开）：`@berkshire/plugin-notify-console`（通知控制台）、
 *   `@berkshire/plugin-datasource-fuyao`（扶摇数据源）、`@berkshire/plugin-datasource-csv`
 *   （CSV 数据源）、`@berkshire/plugin-data-manager`（数据管理页）。
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

/** 可选项（默认开）。新增插件选项 = 往这里加一行。 */
export const DEFAULT_PLUGIN_OPTIONS: readonly DefaultPluginOption[] = [
  {
    id: "notify-console",
    name: "@berkshire/plugin-notify-console",
    label: "通知控制台",
    description: "把 ctx.notifier 的通知转发到控制台并留 log（最小证明插件）。",
    defaultOn: true,
  },
  {
    id: "datasource-fuyao",
    name: "@berkshire/plugin-datasource-fuyao",
    label: "数据源·扶摇（行情/财务）",
    description: "扶摇金融数据 API 的 provider：realtime / daily / adj_factor / financial（需 FUYAO_API_KEY）。",
    defaultOn: true,
  },
  {
    id: "datasource-csv",
    name: "@berkshire/plugin-datasource-csv",
    label: "数据源·CSV（本地文件）",
    description: "最小第二 provider：读 $BK_HOME/data/csv 的 daily/realtime/adj_factor CSV，证明按数据集多源路由。",
    defaultOn: true,
  },
  {
    id: "data-manager",
    name: "@berkshire/plugin-data-manager",
    label: "数据管理页",
    description: "注册「数据管理」页（/data）：provider 一览、按数据集切换路由、扶摇 Key 探测（只探不存）、DuckDB 采集。",
    defaultOn: true,
  },
];

/** 默认全选的勾选态初值。 */
export function defaultSelection(): Record<string, boolean> {
  return Object.fromEntries(DEFAULT_PLUGIN_OPTIONS.map((o) => [o.id, o.defaultOn]));
}