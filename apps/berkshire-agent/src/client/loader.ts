/**
 * client 模块加载器（M3：webview 半身动态拉取，去静态 import / LOCAL_MODULES 硬编码表）。
 *
 * sidecar `client/list` 快照里每条注册自带 `url`（`bk:///node_modules/<pkg>/dist/client/…`，
 * sidecar 已按 `$BK_HOME` 规范化）与 `exportName`（从该入口取哪个具名导出作组件）。本文件只承担
 * 宿主的两个最小职责：
 * 1. `importClientModule(url, exportName)`：运行时 `import(url)` 并取出具名导出（组件/页面）；
 * 2. `injectModuleStyle`：把插件声明的 scoped 样式塞进 `<style data-bk-module={id}>`（卸载即删）。
 *
 * dev 额外接线：workspace 插件**不经 `bun add` 进 `$BK_HOME`**（Rust `to_bk_url` 对这类入口原样
 * 透传，见 bridge.rs），其 client 半身是 `file://`（仓库内源码/已构建 dist）。webview 在 Vite
 * dev server 源下不能直接 `import('file://…')`（跨源 file 访问被拦），故把 `file://` 重写为
 * **Vite `/@fs/` 相对端点**——按宿主页面源（即 Vite dev server）`/<origin>/@fs/<abs>` serve，免硬编码
 * origin/端口；组件 `.tsx` 经此归 Vite 变换（Fast Refresh）。prod 走 `bk://`/`http(s)`，不受影响。
 *
 * 共享依赖（react / @berkshire/ui-slots / 主题 / 路由…）：dev 下 Vite 变换会解析裸名；`bk://`
 * （prod）由宿主经 import-map 解析（见 `sharedImportMap`）。`/* @vite-ignore` 阻止 Vite 在构建期
 * 分析这个运行时 URL（它是插件包发布后才会存在的 bk:// 地址）。
 */
import type { SlotComponent } from "@berkshire/ui-slots"

/**
 * 把 client 入口 URL 归一化为 webview 可 `import()` 的地址：
 * - `bk://`/`http(s)://` → 原样（prod/远程）；
 * - `file://…`（dev workspace 插件）且**浏览器环境**（`window` 存在，Vite dev webview）→
 *   `/@fs<绝对路径>`，交给 Vite dev server serve；Node/测试环境（无 `window`）保留 `file://`
 *   让 `import()` 直接加载（bun test 的文件夹具）。
 * 其余（无法识别的怪 URL）仍原样，交由 `import()` 自身失败（fail-closed）。
 */
export function normalizeClientUrl(url: string): string {
  if (url.startsWith("bk://") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("file://") && typeof window !== "undefined") {
    try {
      // `file:///C:/…` → pathname `/C:/…`；`/@fs` + pathname = `/@fs/C:/…`（无重复斜杠）。
      const { pathname } = new URL(url);
      return `/@fs${decodeURIComponent(pathname)}`;
    } catch {
      return url; // 非标准 file URL → 原样
    }
  }
  return url;
}

/** 从 `url` 运行时 import 并把 `exportName` 导出取作组件（缺省 `default`）；失败抛错（fail-closed）。 */
export async function importClientModule<T = unknown>(
  url: string,
  exportName = "default",
): Promise<T> {
  const mod: unknown = await import(/* @vite-ignore */ normalizeClientUrl(url))
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