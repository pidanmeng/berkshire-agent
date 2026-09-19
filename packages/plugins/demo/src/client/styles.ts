/**
 * demo 插件的前端 scoped 样式（webview 半身，能力块 C）。**单一来源**：sidecar 半身
 *（`../index.ts` 注册 `ctx.clientModules`）从这里取样式字符串，经 `client/list` 交给 webview
 * `loader.ts` 以 `<style data-bk-module>` 注入；webview 本地组件只引用对应 class，不重复定义。
 *
 * **令牌治理（`.agents/features/bk-style-governance.prompt.md`）**：
 * - 样式值一律经 `@berkshire/theme` 的 `bkVar(...)` 引用 `var(--bk-*)`，**禁硬编码色值/间距/圆角**；
 * - 令牌具体值由中枢 webview 在 `:root`/`[data-theme]` 注入（`themeRootCss()`），本文件只写引用；
 * - 每个选择器以 `.bk-demo-*` 前缀并配合 `data-bk-module` 归属，作用域隔离，不污染宿主 / 其它插件。
 */
import { bkVar } from "@berkshire/theme"

export const fundFlowStyle =
  `.bk-demo-fund-flow { display:block; margin:.35rem 0; padding:.5rem .8rem; border:1px dashed ${bkVar('color-info')}; border-radius:${bkVar('radius-lg')}; color:${bkVar('color-info')}; background:${bkVar('color-info-soft')}; font-size:${bkVar('font-size-md')}; }`

export const watchlistToolbarStyle =
  `.bk-demo-watchlist-toolbar { display:inline-flex; gap:.4rem; align-items:center; margin:.2rem .4rem; padding:.3rem .7rem; border:1px solid ${bkVar('color-neutral')}; border-radius:${bkVar('radius-xl')}; color:${bkVar('color-fg')}; background:${bkVar('color-neutral-soft')}; font-size:${bkVar('font-size-sm')}; }`

export const moneyFlowStyle =
  `.bk-demo-money-flow { display:block; margin:.5rem 0; padding:.8rem 1rem; border:1px solid ${bkVar('color-success')}; border-radius:${bkVar('radius-lg')}; color:${bkVar('color-success')}; background:${bkVar('color-success-soft')}; font-size:${bkVar('font-size-md')}; } .bk-demo-money-flow table { border-collapse:collapse; margin-top:.4rem; } .bk-demo-money-flow th,.bk-demo-money-flow td { border:1px solid ${bkVar('color-success')}; padding:.25rem .6rem; text-align:left; }`