import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SidecarPanel from "./components/SidecarPanel";
import ExtensionSlot from "./slots/ExtensionSlot";
import ClientModuleHost from "./client/ClientModuleHost";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      {/* T1：拉取 sidecar client/list 快照并汇入本地 slotRegistry；无 UI、可热装卸。 */}
      <ClientModuleHost />

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
          演示 ExtensionSlot 渲染器 + 类型化上下文 + 空状态。当前无插件注册该槽，
          应正常渲染空、不报错；T3 demo 插件接入后此处会出现底部组件。 */}
      <section className="slot-demo">
        <h2>slot 宿主 demo（stock-preview.footer）</h2>
        <p className="hint">
          无插件注册此槽时正常渲染空、宿主页不崩；T1 已接 sidecar
          <code>client/list</code> 快照（ClientModuleHost 汇入 slotRegistry），bridge 可用时此处会出现
          sidecar 声明的 client 模块及其 scoped 样式。
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

export default App;
