import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import SidecarPanel from "./components/SidecarPanel";
import ExtensionSlot from "./slots/ExtensionSlot";

function App() {
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
          演示 ExtensionSlot 渲染器 + 类型化上下文 + 空状态。当前无插件注册该槽，
          应正常渲染空、不报错；T3 demo 插件接入后此处会出现底部组件。 */}
      <section className="slot-demo">
        <h2>slot 宿主 demo（stock-preview.footer）</h2>
        <p className="hint">
          暂无插件注册此槽——暂无注册也正常渲染空，宿主页不崩；T3 demo 插件接入后此处会出现底部组件。
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
