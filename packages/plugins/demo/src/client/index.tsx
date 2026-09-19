/**
 * demo 插件的 **client 入口**（`@berkshire/plugin-demo/client`）：webview 半身的打包单元。
 *
 * host（`apps/berkshire-agent/src/client/loader.ts`）经此入口静态 import 插件包的页面/组件；
 * 这是走向 `bk://` 远程 bundle 之前的现实中间步（组件随插件包走，仍静态打包，非运行时拉取）。
 * scoped 样式定义在 `./styles.ts`（同一来源也供 sidecar 半身注册用）——前端样式随插件包走。
 */
export { DemoFundFlow } from "./demoFundFlow"
export { DemoWatchlistToolbar } from "./demoWatchlistToolbar"
export { DemoMoneyFlow } from "./demoMoneyFlow"
export { fundFlowStyle, watchlistToolbarStyle, moneyFlowStyle } from "./styles"