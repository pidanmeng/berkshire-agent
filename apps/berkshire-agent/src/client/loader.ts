/**
 * client 模块加载器（M3：webview 半身动态拉取，去静态 import / LOCAL_MODULES 硬编码表）。
 *
 * sidecar `client/list` 快照里每条注册自带 `url`（`bk:///node_modules/<pkg>/dist/client/…`，
 * sidecar 已按 `$BK_HOME` 规范化）与 `exportName`（从该入口取哪个具名导出作组件）。本文件只承担
 * 宿主的两个最小职责：
 * 1. `importClientModule(url, exportName)`：运行时 `import(url)` 并取出具名导出（组件/页面）；
 * 2. `injectModuleStyle`：把插件声明的 scoped 样式塞进 `<style data-bk-module={id}>`（卸载即删）。
 *
 * 共享依赖（react / @berkshire/ui-slots / 主题 / 路由…）由宿主经 import-map 解析（见
 * `sharedImportMap`），插件 bundle 只留 bare specifier —— 因此 `bk://` 动态 import 可解析。
 * `/* @vite-ignore` 阻止 Vite 在构建期分析这个运行时 URL（它是插件包发布后才会存在的 bk:// 地址）。
 */
import type { SlotComponent } from "@berkshire/ui-slots"

/** 从 `url` 运行时 import 并把 `exportName` 导出取作组件（缺省 `default`）；失败抛错（fail-closed）。 */
export async function importClientModule<T = unknown>(
  url: string,
  exportName = "default",
): Promise<T> {
  const mod: unknown = await import(/* @vite-ignore */ url)
  const comp = (mod as Record<string, unknown>)[exportName]
  if (comp === undefined || comp === null) {
    throw new Error(`client 入口 ${url} 无具名导出 "${exportName}"（fail-closed）`)
  }
  return comp as T
}

/** 供外部校验一个 client 模块是否是有效组件导出（复用 SlotComponent 展示用形）。 */
export type ClientComponent = SlotComponent<object>

/** 构造一条 scoped 样式标签的 HTML（能力块 C；用 `data-bk-module={id}` 标记归属）。 */
export function injectModuleStyle(id: string, css: string): () => void {
  const tag = document.createElement("style")
  tag.setAttribute("data-bk-module", id)
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}