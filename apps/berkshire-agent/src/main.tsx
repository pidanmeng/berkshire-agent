import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { installThemedRoot } from "@berkshire/base-ui/client";
import { buildSharedImportMap, injectSharedImportMap } from "./lib/sharedImportMap";

// 渲染前注入 `@berkshire/theme` 的令牌根样式 + 文档基础（base-ui webview 半身）：`:root`
// /`[data-theme]`/`prefers-color-scheme` 的 var 赋值，保证页面与插件 scoped 样式引用的
// `var(--bk-*)` 有值可用（单一事实源，见 @berkshire/base-ui 的 installThemedRoot）。
installThemedRoot();

// M3 共享依赖 import-map（webview 半身动态拉取的解析前置）：插件 client bundle 把
// `react`/`@berkshire/ui-slots`/`@berkshire/theme` 等共享包走 `--external`，产物保留裸 specifier，
// 宿主运行时经 `import("bk://…")` 动态装载时必须有一个 import-map 把它们解析成宿主可 fetch 的 ESM
// 地址。这里是**宿主的接线点**：把「共享 dep 名 → 实际可 fetch URL」的取值交给运行部署提供
// （dev = Vite dev server 预构建模块；prod = 宿主最终 bundle 里可寻址的共享 chunk）。默认为空
// （`buildSharedImportMap()` 无条目时不注入 script）→ 缺壳接线时插件 bundle 若不内联共享 dep 就
// 解析不到，属已登记、待运行验证的接线点，而非宿主硬编码插件装载逻辑。
injectSharedImportMap(buildSharedImportMap());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* T2：HashRouter 在 Tauri webview 内稳定（不依赖 history API/服务端回退）；核心路由 /、/settings + 动态分析菜单路由 */}
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);