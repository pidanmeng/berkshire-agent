import { useState, useSyncExternalStore } from "react";
import { Link, Route, Routes } from "react-router-dom";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SidecarPanel from "./components/SidecarPanel";
import ExtensionSlot from "./slots/ExtensionSlot";
import ClientModuleHost from "./client/ClientModuleHost";
import RouteSync from "./routes/RouteSync";
import { routesStore } from "./routes/routesStore";
import ExtensionRoute from "./routes/ExtensionRoute";

/** 核心路由 `/`：主界面（hero + slot 演示 + sidebar 面板）。 */
function HomePage() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      <h1>Welcome to Tauri + React</h1>

      <div className="row">
        <a href="https://vite.dev" target="_blank">
          <img src="/vite.svg" className="logo vite" alt="Vite logo" />
        </a>
        <a href="https://tauri.app" target="_blank">
          <img src="/tauri.svg" className="logo tauri" alt="Tauri logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <p>Click on the Tauri, Vite, and React logos to learn more.</p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <input
          id="greet-input"
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg}</p>

      {/* slot 宿主 demo（T0 最小落点，能力块 A）：
          无插件注册此槽时正常渲染空、宿主页不崩；T1 已接 sidecar client/list 快照。 */}
      <section className="slot-demo">
        <h2>slot 宿主 demo（stock-preview.footer）</h2>
        <p className="hint">
          bridge 可用时此处会出现 <code>@berkshire/plugin-demo</code> 贡献的底部组件（fund-flow）及其
          scoped 样式；不可用时为空（fail-closed），卸下插件后样式一并移除。
        </p>
        <ExtensionSlot
          name="stock-preview.footer"
          context={{ symbol: "000001.SZ", name: "平安银行", view: "daily" }}
        />
      </section>

      <SidecarPanel />
    </main>
  );
}

/** 核心路由 `/settings`：最小设置页占位。 */
function SettingsPage() {
  return (
    <main className="container">
      <h1>设置</h1>
      <p className="hint">核心路由（/settings）——插件动态菜单不能覆盖此处。</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="container">
      <h1>404</h1>
      <p className="hint">未找到该页面。</p>
      <Link to="/">← 回首页</Link>
    </main>
  );
}

function App() {
  // 动态路由（路由契约化）：从 routesStore 反应式读取 sidecar 的插件自声明路由（含 slot）。
  const routes = useSyncExternalStore(
    routesStore.subscribe,
    routesStore.getSnapshot,
    routesStore.getSnapshot,
  );

  return (
    <div className="app">
      {/* 路由契约化：RouteSync 拉取 sidecar routes/list 快照汇入 routesStore；ClientModuleHost 汇入 client 模块到 slotRegistry。均无 UI。 */}
      <RouteSync />
      <ClientModuleHost />

      <nav className="topbar">
        <Link to="/">首页</Link>
        <Link to="/settings">设置</Link>
        {routes.map((r) => (
          <Link key={r.path} to={r.path}>
            {r.title}
          </Link>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* 插件自声明动态路由（静态路径、不覆盖核心、全局唯一）；每项按 route.slot 指向槽渲染器 + ExtensionBoundary。 */}
        {routes.map((r) => (
          <Route key={r.path} path={r.path} element={<ExtensionRoute title={r.title} slot={r.slot} />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;