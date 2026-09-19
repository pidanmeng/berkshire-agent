/**
 * 令牌 → CSS 变量赋值的生成器（`@berkshire/theme`）。
 *
 * 「单一事实源」在变现处的出口：`App.css` 的 `:root`/`[data-theme]` 与插件 scoped 样式
 * **只写 `var(…)` 的赋值**，具体色板值统一由本包产出——中枢与插件都不再手写魔法值。
 *
 * 换肤边界（诚实）：本包只覆盖**令牌值集**（色板/间距/圆角/字体/阴影）；logo/图片/字体文件、
 * 组件级 CSS 覆盖属更重 asset 通道，另行演进，不塞进 v1 令牌层。
 */
import {
  BK_TOKEN_PREFIX,
  DARK_PALETTE,
  LIGHT_PALETTE,
  bkVarName,
  type Palette,
  type ThemeTokenId,
} from "./tokens"

export { BK_TOKEN_PREFIX }

/** 把一套色板渲染成 `--bk-*: value;` 的声明串（不含花括号）。 */
export function paletteToAssignments(palette: Palette): string {
  return (Object.keys(palette) as ThemeTokenId[])
    .map((id) => `${bkVarName(id)}: ${palette[id]};`)
    .join("\n  ")
}

/**
 * 生成中枢令牌根样式：`:root`（亮默认）+ `@media (prefers-color-scheme: dark)`（跟随系统暗色）
 * + `[data-theme="dark"]`（显式换肤暗色）三块，赋值全部出自令牌。
 *
 * 供 webview 以 `<style data-bk-theme>` 注入；换肤即整体替换这里，不重建组件样式。
 * 显式 `[data-theme]` 换肤缝（`ctx.theme`）仍为目标态，这里只做**令牌值集**的承载。
 */
export function themeRootCss(): string {
  return (
    `:root {\n  ${paletteToAssignments(LIGHT_PALETTE)}\n}\n\n` +
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n  ${paletteToAssignments(DARK_PALETTE)}\n  }\n}\n\n` +
    `[data-theme="dark"] {\n  ${paletteToAssignments(DARK_PALETTE)}\n}`
  )
}