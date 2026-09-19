/**
 * demo 插件的 **client 入口**（`@berkshire/plugin-demo/client`）：webview 半身的打包单元。
 *
 * host（`apps/berkshire-agent/src/client/loader.ts`）经此入口静态 import 插件包的页面/组件；
 * 这是走向 `bk://` 远程 bundle 之前的现实中间步（组件随插件包走，仍静态打包，非运行时拉取）。
 *
 * 对齐 dsh 分治（P3）：插件样式是 **CSS Modules** —— `.tsx` 组件经 `./styles.generated.ts`
 * 拿哈希类名（插件独立打包阶段 lightningcss 编译）；sidecar 半身 import 同一份 `css` 注入代码
 * 经 `client/list` 交给 host 运行时注入。**host 只注入、不参与哈希**。
 */
export { DemoFundFlow } from "./demoFundFlow"
export { DemoWatchlistToolbar } from "./demoWatchlistToolbar"
export { DemoMoneyFlow } from "./demoMoneyFlow"
export { DemoNavExtra, DemoStatusItem, DemoSettingsCard } from "./demoShellWidgets"
export { fundFlow, watchlistToolbar, moneyFlow, navExtra, statusItem, settingsCard } from "./styles.generated"
export type { CompiledModuleStyle } from "./styles.generated"