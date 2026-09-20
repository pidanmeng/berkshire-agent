/**
 * webview ←→ Rust 桥的薄客户端：包装有消费者的 Tauri command + 订阅 `sidecar://*` 事件。
 *
 * 当前包装的命令为 `capabilities_list`/`notify_send`/`log_list`/`client_list`/`routes_list`；
 * 订阅 Rust 侧透传的 Tauri event（`sidecar://notify/request`、`sidecar://capabilities/changed`、
 * `sidecar://client/changed`）。T2 命令面中的 `capabilities_usable` 目前无 webview 消费者，
 * 故薄客户端不包装（Rust 侧命令面保持完整，需用时再补包装）。
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

export interface Capability {
  id: CapabilityId;
  label: string;
  usable: boolean;
}

export type NotifyLevel = "info" | "warn" | "error";

export interface NotifyPayload {
  message: string;
  level?: NotifyLevel;
  channel?: string;
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

/** 动态路由/导航项（路由契约化：插件自声明，任意 slot 的 `route`；含 slot 归属 → 页面渲染槽）。 */
export interface RouteEntry {
  id: string;
  order: number;
  title: string;
  path: string;
  slot: string;
  /** 侧边栏分组键（应用壳 v1）：缺省单组。 */
  section?: string;
}

export interface LogEntry {
  id: number;
  event: string;
  data: unknown;
  at: number;
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

export function notifySend(
  message: string,
  level?: NotifyLevel,
  channel?: string,
): Promise<string[]> {
  return withTimeout(invoke<string[]>("notify_send", { message, level, channel }), "notify_send");
}

export function logList(event?: string): Promise<LogEntry[]> {
  return withTimeout(invoke<LogEntry[]>("log_list", { event }), "log_list");
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

/** 订阅 sidecar 透传的 `notify/request` 事件；返回退订函数。 */
export function onNotifyRequest(cb: (payload: NotifyPayload) => void): Promise<() => void> {
  return listen<NotifyPayload>("sidecar://notify/request", (e) => cb(e.payload)).then(
    (unlisten) => unlisten,
  );
}

/** 订阅 sidecar 透传的 `capabilities/changed` 事件；返回退订函数。 */
export function onCapabilitiesChanged(
  cb: (payload: CapabilitiesChangedEvent) => void,
): Promise<() => void> {
  return listen<CapabilitiesChangedEvent>("sidecar://capabilities/changed", (e) =>
    cb(e.payload),
  ).then((unlisten) => unlisten);
}