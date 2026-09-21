/**
 * slot 上下文类型化 map（契约，不是示例）。
 *
 * 宿主/插件在固定槽位挂组件时，把「该槽位约定的上下文 + actions」以 `context` 属性注入
 * （见 registry.ts 的 `SlotComponent<C>`）。本 map 约束 slot 名与其上下文的一一对应：
 * 写一个 slot 的组件，就等于吃死它的 context 形状——类型是下游插件的契约。
 *
 * 诚实标注（边界）：本包是**共享 UI 缝引擎**（对齐 dsh `@dsh-client-ui-slots` 的 `SlotMap`），
 * 从宿主 `apps/berkshire-agent/src/slots/types.ts` 迁出，宿主与所有插件共同 import；
 * 新增槽位 = 在此加一行（名 + 上下文形状），并同步更新 {@link FRONTEND_SLOT_NAMES}。
 * sidecar 的 clientModules 快照经宿主 `ClientModuleHost` 汇入注册表（T1）；跨包组件用**结构镜像**
 * 上下文对齐（v2 共享类型层债务），跨 sidecar/Rust/webview 边界的 id 仍为 webview 本地域裸字符串，
 * 品牌化为 `Branded<T>` 留 v2。
 */
import type { ReactNode } from "react"
import type { StorageHandle } from "./storage"

/** 个股查看视角（stock-preview.footer 上下文之一）。 */
export type PreviewView = "daily" | "intraday"

/** 自选列表工具栏的视图形态。 */
export type WatchlistViewMode = "compact" | "full"

/**
 * slot 名 → 上下文/actions 的类型化 map。
 *
 * 新增槽位 = 在此加一行（名 + 上下文形状），宿主与插件两端都跟着类型走；注意同步
 * {@link FRONTEND_SLOT_NAMES} 运行时数组（注册时的 fail-closed 校验用）。
 */
export interface FrontendSlotContextMap {
  /** 个股预览页底部：宿主给出正在查看的证券与视角，插件据此渲染补充内容。 */
  "stock-preview.footer": {
    /** 证券代码（跨边界前暂用裸字符串）。 */
    symbol: string
    /** 证券名称。 */
    name: string
    /** 当前查看视角。 */
    view: PreviewView
  }
  /** 自选列表工具栏：宿主给出当前列表、视图与刷新能力。 */
  "watchlist.toolbar": {
    /** 自选证券代码列表。 */
    symbols: string[]
    /** 当前视图形态。 */
    viewMode: WatchlistViewMode
    /** 触发宿主刷新列表。 */
    refresh: () => void
  }
  /** 分析菜单（页面注入载体，能力块 B/路由契约化的挂点）：插件自声明路由的页面内容经此槽渲染；宿主暂无上下文。 */
  "analysis.menu": Record<string, never>
  /** 侧边栏导航区（应用壳）：插件在导航区追加项/分组。宿主给出折叠态与当前路径。 */
  "layout.navigation.extra": {
    /** 侧边栏是否处于折叠（icon 栏）态。 */
    collapsed: boolean
    /** 当前路由 pathname，供活动态派生。 */
    pathname: string
  }
  /** 侧边栏底部（应用壳）：在固定设置入口上方追加控制项。宿主给出折叠态。 */
  "layout.sidebar.footer": {
    /** 侧边栏是否处于折叠（icon 栏）态。 */
    collapsed: boolean
  }
  /** 状态栏右侧（应用壳）：插件追加状态项；插件自持响应式数据，宿主暂无上下文。 */
  "layout.statusbar.right": Record<string, never>
  /**
   * 设置页（应用壳）：插件追加设置卡片/分组；卡片自包含，宿主每张包 ExtensionBoundary。
   * 上下文携带当前可用的**设置分组占位契约**（id/label/order，见 {@link SettingsGroup}）——
   * 真正设置弹窗/表单由 WP-6 消费，本 slot 只把分组骨架透传给卡片作消费面。
   */
  "settings.cards": {
    /** 可用设置分组（骨架，`DEFAULT_SETTINGS_GROUPS` 在 `@berkshire/base-ui`）。 */
    settingsGroups: readonly SettingsGroup[]
  }
  /**
   * 设置弹窗「插件设置」分组（WP-6 设置 Seam）：插件贡献的**设置表单面板**经此槽挂进设置弹窗。
   * 每个注册项是一个自包含的设置面板（自带标题/说明 + 表单字段），由 base-ui 弹窗放进
   * 「插件设置」分组、每个包 `ExtensionBoundary`；装上即出现、卸下即消失（clientModule 注册即效应）。
   * 面板按插件自身的持久化能力接线；宿主（设置弹窗）把共享 `storage` 句柄随 context 注入，
   * 插件面板把**每个表单项落成一个 KV**（`$BK_HOME/state/<ns>/<key>.json`，见 ui-slots `storage.ts`）。
   * 上下文携带 storage 句柄；面板仍自包含（宿主只给句柄，不做 dirty/save 编排）。
   */
  "settings.section": {
    /** 持久化句柄（宿主经 `root` 槽注入壳，壳再注入本槽）：插件设置面板逐字段落 KV 用。 */
    storage: StorageHandle
  }
  /**
   * 数据管理页（数据源能力缝落地）：插件自声明路由 `/data` 的页面内容经此槽渲染。
   * 页面**不自连桥**——宿主把数据管理 API 句柄（`lib/dataManagementApi.ts` 封装
   * `data-sources/*` / `database/*` 命令 + `database/dataset-updated` 事件）随 context
   * 注入，插件页只消费契约（对齐 `root` 槽注入 storage/titleBar 的同款姿势）。
   */
  "data.management": {
    /** 数据管理 API（宿主注入；页面据此拉快照/改路由/探测凭据/触发采集/订阅落库事件）。 */
    api: DataManagementApi
  }
  /**
   * 根（root）槽：应用壳帧挂载点（对齐 dsh `ui-layout` 在宿主内置 `root` 槽挂 `AppFrame`）。
   * **single 语义**：全场**仅一个**壳帧（见 registry.ts `SLOT_KINDS`），重复注册 fail-closed 拒绝。
   * 宿主把路由快照、桥接态与「应用内容渲染 prop」经 `context` 注入；壳帧只做挂点与契约，
   * 具体内容（路由/页面）由 `renderApp` 提供的宿主内容填充，子槽内容归各插件。
   */
  root: {
    /** 插件自声明路由（宿主 routesStore 快照的子集），供壳内分组导航与上下文标题。 */
    routes: readonly ShellRouteInfo[]
    /** 桥接连通态（宿主经 `lib/api` 探测注入）；`null`=检测中。 */
    bridgeOnline: boolean | null
    /**
     * 应用内容渲染 prop：壳帧无法以 `children` 接收宿主内容（slot 组件只收 `context`），
     * 故宿主把 `<Routes>` 的渲染封装成 prop 注入，由壳帧放进内容区渲染。
     */
    renderApp: () => ReactNode
    /** 自绘标题栏控制器（WP-5）：宿主经 Rust window command 封装后注入；壳只做呈现与拖拽。 */
    titleBar: TitleBarController
    /**
     * 持久化句柄（宿主经 `lib/api` storage* 封装后注入）：壳/插件表单经它把设置项落成
     * `$BK_HOME/state/<ns>/<key>.json` 的一个 KV（设置弹窗接入持久化管线）。
     */
    storage: StorageHandle
  }
}

/** 给壳帧的一种路由最小信息（base-ui `AppShell`/`Sidebar`/`StatusBar` 亦复用该形状）。 */
export interface ShellRouteInfo {
  path: string
  title: string
  section?: string
}

/**
 * 自绘标题栏控制器契约（WP-5，root 槽 context 的一部分）。
 *
 * 壳侧（base-ui `TitleBar`）**不依赖宿主 `lib/api` / `@tauri-apps/api`**：宿主把 Rust window
 * command（`decorations:false` 时提供窗口控制）封装成三个动作 + 一个最大态，作为 `titleBar`
 * 注入。`isMaximized` 由宿主订阅 `tauri://resize` 后同步。
 */
export interface TitleBarController {
  /** 窗口标题文案（自绘标题栏品牌区展示）。 */
  title: string
  /** 最小化窗口。 */
  onMinimize(): void
  /** 最大化/还原窗口。 */
  onToggleMaximize(): void
  /** 关闭窗口。 */
  onClose(): void
  /** 当前是否最大化（决定最大化/还原按钮图标与 aria-label）。 */
  isMaximized: boolean
}

/**
 * 设置分组占位契约（应用壳，WP-3）：一个设置的**分组 id / label / 顺序**。
 *
 * 诚实标注：这里是**占位承载**——真正设置弹窗/分组 UI 由 WP-6 消费，本包（base-ui）只定义
 * 契约并给出缺省分组骨架（`通用设置`/`模型设置`，见 base-ui `settingsGroups.ts`）。分组 UI
 * 仍标「待实现」，不要当成已渲染的弹窗。
 */
export interface SettingsGroup {
  /** 分组的稳定 id（如 `general`/`model`），弹窗按它编排。 */
  id: string
  /** 面向用户的标签文案（如「通用设置」「模型设置」）。 */
  label: string
  /** 展示顺序（升序排布；等值按 id 稳定）。 */
  order: number
  /** 可选分组说明（hint 用）。 */
  description?: string
}

/** 已注册槽位的名字（即类型化 map 的键全集）。 */
export type FrontendSlotName = keyof FrontendSlotContextMap

// ---- 数据管理 API（`data.management` 槽 context 的契约，宿主注入、插件页消费）----
// 载荷形状与 sidecar `data-sources/*` / `database/*` 快照**结构镜像**（ui-slots 不依赖
// @berkshire/core，跨包用结构对齐，诚实登记：v2 共享类型层债务）。

/** 一个 provider 对某 dataset 的可用性（不可用带原因，fail-closed 展示面）。 */
export interface DataSourceAvailabilityDto {
  available: boolean
  reason?: string
}

/** `data-sources/list` 快照里的一个 provider 项。 */
export interface DataSourceProviderDto {
  id: string
  label: string
  datasets: Record<string, DataSourceAvailabilityDto>
}

/** 内置 dataset 声明（materialization: embedded 内嵌物化；parquet-view 仍目标态）。 */
export interface DataManagementDatasetDto {
  id: string
  label: string
  materialization: string
  columns: string[]
  /** 同步元信息（v1 仅登记窗口语义字符串供页面展示；cadence/incremental 仍目标态）。 */
  sync?: { window?: string }
}

/** 本地库内嵌表（名称 + 行数）。 */
export interface DataManagementTableDto {
  name: string
  rowCount: number
}

/**
 * 覆盖日期登记快照项（`data-sources/coverage` / `data-sources/list.coverage`，S2 覆盖 seam）：
 * 每组数据的覆盖区间（min~max）、行数、来源与记录时刻。未登记 → `covered:false`（fail-closed，
 * 不伪造「已覆盖」）。
 */
export interface DataCoverageEntryDto {
  dataset: string
  label: string
  /** 是否已有覆盖登记（未同步 → false）。 */
  covered: boolean
  /** 已覆盖区间的起始日期（YYYY-MM-DD；未登记 → null）。 */
  minDate: string | null
  /** 已覆盖区间的截止日期（YYYY-MM-DD；未登记 → null）。 */
  maxDate: string | null
  /** 覆盖区间内的去重日期数（近交易日数；真实日历语义归 market-calendar）。 */
  tradingDays: number | null
  /** 覆盖区间内的实际行数（未登记 → 0）。 */
  rows: number
  /** 数据来源 provider id（未登记 → null）。 */
  source: string | null
  /** 物化策略。 */
  materialization: string
  /** 登记/最后刷新时刻（ms；未登记 → null）。 */
  recordedAt: number | null
  coverageStart: string | null
  isComplete: boolean | null
}

/** 数据管理页主快照（一次拉齐：providers/datasets/当前路由/本地库表/覆盖日期/Key 是否已配置）。 */
export interface DataManagementSnapshotDto {
  providers: DataSourceProviderDto[]
  datasets: DataManagementDatasetDto[]
  /** dataset → 当前实际路由到的 provider（无候选/未配置 → null）。 */
  resolved: Record<string, string | null>
  tables: DataManagementTableDto[]
  /** 覆盖日期快照（每组数据的覆盖区间/行数/来源/记录时刻）。 */
  coverage: DataCoverageEntryDto[]
  /** 扶摇 API Key 是否已配置（当前仅指环境变量 `FUYAO_API_KEY` 已提供；页面据此展示状态）。 */
  apiKeyConfigured: boolean
}

/** 一次同步（采集）的结果（`database/dataset-updated` 载荷同形）。 */
export interface DataManagementSyncResultDto {
  dataset: string
  rows: number
  at: number
}

/**
 * 数据管理 API 契约（宿主 `createDataManagementApi` 实现，随 `data.management` 槽 context 注入）。
 *
 * 全部调用 fail-closed：桥断/命令失败显式 reject，页面据此展示错误而非「看似合理」的空态。
 * 凭据纪律（对齐 AGENTS.md §Secrets）：**不落盘明文密钥**——`probe` 只实探验证、绝不持久化
 * Key 值；provider 运行期只从环境变量（如 `FUYAO_API_KEY`）取值，`ctx.credentials` 仍目标态。
 */
export interface DataManagementApi {
  /** 拉取页面主快照（providers + datasets + 当前路由 + 本地库表 + Key 配置态）。 */
  snapshot(): Promise<DataManagementSnapshotDto>
  /** 把某 dataset 的路由偏好设为某 provider（校验候选，非法组合响亮失败）。 */
  setPreference(dataset: string, provider: string): Promise<void>
  /** 实探一个 provider 的凭据（如扶摇 API Key）；只探不存。 */
  probe(providerId: string, apiKey: string): Promise<{ ok: boolean; reason?: string }>
  /** 触发一次数据集采集（整表替换语义；`params` 如 { symbols, start, end } 透传给 provider）。 */
  sync(dataset: string, params?: Record<string, unknown>): Promise<DataManagementSyncResultDto>
  /** 本地库内嵌表清单（名称 + 行数）。 */
  tables(): Promise<DataManagementTableDto[]>
  /** 手动重算某数据集的覆盖（重扫实际落库表 + 重新登记），返回更新后的覆盖快照。 */
  refreshCoverage(dataset: string): Promise<DataCoverageEntryDto>
  /** 订阅 `database/dataset-updated`；返回同步退订函数。 */
  onDatabaseUpdated(cb: (payload: DataManagementSyncResultDto) => void): () => void
}

/**
 * 运行时存在的槽位名，用于注册时的「未知 slot」校验（fail-closed）。与
 * {@link FrontendSlotContextMap} 的键保持一致。
 */
export const FRONTEND_SLOT_NAMES: readonly FrontendSlotName[] = [
  "root",
  "stock-preview.footer",
  "watchlist.toolbar",
  "analysis.menu",
  "layout.navigation.extra",
  "layout.sidebar.footer",
  "layout.statusbar.right",
  "settings.cards",
  "settings.section",
  "data.management",
]
