// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Arc;

use tauri::{AppHandle, Manager, WebviewWindow};

mod bridge;
mod bk_protocol;
mod sidecar_client;

pub use bridge::Bridge;

type BridgeState<'a> = tauri::State<'a, Arc<Bridge>>;

/// 生成函数保留（T2 交接要求）：新命令作为 v1 接线的最小面，不加 rspc。
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 桥上的阻塞调用统一经 `spawn_blocking` 托到阻塞线程池，避免卡 Tauri 主/异步线程。
async fn bridge_call<T: Send + 'static>(
    state: BridgeState<'_>,
    f: impl FnOnce(&Bridge) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let bridge = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || f(&bridge))
        .await
        .map_err(|e| e.to_string())
        .and_then(|inner| inner)
}

#[tauri::command]
async fn capabilities_list(state: BridgeState<'_>) -> Result<Vec<bridge::CapabilityDto>, String> {
    bridge_call(state, Bridge::capabilities_list).await
}

#[tauri::command]
async fn capabilities_usable(id: String, state: BridgeState<'_>) -> Result<bool, String> {
    bridge_call(state, move |b| b.capabilities_usable(id)).await
}

#[tauri::command]
async fn notify_send(
    message: String,
    level: Option<String>,
    channel: Option<String>,
    state: BridgeState<'_>,
) -> Result<Vec<String>, String> {
    bridge_call(state, move |b| b.notify_send(message, level, channel)).await
}

#[tauri::command]
async fn log_list(event: Option<String>, state: BridgeState<'_>) -> Result<Vec<serde_json::Value>, String> {
    bridge_call(state, move |b| b.log_list(event)).await
}

#[tauri::command]
async fn client_list(state: BridgeState<'_>) -> Result<Vec<bridge::ClientModuleDto>, String> {
    bridge_call(state, Bridge::client_list).await
}

#[tauri::command]
async fn routes_list(state: BridgeState<'_>) -> Result<Vec<bridge::RouteDto>, String> {
    bridge_call(state, Bridge::routes_list).await
}

// ---- `$BK_HOME` 轻量持久化（WP-2 能力缝：storage_get/set/remove/list）----

#[tauri::command]
async fn storage_get(
    ns: String,
    key: String,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.storage_get(ns, key)).await
}

#[tauri::command]
async fn storage_set(
    ns: String,
    key: String,
    value: serde_json::Value,
    state: BridgeState<'_>,
) -> Result<(), String> {
    bridge_call(state, move |b| b.storage_set(ns, key, value)).await
}

#[tauri::command]
async fn storage_remove(
    ns: String,
    key: String,
    state: BridgeState<'_>,
) -> Result<(), String> {
    bridge_call(state, move |b| b.storage_remove(ns, key)).await
}

#[tauri::command]
async fn storage_list(ns: String, state: BridgeState<'_>) -> Result<Vec<String>, String> {
    bridge_call(state, move |b| b.storage_list(ns)).await
}

// ---- 数据源能力缝（data-sources/* + database/tables）：数据管理页 + 同步编排 ----

#[tauri::command]
async fn data_sources_list(state: BridgeState<'_>) -> Result<serde_json::Value, String> {
    bridge_call(state, Bridge::data_sources_list).await
}

#[tauri::command]
async fn data_sources_set_preference(
    dataset: String,
    provider: String,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.data_sources_set_preference(dataset, provider)).await
}

#[tauri::command]
async fn data_sources_probe(
    provider: String,
    api_key: Option<String>,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.data_sources_probe(provider, api_key)).await
}

#[tauri::command]
async fn data_sources_sync(
    dataset: String,
    params: Option<serde_json::Value>,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.data_sources_sync(dataset, params)).await
}

#[tauri::command]
async fn database_tables(state: BridgeState<'_>) -> Result<serde_json::Value, String> {
    bridge_call(state, Bridge::database_tables).await
}

#[tauri::command]
async fn data_sources_coverage(state: BridgeState<'_>) -> Result<serde_json::Value, String> {
    bridge_call(state, Bridge::data_sources_coverage).await
}

#[tauri::command]
async fn data_sources_coverage_refresh(
    dataset: String,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.data_sources_coverage_refresh(dataset)).await
}

#[tauri::command]
async fn data_sources_coverage_gaps(
    dataset: String,
    start: Option<String>,
    end: Option<String>,
    state: BridgeState<'_>,
) -> Result<serde_json::Value, String> {
    bridge_call(state, move |b| b.data_sources_coverage_gaps(dataset, start, end)).await
}

/// 首启供给：sidecar 是否处于「待供给」阶段（无 cordis.yml）→ webview 显示首启引导。
#[tauri::command]
async fn provisioning_status(state: BridgeState<'_>) -> Result<bool, String> {
    bridge_call(state, Bridge::provisioning_status).await
}

/// 首启供给：把 user 选择的完整 cordis.yml 写入 `$BK_HOME` 并重启 sidecar 进入 ready。
/// （JS 侧经 Tauri 默认 camelCase 传 `{ cordisYml }` → 本参 `cordis_yml`。）
#[tauri::command]
async fn provision_bk_home(cordis_yml: String, state: BridgeState<'_>) -> Result<(), String> {
    bridge_call(state, move |b| b.provision_bk_home(cordis_yml)).await
}

// ---- WP-5：自绘标题栏窗口控制命令面 ----
// `tauri.conf.json` 的 `app.windows[].decorations` 已置 `false`（去除原生标题栏），故本层暴露
// 最小窗口控制命令供 webview 自绘标题栏调用（`window_minimize`/`window_toggle_maximize`/`window_close`/
// `window_is_maximized`）。这些是**窗口级**命令，不经过 sidecar Bridge（与侧边桥无关）。
//
// 诚实标注（目标平台与降级）：本功能**聚焦 Windows**。`decorations:false` 对全部桌面平台生效
// （含 macOS/Linux）；macOS 因此隐藏原生红绿灯、依赖本自绘标题栏提供窗口控制，属尽力降级——
// macOS 的 `titleBarStyle: "Overlay"` 原生红绿灯叠加与 Linux 的差异化拖拽后续处理，不在本 WP 范围。

/// 取主窗口（`tauri.conf.json` 未显式给 label，默认 `main`）；缺窗口 fail-closed 返回显式错误。
fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "主窗口未找到".to_string())
}

/// 最小化主窗口。
#[tauri::command]
fn window_minimize(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(|e| e.to_string())
}

/// 最大化/还原主窗口，返回切换后的最大化态（供 webview 同步按钮图标与 aria-label）。
#[tauri::command]
fn window_toggle_maximize(app: AppHandle) -> Result<bool, String> {
    let w = main_window(&app)?;
    if w.is_maximized().map_err(|e| e.to_string())? {
        w.unmaximize().map_err(|e| e.to_string())?;
    } else {
        w.maximize().map_err(|e| e.to_string())?;
    }
    w.is_maximized().map_err(|e| e.to_string())
}

/// 关闭主窗口。
#[tauri::command]
fn window_close(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.close().map_err(|e| e.to_string())
}

/// 查询主窗口当前是否最大化（初始态 + `tauri://resize` 事件后重查）。
#[tauri::command]
fn window_is_maximized(app: AppHandle) -> Result<bool, String> {
    main_window(&app)?.is_maximized().map_err(|e| e.to_string())
}

/// 取主窗口的**实际标题**（`tauri.conf.json` 的 `app.windows[].title`，单一真源）——自绘标题栏
/// 据此展示，避免 webview 侧硬编码与系统任务栏/Alt-Tab 标题漂移。
#[tauri::command]
fn window_title(app: AppHandle) -> Result<String, String> {
    main_window(&app)?.title().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // M3：`bk://` 自定义协议——webview 运行时动态拉取 `$BK_HOME` 下的插件发布产物。
        .register_uri_scheme_protocol(bk_protocol::SCHEME, bk_protocol::handle_bk)
        .setup(|app| {
            // 启动即拉起 sidecar（T2：bridge 启动由 app.setup 触发）；`start` 已返回 Arc，
            // dev 态热更的后台 reload 循环由其内部线程承担。
            app.manage(Bridge::start(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            capabilities_list,
            capabilities_usable,
            notify_send,
            log_list,
            client_list,
            routes_list,
            storage_get,
            storage_set,
            storage_remove,
            storage_list,
            data_sources_list,
            data_sources_set_preference,
            data_sources_probe,
            data_sources_sync,
            database_tables,
            data_sources_coverage,
            data_sources_coverage_refresh,
            data_sources_coverage_gaps,
            provisioning_status,
            provision_bk_home,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_is_maximized,
            window_title
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
