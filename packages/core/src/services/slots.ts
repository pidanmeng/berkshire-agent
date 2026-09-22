import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import '../events'

// ctx.slots —— 服务类型增强 co-locate；`client/changed` 为跨服务共享事件（见 ../events）
declare module '@berkshire/cordis' {
  interface Context {
    slots: Slots
  }
}

/**
 * 已知 slot 名单（能力块 A：前端组件挂点；应用壳 v1 起含布局挂点：侧边栏/状态栏/设置页）。
 * 与 webview 侧共享缝 `@berkshire/ui-slots` 的 `FRONTEND_SLOT_NAMES` 是**同一契约**。
 * 诚实标注：目前两个端各有一份（sidecar core 与 webview 各自校验），共享类型层是 v2；
 * 改动必须两端同步，否则注册时 fail-closed 会不一致。
 * 注意：`root` 是 webview 本地 single 槽（壳帧挂载点，见 capability-seams §6），**不在**本
 * `SLOT_NAMES` 内——sidecar 不可注册壳帧，两端集合因此有意不同。
 */
export const SLOT_NAMES = [
  'stock-preview.footer',
  'watchlist.toolbar',
  'analysis.menu',
  // 应用壳（Vercel 黑白风）布局挂点：挂点归中枢，内容归插件。
  'layout.navigation.extra', // 侧边栏导航区追加项（导航列表下方）
  'layout.sidebar.footer', // 侧边栏底部（设置入口上方）追加控制项
  'layout.statusbar.right', // 状态栏右侧追加状态项
  'settings.cards', // 设置弹窗追加设置卡片/分组
  'settings.section', // 设置弹窗「插件设置」分组：插件贡献自己的设置表单面板（WP-6 设置 Seam）
  // 数据管理页（WP：数据源能力缝落地）：页面注入载体，插件自声明路由的页面内容经此槽渲染。
  'data.management',
] as const
export type SlotName = (typeof SLOT_NAMES)[number]

/**
 * 核心路由静态路径（能力块 B 的红线：插件注入的菜单路由**不得覆盖**）。
 * WP-6：`/settings` 已改为设置弹窗（不再路由页），故从核心路由移除；仅剩 `/` 首页与 `/theme` 令牌对照 dev 工具页。
 * 与 webview 侧 `apps/berkshire-agent/src/App.tsx` 的核心 `<Route>` 集合保持同一契约；
 * 两端各有一份是 v2 共享类型层前的现状，改动必须同步。
 */
export const CORE_ROUTE_PATHS = ['/', '/theme'] as const

/**
 * 一条插件自声明的**路由**（能力块 B/页面，路由契约化）：插件在**任意 slot** 的占用声明上带
 * `route` 即声明一个可导航进入的页面。宿主只做「路由宿主」——汇总集合成导航与路由，页面内容仍归插件。
 * `slot` 指明该页内容挂进哪个槽位（webview 按它渲染，不再写死 analysis.menu）。
 */
export interface RouteDescriptor {
  /** 路由/声明 id（URL 空间内唯一）。 */
  id: string
  /** 排序权重，缺省 100；同值按注册先后稳定。 */
  order: number
  /** 导航标题。 */
  title: string
  /** 静态路由路径（不含动态段 `:`、不覆盖核心路径、全局唯一）。 */
  path: string
  /** 该页内容挂进哪个固定槽位。 */
  slot: SlotName
}

/** `ctx.slots` 的一条 slot 占用声明（Definition：某插件声明挂进某固定槽位）。 */
export interface FrontendSlotRegistration {
  /** 声明方插件稳定 id（同一槽内须唯一）。 */
  id: string
  /** 排序权重，缺省 100；同值按注册先后稳定。 */
  order?: number
  /** 菜单标题（能力块 B/动态菜单，T2 才接，T1 只透传不消费）。 */
  title?: string
  /** 静态路由声明（能力块 B/页面，路由契约化）：带上即声明该槽可作一个可导航页面（路径必须静态，见校验）。 */
  route?: { path: string }
}

/**
 * `ctx.slots` —— 前端 slot 占用注册表（能力缝：sidecar 侧 Definition）。
 *
 * T1 最小件：插件经 `ctx.slots.register(slotName, { id, ... })` 声明「挂进某固定槽位」，
 * 做运行时校验（未知 slot / 重复 id，fail-closed）+ `@mode emit` 广播 `client/changed`，
 * 返回可逆 disposer。**路由契约化（本轮）**：任意 slot 的声明都可带 `route` 声明一个页面——
 * 校验静态路径（不含 `:`）、不覆盖核心路径、path 在 **URL 空间全局唯一**；`routes()` 汇总
 * 所有带 route 的声明（含 slot）成导航/路由快照。宿主只做路由宿主，页面内容仍归插件。
 */
export class Slots extends Service {
  private byName = new Map<SlotName, Map<string, FrontendSlotRegistration>>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  /** 注册一条 slot 占用声明；未知槽位/重复 id fail-closed；带 `route` 时增路由校验，返回可逆 disposer。 */
  register(name: SlotName, reg: FrontendSlotRegistration): () => void {
    if (!SLOT_NAMES.includes(name)) {
      throw new Error(`[slots] 未知 slot '${String(name)}'，可用：${SLOT_NAMES.join(', ')}`)
    }
    if (reg.route) {
      this.assertRoute(reg)
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
      if (reg.route) {
        this.assertRoutePathFree(reg)
      }
      map.set(reg.id, reg)
      this.ctx.emit('client/changed', { kind: 'slots' })
      return () => {
        map.delete(reg.id)
        if (map.size === 0) this.byName.delete(name)
        this.ctx.emit('client/changed', { kind: 'slots' })
      }
    })
  }

  /** 所有带 `route` 声明的**已排序**路由快照（含 slot；排序同 T0：`order ?? 100` 稳定）。 */
  routes(): RouteDescriptor[] {
    const out: RouteDescriptor[] = []
    for (const name of SLOT_NAMES) {
      for (const r of this.claims(name)) {
        if (!r.route?.path) continue
        out.push({
          id: r.id,
          order: r.order ?? 100,
          title: r.title ?? r.id,
          path: r.route.path,
          slot: name,
        })
      }
    }
    // title/path 在注册时已由 assertRoute 强制非空（route 声明必带），此处无需再过滤。
    return out.sort((a, b) => a.order - b.order)
  }

  /** 当前是否已有声明（供可用性门控/demo 开关）。 */
  claims(name: SlotName): FrontendSlotRegistration[] {
    return [...(this.byName.get(name)?.values() ?? [])]
  }

  /** 带 `route` 的声明的结构校验（不含 path 占用校验，那个留到 effect 内做，因要求对已存在项全局唯一）。 */
  private assertRoute(reg: FrontendSlotRegistration): void {
    if (typeof reg.title !== 'string' || reg.title === '') {
      throw new Error(`[slots] 路由 '${reg.id}' 必须提供非空 title`)
    }
    const path = reg.route?.path
    if (typeof path !== 'string' || path === '') {
      throw new Error(`[slots] 路由 '${reg.id}' 必须提供非空 route.path`)
    }
    if (!path.startsWith('/')) {
      throw new Error(`[slots] 路由 '${reg.id}' 的 path '${path}' 必须以 '/' 开头`)
    }
    if (path.includes(':')) {
      throw new Error(`[slots] 路由 '${reg.id}' 的 path '${path}' 含动态段 ':' 段，须为静态路径`)
    }
    if ((CORE_ROUTE_PATHS as readonly string[]).includes(path)) {
      throw new Error(`[slots] 路由 '${reg.id}' 的 path '${path}' 覆盖核心路由，禁止`)
    }
  }

  /** effect 内检查：新路由 path 不得与任何 slot 的已存在路由 path 重复（URL 空间全局，id 检查在前已挡同 id）。 */
  private assertRoutePathFree(reg: FrontendSlotRegistration): void {
    const path = reg.route!.path
    for (const name of SLOT_NAMES) {
      const existing = this.byName.get(name)
      if (!existing) continue
      const dup = [...existing.values()].find((r) => r.route?.path === path)
      if (dup) {
        throw new Error(`[slots] 路由 '${reg.id}' 的 path '${path}' 与 '${dup.id}' 重复`)
      }
    }
  }
}