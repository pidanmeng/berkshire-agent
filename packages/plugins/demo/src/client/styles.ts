/**
 * demo 插件的前端 scoped 样式（webview 半身，能力块 C）。**单一来源**：sidecar 半身
 *（`../index.ts` 注册 `ctx.clientModules`）从这里取样式字符串，经 `client/list` 交给 webview
 * `loader.ts` 以 `<style data-bk-module>` 注入；webview 本地组件只引用对应 class，不重复定义。
 *
 * 每个选择器以 `.bk-demo-*` 前缀并配合 `data-bk-module` 归属，作用域隔离，不污染宿主 / 其它插件。
 */
export const fundFlowStyle =
  '.bk-demo-fund-flow { display:block; margin:.35rem 0; padding:.5rem .8rem; border:1px dashed #2e86de; border-radius:8px; color:#1f618d; background:rgba(46,134,222,.08); font-size:.9em; }'

export const watchlistToolbarStyle =
  '.bk-demo-watchlist-toolbar { display:inline-flex; gap:.4rem; align-items:center; margin:.2rem .4rem; padding:.3rem .7rem; border:1px solid #7d8a92; border-radius:14px; color:#2c3e50; background:rgba(125,138,146,.10); font-size:.85em; }'

export const moneyFlowStyle =
  '.bk-demo-money-flow { display:block; margin:.5rem 0; padding:.8rem 1rem; border:1px solid #27ae60; border-radius:8px; color:#1e8449; background:rgba(39,174,96,.08); font-size:.95em; } .bk-demo-money-flow table { border-collapse:collapse; margin-top:.4rem; } .bk-demo-money-flow th,.bk-demo-money-flow td { border:1px solid rgba(39,174,96,.4); padding:.25rem .6rem; text-align:left; }'