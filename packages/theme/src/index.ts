/**
 * `@berkshire/theme` —— 样式层**单一事实源**（无 `@berkshire/core` 依赖）。
 *
 * 对齐 dsh 的 **static → alias 两层令牌**（不多不少两层）：
 * - **取值层** `STATIC_TOKENS`（`--bk-static-*`）：唯一写实值的地方；
 * - **别名层** `THEME_TOKENS`（`--bk-*`）：组件/插件唯一引用入口，值为 `var(--bk-static-*)`。
 *
 * 出口与助手：
 * - **色板** `LIGHT_PALETTE` / `DARK_PALETTE`（别名 id → 解析后实值，供对照页/测试）；
 * - **CSS 赋值出口** `themeRootCss()`：先写取值层实值、再写别名引用，暗色单表覆盖取值层；
 * - **引用助手** `bkVar('color-primary')` → `var(--bk-color-primary)`（别名层，组件用它）。
 *
 * 诚实边界：仅覆盖**令牌值集**；`ctx.theme` 换肤缝、远程 bundle（`bk://`）、正式样式文件接管
 * static 层仍为目标态 (v-next)，本包不假装已落地。正式「组件写 4 倍数/行高、弃用
 * space/radius/font-size 令牌」亦 v-next。
 */
export {
  BK_ALIAS_PREFIX,
  BK_STATIC_PREFIX,
  THEME_TOKENS,
  STATIC_TOKENS,
  LIGHT_PALETTE,
  DARK_PALETTE,
  bkVar,
  bkVarName,
  bkStaticVar,
  bkStaticVarName,
  type AliasToken,
  type Palette,
  type StaticToken,
  type StaticTokenId,
  type ThemeTokenId,
  type TokenGroup,
} from "./tokens"
export { paletteToAssignments, staticAssignments, aliasAssignments, themeRootCss } from "./css"

// 兼容别名：早期导出是 `--bk-`（别名层），保留为旧名避免外部破坏。
export { BK_ALIAS_PREFIX as BK_TOKEN_PREFIX } from "./tokens"