import { Service } from 'cordis'
import type { Context } from 'cordis'

/**
 * 已知 slot 名单（能力块 A：前端组件挂点）。与 webview 侧
 * `apps/berkshire-agent/src/slots/types.ts` 的 `FRONTEND_SLOT_NAMES` 是**同一契约**。
 * 诚实标注：目前两个端各有一份（sidecar core 与 webview 各自校验），共享类型层是 v2；
 * 改动必须两端同步，否则注册时 fail-closed 会不一致。
 */
export const SLOT_NAMES = ['stock-preview.footer', 'watchlist.toolbar', 'analysis.menu'] as const
export type SlotName = (typeof SLOT_NAMES)[number]

/**
 * 核心路由静态路径（能力块 B 的红线：插件注入的菜单路由**不得覆盖**）。
 * 与 webview 侧 `apps/berkshire-agent/src/App.tsx` 的核心 `<Route>` 集合保持同一契约；
 * 两端各有一份是 v2 共享类型层前的现状，改动必须同步。
 */
export const CORE_ROUTE_PATHS = ['/', '/settings'] as const

/** `analysis.menu` 菜单项（能力块 B/页面）：插件声明一个可点击进入的分析页。 */
export interface MenuItem {
  /** 菜单项/路由声明 id（同一注册表内唯一）。 */
  id: string
  /** 排序权重，缺省 100；同值按注册先后稳定。 */
  order: number
  /** 导航标题。 */
  title: string
  /** 静态路由路径（不含动态段 `:`、不覆盖核心路径）。 */
  path: string
}

/** `ctx.slots` 的一条 slot 占用声明（Definition：某插件声明挂进某固定槽位）。 */
export interface FrontendSlotRegistration {
  /** 声明方插件稳定 id（同一槽内须唯一）。 */
  id: string
  /** 排序权重，缺省 100；同值按注册先后稳定。 */
  order?: number
  /** 菜单标题（能力块 B/动态菜单，T2 才接，T1 只透传不消费）。 */
  title?: string
  /** 静态路由声明（能力块 B/页面，T2 才接，T1 只透传不消费）。 */
  route?: { path: string; staticOnly?: boolean }
}

/**
 * `ctx.slots` —— 前端 slot 占用注册表（能力缝：sidecar 侧 Definition）。
 *
 * T1 最小件：插件经 `ctx.slots.register(slotName, { id, ... })` 声明「挂进某固定槽位」，
 * 做运行时校验（未知 slot / 重复 id，fail-closed）+ `@mode emit` 广播 `client/changed`，
 * 返回可逆 disposer。T2：对 `analysis.menu` 增菜单/路由语义——注册时必须给出静态路由
 * （不含 `:` 动态段）、不得覆盖核心路径、路径在菜单内唯一；`menu()` 提供导航快照。
 */
export class Slots extends Service {
  private byName = new Map<SlotName, Map<string, FrontendSlotRegistration>>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  /** 注册一条 slot 占用声明；未知槽位/重复 id fail-closed；`analysis.menu` 增路由校验，返回可逆 disposer。 */
  register(name: SlotName, reg: FrontendSlotRegistration): () => void {
    if (!SLOT_NAMES.includes(name)) {
      throw new Error(`[slots] 未知 slot '${String(name)}'，可用：${SLOT_NAMES.join(', ')}`)
    }
    if (name === 'analysis.menu') {
      this.assertMenuItem(reg)
    }
    return this.ctx.effect(() => {
      let map = this.byName.get(name)
      if (!map) {
        map = new Map()
        this.byName.set(name, map)
      }
      if (map.has(reg.id)) {
        throw new Error(`[slots] 重复 id '${reg.id}' 注册到 slot '${name}'`)
      }
      this.assertMenuItemRouteFree(name, reg)
      map.set(reg.id, reg)
      this.ctx.emit('client/changed', { kind: 'slots' })
      return () => {
        map.delete(reg.id)
        if (map.size === 0) this.byName.delete(name)
        this.ctx.emit('client/changed', { kind: 'slots' })
      }
    })
  }

  /** `analysis.menu` 的已排序导航快照（排序同 T0：`order ?? 100` 稳定）。 */
  menu(): MenuItem[] {
    return this.claims('analysis.menu')
      .map((r) => ({ id: r.id, order: r.order ?? 100, title: r.title ?? r.id, path: r.route?.path ?? '' }))
      .filter((m) => m.path !== '' && m.title !== '')
      .sort((a, b) => a.order - b.order)
  }

  /** 当前是否已有声明（供可用性门控/demo 开关）。 */
  has(name: SlotName): boolean {
    return (this.byName.get(name)?.size ?? 0) > 0
  }

  /** 某槽位已登记的声明快照。 */
  claims(name: SlotName): FrontendSlotRegistration[] {
    return [...(this.byName.get(name)?.values() ?? [])]
  }

  /** `analysis.menu` 注册的结构校验（不含路由占用校验，那个留到 effect 内做，因要求对已存在项唯一）。 */
  private assertMenuItem(reg: FrontendSlotRegistration): void {
    if (typeof reg.title !== 'string' || reg.title === '') {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 必须提供非空 title`)
    }
    const path = reg.route?.path
    if (typeof path !== 'string' || path === '') {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 必须提供非空 route.path`)
    }
    if (!path.startsWith('/')) {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 的 path '${path}' 必须以 '/' 开头`)
    }
    if (path.includes(':')) {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 的 path '${path}' 含动态段 ':' 段，须为静态路径`)
    }
    if ((CORE_ROUTE_PATHS as readonly string[]).includes(path)) {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 的 path '${path}' 覆盖核心路由，禁止`)
    }
  }

  /** effect 内检查：新菜单路径不得与已存在菜单项路径重复（不含当前待插入项，因为 id 检查在前已挡同 id）。 */
  private assertMenuItemRouteFree(name: SlotName, reg: FrontendSlotRegistration): void {
    const existing = this.byName.get(name)
    if (!existing || !reg.route) return
    const dup = [...existing.values()].find((r) => r.route?.path === reg.route?.path)
    if (dup) {
      throw new Error(`[slots] analysis.menu 项 '${reg.id}' 的 path '${reg.route.path}' 与 '${dup.id}' 重复`)
    }
  }
}