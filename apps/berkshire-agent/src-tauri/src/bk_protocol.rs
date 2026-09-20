//! `bk://` 自定义 URI 方案（M3 目标，docs/npm-plugin-packaging-and-loading.md §5.3）。
//!
//! 作用：把 `$BK_HOME` 下**下载的插件发布产物**安全地映射给 webview，供其运行时动态
//! `import()`（webview 半身动态拉取）。约定 URL：
//!   `bk:///node_modules/<pkg>/dist/client/<file>` → `$BK_HOME/node_modules/<pkg>/dist/client/<file>`
//!
//! 安全纪律（fail-closed）：
//! - 只服务 `$BK_HOME` 树**内的**文件（`starts_with` 防目录穿越）；
//! - ESM/CSS/JSON/HTML 给正确 MIME（可 `import()` 需 `text/javascript`）；
//! - 不存在 → 404；越界 → 403。
//!
//! `$BK_HOME` 与 `@berkshire/boot#defaultBkHome` 同契约：Windows `%APPDATA%\.bk`、
//! macOS `~/Library/Application Support/.bk`、Linux `~/.bk`，`BK_HOME` 环境变量优先
//! （host 拉起 sidecar 时在同一环境，两端据此一致）。
use std::path::{Path, PathBuf};

use tauri::http::{Response, StatusCode};
use tauri::UriSchemeContext;

pub const SCHEME: &str = "bk";

/// 解析 `$BK_HOME`（与 boot 侧 golden 契约，见上）。无环境变量/家目录时退化为当前目录下的 `.bk`。
pub fn bk_home() -> PathBuf {
    if let Ok(h) = std::env::var("BK_HOME") {
        if !h.is_empty() {
            return PathBuf::from(h);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(a) = std::env::var("APPDATA") {
            if !a.is_empty() {
                return PathBuf::from(a).join(".bk");
            }
        }
        if let Ok(u) = std::env::var("USERPROFILE") {
            if !u.is_empty() {
                return PathBuf::from(u).join(".bk");
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(h) = std::env::var("HOME") {
            if !h.is_empty() {
                return PathBuf::from(h).join("Library/Application Support/.bk");
            }
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Ok(h) = std::env::var("HOME") {
            if !h.is_empty() {
                return PathBuf::from(h).join(".bk");
            }
        }
    }
    PathBuf::from(".bk")
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("js" | "mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("html") => "text/html",
        Some("ts") => "text/plain",
        _ => "application/octet-stream",
    }
}

/// 处理一个 `bk://` 请求。`request.uri().path()` 形如 `/node_modules/<pkg>/dist/…`。
/// 签名对齐 `Builder::register_uri_scheme_protocol`：同步 handler，直接返回 `Response`。
pub fn handle_bk(
    _ctx: UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri().path().trim_start_matches('/');
    let base = bk_home();
    let candidate = base.join(uri);

    // 越界（目录穿越）→ 403（fail-closed）。
    if !candidate.starts_with(&base) {
        return Response::builder().status(StatusCode::FORBIDDEN).body(Vec::new()).unwrap();
    }
    // 只服务文件（避免目录/符号链接逃逸语义混乱），不存在 → 404。
    if !candidate.is_file() {
        return Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap();
    }

    match std::fs::read(&candidate) {
        Ok(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", mime_for(&candidate))
            .body(bytes)
            .unwrap(),
        Err(_) => Response::builder().status(StatusCode::NOT_FOUND).body(Vec::new()).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mime_js_is_text_javascript() {
        assert_eq!(mime_for(Path::new("a/b/index.js")), "text/javascript");
        assert_eq!(mime_for(Path::new("a/b/style.css")), "text/css");
        // 未知扩展名 → 通用字节流（不 panic、可下载但不能当 ESM import）。
        assert_eq!(mime_for(Path::new("a/b/pkg.bin")), "application/octet-stream");
    }
}