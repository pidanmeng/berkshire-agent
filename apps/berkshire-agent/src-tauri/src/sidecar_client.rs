//! sidecar 的 stdio 协议客户端：`bun run …/index.ts` + 逐行 ndjson 请求-响应/事件推送。
//!
//! 对应 `packages/sidecar/README.md`（T0 协议）：`stdout`=响应+事件、`stdin`=请求。
//! 本模块**不依赖 Tauri**（纯子进程对话），既被 [bridge] 复用（补上 AppHandle 事件透传），
//! 也可被 `#[cfg(test)]` 单独测「一行请求 → 一行响应」的 round-trip。
//!
//! 诚实边界：仅内存视图；sidecar 的打包 externalBin 属 T5（这里始终以 `bun run <ts路径>` 拉起）。
//! 设计取舍：不使用 tokio（避免新增网络依赖），请求-响应用 `std::sync::mpsc` 阻塞配对；
//! [bridge] 经 `tauri::async_runtime::spawn_blocking` 托到阻塞线程池，避免卡 Tauri 主线程。
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::Value;

/// 桥协议错误（fail-closed：返回给调用方显式错误，绝不吞）。
#[derive(Debug, Clone)]
pub struct SidecarError {
    pub message: String,
}
impl std::fmt::Display for SidecarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sidecar: {}", self.message)
    }
}
impl std::error::Error for SidecarError {}
impl From<std::io::Error> for SidecarError {
    fn from(e: std::io::Error) -> Self {
        Self { message: e.to_string() }
    }
}
// 让 `?` 在返回 `Result<_, String>` 的桥层里直接把 SidecarError 转成消息字符串。
impl From<SidecarError> for String {
    fn from(e: SidecarError) -> Self {
        e.to_string()
    }
}

/// 事件推送回调（sidecar 的 `{event,payload}`；由 [bridge] 转成 Tauri event）。
pub type EventFn = dyn Fn(&str, &Value) + Send + Sync;

/// 把一份请求报文序列化为一行 ndjson（顺序固定：id、method、params）。
pub fn encode_request(id: u64, method: &str, params: &Value) -> String {
    serde_json::json!({ "id": id, "method": method, "params": params }).to_string()
}

/// 默认拉起命令（优先 `BRIDGE_SIDECAR` 环境变量覆盖，便于测试/打包注入）。
pub fn default_entry_command() -> Vec<String> {
    if let Ok(path) = std::env::var("BRIDGE_SIDECAR") {
        return vec!["bun".into(), "run".into(), path];
    }
    let manifest = env!("CARGO_MANIFEST_DIR"); // …/apps/berkshire-agent/src-tauri
    let entry = format!("{manifest}/../../../packages/sidecar/src/index.ts"); // → 仓库根
    vec!["bun".into(), "run".into(), entry]
}

type PendingMap = HashMap<u64, std::sync::mpsc::Sender<Result<Value, SidecarError>>>;

/// 一个受管 subprocess：持有读/写 sidecar stdio 的线程 + 带 id 的请求-响应配表。
pub struct SidecarClient {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Arc<Mutex<PendingMap>>,
    next_id: AtomicU64,
}

impl SidecarClient {
    /// 拉起子进程并挂读线程。失败返回 [SidecarError]（例如 bun 不可用），调用方决定降级。
    pub fn spawn(cmd_line: &[String], on_event: Option<Arc<EventFn>>) -> Result<Self, SidecarError> {
        let mut cmd = Command::new(&cmd_line[0]);
        cmd.args(&cmd_line[1..]);
        // dev 态插件热更：debug 构建拉起 sidecar 时注入开关，sidecar 据此附加 watcher
        //（插件 sidecar 半身/样式变更 → dev/reload-requested → 宿主重启 reify）。release 不加。
        #[cfg(debug_assertions)]
        cmd.env("BK_DEV_HOTRELOAD", "1");
        cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn()?;
        let stdin = child.stdin.take().ok_or_else(|| SidecarError { message: "no stdin pipe".into() })?;
        let stdout = child.stdout.take().ok_or_else(|| SidecarError { message: "no stdout pipe".into() })?;
        let stderr = child.stderr.take().ok_or_else(|| SidecarError { message: "no stderr pipe".into() })?;
        let pending: Arc<Mutex<PendingMap>> = Arc::new(Mutex::new(HashMap::new()));

        // stderr → 宿主日志（T0：stderr 仅供日志，绝不混协议）。
        {
            let reader = BufReader::new(stderr);
            std::thread::spawn(move || {
                for line in reader.lines().map_while(Result::ok) {
                    eprintln!("[sidecar::stderr] {line}");
                }
            });
        }

        // stdout → 响应按 id settle 配表；事件交给 on_event（可能跨线程调用 AppHandle::emit）。
        {
            let pending = Arc::clone(&pending); // 读线程持 Arc，结构体仍保有一份
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                        eprintln!("[bridge] 非 ndjson 行（协议污染?）: {line}");
                        continue;
                    };
                    if let Some(id) = msg.get("id").and_then(Value::as_u64) {
                        let tx = pending.lock().unwrap().remove(&id);
                        if let Some(tx) = tx {
                            let res = match msg.get("error") {
                                Some(err) => Err(SidecarError {
                                    message: err
                                        .get("message")
                                        .and_then(Value::as_str)
                                        .map(str::to_owned)
                                        .unwrap_or_else(|| "sidecar error".into()),
                                }),
                                None => Ok(msg.get("result").cloned().unwrap_or(Value::Null)),
                            };
                            let _ = tx.send(res);
                        }
                    } else if let Some(ev) = msg.get("event").and_then(Value::as_str) {
                        if let Some(cb) = &on_event {
                            let payload = msg.get("payload").cloned().unwrap_or(Value::Null);
                            cb(ev, &payload);
                        }
                    }
                }
            });
        }

        Ok(Self {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending,
            next_id: AtomicU64::new(0),
        })
    }

    pub fn pid(&self) -> u32 {
        self.child.lock().unwrap().id()
    }

    /// 发一个请求并阻塞等待响应/错误。读线程关闭而响应未到 → fail-closed 显式错误。
    pub fn request(&self, method: &str, params: Value) -> Result<Value, SidecarError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).saturating_add(1);
        let (tx, rx) = std::sync::mpsc::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            pending.insert(id, tx);
        }
        {
            let mut stdin = self.stdin.lock().unwrap();
            // NDJSON：一行一报文，行尾必须有 \n，否则 sidecar 的 readline 等不到完整一行。
            let line = format!("{}\n", encode_request(id, method, &params));
            stdin.write_all(line.as_bytes())?;
            stdin.flush()?;
        }
        rx.recv()
            .map_err(|_| SidecarError { message: "bridge 读线程已关闭，未收到响应".into() })?
    }

    /// 阻塞等待子进程退出并回收退出状态（供 shutdown/测试用）。
    pub fn wait(&self) -> std::io::Result<std::process::ExitStatus> {
        self.child.lock().unwrap().wait()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_request_produces_a_single_ndjson_line() {
        let line = encode_request(7, "capabilities/usable", &serde_json::json!({ "id": "x" }));
        let parsed: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(parsed["id"], 7);
        assert_eq!(parsed["method"], "capabilities/usable");
        assert_eq!(parsed["params"]["id"], "x");
        assert!(!line.contains('\n'), "报文必须是一行（不带换行）");
    }

    /// 真实拉起 sidecar 做 round-trip：四方法 + 事件推送 + shutdown 退出码 0。
    /// 依赖环境中的 `bun` 与 `packages/sidecar`（缺 bun 即 hard-fail），故默认 `#[ignore]`；
    /// 在保证 bun + sidecar 依赖的 CI/本机显式跑：`cargo test -- --ignored`（可选加 `-- --nocapture`）。
    #[test]
    #[ignore]
    fn spawn_roundtrip_covers_v1_methods_and_shutdown() {
        let events: Arc<Mutex<Vec<(String, Value)>>> = Arc::new(Mutex::new(Vec::new()));
        let events2 = Arc::clone(&events);
        let on_event: Arc<EventFn> = Arc::new(move |ev: &str, payload: &Value| {
            events2.lock().unwrap().push((ev.to_string(), payload.clone()));
        });
        let cmd = default_entry_command();
        let client = SidecarClient::spawn(&cmd, Some(on_event)).expect("应能拉起 sidecar（需 bun）");

        // capabilities/list → 含 usable:true 的 notify-console
        let caps = client.request("capabilities/list", Value::Object(Default::default())).unwrap();
        let arr = caps.as_array().unwrap();
        let notify = arr
            .iter()
            .find(|c| c["id"] == "notify-console")
            .unwrap_or_else(|| panic!("capabilities/list 应含 notify-console: {caps}"));
        assert_eq!(notify["usable"], true);

        // notify/send → delivered 含 notify-console
        let delivered = client
            .request("notify/send", serde_json::json!({ "message": "roundtrip 测试", "level": "info" }))
            .unwrap();
        assert_eq!(delivered.as_array().unwrap().first().unwrap(), "notify-console");

        // 事件推送已捕获
        assert!(
            events.lock().unwrap().iter().any(|(ev, p)| ev == "notify/request" && p["message"] == "roundtrip 测试"),
            "应收到 notify/request 事件推送"
        );

        // capabilities/usable + log/list
        let usable = client.request("capabilities/usable", serde_json::json!({ "id": "notify-console" })).unwrap();
        assert_eq!(usable, true);
        let logs = client.request("log/list", Value::Object(Default::default())).unwrap();
        assert!(
            logs.as_array().unwrap().iter().any(|e| e["event"] == "notify/request"),
            "log/list 应含 notify/request 记录"
        );

        // 未知方法 → 显式错误（fail-closed），不静默
        let unknown = client.request("no/such/method", Value::Object(Default::default()));
        assert!(unknown.is_err(), "未知方法应返回错误");

        // shutdown → 退出码 0
        client.request("shutdown", Value::Null).ok();
        let status = client.wait().expect("wait 应成功");
        assert!(status.success(), "shutdown 后退出码应为 0, got {status}");
    }
}
