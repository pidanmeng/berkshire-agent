/**
 * 令牌根样式安装器（webview 侧最小件）。
 *
 * `@berkshire/theme` 是令牌单一事实源；`App.css` 与插件 scoped 样式只引用 `var(--bk-*)`，
 * 具体的 `:root` / `[data-theme]` / `@media (prefers-color-scheme: dark)` 赋值由本模块在
 * **渲染前**以 `<style data-bk-theme>` 注入，避免首屏无令牌（白屏/错色）。
 *
 * 诚实边界：这里只承载**令牌值集**；`ctx.theme` 换肤缝、远程 bundle（`bk://`）仍为目标态。
 */
import { themeRootCss } from "@berkshire/theme"

/** 令牌根样式的 `<style data-bk-theme>` 标签 id，供反复注换/卸载时定位。 */
export const THEME_STYLE_ID = "bk-theme-root"

/**
 * 幂等安装令牌根样式；重复调用先移除旧 `<style data-bk-theme>` 再插入（换肤即整体替换值集）。
 * 返回移除函数。
 *
 * TODO(next): 当前 `main.tsx` 一次性安装、不取用返回值——返回的 disposer 仅在目标态
 * `ctx.theme` 换肤缝落地时作为卸载钩子才有消费者；v1 可考虑改返回 `void`，待换肤缝接入再复原。
 */
export function installThemeRootStyle(): () => void {
  document.getElementById(THEME_STYLE_ID)?.remove()
  const style = document.createElement("style")
  style.id = THEME_STYLE_ID
  style.textContent = themeRootCss()
  document.head.appendChild(style)
  return () => {
    document.getElementById(THEME_STYLE_ID)?.remove()
  }
}