/**
 * 动态路由 store（能力块 B/页面，路由契约化：插件自声明路由，宿主做路由宿主）。
 *
 * 用 `useSyncExternalStore` 反应式契约存「所有带 `route` 声明的已排序导航项（含 slot）」，供顶栏
 * 导航与动态路由实时消费；由 `RouteSync` 从 sidecar `routes/list` 拉取并 `replace`，slot 变化
 * （`client/changed`）时刷新。排序 `order ?? 100` 稳定（sidecar `ctx.slots.routes()` 已排好，这里原样收下）。
 */
export interface ResolvedRouteEntry {
  id: string
  title: string
  path: string
  /** 页面内容挂进哪个槽位（webview 按它渲染，不再写死 analysis.menu）。 */
  slot: string
}

class RoutesStore {
  private entries: ResolvedRouteEntry[] = []
  private listeners = new Set<() => void>()

  /** 订阅；返回退订函数（供 `useSyncExternalStore`）。 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 当前路由快照（稳定引用，仅在 `replace` 后替换）。 */
  getSnapshot = (): readonly ResolvedRouteEntry[] => this.entries

  /** 整体替换路由并通知订阅者（原子替换：读完即新快照）。 */
  replace(items: ResolvedRouteEntry[]): void {
    this.entries = items
    for (const l of this.listeners) l()
  }
}

export const routesStore = new RoutesStore()