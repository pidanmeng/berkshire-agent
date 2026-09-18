# tick-stock-panel — Concrete Contracts & Data Shapes (read-only audit)

Repo: `C:\Code\tick-stock-panel`. All paths below are relative to that root. Line numbers are exact; snippets are quoted verbatim (comments in Chinese translated where relevant).

---

## 1. Storage & query — `backend/app/tickflow/repository.py`

### DuckDB is **in-memory only** — no `.duckdb` file is ever written

`DataStore` (line 85) opens the connection hard-coded to `:memory:` and only registers **views** over on-disk Parquet. Nothing writes a real `.duckdb` database file:

```python
# line 127-129 (§7.1 注释: "DuckDB 内存模式 — 不建 .db 文件")
# DuckDB 内存模式 — 不建 .db 文件(§7.1)
self.db = duckdb.connect(database=":memory:")
self._register_views()
```

`DataStore.__init__` (lines 88-121) creates a fixed set of subdirectories under `data_dir`, including `kline_daily`, `kline_daily_enriched`, `kline_index_daily`, `kline_index_enriched`, `kline_etf_daily`, `kline_etf_enriched`, `kline_etf_minute`, `kline_minute`, `adj_factor`, `adj_factor_etf`, `financials`, `instruments`, `instruments_index`, `instruments_etf`, `instruments_ext`, `kline_ext`, `pools`, `backtest_results`, `screener_results`, `ai_cache`, `user_data`, `depth5`, plus five financial subdirs (`metrics`, `income`, `balance_sheet`, `cash_flow`, `shares`).

### Parquet → DuckDB views (`_register_views`, lines 189-246)

Every view is `CREATE OR REPLACE VIEW ... AS SELECT * FROM read_parquet('<dir>/**/*.parquet', union_by_name=true)`. Representative pair (lines 193-196):

```sql
CREATE OR REPLACE VIEW kline_daily AS
    SELECT * FROM read_parquet('{d}/kline_daily/**/*.parquet', union_by_name=true)
CREATE OR REPLACE VIEW kline_enriched AS
    SELECT * FROM read_parquet('{d}/kline_daily_enriched/**/*.parquet', union_by_name=true)
```

Registration failures (empty dir / permission) are swallowed to `debug` log so startup never blocks (lines 238-245). A second pass `_register_unified_views` (lines 251-330) builds cross-asset views `kline_daily_all`, `kline_enriched_all`, `kline_minute_all`, `instruments_all` by `UNION ALL BY NAME` when the backing parquet exists, adding literal columns `asset_type` (`'stock'|'index'|'etf'`) and `source` (`'tickflow'`).

### View / table names and column sets

The `kline_daily` view = parquet files written from the provider-normalized daily schema. Canonical column list is in `backend/app/data_providers/schemas.py` (lines 4-7):

```python
DAILY_COLUMNS = [
    "symbol", "asset_type", "source", "date", "open", "high", "low", "close",
    "volume", "amount", "pre_close", "change_pct",
]
```

Other normalized schemas in the same file:

```python
ADJ_FACTOR_COLUMNS    = ["symbol", "asset_type", "source", "trade_date", "ex_factor"]      # line 9
INSTRUMENT_COLUMNS    = ["symbol", "name", "exchange", "asset_type", "source", "list_date", "status"]  # line 11-13
MINUTE_COLUMNS        = ["symbol", "asset_type", "source", "datetime", "open", "high", "low", "close", "volume", "amount", "freq"]  # line 15-18
```

**`kline_enriched` (narrow table on disk)** stores only the base columns — see §4. On-disk layout is Hive-style partitioned by date: `kline_daily_enriched/date=YYYY-MM-DD/part.parquet` (see `_refresh_enriched_impl`, lines 571-574: `enriched_dir / f"date={ds}" / "part.parquet"`).

### Polars is the hot path; DuckDB is only cold / ad-hoc SQL

The module docstring (lines 3-6) states the layering: *DuckDB views for cold queries (stats, metadata, user-defined SQL); Polars caches for hot paths (enriched latest ~5500 rows + instruments ~5500 rows); Polars `scan_parquet` for minute/historical daily with predicate pushdown.* `KlineRepository` (line 333) holds Polars in-memory caches (`_enriched_cache`, `_live_agg_cache`, `_enriched_history_cache` ~1M rows, `_instruments_cache`, etc., lines 344-389). All DuckDB reads are thread-safe through a lock:

```python
# lines 391-398
def execute_all(self, sql: str, params: list | None = None) -> list[tuple]:
    """线程安全的 SELECT → fetchall。DuckDB 单 connection 非线程安全，所有读路径须走此方法。"""
    with self._lock:
        cursor = self.db.cursor()
        try:
            return cursor.execute(sql, params or []).fetchall()
        finally:
            cursor.close()
```

Writes to parquet go through Polars + `replace_with_retry` (lines 42-66, Windows reader-lock retry). Enriched re-computation is offloaded to a daemon warmup thread on startup (`_start_enriched_warmup`, lines 459-493).

---

## 2. Data provider contract — `backend/app/data_providers/base.py`

Uses **`typing.Protocol`** (structural typing, **not** ABC). `ProviderCapabilities` is a frozen dataclass of booleans (lines 19-27):

```python
@dataclass(frozen=True)
class ProviderCapabilities:
    instruments: bool = False
    daily: bool = False
    adj_factor: bool = False
    minute: bool = False
    realtime: bool = False
    depth5: bool = False
    financial: bool = False
```

`MarketDataProvider` Protocol (lines 30-79). Method signatures and documented return shapes (all return **normalized Polars DataFrames**):

```python
class MarketDataProvider(Protocol):
    name: str
    capabilities: ProviderCapabilities

    def get_instruments(self, asset_type: AssetType) -> pl.DataFrame: ...   # symbol/name/code/exchange/asset_type/source
    def get_daily(self, symbols, start_time, end_time, asset_type) -> pl.DataFrame: ...   # normalized daily K rows
    def get_adj_factors(self, symbols, start_time, end_time, asset_type) -> pl.DataFrame: ...  # symbol/trade_date/ex_factor
    def get_minute(self, symbols, start_time, end_time, asset_type, freq="1m",
                   on_chunk_done: Callable[[int, int], None] | None = None) -> pl.DataFrame: ...
    def get_realtime(self, universes=None, symbols=None) -> pl.DataFrame: ...
    def get_depth_batch(self, symbols: list[str]) -> dict[str, dict]: ...   # five-level order books keyed by symbol
```

`AssetType = Literal["stock", "index", "etf"]` (line 16). `get_depth_batch`, `get_realtime`, `get_minute` may return empty. The `on_chunk_done` 2-arg contract is wrapped into the 3-arg `seg_label` form in `kline_sync._try_custom_minute`, not in the provider layer (lines 66-68).

---

## 3. Capability registry — `backend/app/data_providers/capabilities.py`

`CAPABILITY_REGISTRY` (lines 28-89) is a list of dicts; single authoritative source mapping a capability id → dataset, display metadata, routing preference field, and TickFlow tier. Intent (module docstring): *capability = one standardized dataset* (`daily / adj_factor / realtime / minute / depth5 / financial / full_minute`).

```python
CAPABILITY_REGISTRY: list[dict] = [
    {"id": "daily",       "label": "日K",     "field": "daily_data_provider",       "default": "tickflow", "tf_tier": "none"},
    {"id": "adj_factor",  "label": "除权因子", "field": "adj_factor_provider",       "default": "tickflow", "tf_tier": "starter"},
    {"id": "realtime",    "label": "实时行情", "field": "realtime_data_provider",    "default": "tickflow", "tf_tier": "starter"},
    {"id": "minute",      "label": "分钟K",   "field": "minute_data_provider",      "default": "tickflow", "tf_tier": "pro"},
    {"id": "depth5",      "label": "五档盘口", "field": "depth5_data_provider",      "default": "tickflow", "tf_tier": "pro"},
    {"id": "financial",   "label": "财务数据", "field": "financial_data_provider",   "default": "tickflow", "tf_tier": "expert"},
    {"id": "full_minute", "label": "全量分钟", "field": "full_minute_data_provider", "default": "tickflow", "tf_tier": "expert"},
]
```

**(line 100-101) tier rank for fail-closed gating:** `_TIER_RANK = {"none": -1, "free": 0, "starter": 1, "pro": 2, "expert": 3}`.

### Routing

```python
# line 146
def build_capability_matrix(current: dict[str, str], tickflow_tier: str = "none") -> dict:
```

Each capability independently routes (no "follow daily" coupling — line 44-46). `_declared_sources()` (lines 112-134) merges plugin + custom data-source capability declarations (`custom_sources.list_plugins()` / `list_sources()`, each exposing a `datasets` set). Output per capability: `{id,label,desc,field,default,tf_tier,tf_available,usable,current,current_display,effective,effective_display,candidates,pending}` (lines 184-199). Semantics:
- `candidates` = sources that actually deliver the capability *now* (TickFlow filtered by tier; plugins/custom filtered by availability).
- `pending` = registered but not ready (missing deps / unconfigured key), with reason.
- `usable` = whether the *effective* (currently routed) source is in `candidates`. Feature **gating everywhere uses `usable`**, not the TickFlow plan view (lines 18-21).

So: capability → dataset → source routing is a single declarative matrix, driven jointly by the registry, per-provider `datasets` declarations, the preference map, and the active TickFlow tier.

---

## 4. Indicator pipeline — `backend/app/indicators/pipeline.py`

### The stored base columns of the enriched narrow table

`ENRICHED_STORAGE_COLS` (lines 93-103). Note: the surrounding comments say "14 列" but the list now actually has **15 entries** — `quote_ts` was added later and the count comment is stale:

```python
# enriched parquet 仅存储的列 (14 列)   ← comment still says 14
ENRICHED_STORAGE_COLS = [
    "symbol", "date",
    "open", "high", "low", "close",          # 前复权 (forward-adjusted)
    "volume", "amount",
    "raw_close", "raw_high", "raw_low",       # 不复权原始价 (unadjusted)
    "turnover_rate",                          # depends on float_shares, not recomputable
    "consecutive_limit_ups",                  # recursive state
    "consecutive_limit_downs",
    "quote_ts",                               # market timestamp (ms)
]
```

The **complete** column vocabulary (storage + runtime-derived + signals + join) is documented in `ENRICHED_COLUMNS` (lines 111-205) and grouped in `ENRICHED_COLUMNS_BY_CATEGORY` (lines 208-225): basic (`prev_close/change_pct/change_amount/amplitude`), ma5/10/20/30/60, ema5/10/20/30/60, macd (`dif/dea/hist`), boll (`upper/lower`), kdj (`k/d/j`), `atr_14`, volume (`vol_ma5/vol_ma10/vol_ratio_5d`), extremes (`high_60d/low_60d`), momentum 5/10/20/30/60d, deviation (`deviate_3d/10d/30d` — attached at read time, not persisted), `annual_vol_20d`, rsi_6/14/24, ~15 boolean `signal_*` columns, and join columns (`name/total_shares/float_shares`).

### How the ~derived indicators are computed on the fly

Pure Polars expressions; `compute_indicators` takes raw OHLCV → returns a DataFrame with all indicator columns; `needed: set[str] | None` prunes to a dependency closure (`_resolve_needed` + `_INDICATOR_DEPS`, lines 317-362). Pipeline entry points / function names:

- `compute_indicators(df, needed=None, *, assume_sorted=False)` — line 365. MA/EMA/BOLL/KDJ/ATR/vol/momentum/volatility/RSI in print passes 1-6.
- `compute_signals(df, needed)` — line 622. Atomic boolean `signal_*` columns (crossovers, breakouts, n-day high/low, volume surge ≥2.0); also injects custom signals (`custom_signals`).
- `compute_limit_signals(df, instruments, needed, historical_shares)` — line 689. `signal_limit_up/down`, `consecutive_limit_ups/downs`, `signal_limit_down_recovery` (跌停翘板), `signal_broken_limit_up` (炸板), `turnover_rate`.
- `compute_all(df, instruments, historical_shares)` — line 963. One-shot `compute_indicators` → `compute_signals` → `compute_limit_signals`, then NaN/Inf → null.
- `compute_enriched(raw, factors, instruments, historical_shares)` — line 1012. Pipeline entry: halt-day filter → snapshot raw prices → `_apply_adj_factor` (forward adjust) → `compute_all`.
- `compute_enriched_history_window(...)`, `compute_enriched_today(...)` — referenced from repository for windowed/batched recompute and live intraday recursion.
- `filter_halt_days(df)` — line 991. Drops days where `(open==0)&(high==0)` or `(volume==0)&(amount==0)`.
- `_apply_adj_factor(raw, factors)` — line 242. Forward-adjustment via `cum_prod` of `ex_factor` per symbol (`adj_factor` = `close/raw_close` at read time).

Adj-adjustment semantics (lines 246-252): *adjusted = raw / (product of all `ex_factor` events after that date)*; `ex_factor` is per-event (pre/post ratio), non-cumulative. Limit/eX-signal prices use integer arithmetic to avoid float drift (`polars_limit_price`), with authoritative `limit_up/limit_down` from the instruments dimension table when `as_of == date`.

---

## 5. Backend extension mechanism — `backend/app/extensions/`

### `BACKEND_EXTENSION_API_VERSION` (contracts.py line 9)

```python
BACKEND_EXTENSION_API_VERSION = 1
```

### `BackendExtensionRegistrar` (registry.py lines 28-49)

API version check is enforced on every `register()` against the registry's own bound `api_version` (registry.py lines 78-82):

```python
class BackendExtensionRegistrar:
    """Staging area: a failed setup is discarded without partial registration."""
    def __init__(self, extension_id: str, *, api_version: int) -> None:
        self.extension_id = extension_id
        self.api_version = api_version
        self.routers: list[APIRouter] = []
        self.notification_formatters: list[tuple[str, NotificationFormatter, int]] = []

    def include_router(self, router: APIRouter) -> None:
        if not isinstance(router, APIRouter):
            raise TypeError("router must be fastapi.APIRouter")
        self.routers.append(router)

    def register_notification_formatter(self, implementation_id, formatter, *, order=100):
        self.notification_formatters.append((implementation_id, formatter, order))
```

### Registry + loading (`BackendExtensionRegistry` lines 52-134; `loader.py` lines 36-64)

Registration validates ids (`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`), API version, and duplicate ids before mutation; `freeze()` (line 108) sorts formatters by `(order, implementation_id)` and locks the registry. Discovered modules come from `app.custom` via `pkgutil.iter_modules` (`loader.py` `_custom_module_names`, lines 24-33); each must define `EXTENSION_ID`, `EXTENSION_API_VERSION`, and a `setup(registrar)` callable. Router conflicts against core routes are rejected (`_validate_router_conflicts` lines 67-86). Post-core `startup(context)` hooks run via `start_backend_extensions` (lines 89-103) with an `ExtensionContext(api_version, data_dir, repository)`.

### Implemented vs planned-but-unimplemented inheritance points

- **Actually implemented**: `include_router` (arbitrary FastAPI routers → included into the app at startup) and `register_notification_formatter` (custom `NotificationFormatter` subclasses, `abc.ABC` base with abstract `format_message`). This is **the only** real extension surface.
- **Declared but effectively read-only/structural (planned direction)**: `RepositoryAccess` is a `Protocol` exposing only `get_name_map()` (contracts.py lines 12-15) — a minimal, read-oriented repository surface handed to extensions, not a full data/plugin API. There is no implemented hook for pre/post data transformation, no custom data-provider registration in `extensions` (that lives separately in `data_providers/custom`/`plugins`), and no generic "hook" list — `BackendExtensionRegistrar` has only `routers` and `notification_formatters`.

Note the two plugin systems are **distinct**: `app/extensions/` = in-repo FastAPI + notification customization; `app/data_providers/custom/` + `app/plugins/` = data-source plugins. Keep them separate in the new design.

---

## 6. Frontend extension slots — `frontend/src/extensions/`

### `FrontendSlotContextMap` (types.ts lines 6-26) and the 3 implemented slots

`FRONTEND_EXTENSION_API_VERSION = 1` (line 4).

```ts
export interface FrontendSlotContextMap {
  'layout.navigation.extra': { collapsed: boolean; pathname: string }
  /** 个股详情对话框底部扩展区 (日K/分时图表下方) */
  'stock-preview.footer': { symbol: string; name: string | null; view: 'daily' | 'intraday' }
  /** 自选页工具栏扩展区 (按钮行末尾) */
  'watchlist.toolbar': {
    symbols: string[]; viewMode: 'table' | 'card'; selectedGroup: string
    refresh: () => void   // 刷新自选增强数据 (扩展修改数据后调用)
  }
}
```

Slot registration type (lines 30-35): `FrontendSlotRegistration<K> = { name: K; id: string; order?: number; component: ComponentType<Context[K]> }`. Extensions may also add whole-page `routes` (`path: \`/${string}\``, static paths only) and `navigation` items (types.ts lines 37-50).

### Loading (`bootstrap.ts` lines 4-10)

```ts
const modules = import.meta.glob<FrontendExtensionModule>('../custom/*/extension.tsx')
export async function initializeFrontendExtensions() {
  await loadFrontendExtensions(modules)
}
```

Vite glob loads every `src/custom/<ns>/extension.tsx`; each must `default`-export a `FrontendExtension { id, apiVersion, routes?, navigation?, slots? }`. `registry.ts` enforces id format, API-version, duplicate-id, duplicate-path conflicts, and (at `finalizeFrontendExtensions`) that routes are static and don't collide with core routes (registry.ts lines 110-141). Slot components are sorted by `order ?? 100`.

### Rendering & error isolation (`ExtensionBoundary.tsx`, `ExtensionSlot.tsx`)

`ExtensionSlot` renders each registration wrapped in an `ExtensionBoundary` (ExtensionSlot.tsx lines 14-25). `ExtensionBoundary` is a React error boundary: `getDerivedStateFromError` sets `failed=true`; on failure renders null when `compact`, else a muted danger banner "扩展 {id} 暂时不可用" and logs to console (ExtensionBoundary.tsx lines 13-32). A failing extension never crashes the host page.

---

## 7. Custom data source loading — `backend/app/data_providers/custom/loader.py`

### Two scanned locations

- **User data dir** `data/data_sources/*.yaml` / `*.yml` — `load_all` (lines 47-72) globs, parses via `CustomSourceConfig`, instantiates `GenericHTTPProvider`, calls `provider.validate()`, and registers into `_PROVIDERS[name]`; load failures are recorded in `_LOAD_ERRORS` without aborting.
- **Built-in plugins** `backend/app/plugins/*/plugin.yaml` — `_load_builtin_plugins` (lines 532-553) iterates plugin subdirs; each manifest must have `name` (+ optional `hidden`); calls the manifest's `check` function (`_call_check`, lines 598-613), and if available dynamically imports the `entry` (`module.path:attr`, `_load_entry` lines 616-622) and registers the provider with `builtin=True`. Missing deps → recorded as unavailable in `_PLUGIN_STATUS`, never crash. Optional dependency install/uninstall via `install_plugin/uninstall_plugin` (npm for `runtime: node`, pip/uv for `python`).

### `get_provider` return (lines 298-302)

```python
def get_provider(name: str) -> GenericHTTPProvider:
    provider = _PROVIDERS.get((name or "").lower())
    if provider is None:
        raise ValueError(f"Custom data source not found or invalid: {name}")
    return provider
```

So **all** providers (user YAML + active plugins) are instances of `GenericHTTPProvider` exposing the `MarketDataProvider` method set; the `GenericHTTPProvider` maps each configured dataset URL/field_map/transforms into the normalized schemas from §1/§2.

### Example manifest structure — `backend/app/plugins/fuyao/plugin.yaml`

```yaml
name: fuyao
display_name: "fuyao"
runtime: none                       # none | node | python
entry: app.plugins.fuyao.provider:FuyaoProvider   # "module.path:ProviderClass"
check: app.plugins.fuyao.provider:availability    # "module.path:func" returning bool|(bool,reason)
datasets: [realtime, daily, adj_factor, financial, minute]
api_key_env: FUYAO_API_KEY          # declared => settings page shows a Key input (probe-before-store)
description: "..."
install_hint: "..."
homepage: "https://fuyao.aicubes.cn"
```
(`stocksdk/plugin.yaml` is the `runtime: node` variant — same fields, `datasets: [daily, adj_factor, minute, realtime]`.)

### YAML custom source per-dataset shape

`CustomSourceConfig` / `DatasetConfig` (custom/config.py lines 23-51). Each dataset dict supports: `url`, `method` (default GET), `batch`, `rpm`, `timeout` (30 default, ≤300), `response_path` (JSON pointer into response), `field_map` (source→canonical field), `transforms`, `params`, `body`, `symbols_param`, `start_param` (default `start_time`), `end_param` (default `end_time`), and for `minute`: `asset_type_param`, `freq_param`; for `realtime`: `pct_unit` (`percent`|`decimal`). Global section: `name`, `display_name`, `auth: {type: none|bearer|header|query, token_env, header, param}`. Duplicate request-param names are rejected (loader.py lines 509-524). Allowed dataset keys: `daily, adj_factor, realtime, minute, full_minute, financial` (loader.py line 427).

---

## 8. Domain feature set (routes from `frontend/src/router.tsx`, services from `backend/app/`)

| Domain | One-line description | Main service (`backend/app/services/…`) | Frontend route |
|---|---|---|---|
| Dashboard / overview | Market overview + dimension leaders / market recap | `market_overview_builder.py`, `market_mainline.py`, `market_phase.py` | `/` (index; legacy `/overview` → `/`) |
| Watchlist | User stock watchlist groups, enriched join, OCR/CSV import | `watchlist.py`, `watchlist_csv.py`, `watchlist_ocr/` | `/watchlist` |
| Screener | Multi-factor stock screening (builtin params, ETF, JIT turnover) | `screener.py` | `/screener` |
| Factors | Factor library, DSL editor, factor backtests + mining tab | `factors/` (`registry.py`, `dsl.py`, `store.py`, `ext_factors.py`), `backtest/factor.py`, `backtest/mining*.py` | `/factors` (`/mining` → redirect) |
| Backtest | Strategy simulation engine (portfolio/cost model, Numba runtime, minute replay, walkforward, optimizer) | `backtest.py`, `backtest/engine.py`, `backtest/worker.py` | `/backtest` |
| Stock analysis | Per-stock deep dive (analysis detail/menus) | `stock_analyzer.py`, `stock_reports.py`, `analysis_menus` | `/analysis/:menuId`, `/stock-analysis` |
| Limit ladder | 连板梯队 — limit-up tier ladder with sealed boards / order-book seals | `depth_service.py`, `price_limits.py`, `abnormal` infra | `/limit-ladder` |
| Concept / Industry analysis | Concept & industry rotation / leader analysis | `concept_rotation_analyzer.py`, `sector_monitor.py`, `sector_rotation.py`, `rps_rotation.py` | `/concept-analysis`, `/industry-analysis` |
| Financials | Financial metrics & 3 statements sync/analysis | `financial_sync.py`, `financial_analyzer.py`, `share_capital.py` | `/financials` |
| Monitor | Intraday monitor rules, signals, alerts, notifications | `strategy/monitor*.py`, `monitor_rules.py`, `alert_store.py`, `notify_adapter.py`, `wecom_bot_service.py`, `webhook_adapter.py` | `/monitor` |
| Regime | Market regime detection & history | `regime_builder.py`, `market_phase.py` | `/regime` |
| Abnormal moves | Abnormal price-move detection & reports | `abnormal_moves.py`, `auction_benchmark.py`, `dragon_tiger.py` | `/abnormal` |
| Lots | Order / block-lot analysis (strategy.lots) | `strategy/lots.py`, `api/lots.py` | `/lots` |
| Signals | Strategy signal catalog / custom signals | `strategy/signals`, `custom_signals*.py`, `strategy/builtin/*.py` | `/signals` |
| Review | Market recap / review reports | `market_recap.py`, `market_recap_reports.py`, `stock_reports.py` | `/review` |
| Indices | Index data & comparison | `index_sync.py`, `quote_service.py`, `api/indices.py` | `/indices` |
| Data mgmt | Data pipeline status, sync, settings, external data import | `kline_sync.py`, `instrument_sync.py`, `data_integrity.py`, `ext_data.py`, `ext_pull.py`, `pipeline_jobs.py`, `daily_pipeline.py` | `/data`, `/settings` |

Also: `/onboarding`, `/login`, `/dev` (hidden dev tools), and the settings sub-tabs `/settings` (data-sources, ai, queries, ext-pages) which host key/data-source configuration (ext-pages = dynamically generated external dataset pages, `settings/ExtPages.tsx`).

---

## Data & capability contracts I copied (highest-value reusable contracts for a DuckDB-based plugin-driven app)

1. **Provider interface (Protocol, not ABC)** — `data_providers/base.py:30-79`: `MarketDataProvider` with `name`, `capabilities: ProviderCapabilities`, and `get_instruments/get_daily/get_adj_factors/get_minute/get_realtime/get_depth_batch`, all returning **normalized Polars DataFrames** using the exact schema column lists in `data_providers/schemas.py` (`DAILY_COLUMNS`, `ADJ_FACTOR_COLUMNS`, `INSTRUMENT_COLUMNS`, `MINUTE_COLUMNS`). `AssetType = Literal["stock","index","etf"]`. Adopt this verbatim: output-normalized providers make storage/indicators/backtests source-agnostic.

2. **Capability model & matrix** — `data_providers/capabilities.py`: `ProviderCapabilities` frozen dataclass (`daily/adj_factor/minute/realtime/depth5/financial`), plus the registry→routing pattern: `CAPABILITY_REGISTRY` (id → dataset, field, default, `tf_tier`) combined with per-source `datasets` declarations in `build_capability_matrix(current, tier)` producing per-capability `{usable, effective, candidates, pending}`. `usable` (not tier) is the universal feature gate. Reuse as-is for plugin capability declaration + routing + UI gating.

3. **Storage view schema (read-model over Parquet, in-memory DuckDB)** — `tickflow/repository.py:85-246`: single `DataStore` with `duckdb.connect(database=":memory:")` (never a `.duckdb` file), registering `CREATE OR REPLACE VIEW <name> AS SELECT * FROM read_parquet('<dir>/**/*.parquet', union_by_name=true)` per dataset, plus unified cross-asset views with `asset_type`/`source` literal columns via `UNION ALL BY NAME`. Pair with Polars caches for the hot path and `scan_parquet` predicate pushdown for wide/historical reads; guard single-connection DuckDB with a lock (`execute_all`).

4. **Narrow enriched schema + pure on-the-fly derivations** — `indicators/pipeline.py:93-103`: persist only the base `ENRICHED_STORAGE_COLS` (symbol, date, adjusted OHLC, volume, amount, raw_close/high/low, turnover_rate, consecutive_limit_ups/downs, quote_ts) partitioned by `date=`; compute the ~40 indicator + signal columns lazily with pure Polars expressions gated by a `needed: set[str]` dependency closure (`compute_indicators/compute_signals/compute_limit_signals/compute_enriched`). Cheap-to-store, recompute-on-read is the key scaling trick.

5. **Backend extension registrar (router + formatter two-slot API)** — `extensions/registry.py:28-49` + `extensions/contracts.py`: `BACKEND_EXTENSION_API_VERSION=1`, staged `BackendExtensionRegistrar` with `include_router` and `register_notification_formatter`, hash-id validation, version + duplicate checks, freeze-once semantics, discovered from `app.custom/*` modules exporting `EXTENSION_ID/EXTENSION_API_VERSION/setup(registrar)`.

6. **Frontend slot model (typed context map + error boundary)** — `frontend/src/extensions/`: `FRONTEND_EXTENSION_API_VERSION=1`; `FrontendSlotContextMap` maps slot name → `{...context, ...actions}` (`refresh()` mutation callback is the pattern); `FrontendSlotRegistration = {name,id,order?,component}`; Vite `import.meta.glob('../custom/*/extension.tsx')`; finalization rejects non-static/duplicate/core-colliding routes; every slot/runtime render is wrapped in an `ExtensionBoundary` error boundary so a bad plugin can't take down the page.

7. **Data-source plugin manifest contract** — `data_providers/custom/loader.py` + `plugins/*/plugin.yaml`: plugin = `{name, display_name, runtime: none|node|python, entry: "pkg.mod:ProviderClass", check: "pkg.mod:func", datasets: [...], api_key_env, description, install_hint, homepage}`; user custom source = YAML in `data/data_sources/` mapping each dataset to `{url, method, batch, rpm, timeout, response_path, field_map, transforms, symbols_param/start_param/end_param, ...}`. Both collapse into a single `GenericHTTPProvider` that normalizes to the §1 provider schemas.