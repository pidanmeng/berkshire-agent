/**
 * `@berkshire/theme` —— 样式层**单一事实源**（无 `@berkshire/core` 依赖）。
 *
 * - **令牌注册表** `THEME_TOKENS`：每个令牌含 id / 维度组 / 亮暗两值 / 标签；
 * - **色板** `LIGHT_PALETTE` / `DARK_PALETTE`；`Palette` 类型（`ThemeTokenId → 值`）；
 * - **CSS 赋值出口** `themeRootCss()`：`App.css` 的 `:root`/`[data-theme]` 由它注入，组件样式只写 `var(--bk-*)`；
 * - **引用助手** `bkVar('color-primary')` → `var(--bk-color-primary)`，供 `App.css`/插件 `styles.ts` 用，避免手写魔法值。
 *
 * 诚边界：仅覆盖**令牌值集**（色板/间距/圆角/字体/阴影）；`ctx.theme` 换肤缝、远程 bundle（`bk://`）
 * 仍为目标态，本包不假装已落地。
 */
export {
  BK_TOKEN_PREFIX,
  THEME_TOKENS,
  LIGHT_PALETTE,
  DARK_PALETTE,
  bkVar,
  bkVarName,
  type Palette,
  type ThemeToken,
  type ThemeTokenId,
  type TokenGroup,
} from "./tokens"
export { paletteToAssignments, themeRootCss } from "./css"