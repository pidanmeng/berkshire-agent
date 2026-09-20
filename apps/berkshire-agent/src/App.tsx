import { useSyncExternalStore } from "react";
import { Link, Route, Routes } from "react-router-dom";
import styles from "./App.module.css";
import { ExtensionSlot } from "@berkshire/ui-slots";
import ClientModuleHost from "./client/ClientModuleHost";
import RouteSync from "./routes/RouteSync";
import { routesStore } from "./routes/routesStore";
import ExtensionRoute from "./routes/ExtensionRoute";
import { ThemePalettePage, SettingsPage, registerRootShell } from "@berkshire/base-ui/client";
import { useBridgeStatus } from "./lib/useBridgeStatus";
import { useWindowControls } from "./lib/useWindowControls";
import { OnboardingGate } from "./onboarding/OnboardingGate";
import { useAppPhase } from "./onboarding/useAppPhase";

// base-ui 壳帧 = 共享 `root` 槽的 single 项：装配即注册（注册即效应），宿主改从 root 槽挂载。
registerRootShell();

/** 核心路由 `/`：主界面（产品落地页骨架）。页面内容由插件经 slot/route 注入，宿主只做路由宿主。 */
function HomePage() {
  return (
    <main className={styles.container}>
      <h1>Berkshire Agent</h1>
      <p className={styles.hint}>A 股投研桌面工作台——左侧侧边栏 + 右侧路由区 + 顶部状态栏 + 底部设置入口。</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className={styles.container}>
      <h1>404</h1>
      <p className={styles.hint}>未找到该页面。</p>
      <Link to="/">← 回首页</Link>
    </main>
  );
}

function App() {
  // 首启供给阶段：checking=探测中，provisioning=$BK_HOME/cordis.yml 未落盘（显示首启引导），
  // ready=已装配（显示正常应用）。在 routes/bridgeOnline 之后取值，保证 hook 顺序稳定。
  const [phase, refreshPhase] = useAppPhase();
  // 动态路由（路由契约化）：从 routesStore 反应式读取 sidecar 的插件自声明路由（含 slot/section）。
  const routes = useSyncExternalStore(
    routesStore.subscribe,
    routesStore.getSnapshot,
    routesStore.getSnapshot,
  );
  // 桥接连通态：base-ui 壳不依赖宿主 lib/api，这里探测后作为 prop 注入。null=检测中。
  // gate 在 ready 上：provisioning 阶段 capabilitiesList 必 fail-closed，故只在就绪后探测。
  const bridgeOnline = useBridgeStatus(phase === "ready");
  // WP-5 自绘标题栏：宿主把 Rust window command 封装成控制器注入 root 槽 context（壳只呈现/拖拽）。
  const titleBar = useWindowControls();

  // 首启供给：$BK_HOME 未初始化 → 全屏首启引导；探测中 → 轻量 splash（避免闪烁）。
  if (phase === "checking") {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--bk-font-sans)",
          color: "var(--bk-color-fg-muted)",
          background: "var(--bk-color-bg)",
        }}
      >
        正在初始化…
      </main>
    );
  }
  if (phase === "provisioning") {
    return <OnboardingGate onDone={refreshPhase} />;
  }

  return (
    <div className={styles.app}>
      {/* 路由契约化：RouteSync 拉取 sidecar routes/list 快照汇入 routesStore；ClientModuleHost 汇入 client 模块到 slotRegistry。均无 UI。 */}
      <RouteSync />
      <ClientModuleHost />

      {/* 应用壳（@berkshire/base-ui 经共享 root 槽贡献壳帧，single 语义）：宿主只注入 context——
          routes/bridgeOnline + renderApp（本宿主的 <Routes>）。壳帧内容（导航/状态/设置/页面挂点）归插件。 */}
      <ExtensionSlot
        name="root"
        context={{
          routes,
          bridgeOnline,
          titleBar,
          renderApp: () => (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/theme" element={<ThemePalettePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              {/* 插件自声明动态路由（静态路径、不覆盖核心、全局唯一）；每项按 route.slot 指向槽渲染器 + ExtensionBoundary。 */}
              {routes.map((r) => (
                <Route key={r.path} path={r.path} element={<ExtensionRoute title={r.title} slot={r.slot} />} />
              ))}
              <Route path="*" element={<NotFound />} />
            </Routes>
          ),
        }}
      />
    </div>
  );
}

export default App;