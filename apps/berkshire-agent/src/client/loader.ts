/**
 * client 模块加载器（T1 最小件，能力块 A+C 的 webview 侧）。
 *
 * 把 sidecar `client/list` 快照里的 bundle 名解析成 **webview 本地已打包进来的 React 组件**，
 * 并负责 scoped 样式注入（`<style data-bk-module={id}>`，卸载即删），保证不污染宿主与其它插件。
 *
 * 诚实边界：远程 bundle 经 `bk://` 协议动态拉取、HMR、生产样式分发包均标 v-next；
 * 本任务只证明「sidecar 声明 → 本地模块映射 → 挂载 + scoped 样式」这条链路成立。
 */
import type { SlotComponent } from "../slots/registry"
import { DemoMinimal } from "./demoMinimal"

export interface ClientModuleDef {
  /** bundle 名（与 sidecar `ClientModuleRegistration.bundle` 对应）。 */
  bundle: string
  /** 本地 React 组件（上下文按该模块实际挂载的槽位契约解构）。 */
  component: SlotComponent<object>
}

/** 本地模块表：bundle 名 → 本地模块。新增 client 插件在此登记，或由 T3 demo 插件打包进来。 */
const LOCAL_MODULES: Record<string, ClientModuleDef> = {
  "client/demo-minimal.js": { bundle: "client/demo-minimal.js", component: DemoMinimal },
}

/** 按 bundle 名解析本地模块；未知 bundle 返回 undefined（调用方 fail-closed 降级）。 */
export function loadClientModule(bundle: string): ClientModuleDef | undefined {
  return LOCAL_MODULES[bundle]
}

/** 构造一条 scoped 样式标签的 HTML（能力块 C；用 `data-bk-module={id}` 标记归属）。 */
export function moduleStyleTag(id: string, css: string): string {
  return `<style data-bk-module="${id}">${css}</style>`
}

/** 把一条 scoped 样式注入 `<head>`；返回移除函数（卸载/断链时调用带走样式）。 */
export function injectModuleStyle(id: string, css: string): () => void {
  const tag = document.createElement("style")
  tag.setAttribute("data-bk-module", id)
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}