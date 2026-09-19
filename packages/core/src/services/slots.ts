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
 * 返回可逆 disposer。菜单/路由语义（title/route）与 webview 挂载本身属于 T2/T1 其余层，
 * 本服务只负责「声明 + 快照」。
 */
export class Slots extends Service {
  private byName = new Map<SlotName, Map<string, FrontendSlotRegistration>>()

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  /** 注册一条 slot 占用声明；未知槽位/重复 id 抛错（fail-closed），返回可逆 disposer。 */
  register(name: SlotName, reg: FrontendSlotRegistration): () => void {
    if (!SLOT_NAMES.includes(name)) {
      throw new Error(`[slots] 未知 slot '${String(name)}'，可用：${SLOT_NAMES.join(', ')}`)
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
      map.set(reg.id, reg)
      this.ctx.emit('client/changed', { kind: 'slots' })
      return () => {
        map.delete(reg.id)
        if (map.size === 0) this.byName.delete(name)
        this.ctx.emit('client/changed', { kind: 'slots' })
      }
    })
  }

  /** 当前是否已有声明（供可用性门控/demo 开关）。 */
  has(name: SlotName): boolean {
    return (this.byName.get(name)?.size ?? 0) > 0
  }

  /** 某槽位已登记的声明快照。 */
  claims(name: SlotName): FrontendSlotRegistration[] {
    return [...(this.byName.get(name)?.values() ?? [])]
  }
}