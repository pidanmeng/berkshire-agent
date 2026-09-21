/**
 * 令牌根样式安装器 —— base-ui webview 半身（对齐 dsh `ui-theme`/`boot-theme` 渲染前注入）。
 *
 * `@berkshire/theme` 是令牌单一事实源，插件/render 侧只引用 `var(--bk-*)`；具体赋值（
 * `:root` / `[data-theme]` / `@media (prefers-color-scheme: dark)`）由本模块在**渲染前**以
 * `<style data-bk-theme>` 注入，避免首屏无令牌（白屏/错色）。原宿主 `src/theme/install.ts`
 * 与 `App.css` 的 `:root`/`body` 文档基础一并下沉到此（壳/文档基础样式归 base-ui）。
 *
 * 诚实边界：这里只承载**令牌值集 + 文档基础**；`ctx.theme` 换肤缝、远程 bundle（`bk://`）仍为目标态。
 */
import { themeRootCss } from "@berkshire/theme"

/** 令牌根样式的 `<style data-bk-theme>` 标签 id，供反复注换/卸载时定位。 */
export const THEME_STYLE_ID = "bk-theme-root"

/** 文档基础（原宿主 App.css :root/body）：只写 `var(--bk-*)` 与结构，禁魔法色值。 */
const DOCUMENT_BASE_CSS = `
:root {
  font-family: var(--bk-font-sans);
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;
  color: var(--bk-color-fg);
  background-color: var(--bk-color-bg);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}
body {
  margin: 0;
}

/* 全局滚动条：覆盖默认样式，改为不起眼的一次性滚动条（细、弱色、隐藏轨道）。
 * 只写 var(--bk-*) 与结构，禁魔法色值；Firefox 走 scrollbar-width/color，WebKit 走伪元素。
 * border + background-clip: content-box 让滑块两端留空隙，视觉更收敛。 */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bk-color-fg-subtle) transparent;
}
*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background-color: var(--bk-color-fg-subtle);
  border: 3px solid transparent;
  background-clip: content-box;
  border-radius: 999px;
}
*::-webkit-scrollbar-thumb:hover {
  background-color: var(--bk-color-fg-muted);
}
`

/**
 * 幂等安装令牌根 + 文档基础样式；重复调用先移除旧 `<style data-bk-theme>` 再插入
 * （换肤即整体替换值集）。返回移除函数。
 */
export function installThemedRoot(): () => void {
  document.getElementById(THEME_STYLE_ID)?.remove()
  const style = document.createElement("style")
  style.id = THEME_STYLE_ID
  style.textContent = themeRootCss() + DOCUMENT_BASE_CSS
  document.head.appendChild(style)
  return () => {
    document.getElementById(THEME_STYLE_ID)?.remove()
  }
}