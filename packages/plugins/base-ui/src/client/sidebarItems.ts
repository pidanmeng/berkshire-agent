/**
 * 侧边栏导航模型（base-ui 壳插件）：`SidebarItem` 化 + 未来迭代出口（排序/隐藏/切换预设）。
 *
 * 现状（本轮）：**取消「扩展」分组**——插件自声明页面与首页**同权**，全部扁平排布在一条导航列表里。
 * 排布顺序 = 声明序：首页 pinned（`core:home`，order 0）在前，插件路由按 sidecar `routes/list`
 * 已排好的 `order`（core `Slots.routes()` 按 `order ?? 100` 稳定排序，webview 原样收下）在后。
 *
 * 未来迭代出口（v-next 设置弹窗 UI，本文件只留**契约与解析**，不建 UI）：
 * - **排序**：设置弹窗把每项的 order 覆盖写入 `settings/sidebar.items[<id>].order`；
 * - **隐藏**：同键写入 `.hidden`（`true` 即隐藏，缺省显示）；
 * - **切换预设**：写 `settings/sidebar.preset`（`SIDEBAR_PRESETS` 注册表；v1 只有
 *   `default`＝声明原序，新预设在此追加注册即可，无需改侧边栏渲染）。
 * 侧边栏经 {@link useSidebarItems} 读同一两个键并**反应式合并**（`usePersistedField` 订阅
 * `storage/changed`），未来设置面板用 `usePersistedField` 写同一键即天然同步（多面板/多窗口一致）。
 * 首页与插件页同走一个模型——未来设置弹窗同样可对首页排序/隐藏/预设（「同权」）。
 */
import { useMemo } from "react"
import {
  usePersistedField,
  type StorageHandle,
  type StorageNamespaceId,
} from "@berkshire/ui-slots"
import type { ShellRouteInfo } from "./AppShell"

/** 侧边栏项持久化命名空间（复用壳自有设置命名空间，`$BK_HOME/state/settings/`）。 */
export const SIDEBAR_NS = "settings" as StorageNamespaceId

/** 侧边栏项用户覆盖键：`Record<itemId, SidebarItemOverride>`（排序/隐藏，v-next 设置弹窗写入）。 */
export const SIDEBAR_ITEMS_KEY = "sidebar.items"

/** 侧边栏预设键：`SidebarPresetId`（切换预设，v-next 设置弹窗写入）。 */
export const SIDEBAR_PRESET_KEY = "sidebar.preset"

/** 一条侧边栏导航项（壳 + 插件页面统一模型；`hidden` 为 v-next 覆盖位，缺省显示）。 */
export interface SidebarItem {
  /** 稳定身份（合并键：声明 + 用户覆盖）。壳自有项 `core:*`，插件项 = 路由声明 id。 */
  id: string
  /** 导航标题。 */
  title: string
  /** 路由路径（激活态按它匹配）。 */
  path: string
  /** 声明序（sidecar 已排好）；用户覆盖/未来排序以此为基准。 */
  order: number
  /** 用户隐藏（v-next 设置弹窗写入；缺省/`false` 显示）。 */
  hidden?: boolean
}

/** 用户对单项的覆盖（排序/隐藏；只写存在的键，缺省取声明值）。 */
export interface SidebarItemOverride {
  order?: number
  hidden?: boolean
}

/** 侧边栏预设 id（v-next 切换预设的持久化值）。 */
export type SidebarPresetId = string

/** 一个侧边栏预设：对声明项做一次再编排（v1 只有 `default`=声明原序；新预设在此追加注册）。 */
export interface SidebarPreset {
  id: SidebarPresetId
  /** 面向用户的标签（v-next 设置弹窗下拉项）。 */
  label: string
  /** 预设对声明项的编排（返回新数组，不改入参）。 */
  arrange: (base: readonly SidebarItem[]) => SidebarItem[]
}

/** 缺省预设：声明原序（首页在前，插件路由按 sidecar 排好的 order 在后）。 */
export const DEFAULT_SIDEBAR_PRESET_ID = "default" as const

/** 预设注册表：v1 仅 `default`；新预设在此追加（含 label）即被侧边栏与 v-next 设置弹窗消费。 */
export const SIDEBAR_PRESETS: Record<SidebarPresetId, SidebarPreset> = {
  [DEFAULT_SIDEBAR_PRESET_ID]: {
    id: DEFAULT_SIDEBAR_PRESET_ID,
    label: "默认（声明序）",
    arrange: (base) => [...base],
  },
}

/** 壳自有核心导航（插件不可覆盖路由，但可与插件页同权被排序/隐藏/预设——「同权」语义）。 */
export const CORE_NAV: readonly SidebarItem[] = [
  { id: "core:home", title: "首页", path: "/", order: 0 },
]

/** 声明基线：核心 pinned + 插件路由（sidecar 已按 order 排好，原样收下）。 */
export function buildBaseItems(routes: readonly ShellRouteInfo[]): SidebarItem[] {
  return [
    ...CORE_NAV,
    ...routes.map((r) => ({ id: r.id, title: r.title, path: r.path, order: r.order })),
  ]
}

/**
 * 解析出**生效**的侧边栏项（纯函数）：
 * 1. 按预设编排（v1 `default`=声明原序）；
 * 2. 合并用户覆盖（order/hidden，缺省取声明值）；
 * 3. 过滤隐藏项 + 按生效 order 排序（等值保持声明序——`Array.sort` 稳定，与 core
 *    `Slots.routes()` 的「等值按注册先后稳定」一致，不做 id 平局重排）。
 */
export function resolveSidebarItems(
  base: readonly SidebarItem[],
  presetId: SidebarPresetId,
  overrides: Record<string, SidebarItemOverride>,
): SidebarItem[] {
  const preset = SIDEBAR_PRESETS[presetId] ?? SIDEBAR_PRESETS[DEFAULT_SIDEBAR_PRESET_ID]!
  const arranged = preset.arrange(base)
  return arranged
    .map((item) => {
      const o = overrides[item.id]
      if (!o) return item
      return { ...item, order: o.order ?? item.order, hidden: o.hidden ?? item.hidden }
    })
    .filter((item) => item.hidden !== true)
    .sort((a, b) => a.order - b.order)
}

/**
 * 侧边栏项 hook：把「声明路由 + 持久化覆盖/预设」合并成生效导航项（反应式）。
 *
 * 首帧用声明序渲染（defaultValue），storage 读到覆盖后对齐；未来设置弹窗写同一键
 * （`settings/sidebar.items` / `settings/sidebar.preset`）即实时反映到侧边栏。
 */
export function useSidebarItems(
  routes: readonly ShellRouteInfo[],
  storage: StorageHandle,
): { items: SidebarItem[]; loading: boolean } {
  const preset = usePersistedField<SidebarPresetId>(storage, SIDEBAR_NS, SIDEBAR_PRESET_KEY, {
    defaultValue: DEFAULT_SIDEBAR_PRESET_ID,
  })
  const overrides = usePersistedField<Record<string, SidebarItemOverride>>(
    storage,
    SIDEBAR_NS,
    SIDEBAR_ITEMS_KEY,
    { defaultValue: {} },
  )
  const base = useMemo(() => buildBaseItems(routes), [routes])
  const items = useMemo(
    () => resolveSidebarItems(base, preset.value, overrides.value),
    [base, preset.value, overrides.value],
  )
  return { items, loading: preset.loading || overrides.loading }
}
