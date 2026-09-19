/**
 * client 模块加载器（T1 最小件，能力块 A+C 的 webview 侧）。
 *
 * 把 sidecar `client/list` 快照里的 bundle 名解析成 **webview 已打包进来的 React 组件**，
 * 并负责 scoped 样式注入（`<style data-bk-module={id}>`，卸载即删），保证不污染宿主与其它插件。
 *
 * 诚实边界：远程 bundle 经 `bk://` 协议动态拉取、HMR、生产样式分发包均标 v-next；
 * 本任务证明「sidecar 声明 → 插件包静态 import → 挂载 + scoped 样式」这条链路成立。
 * demo 的页面/组件 + 前端样式定义随 `@berkshire/plugin-demo` 打包进来（从 `./client` 入口取），
 * host 只做模块映射 + 样式注入宿主。
 */
import type { SlotComponent } from "../slots/registry"
import { DemoFundFlow, DemoWatchlistToolbar, DemoMoneyFlow } from "@berkshire/plugin-demo/client"

export interface ClientModuleDef {
  /** bundle 名（与 sidecar `ClientModuleRegistration.bundle` 对应）。 */
  bundle: string
  /** 本地 React 组件（来自 `@berkshire/plugin-demo` 的 webview 半身，上下文按槽位契约解构）。 */
  component: SlotComponent<object>
}

/** 本地模块表：bundle 名 → 插件包提供的组件。新增 client 插件在此登记（组件的家在插件包，不在 host）。 */
const LOCAL_MODULES: Record<string, ClientModuleDef> = {
  "client/demo-fund-flow.js": { bundle: "client/demo-fund-flow.js", component: DemoFundFlow },
  "client/demo-watchlist-toolbar.js": {
    bundle: "client/demo-watchlist-toolbar.js",
    component: DemoWatchlistToolbar,
  },
  "client/demo-money-flow.js": { bundle: "client/demo-money-flow.js", component: DemoMoneyFlow },
}

/** 按 bundle 名解析本地模块；未知 bundle 返回 undefined（调用方 fail-closed 降级）。 */
export function loadClientModule(bundle: string): ClientModuleDef | undefined {
  return LOCAL_MODULES[bundle]
}

/** 构造一条 scoped 样式标签的 HTML（能力块 C；用 `data-bk-module={id}` 标记归属）。 */
export function injectModuleStyle(id: string, css: string): () => void {
  const tag = document.createElement("style")
  tag.setAttribute("data-bk-module", id)
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}