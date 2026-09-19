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

/// client 插件图快照（`client/list` 结果）：slot → bundle 清单，随 bundle 的可选 scoped 样式。
#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct ClientModuleDto {
    pub id: String,
    pub slot: String,
    pub bundle: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}

/// 动态路由/导航项（`routes/list` 结果，能力块 B/页面，路由契约化）：所有带 `route` 声明的已排序导航项
///（任意 slot，含 `slot` 归属——webview 按它渲染页面内容槽，不再写死 analysis.menu）。
#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct RouteDto {
    pub id: String,
    pub order: u64,
    pub title: String,
    pub path: String,
    pub slot: String,
}

pub struct Bridge {
    client: RwLock<Option<Arc<SidecarClient>>>,
    app: Arc<AppHandle>,
    entry_cmd: Vec<String>,
    /// dev 态插件热更：sidecar 推 `dev/reload-requested` 时由 on_event 转发到这里，
    /// 后台线程收到后重启 sidecar 以重装配新声明/样式。生产 sidecar 不发此事件 → 惰性。
    reload_tx: std::sync::mpsc::Sender<()>,
}

impl Bridge {
    pub fn start(app: AppHandle) -> Arc<Self> {
        let app = Arc::new(app);
        let (reload_tx, reload_rx) = std::sync::mpsc::channel::<()>();
        let bridge = Arc::new(Self {
            client: RwLock::new(None),
            entry_cmd: default_entry_command(),
            app,
            reload_tx,
        });
        bridge.spawn_client();
        let reload_self = Arc::clone(&bridge);
        reload_self.spawn_reload_loop(reload_rx);
        bridge
    }

    /// 后台 reload 循环（持有 `Arc<Self>` 以便重启+推事件）：收到 dev/reload-requested →
    /// 重启 sidecar（新声明/样式生效），随后主动推 `sidecar://client/changed` 让 webview 的
    /// ClientModuleHost + RouteSync 重拉 `client/list` + `routes/list` 快照（组件由 Vite
    /// Fast Refresh 负责，不经本路径）。
    fn spawn_reload_loop(self: Arc<Self>, rx: std::sync::mpsc::Receiver<()>) {
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                self.restart();
                // 就绪探测：`restart()` 的 spawn_client 只是拉起进程、无 booted 握手，直接推
                // 脉冲会让 webview 抢在 mountFromLayers 完成前重拉，拿到中间态/超时。这里等新
                // sidecar 能应答一次 `client/list`（其阻塞请求会在 boot 后被其读线程处理，故首次
                // 成功即视为就绪）再推。有界重试，dev-only；探测失败也照样推（fail-open 保命）。
                self.wait_ready_probe();
                // 关键：脉冲必须带 `kind: clientModules`——webview 的 ClientModuleHost 只对
                // `kind==='clientModules'` 重拉 client/list（见 ClientModuleHost.tsx）；RouteSync
                // 无条件刷 `routes/list`，两种快照都随之刷新。
                let _ = self
                    .app
                    .emit("sidecar://client/changed", serde_json::json!({ "kind": "clientModules" }));
            }
        });
    }

    /// dev 热更后等新 sidecar 就绪的探测。`client_list()` 是阻塞请求，内部会一直等到新 sidecar
    /// boot 完并开始应答；仅当 boot 失败/崩溃时靠有界重试兜底（避免死等），仍不达则告警并放行。
    fn wait_ready_probe(&self) {
        const ATTEMPTS: u32 = 10;
        const SLEEP_MS: u64 = 150;
        for _attempt in 0..ATTEMPTS {
            if self.client_list().is_ok() {
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(SLEEP_MS));
        }
        eprintln!("[bridge] dev 热更就绪探测未达（新 sidecar 长期未应答 client/list），仍推送 client/changed");
    }

    /// spawn/start：拉起 sidecar。失败时不 panic（可靠降级为「bridge 不可用」，
    /// 命令返回显式错误，宿主页仍可交互——遵循 ExtensionBoundary 精神）。
    fn spawn_client(&self) {
        let app = Arc::clone(&self.app);
        let reload_tx = self.reload_tx.clone();
        let on_event: Arc<EventFn> = Arc::new(move |ev: &str, payload: &Value| {
            // T0 规则：事件名保持域前缀 sidecar://<event>
            let event = format!("sidecar://{ev}");
            let _ = app.emit(event.as_str(), payload.clone());
            // 仅 dev 态 sidecar 推送此事件；事务在后台 reload 循环处理（此处只投递，不阻塞读线程）。
            if ev == "dev/reload-requested" {
                let _ = reload_tx.send(());
            }
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

    /// client 插件图快照（T1）：`ctx.clientModules` 的 slot → bundle 清单，供 webview 挂载。
    pub fn client_list(&self) -> Result<Vec<ClientModuleDto>, String> {
        let v = self.call("client/list", Value::Object(Default::default()))?;
        let arr = v.as_array().ok_or_else(|| "client/list 返回非数组".to_string())?;
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            out.push(serde_json::from_value(item.clone()).map_err(|e| e.to_string())?);
        }
        Ok(out)
    }

    /// 动态路由/导航快照（路由契约化）：所有带 `route` 声明的导航项（含 `slot`），供 webview 生成导航 + 路由。
    pub fn routes_list(&self) -> Result<Vec<RouteDto>, String> {
        let v = self.call("routes/list", Value::Object(Default::default()))?;
        let arr = v.as_array().ok_or_else(|| "routes/list 返回非数组".to_string())?;
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            out.push(serde_json::from_value(item.clone()).map_err(|e| e.to_string())?);
        }
        Ok(out)
    }
}
