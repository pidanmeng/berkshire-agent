/**
 * 令牌 → CSS 变量赋值的生成器（`@berkshire/theme`）。
 *
 * 「单一事实源」在变现处的出口：`App.css` 的 `:root`/`[data-theme]` 与插件 scoped 样式
 * **只写 `var(--bk-*)`（别名层）的引用**，具体色板值统一由取值层（static 层）产出——
 * 中枢与插件都不再手写魔法值。
 *
 * 对齐 dsh 的 **static → alias 两层**：
 * - 一层写**取值层** `--bk-static-*: 实值`（`STATIC_TOKENS`，唯一写实值的地方）；
 * - 一层写**别名层** `--bk-*: var(--bk-static-*)`（`THEME_TOKENS` 引用入口）。
 * 暗色单表：只覆盖取值层同名变量（`.dark` 静态度量），别名不动——组件/插件零主题选择器。
 *
 * 换肤边界（诚实）：本包只覆盖**令牌值集**；logo/图片/字体文件、组件级 CSS 覆盖属更重 asset
 * 通道，另行演进，不塞进 v1 令牌层。`ctx.theme` 换肤缝仍为目标态。
 */
import {
  BK_ALIAS_PREFIX,
  BK_STATIC_PREFIX,
  DARK_PALETTE,
  LIGHT_PALETTE,
  STATIC_TOKENS,
  THEME_TOKENS,
  type Palette,
  type ThemeTokenId,
} from "./tokens"

export { BK_ALIAS_PREFIX, BK_STATIC_PREFIX }

/** 把一套色板渲染成**别名层**赋值串 `--bk-*: value;`（兼容入口；供测试/对照页化实值）。 */
export function paletteToAssignments(palette: Palette): string {
  return (Object.keys(palette) as ThemeTokenId[])
    .map((id) => `${BK_ALIAS_PREFIX}${id}: ${palette[id]};`)
    .join("\n  ")
}

/** 取值层赋值串 `--bk-static-*: 实值;`（light 或 dark 一套）。 */
export function staticAssignments(values: "light" | "dark"): string {
  return STATIC_TOKENS.map((t) => `${BK_STATIC_PREFIX}${t.id}: ${t[values]};`).join("\n  ")
}

/** 别名层赋值串 `--bk-*: var(--bk-static-<ref>);` —— 组件/插件引用的入口。 */
export function aliasAssignments(): string {
  return THEME_TOKENS.map(
    (a) => `${BK_ALIAS_PREFIX}${a.id}: var(${BK_STATIC_PREFIX}${a.ref});`,
  ).join("\n  ")
}

/**
 * 生成中枢令牌根样式：`:root` 写取值层亮值 + 别名层引用；`@media (prefers-color-scheme: dark)`
 * 与 `[data-theme="dark"]` 各只覆盖取值层暗值（单表，别名不变）。
 *
 * 供 webview 以 `<style data-bk-theme>` 注入；换肤即整体替换这里，不重建组件样式。
 * 显式 `[data-theme]` 换肤缝（`ctx.theme`）仍为目标态，这里只做**令牌值集**的承载。
 */
export function themeRootCss(): string {
  return (
    `:root {\n  ${staticAssignments("light")}\n  ${aliasAssignments()}\n}\n\n` +
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]) {\n  ${staticAssignments("dark")}\n  }\n}\n\n` +
    `[data-theme="dark"] {\n  ${staticAssignments("dark")}\n}`
  )
}

// 保留 LIGHT/DARK_PALETTE 为命名导出（测试/对照页读取实值），避免包外类型漂移。
export { DARK_PALETTE, LIGHT_PALETTE }