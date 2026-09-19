import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { installThemeRootStyle } from "./theme/install";

// 渲染前注入 `@berkshire/theme` 的令牌根样式（`:root`/`[data-theme]`/`prefers-color-scheme` 的 var 赋值），
// 保证 App.css 与插件 scoped 样式引用的 `var(--bk-*)` 有值可用（单一事实源，见 ./theme/install.ts）。
installThemeRootStyle();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* T2：HashRouter 在 Tauri webview 内稳定（不依赖 history API/服务端回退）；核心路由 /、/settings + 动态分析菜单路由 */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);