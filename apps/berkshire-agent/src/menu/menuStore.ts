/**
 * 动态菜单 store（能力块 B/页面，T2）。
 *
 * 用 `useSyncExternalStore` 反应式契约存「analysis.menu 的已排序导航项」，供顶栏导航与
 * 动态路由实时消费；由 `MenuSync` 从 sidecar `menu/list` 拉取并 `replace`，slot 变化（`client/changed`）
 * 时刷新。排序 `order ?? 100` 稳定（sidecar `ctx.slots.menu()` 已排好，这里原样收下）。
 */
export interface ResolvedMenuEntry {
  id: string
  title: string
  path: string
}

class MenuStore {
  private entries: ResolvedMenuEntry[] = []
  private listeners = new Set<() => void>()

  /** 订阅；返回退订函数（供 `useSyncExternalStore`）。 */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 当前菜单项快照（稳定引用，仅在 `replace` 后替换）。 */
  getSnapshot = (): readonly ResolvedMenuEntry[] => this.entries

  /** 整体替换菜单项并通知订阅者（原子替换：读完即新快照）。 */
  replace(items: ResolvedMenuEntry[]): void {
    this.entries = items
    for (const l of this.listeners) l()
  }
}

export const menuStore = new MenuStore()