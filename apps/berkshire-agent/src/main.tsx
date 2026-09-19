import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* T2：HashRouter 在 Tauri webview 内稳定（不依赖 history API/服务端回退）；核心路由 /、/settings + 动态分析菜单路由 */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);