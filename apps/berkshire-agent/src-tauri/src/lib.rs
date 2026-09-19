// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Arc;

use tauri::Manager;

mod bridge;
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
async fn menu_list(state: BridgeState<'_>) -> Result<Vec<bridge::MenuItemDto>, String> {
    bridge_call(state, Bridge::menu_list).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 启动即拉起 sidecar（T2：bridge 启动由 app.setup 触发）。
            app.manage(Arc::new(Bridge::start(app.handle().clone())));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            capabilities_list,
            capabilities_usable,
            notify_send,
            log_list,
            client_list,
            menu_list
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
