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
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde_json::Value;
use tauri::{AppHandle, Emitter};

use crate::bk_protocol::bk_home;
use crate::sidecar_client::{default_entry_command, EventFn, SidecarClient, SidecarError};

#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct CapabilityDto {
    pub id: String,
    pub label: String,
    pub usable: bool,
}

/// client 插件图快照（`client/list` 结果）：slot → 可 import 的 client 入口 URL 清单，
/// 随入口的具名导出（组件/页面）与可选 scoped 样式。宿主据此运行时动态 `import(url)`，零硬编码。
///
/// `rename_all = "camelCase"`：sidecar（JS）的 `clientModules` 快照字段是 camelCase
/// （`exportName`），Rust 侧 `export_name` 与之双向映射——反序列化能读到、序列化成 `exportName`
/// 交 webview。缺此会把 `exportName` 当未知键忽略 → 入口回到 default → 具名导出必然失败。
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientModuleDto {
    pub id: String,
    pub slot: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub export_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
}

/// 动态路由/导航项（`routes/list` 结果，能力块 B/页面，路由契约化）：所有带 `route` 声明的已排序导航项
///（任意 slot，含 `slot` 归属——webview 按它渲染页面内容槽，不再写死 analysis.menu）；`section` 供
/// 侧边栏按组展示（如 demo 声明 `分析`、data-manager 声明 `数据`），缺省无分组。
#[derive(serde::Deserialize, serde::Serialize, Clone)]
pub struct RouteDto {
    pub id: String,
    pub order: u64,
    pub title: String,
    pub path: String,
    pub slot: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub section: Option<String>,
}

/// 把插件自报的绝对 client 入口（file URL 或绝对路径）映射成 webview 可 `import()` 的 `bk://` URL。
///
/// 契约（bk_protocol.rs）：下载插件位于 `$BK_HOME/node_modules/<pkg>/`，故入口在 `$BK_HOME` 内时
/// 映射成 `bk:///<rel>`；宿主零硬编码。映射是**地址改写**（非装载决策）：不在 `$BK_HOME` 内
/// （如 dev 下的 workspace 插件未经 `bun add` 进 home）时原样透传 + 告警，交由 webview 按模块
/// fail-closed 处理，避免整表 `client/list` 被一个未下载插件拖死。
/// 把 `file://` URL 还原成本机路径字符串。覆盖两种盘符形态且不破坏 POSIX 绝对路径：
/// - `file://C:/…`  → `C:/…`（旧形态）
/// - `file:///C:/…` → `C:/…`（规范形态，`new URL(...).href` 总是产出它——先去掉前导 `/` 再判盘符）
/// - `file:///home/…`（POSIX）→ 保留前导 `/` 的绝对路径（不加盘符逻辑）
fn url_to_path_str(raw: &str) -> String {
    // 没有盘符时原样返回（保持 POSIX 前导 `/`）。
    let has_colon_at = |i: usize| 0 < i && i < raw.len() && raw.as_bytes().get(i) == Some(&b':');
    if has_colon_at(1) {
        return raw.to_string(); // file://C:/…
    }
    if raw.starts_with('/') && has_colon_at(2) && raw.as_bytes().get(1).is_some_and(|b| b.is_ascii_alphabetic()) {
        return raw.trim_start_matches('/').to_string(); // file:///C:/…　→ C:/…
    }
    raw.to_string()
}

fn to_bk_url(url: &str, home: &Path) -> String {
    if url.starts_with("bk://") || url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    let raw = url.strip_prefix("file://").unwrap_or(url);
    let path_str = url_to_path_str(raw);
    let p = PathBuf::from(path_str);
    let Ok(rel) = p.strip_prefix(home) else {
        eprintln!("[bridge] client 入口不在 $BK_HOME（{}）内，原样透传（先 bun add 进 home）: {url}", home.display());
        return url.to_string();
    };
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    format!("bk:///{}", parts.join("/"))
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

    // ---- 首启供给（onboarding）：boot/status + 写 cordis.yml + restart ----

    /// 查询 sidecar 装配阶段：`boot/status` → `{ phase: 'ready'|'provisioning' }`。
    pub fn boot_status(&self) -> Result<Value, String> {
        self.call("boot/status", Value::Object(Default::default()))
            .map_err(|e| e.message)
    }

    /// sidecar 是否处于「待供给」阶段（`$BK_HOME/cordis.yml` 尚未落盘）。webview 据此决定
    /// 是否显示首启引导。sidecar 未就绪/不可达一律视为需引导（fail-closed，不误报已就绪）。
    pub fn provisioning_status(&self) -> Result<bool, String> {
        let v = self.boot_status()?;
        Ok(v.get("phase").and_then(|p| p.as_str()) == Some("provisioning"))
    }

    /// 首启引导落盘 `$BK_HOME/cordis.yml`，随后重启 sidecar 进入 ready 装配。
    /// `$BK_HOME` 写盘由 Rust 单写者承担；内容即 webview 首启步骤产出的完整 YAML 文本
    /// （本层不做插件装载决策，只负责把用户选择写进配置并重装配）。
    pub fn provision_bk_home(&self, cordis_yaml: String) -> Result<(), String> {
        use std::fs;

        let home = bk_home();
        fs::create_dir_all(&home).map_err(|e| format!("create $BK_HOME {}: {e}", home.display()))?;
        let yml = home.join("cordis.yml");
        fs::write(&yml, cordis_yaml).map_err(|e| format!("write {}: {e}", yml.display()))?;
        eprintln!("[bridge] provisioning: wrote {}", yml.display());

        // 重装配：停掉 provisioning 阶段的 sidecar，按新 cordis.yml 拉起 ready 进程。
        self.restart();
        // 主动推一次 client/changed，让仍在活的 reconciler（ClientModuleHost）据此重拉 client/list；
        // 即便新 sidecar 尚未 boot 完，其阻塞请求也会在就绪后被读线程应答。事件在 webview 尚未
        // mount 前发出会丢失，故 ClientModuleHost 侧还做了首次拉取有界重试兜底。
        let _ = self
            .app
            .emit("sidecar://client/changed", serde_json::json!({ "kind": "clientModules" }));
        Ok(())
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

    /// client 插件图快照（T1→M3）：`ctx.clientModules` 的 slot → 可动态 import 的 client 入口。
    /// 把插件自报的绝对入口规范化成 `bk://`（webview 运行时 `import()`），宿主零硬编码。
    pub fn client_list(&self) -> Result<Vec<ClientModuleDto>, String> {
        let v = self.call("client/list", Value::Object(Default::default()))?;
        let arr = v.as_array().ok_or_else(|| "client/list 返回非数组".to_string())?;
        let home = bk_home();
        let mut out = Vec::with_capacity(arr.len());
        for item in arr {
            let mut dto: ClientModuleDto = serde_json::from_value(item.clone()).map_err(|e| e.to_string())?;
            dto.url = to_bk_url(&dto.url, &home);
            out.push(dto);
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

    // ---- `$BK_HOME` 轻量持久化（WP-2 能力缝：`$BK_HOME/state/<ns>/<key>.json`）----
    // 所有读写经 sidecar `ctx.storage`（文件 Provider）落盘；跨边界 id `ns` 品牌化在薄客户端侧复刻。

    /// 读一个键（缺省/缺失返回 JSON `null`）。坏文件/越权 → 显式错误（fail-closed）。
    pub fn storage_get(&self, ns: String, key: String) -> Result<Value, String> {
        self.call("storage/get", serde_json::json!({ "ns": ns, "key": key }))
            .map_err(|e| e.message)
    }

    /// 写一个键（JSON 序列化 + 原子改名写）；成功即持久化，供重启后读回。
    pub fn storage_set(&self, ns: String, key: String, value: Value) -> Result<(), String> {
        self.call("storage/set", serde_json::json!({ "ns": ns, "key": key, "value": value }))
            .map_err(|e| e.message)?;
        Ok(())
    }

    /// 删除一个键（缺失视为成功 no-op）。
    pub fn storage_remove(&self, ns: String, key: String) -> Result<(), String> {
        self.call("storage/remove", serde_json::json!({ "ns": ns, "key": key }))
            .map_err(|e| e.message)?;
        Ok(())
    }

    /// 列出某命名空间下全部键名。
    pub fn storage_list(&self, ns: String) -> Result<Vec<String>, String> {
        let v = self
            .call("storage/list", serde_json::json!({ "ns": ns }))
            .map_err(|e| e.message)?;
        let arr = v.as_array().ok_or_else(|| "storage/list 返回非数组".to_string())?;
        arr.iter()
            .map(|x| {
                x.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| "storage/list 含非字符串元素".to_string())
            })
            .collect()
    }

    // ---- 数据源能力缝（data-sources/* + database/tables）：数据管理页 + 同步编排 ----
    // 快照/复合结果为 JSON Value 直通（页面消费形状，Rust 侧不做业务判定；fail-closed 在
    // sidecar 协议层/服务层），单参命令仍按命令面逐一签名。

    /// 数据源主快照（`data-sources/list`）：providers（含逐 dataset 可用性）+ datasets
    /// 声明 + 当前路由（偏好解析）。无候选源 → resolved 为 null（页面据此展示缺源）。
    pub fn data_sources_list(&self) -> Result<Value, String> {
        self.call("data-sources/list", Value::Object(Default::default()))
            .map_err(|e| e.message)
    }

    /// 切换某数据集的路由偏好（校验目标 provider 确为该数据集候选；非法组合响亮失败）。
    /// 返回新偏好表（Record<dataset, providerId>）。
    pub fn data_sources_set_preference(&self, dataset: String, provider: String) -> Result<Value, String> {
        self.call(
            "data-sources/set-preference",
            serde_json::json!({ "dataset": dataset, "provider": provider }),
        )
        .map_err(|e| e.message)
    }

    /// 实探某 provider 的凭据（先探后存：本方法不落盘，由调用方决定是否存储）。
    /// `api_key` 可选（缺省用 provider 当前已配置的 Key 实探）。
    pub fn data_sources_probe(&self, provider: String, api_key: Option<String>) -> Result<Value, String> {
        let mut p = serde_json::Map::new();
        p.insert("provider".into(), provider.into());
        if let Some(k) = api_key {
            p.insert("apiKey".into(), k.into());
        }
        self.call("data-sources/probe", Value::Object(p))
            .map_err(|e| e.message)
    }

    /// 触发一次数据集采集（整表替换语义：建表 → DELETE + 批量 INSERT → 广播落库事件）。
    /// `params`（如 `{ symbols, start, end }`）可选透传给 provider。
    pub fn data_sources_sync(&self, dataset: String, params: Option<Value>) -> Result<Value, String> {
        let mut p = serde_json::Map::new();
        p.insert("dataset".into(), dataset.into());
        if let Some(pp) = params {
            p.insert("params".into(), pp);
        }
        self.call("data-sources/sync", Value::Object(p))
            .map_err(|e| e.message)
    }

    /// 本地库内嵌表清单（`database/tables`：名称 + 行数；`database/dataset-updated` 后
    /// 页面据此刷新展示）。
    pub fn database_tables(&self) -> Result<Value, String> {
        self.call("database/tables", Value::Object(Default::default()))
            .map_err(|e| e.message)
    }

    /// 覆盖日期登记快照（`data-sources/coverage`）：全部已声明数据组的覆盖记录
    /// （未登记 → covered:false，fail-closed 不伪造「已覆盖」）。
    pub fn data_sources_coverage(&self) -> Result<Value, String> {
        self.call("data-sources/coverage", Value::Object(Default::default()))
            .map_err(|e| e.message)
    }

    /// 手动重算某数据集的覆盖（`data-sources/coverage-refresh { dataset }`）：重扫实际落库表
    /// 并重新登记（数据被外部/旧版本写入后校准）。返回更新后的该数据集覆盖快照。
    pub fn data_sources_coverage_refresh(&self, dataset: String) -> Result<Value, String> {
        self.call(
            "data-sources/coverage-refresh",
            serde_json::json!({ "dataset": dataset }),
        )
        .map_err(|e| e.message)
    }

    /// 覆盖缺洞自检（`data-sources/coverage-gaps { dataset, start?, end? }`，最小面）：
    /// 比对目标窗口与实际覆盖区间，输出缺失区间列表。
    pub fn data_sources_coverage_gaps(
        &self,
        dataset: String,
        start: Option<String>,
        end: Option<String>,
    ) -> Result<Value, String> {
        let mut p = serde_json::Map::new();
        p.insert("dataset".into(), dataset.into());
        if let Some(s) = start {
            p.insert("start".into(), s.into());
        }
        if let Some(e) = end {
            p.insert("end".into(), e.into());
        }
        self.call("data-sources/coverage-gaps", Value::Object(p))
            .map_err(|e| e.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;

    #[test]
    fn maps_under_home_to_bk_url() {
        let home = temp_dir().join("bk-test-home");
        let p = home
            .join("node_modules")
            .join("@berkshire/plugin-demo")
            .join("dist")
            .join("client")
            .join("index.js");
        let url = format!("file://{}", p.display());
        assert_eq!(
            to_bk_url(&url, &home),
            "bk:///node_modules/@berkshire/plugin-demo/dist/client/index.js"
        );
    }

    /// Windows：注册表里插件自报的 `CLIENT_ENTRY_URL` 是新 `URL(...).href` 的规范形态
    /// `file:///C:/…`（前导斜杠 + 正斜杠），此前会因判不到盘符而透传、`bk://` 永不命中。
    #[cfg(windows)]
    #[test]
    fn maps_windows_canonical_file_url() {
        let home = PathBuf::from("C:\\Users\\tester\\.bk");
        let url = "file:///C:/Users/tester/.bk/node_modules/@berkshire/plugin-demo/dist/client/index.js";
        assert_eq!(
            to_bk_url(url, &home),
            "bk:///node_modules/@berkshire/plugin-demo/dist/client/index.js"
        );
        // 旧形态 `file://C:/…` 也应命中。
        let url2 = "file://C:/Users/tester/.bk/node_modules/a/pkg/dist/index.js";
        assert_eq!(to_bk_url(url2, &home), "bk:///node_modules/a/pkg/dist/index.js");
        // 在 $BK_HOME 外 → 原样透传（不改地址）。
        let outside = "file:///C:/elsewhere/x.js";
        assert!(to_bk_url(outside, &home).starts_with("file://"), "应原样透传：{outside}");
    }

    #[test]
    fn passthroughs_outside_home_and_foreign_schemes() {
        let home = PathBuf::from("/nonexistent/home");
        let outside = to_bk_url("file:///tmp/elsewhere/x.js", &home);
        assert!(outside.starts_with("file://"), "应原样透传：{outside}");
        assert_eq!(
            to_bk_url("bk:///node_modules/a/pkg/dist/index.js", &home),
            "bk:///node_modules/a/pkg/dist/index.js"
        );
        assert_eq!(to_bk_url("https://cdn.example/x.js", &home), "https://cdn.example/x.js");
    }

    /// `ClientModuleDto` 双向映射 `exportName`（sidecar JS 是 camelCase）：反序列化能读到、
    /// 序列化回 camelCase 供 webview 取具名导出。缺 `rename_all = "camelCase"` 会把导入名丢掉
    /// → 入口回到 default → 具名导出必然失败（client 组件不渲染的根因之一）。
    #[test]
    fn client_module_dto_roundtrips_camel_case_export_name() {
        // 反序列化 sidecar 的 camelCase 快照项。
        let sidecar_item = r#"{"id":"demo-settings-card","slot":"settings.cards","url":"bk:///node_modules/@berkshire/plugin-demo/dist/client/index.js","exportName":"DemoSettingsCard","style":".x{}"}"#;
        let dto: ClientModuleDto = serde_json::from_str(sidecar_item).expect("应能读到 camelCase exportName");
        assert_eq!(dto.export_name.as_deref(), Some("DemoSettingsCard"));
        assert_eq!(dto.style.as_deref(), Some(".x{}"));
        // 序列化回 webview 时应再产出 camelCase exportName。
        let serialized = serde_json::to_value(&dto).expect("serialize");
        assert_eq!(serialized["exportName"], "DemoSettingsCard");
        assert_eq!(serialized.get("export_name"), None);
        // 无 exportName（可选字段）→ None，webview 用 default。
        let no_export: ClientModuleDto = serde_json::from_str(
            r#"{"id":"a","slot":"root","url":"bk:///x.js"}"#,
        )
        .expect("缺 exportName 合法");
        assert!(no_export.export_name.is_none());
    }
}
