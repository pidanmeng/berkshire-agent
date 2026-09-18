# Tauri 2 + DuckDB + Cordis-style plugin runtime — research report

Scope: Rust host + React frontend + DuckDB persistence, wanting a Cordis-like plugin
runtime (runtime load/update/unload without restart, revertible effects, reactive DI).
All facts checked against current docs as of this research pass. Uncertainty flagged inline.

---

## 1. Embedding DuckDB in a Tauri 2 app

### 1a. `duckdb` Rust crate (duckdb-rs)
- **Status: actively maintained, official.** Lives in the `duckdb/duckdb-rs` repo and is the
  official client in the DuckDB docs. The latest client tracks DuckDB 1.5.x; crate versions
  follow the form `1.<major_minor_patch>.x` (e.g. `duckdb = { version = "~1.10505.0", features = ["bundled"] }`).
  The `bundled` feature compiles DuckDB from source so no system lib is needed — ideal for a
  Tauri installer.
  - https://duckdb.org/docs/current/clients/rust/overview
  - https://github.com/duckdb/duckdb-rs
  - https://crates.io/crates/duckdb
- **Async/Tokio: there is NO native async support.** The crate deliberately mirrors `rusqlite`
  (a synchronous, blocking API: `Connection`, `prepare`, `execute`, `query_map`). To use it
  under Tauri's async runtime you must wrap calls in a blocking thread pool:
  `tauri::async_runtime::spawn_blocking(...)` / `tokio::task::spawn_blocking(...)`. This is the
  standard pattern and works fine, but it means you can't await DuckDB from an async command
  without hopping threads.
  - https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html
- **Registering Parquet/CSV as views:** Yes. duckdb-rs executes arbitrary SQL (it is the same
  in-process DuckDB engine as the CLI/Python), so you register views exactly as elsewhere:
  `CREATE VIEW name AS SELECT * FROM read_parquet('file.parquet');` (or `read_csv`). The bundled
  build ships the file-format readers as Cargo feature flags (parquet, csv, etc.).
  - https://github.com/duckdb/duckdb-rs (feature flags / README)

### 1b. `tauri-plugin-duckdb` / community plugins
- **No first-party or notable `tauri-plugin-duckdb` exists.** Tauri's own `tauri-plugin-sql` is
  built on `sqlx` and supports **SQLite, MySQL, PostgreSQL only — no DuckDB**.
  - https://crates.io/crates/tauri-plugin-sql
  - https://v2.tauri.app/plugin/sql/
- A crates.io search for "duckdb tauri" returns only small ORM/Diesel wrappers (`better-duck-*`,
  Diesel-based) and unrelated crates — nothing that is a maintained Tauri IPC plugin wrapping
  DuckDB. **Status: no established community plugin; treat as unsupported path.**
  - https://crates.io/api/v1/crates?q=duckdb%20tauri
- Practical alternative: write your own thin Tauri commands around `duckdb-rs`, or generate
  your IPC layer with `tauri-bindgen` (typesafe bindings for Tauri's IPC bridge).
  - https://github.com/tauri-apps/tauri-bindgen

### 1c. DuckDB-Wasm
- **Maturity: official, stable, actively shipped.** Latest stable Wasm client 1.5.5. Distributed
  as `@duckdb/duckdb-wasm` (JS + WASM lib), `@duckdb/duckdb-wasm-shell`, and buildable from
  source. Runs a full DuckDB engine inside the browser/webview at near-native speed, no server,
  data never leaves the machine.
  - https://duckdb.org/docs/current/clients/wasm/overview
  - https://github.com/duckdb/duckdb-wasm
- **Parquet over HTTP:** supported — DuckDB's httpfs-style remote reads plus the standard
  `read_parquet`/`read_csv` table functions work in Wasm (this is how the browser shell queries
  remote datasets). Caveats: requires the appropriate bundle/threaded workers and CORS on the
  HTTP endpoint; not a zero-friction substitute for local files. Flag: responsiveness/CORS and
  worker setup are the known friction points.
  - For Tauri it's attractive because the DB runs *inside the webview*, so JS plugin code that
    owns the DB (see Recommendation) shares one process with the data. Watch for having *two*
    engines if you also embed Rust-side duckdb-rs for a permanent store.

### 1d. rspc / specta as typed RPC
- **rspc** is a typesafe router (define server procs in Rust, get an end-to-end typed TS client);
  transport-agnostic — it can serve from an HTTP server (Axum) *or* from Tauri. Used in production
  by Spacedrive. Current docs: the old `rspc.dev` v0.3 docs are marked deprecated and point to
  `specta.dev/docs/rspc`; a 1.0.0-rc.x docs section exists.
  - https://www.rspc.dev
  - https://github.com/oscartbeaumont/rspc
- **Tauri 2 integration:** `specta-rs/tauri2` is the adapter repo covering rspc, specta, and
  `tauri-specta` (typesafe `#[tauri::command]` + events). Tauri v2 integration is current.
  Flag: maintenance is community-paced (single lead maintainer); "actress but not fast-moving" —
  fine as a typed layer, not a bet-the-app dependency.
  - https://github.com/specta-rs/tauri2
  - https://crates.io/crates/tauri-specta

---

## 2. Node/Bun/TS plugin runtime as a Tauri sidecar

### 2a. Tauri 2 sidecars
- The `bundle.externalBin` array in `tauri.conf.json` bundles external executables. The binary
  must be placed in `src-tauri/binaries` named `<name>-<target-triple>+<version>[.exe]` (rename
  script shown in docs). You **must build a separate binary per target triple** (win x64, linux,
  mac arm64, …).
  - https://v2.tauri.app/develop/sidecar/
- **Spawning:** `tauri-plugin-shell`. From Rust: `app.shell().sidecar("name").spawn()` yields an
  event stream (`CommandEvent::Stdout`) and `child.write()` to stdin. From JS:
  `Command.sidecar('binaries/name', args)`. **Because sidecar execution is a real OS process, it
  is gated by capability/scope permissions** — you must add entries to `capabilities/default.json`
  (the args you allow are validated against a declared schema/scope).
  - https://v2.tauri.app/plugin/shell/
  - https://v2.tauri.app/develop/sidecar/
- **Concerns:** bundle size (a Node/Bun runtime is tens–hundreds of MB), per-platform binaries,
  and security — the sidecar is *not* subject to the webview's CSP; keep its surface minimal and
  route it through capabilities. Depth reference (Node sidecar guide):
  - https://v2.tauri.app/learn/sidecar-nodejs/

### 2b. Bun as the sidecar runtime vs Node
- **Bun can produce a self-contained single-file executable** via `bun build ./x.ts --compile
  --outfile mycli`. It bundles the app plus a copy of the Bun runtime and supports all Bun + Node
  APIs. Critical for Tauri: `--target=bun-windows-x64|...-arm64|linux-x64|darwin-*|...` does
  **cross-compilation**, so you can produce each platform's binary without that platform's toolchain.
  - https://bun.sh/docs/bundler/executables
- **Fit for Tauri:** yes — compile per-target-triple and drop into `src-tauri/binaries` as a
  sidecar. Known pain points: (1) **size** — the Bun runtime inflates the executable (historically
  ~tens of MB, now smaller but still significant); (2) **Windows** has had its share of Bun
  runtime/bundling quirks — treat Windows as a build/test gate, don't assume parity. Confirmed as
  an open discussion in the Tauri org.
  - https://github.com/orgs/tauri-apps/discussions/5837  (flagged: uncertain on exact current
    Windows bug list — verify on your target Bun version)

### 2c. Spawning from Rust + stdio JSON-RPC
- Yes. The shell plugin gives full duplex stdio: Rust reads structured lines on `CommandEvent::Stdout`,
  writes requests via `child.write()`. If the sidecar speaks newline-delimited JSON, that IS an
  RPC channel (request/response + events). The Node-sidecar guide explicitly suggests stdin/stdout,
  localhost, or local sockets as the IPC options (each with its own latency/security tradeoffs).
  - https://v2.tauri.app/develop/sidecar/
  - https://v2.tauri.app/learn/sidecar-nodejs/
- For streaming-heavy workloads, a localhost socket can beat per-line stdio; but stdio is the
  simplest and is what the shell plugin models.

---

## 3. Cordis: does it really hot-reload without restart?

**Confirmed — the claim is real for the JS side.** Cordis core (`cordis`, npm) implements plugin
lifecycle as **Fibers**:

- `ctx.plugin(Plugin)` loads a plugin and returns a **Fiber** — the runtime instance of that
  plugin (lifecycle state, validated config, registered effects).
- **`fiber.dispose()`** unloads the plugin and *awaits* all cleanup; it recursively unloads any
  child plugins the plugin mounted.
- **`fiber.restart()`** disposes and immediately reloads the same plugin with its current config.
- **`fiber.update(config, noSave)`** validates new config and restarts, running an
  `internal/update` waterfall that lets HMR hooks veto/replace the restart.
- **Revertibility:** every side effect is registered with `ctx.effect(() => { ...; return disposer })`.
  Disposers run in reverse registration order on unload; async disposers are awaited. This is the
  "no leak" / "fully reverted" model — Cordis tracks *and* reverts every effect.
- **Reactive DI:** plugins declare `inject = ['database', 'logger']`; Cordis doesn't run `apply`
  until the required services are actually available (a "reactive coeffect").
  - https://github.com/cordiverse/cordis
  - https://registry.npmjs.org/cordis/latest  (v4.0.0-rc.10, MIT, Shigma)
  - Fiber API: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/fiber.md
  - Explainers: https://agentatlas.org/blog/cordis-explained-how-deepseek-harness-plugin-framework-works/
    and https://dev.to/worldlinetech/understanding-cordis-the-typescript-framework-built-for-hot-swapping-everything-1ihb

**HMR/loader:** the repo ships `packages/loader` (`@cordisjs/plugin-loader`, HMR file-watch
loader) and `packages/hmr`. The loader watches plugin entry files and drives fiber restart/update
in place — i.e. plugin code changes apply at runtime. So "no restart" refers to **the process not
restarting; individual plugin fibers are disposed and recreated**, which is exactly the Cordis goal.
  - https://github.com/cordiverse/cordis/tree/main/packages

**Minimal setup in plain Node/Bun (not Koishi) — yes:**
```ts
import { Context } from 'cordis'
const app = new Context()
app.plugin(MyPlugin)
```
Core has only `cosmokit` + `@standard-schema/spec` as required deps; `@cordisjs/plugin-loader`
and `@cordisjs/plugin-include` are **optional peer deps** (you add the loader only when you want
file-watch HMR). Koishi is a *consumer* of cordis, not a prerequisite.
  - https://registry.npmjs.org/cordis/latest (dependencies/peerDependencies)

---

## 4. A Rust-native plugin runtime — realistic?

- **The fundamental blocker: no stable ABI between separately-compiled Rust crates.** A Rust
  "dynamic library plugin" must be built with the *same rustc, same feature set, same dependency
  graph* as the host, or its trait objects/allocators will disagree. `dlopen` + a trait-object
  interface across the DLL boundary is fragile.
  - https://www.reddit.com/r/rust/comments/bb73vw/
  - https://users.rust-lang.org/t/prefer-dynamic-yes-in-hot-reload-or-plugin-system/115364
- **Implications for "load/unload at runtime":** it *is* possible, but you'd have to pin a stable
  C-compatible ABI contract (plain-C types, explicit versioning), effectively writing your own
  mini-FFI schema + a hand-rolled DI container + a manual effect-tracking layer. That's a large,
  novel build. There is **no mature Rust crate comparable to Cordis** for reactive DI + reversible
  effects + runtime hot-swap.
- **Pragmatic verdict:** for the Cordis goals specifically, a **JS runtime is the right engine** —
  it sidesteps the ABI problem entirely (JS modules load/unload in one process freely) and reuses
  the battle-tested cordis fiber/effect model instead of reimplementing it. Rust stays the secure
  host, orchestrator, and analytics tier (duckdb-rs), not the plugin VM.

---

## 5. Data flow for streaming quotes/charts

- **Rust → webview:** `AppHandle`/`WebviewWindow` implement the `Emitter` trait; `app.emit("quote",
  payload)` delivers to webview listeners (`listen`/`on` in `@tauri-apps/api/event`). Events are
  global or webview-scoped. This is the native high-rate path.
  - https://v2.tauri.app/develop/calling-frontend/
- **JS sidecar → webview:** a sidecar streams to the Rust host (stdout JSON) and Rust re-emits to
  the webview — that adds one hop. For high-frequency ticks, **don't ship one event per tick**;
  batch/aggregate (push into DuckDB, emit a series/candle update at a fixed cadence). Same guidance
  applies if you run DuckDB-Wasm in the webview and push from a JS runtime there.
  - https://v2.tauri.app/develop/calling-frontend/

---

## Recommendation sketch

Base: Rust host + React + DuckDB. Decide where the DB lives first, then where plugins live.

- **Analytics/persistent data — keep in Rust with `duckdb-rs`** (official, maintained, bundled
  build = installer-friendly). Wrap in `spawn_blocking`. It registers Parquet/CSV views via the
  same SQL table functions the CLI uses.
- **Stick the Cordis runtime in a Bun-compiled sidecar** (cross-compiled per-target, packaged as a
  Tauri sidecar, spoken to over newline-JSON on stdio, gated by shell capabilities). Cordis gives
  you load/update/unload without process restart, revertible effects, and reactive DI for free —
  none of which a Rust-native approach can deliver cheaply. Plugins are "capability + data-logic":
  they ask Cordis for services, run SQL against Rust-backed duckdb commands, and feed results to
  the webview.
- **Extensible data (a):** cordis plugins in the sidecar declare SQL/views and data providers;
  Rust (duckdb-rs) is the executor. Hot-loadable because cordis swaps fibers.
- **Extensible capability (c):** cordis services + a small set of locked-down Rust/Tauri commands
  the plugins can call over the typed layer (`rspc`/`specta` for hypersafety, or plain commands).
- **Extensible UI (b) — the hard part:** cordis runs in the *sidecar*, but React runs in the
  *webview*, so a browser-side plugin must both render and be hot-loadable. Cleanest options:
  - **Option A (JS UI + cordis all in the webview):** run cordis + a pluggable UI registry *inside*
    the webview (DuckDB-Wasm as the DB), so data + UI + capabilities hot-swap in ONE process. Rust
    stays the secure host/orchestrator. Downside: if Rust must also own a persistent SQLite/DuckDB
    store you end up with two engines; and SQL runs in the webview.
  - **Option B (cordis in sidecar, UI-native in webview):** sidecar hosts cordis (data/capability);
    the webview exposes React "slots"; a plugin's frontend bundle is fetched by a webview-side HMR
    mechanism and mounted into a slot. More moving parts but keeps DuckDB firmly in Rust.

**Bottom line:** to maximize *all three* hot-loadable axes with minimum custom machinery, the
pragmatic pick is **Bun-sidecar cordis + Rust duckdb-rs + a rspc/specta typed bridge to the
WebView**, and invest specifically in the webview-side UI-slot/HMR piece (the only genuinely hard
part) — or collapse to Option A (duckdb-wasm + cordis in-webview) if "one process for data+UI
plugins" matters more than Rust owning the DB. Flag as a design decision for you, not a settled fact.