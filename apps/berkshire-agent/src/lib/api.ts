/**
 * webview ←→ Rust 桥的薄客户端：包装有消费者的 Tauri command + 订阅 `sidecar://*` 事件。
 *
 * 当前包装的命令为 `capabilities_list`/`client_list`/`routes_list`；订阅 Rust 侧透传的 Tauri event
 * （`sidecar://capabilities/changed`、`sidecar://client/changed`）。T2 命令面中的 `notify_send`/`log_list`
 * （支撑 `ctx.notifier`/`ctx.log`）与 `capabilities_usable` 目前无 webview 消费者，薄客户端不包装
 * （Rust 侧命令面保持完整，需用时再按同一模板补包装——此前 T3 demo 面板消费它们，随宿主 demo 清理移除）。
 *
 * 跨边界 payload 用品牌 id：`CapabilityId` 镜像 @berkshire/core 的 brand（为避免把 core
 * 拉进 webview 的类型图，这里本地复刻同样的 Branded 结构；真正的生态落地在 v2 共享类型层）。
 * 所有 invoke 外包一个超时：bridge 断/慢 → 显式 reject（fail-closed），不静默挂起。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** 品牌 id 基础结构（镜像 @berkshire/core 的 Branded）。 */
type Branded<T, S extends string> = T & { readonly __brand: S };
/** 能力 id：跨边界 opaque，禁止凭字符串格式猜类型。 */
export type CapabilityId = Branded<string, "capability">;
/** client 模块 id：跨边界 opaque（镜像 @berkshire/core 的 ClientModuleId）。 */
export type ClientModuleId = Branded<string, "client-module">;
/** 存储命名空间 id：跨边界 opaque（镜像 @berkshire/core 的 StorageNamespaceId）。 */
export type StorageNamespaceId = Branded<string, "storage-namespace">;

export interface Capability {
  id: CapabilityId;
  label: string;
  usable: boolean;
}

export interface CapabilitiesChangedEvent {
  capability: CapabilityId;
  usable: boolean;
}

/**
 * client 插件图快照项（T1→M3：slot → 可动态 import 的 client 入口）。
 * `url` 为插件自报的 client 入口 ESM URL（宿主经 `to_bk_url`（Rust bridge.rs）规范化成 `bk://` 供运行时
 * `import()`），`exportName` 指出从该入口取哪个具名导出作为组件/页面（缺省 default）。宿主零硬编码。
 */
export interface ClientModule {
  id: ClientModuleId;
  slot: string;
  url: string;
  exportName?: string;
  style?: string;
}

export interface ClientChangedEvent {
  kind: "slots" | "clientModules";
}

/** 动态路由/导航项（路由契约化：插件自声明，任意 slot 的 `route`；含 slot 归属 → 页面渲染槽）。
 *  `order` 为 sidecar 已按 `order ?? 100` 排好的声明序（base-ui 侧边栏据此排布，用户覆盖待 v-next）。 */
export interface RouteEntry {
  id: string;
  order: number;
  title: string;
  path: string;
  slot: string;
}

const DEFAULT_TIMEOUT_MS = 4000;

function withTimeout<T>(p: Promise<T>, what: string, ms: number = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`bridge 超时（${what}）`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function capabilitiesList(): Promise<Capability[]> {
  return withTimeout(invoke<Capability[]>("capabilities_list"), "capabilities_list");
}

/** 拉取 client 插件图快照（T1：`client/list` → ClientModuleHost 挂载）。 */
export function clientList(): Promise<ClientModule[]> {
  return withTimeout(invoke<ClientModule[]>("client_list"), "client_list");
}

/** 拉取动态路由/导航快照（路由契约化：`routes/list` → 导航 + 路由）。 */
export function routesList(): Promise<RouteEntry[]> {
  return withTimeout(invoke<RouteEntry[]>("routes_list"), "routes_list");
}

/** 首启供给：sidecar 是否处于「待供给」阶段（$BK_HOME/cordis.yml 尚未落盘）。 */
export function provisioningStatus(): Promise<boolean> {
  return withTimeout(invoke<boolean>("provisioning_status"), "provisioning_status");
}

/** 首启供给：把 user 选择的完整 cordis.yml 文本写入 $BK_HOME 并重启 sidecar 进入 ready。 */
export function provisionBkHome(cordisYml: string): Promise<void> {
  return withTimeout(invoke<void>("provision_bk_home", { cordisYml }), "provision_bk_home");
}

/** 订阅 sidecar 透传的 `client/changed` 事件；返回退订函数。 */
export function onClientChanged(cb: (payload: ClientChangedEvent) => void): Promise<() => void> {
  return listen<ClientChangedEvent>("sidecar://client/changed", (e) =>
    cb(e.payload),
  ).then((unlisten) => unlisten);
}

/** 订阅 sidecar 透传的 `capabilities/changed` 事件；返回退订函数。 */
export function onCapabilitiesChanged(
  cb: (payload: CapabilitiesChangedEvent) => void,
): Promise<() => void> {
  return listen<CapabilitiesChangedEvent>("sidecar://capabilities/changed", (e) =>
    cb(e.payload),
  ).then((unlisten) => unlisten);
}

// ---- `$BK_HOME` 轻量持久化（WP-2 能力缝：storage_get/set/remove/list + storage/changed）----

/** `storage/set` / `storage/remove` 事件载荷（经 sidecar：`storage/changed` → Rust → webview）。 */
export interface StorageChangedEvent {
  ns: StorageNamespaceId;
  key: string;
}

/** 读一个键：缺失返回 `null`（sidecar 归一化）；坏文件/越权 fail-closed（invoke reject）。 */
export function storageGet<T = unknown>(
  ns: StorageNamespaceId,
  key: string,
): Promise<T | null> {
  return withTimeout(invoke<T | null>("storage_get", { ns: String(ns), key }), "storage_get");
}

/** 写一个键（JSON 序列化 + 原子改名写；成功即持久化）。 */
export function storageSet(ns: StorageNamespaceId, key: string, value: unknown): Promise<void> {
  return withTimeout(invoke<void>("storage_set", { ns: String(ns), key, value }), "storage_set");
}

/** 删除一个键（缺失视为成功 no-op）。 */
export function storageRemove(ns: StorageNamespaceId, key: string): Promise<void> {
  return withTimeout(
    invoke<void>("storage_remove", { ns: String(ns), key }),
    "storage_remove",
  );
}

/** 列出某命名空间下全部键名。 */
export function storageList(ns: StorageNamespaceId): Promise<string[]> {
  return withTimeout(
    invoke<string[]>("storage_list", { ns: String(ns) }),
    "storage_list",
  );
}

/** 订阅 sidecar 透传的 `storage/changed` 事件（set/remove 后触发）；返回退订函数。 */
export function onStorageChanged(
  cb: (payload: StorageChangedEvent) => void,
): Promise<() => void> {
  return listen<StorageChangedEvent>("sidecar://storage/changed", (e) =>
    cb(e.payload),
  ).then((unlisten) => unlisten);
}

// ---- 数据源能力缝（data-sources/* + database/tables）：数据管理页 + 同步编排 ----
// 快照载荷与 `@berkshire/ui-slots` 的 DataManagementApi DTO 结构镜像（见
// `packages/ui-slots/src/types.ts`；宿主不依赖 core，跨包用结构对齐）。

/** 一个 provider 对某 dataset 的可用性（不可用带原因，fail-closed 展示面）。 */
export interface DataSourceAvailabilityDto {
  available: boolean;
  reason?: string;
}

/** `data-sources/list` 快照里的一个 provider 项。 */
export interface DataSourceProviderDto {
  id: string;
  label: string;
  datasets: Record<string, DataSourceAvailabilityDto>;
}

/** 内置 dataset 声明（materialization: embedded 内嵌物化；parquet-view 仍目标态）。 */
export interface DataManagementDatasetDto {
  id: string;
  label: string;
  materialization: string;
  columns: string[];
  sync?: { window?: string };
}

/** 本地库内嵌表（名称 + 行数）。 */
export interface DataManagementTableDto {
  name: string;
  rowCount: number;
}

/** `data-sources/list` 主快照（providers + datasets + 当前路由）。 */
export interface DataSourcesSnapshot {
  providers: DataSourceProviderDto[];
  datasets: DataManagementDatasetDto[];
  /** dataset → 当前实际路由到的 provider（无候选/未配置 → null）。 */
  resolved: Record<string, string | null>;
}

/** 一次同步（采集）的结果（`database/dataset-updated` 载荷同形）。 */
export interface DataManagementSyncResultDto {
  dataset: string;
  rows: number;
  at: number;
}

/** 拉取数据源主快照（`data-sources/list`）。 */
export function dataSourcesList(): Promise<DataSourcesSnapshot> {
  return withTimeout(invoke<DataSourcesSnapshot>("data_sources_list"), "data_sources_list");
}

/** 切换某数据集的路由偏好（校验候选；非法组合响亮失败）。 */
export function dataSourcesSetPreference(dataset: string, provider: string): Promise<void> {
  return withTimeout(
    invoke<void>("data_sources_set_preference", { dataset, provider }),
    "data_sources_set_preference",
  );
}

/** 实探一个 provider 的凭据（只探不存，供校验）。 */
export function dataSourcesProbe(
  providerId: string,
  apiKey?: string,
): Promise<{ ok: boolean; reason?: string }> {
  return withTimeout(
    invoke<{ ok: boolean; reason?: string }>("data_sources_probe", {
      provider: providerId,
      apiKey,
    }),
    "data_sources_probe",
  );
}

/** 触发一次数据集采集（整表替换语义；`params` 透传给 provider）。 */
export function dataSourcesSync(
  dataset: string,
  params?: Record<string, unknown>,
): Promise<DataManagementSyncResultDto> {
  return withTimeout(
    invoke<DataManagementSyncResultDto>("data_sources_sync", { dataset, params }),
    "data_sources_sync",
  );
}

/** 本地库内嵌表清单（`database/tables`：名称 + 行数）。 */
export function databaseTables(): Promise<DataManagementTableDto[]> {
  return withTimeout(invoke<DataManagementTableDto[]>("database_tables"), "database_tables");
}

/** 订阅 sidecar 透传的 `database/dataset-updated` 事件（落库完成后触发）；返回退订函数。 */
export function onDatabaseUpdated(
  cb: (payload: DataManagementSyncResultDto) => void,
): Promise<() => void> {
  return listen<DataManagementSyncResultDto>("sidecar://database/dataset-updated", (e) =>
    cb(e.payload),
  ).then((unlisten) => unlisten);
}

// ---- WP-5：自绘标题栏窗口控制（Rust command 面，聚焦 Windows）----
// 经 `tauri.conf.json` 的 `decorations:false` 去除原生标题栏后，webview 自绘标题栏据此调用窗口命令。
// 这些命令不经过 sidecar（窗口级操作），仍经 `invoke` 直连 Rust。

/** 最小化主窗口。 */
export function windowMinimize(): Promise<void> {
  return withTimeout(invoke<void>("window_minimize"), "window_minimize");
}

/** 最大化/还原主窗口；resolve 出切换后的最大化态（供按钮图标/aria-label 同步）。 */
export function windowToggleMaximize(): Promise<boolean> {
  return withTimeout(invoke<boolean>("window_toggle_maximize"), "window_toggle_maximize");
}

/** 关闭主窗口。 */
export function windowClose(): Promise<void> {
  return withTimeout(invoke<void>("window_close"), "window_close");
}

/** 查询主窗口当前是否最大化。 */
export function windowIsMaximized(): Promise<boolean> {
  return withTimeout(invoke<boolean>("window_is_maximized"), "window_is_maximized");
}

/** 取主窗口实际标题（Rust 侧从 `tauri.conf.json` 读，单一真源），供自绘标题栏展示。 */
export function windowTitle(): Promise<string> {
  return withTimeout(invoke<string>("window_title"), "window_title");
}

/** 订阅主窗口 resize（含最大化/还原）事件；最大化态变化据此重查。返回退订函数。 */
export function onWindowResized(cb: () => void): Promise<() => void> {
  return listen<unknown>("tauri://resize", () => cb()).then((unlisten) => unlisten);
}
