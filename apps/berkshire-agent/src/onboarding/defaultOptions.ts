/**
 * 默认 cordis.yml 的可选项——「首次启动选择配置」里让用户点选哪些插件。
 *
 * 诚实边界（目标态 vs 已实现）：
 * - **必装**（用户不可关）：`@berkshire/core`——headless 核心脊，`ctx.log/ctx.capabilities/
 *   ctx.notifier/ctx.slots/ctx.clientModules` 的能力缝 Definition 都由它提供；壳 base-ui 是宿主
 *   静态半身，不在此列。v1 先只放开两个证明性选项。
 * - 可选项（默认开）：`@berkshire/plugin-notify-console`（通知控制台）、`@berkshire/plugin-demo`
 *   （资金流向示例页 + 组件 + 样式）。
 * - 生产安装时插件需落到 `$BK_HOME/node_modules`（`bun add`）；**v1 依赖 dev workspace 解析**
 *   （boot 的 importPlugin 找不到 home 内包时回退 `import(name)` 命中 workspace 包），不跑 bun add。
 *   数据源 provider / AI 适配器等选项随插件生态落地后再加进此表。
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
    id: "demo",
    name: "@berkshire/plugin-demo",
    label: "示例插件（资金流向 demo）",
    description: "注册 stock-preview 底部组件 + watchlist 工具栏 + 资金流向页 + 壳布局挂点（含 scoped 样式）。",
    defaultOn: true,
  },
];

/** 默认全选的勾选态初值。 */
export function defaultSelection(): Record<string, boolean> {
  return Object.fromEntries(DEFAULT_PLUGIN_OPTIONS.map((o) => [o.id, o.defaultOn]));
}