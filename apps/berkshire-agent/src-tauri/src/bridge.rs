//! Tauri Rust 宿主侧 sidecar 桥：管理 [SidecarClient] 生命周期，把 sidecar 的
//! `{event,payload}` 推送转成 Tauri event，并向 webview 暴露最小命令面。
//!
//! 命令注册见 [crate::run]（`capabilities_list`/`capabilities_usable`/`notify_send`/
//! `log_list`）。事件名保持域前缀：`sidecar://notify/*`、`sidecar://capabilities/*`。
//!
//! 诚实边界：DuckDB 单写者、rspc/specta typed bridge 仍目标态（差异记入
//! docs/secondary-development.md §8）；本层用 Tauri 原生 command + Tauri events 最小接线。
//! 所有请求-响应为**阻塞**调用（[SidecarClient::request]），由 `spawn_blocking` 托到
//! 阻塞线程池执行，避免卡 Tauri 主/异步线程。
use std::sync::{Arc, RwLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::sidecar_client::{default_entry_command, EventFn, SidecarClient, SidecarError};

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct CapabilityDto {
    pub id: String,
    pub label: String,
    pub usable: bool,
}

pub struct Bridge {
    client: RwLock<Option<Arc<SidecarClient>>>,
    app: Arc<AppHandle>,
    entry_cmd: Vec<String>,
}

impl Bridge {
    pub fn start(app: AppHandle) -> Self {
        let app = Arc::new(app);
        let bridge = Self {
            client: RwLock::new(None),
            entry_cmd: default_entry_command(),
            app,
        };
        bridge.spawn_client();
        bridge
    }

    /// spawn/start：拉起 sidecar。失败时不 panic（可靠降级为「bridge 不可用」，
    /// 命令返回显式错误，宿主页仍可交互——遵循 ExtensionBoundary 精神）。
    fn spawn_client(&self) {
        let app = Arc::clone(&self.app);
        let on_event: Arc<EventFn> = Arc::new(move |ev: &str, payload: &Value| {
            // T0 规则：事件名保持域前缀 sidecar://<event>
            let event = format!("sidecar://{ev}");
            let _ = app.emit(event.as_str(), payload.clone());
        });
        *self.client.write().unwrap() = match SidecarClient::spawn(&self.entry_cmd, Some(on_event)) {
            Ok(client) => {
                eprintln!("[bridge] sidecar started (pid={})", client.pid());
                Some(Arc::new(client))
            }
            Err(e) => {
                eprintln!("[bridge] sidecar start failed → bridge unavailable: {e}");
                None
            }
        };
    }

    /// stop：走协议 shutdown（逆序销毁），并等待子进程退出。
    fn stop(&self) {
        let Some(client) = self.client.read().unwrap().clone() else { return };
        let _ = client.request("shutdown", Value::Null);
        let _ = client.wait();
        *self.client.write().unwrap() = None;
    }

    /// host 侧 restart：stop 后重新 spawn。
    pub fn restart(&self) {
        self.stop();
        self.spawn_client();
    }

    fn client(&self) -> Result<Arc<SidecarClient>, SidecarError> {
        self.client
            .read()
            .unwrap()
            .clone()
            .ok_or_else(|| SidecarError { message: "bridge 未启动/不可用".into() })
    }

    fn call(&self, method: &str, params: Value) -> Result<Value, SidecarError> {
        self.client()?.request(method, params)
    }

    // ---- 最小命令面（经 bridge 走 sidecar，v1 能力）----

    pub fn capabilities_list(&self) -> Result<Vec<CapabilityDto>, String> {
        let v = self.call("capabilities/list", Value::Object(Default::default()))?;
        let arr = v.as_array().ok_or_else(|| "capabilities/list 返回非数组".to_string())?;
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            out.push(serde_json::from_value(item.clone()).map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    pub fn capabilities_usable(&self, id: String) -> Result<bool, String> {
        let v = self.call("capabilities/usable", serde_json::json!({ "id": id }))?;
        v.as_bool().ok_or_else(|| "capabilities/usable 返回非布尔".to_string())
    }

    pub fn notify_send(&self, message: String, level: Option<String>, channel: Option<String>) -> Result<Vec<String>, String> {
        let mut p = serde_json::Map::new();
        p.insert("message".into(), message.into());
        if let Some(l) = level {
            p.insert("level".into(), l.into());
        }
        if let Some(c) = channel {
            p.insert("channel".into(), c.into());
        }
        let v = self.call("notify/send", Value::Object(p))?;
        let arr = v.as_array().ok_or_else(|| "notify/send 返回非数组".to_string())?;
        Ok(arr
            .iter()
            .map(|x| x.as_str().map(str::to_string).unwrap_or_default())
            .collect())
    }

    pub fn log_list(&self, event: Option<String>) -> Result<Vec<Value>, String> {
        let mut p = serde_json::Map::new();
        if let Some(e) = event {
            p.insert("event".into(), e.into());
        }
        let v = self.call("log/list", Value::Object(p))?;
        v.as_array()
            .cloned()
            .ok_or_else(|| "log/list 返回非数组".to_string())
    }
}
