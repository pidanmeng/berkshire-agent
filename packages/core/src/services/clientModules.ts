import { Service } from 'cordis'
import type { Context } from 'cordis'
import type { ClientModuleId } from '../brand'
import { SLOT_NAMES, type SlotName } from './slots'

/** `ctx.clientModules` 的一条前端 bundle 声明（Provider：插件提供一个要挂到 webview 的 bundle）。 */
export interface ClientModuleRegistration {
  /** client 模块稳定 id（跨边界品牌化，同一注册表内须唯一）。 */
  id: ClientModuleId
  /** 该 bundle 挂进哪个固定槽位。 */
  slot: SlotName
  /** 前端 bundle 引用名（webview 侧加载器据此解析；T1 用本地模块名，远程 `bk://` 是 v-next）。 */
  bundle: string
  /** 随 bundle 携带的 scoped 样式字符串（能力块 C），可选。 */
  style?: string
}

/**
 * `ctx.clientModules` —— client 插件图注册表（能力缝：sidecar 侧 Provider/Definition）。
 *
 * 插件经 `ctx.clientModules.register({ id, slot, bundle, style? })` 声明「提供一个前端 bundle
 * 挂进某 slot」。做运行时校验（未知 slot / 重复 id，fail-closed）+ `@mode emit` 广播
 * `client/changed`，返回可逆 disposer。`client/list` 协议方法直接消费本注册表的快照。
 */
export class ClientModules extends Service {
  private byId = new Map<ClientModuleId, ClientModuleRegistration>()

  constructor(ctx: Context) {
    super(ctx, 'clientModules')
  }

  register(reg: ClientModuleRegistration): () => void {
    if (!SLOT_NAMES.includes(reg.slot)) {
      throw new Error(`[clientModules] 未知 slot '${String(reg.slot)}'，可用：${SLOT_NAMES.join(', ')}`)
    }
    return this.ctx.effect(() => {
      if (this.byId.has(reg.id)) {
        throw new Error(`[clientModules] 重复 id '${String(reg.id)}'`)
      }
      this.byId.set(reg.id, reg)
      this.ctx.emit('client/changed', { kind: 'clientModules' })
      return () => {
        this.byId.delete(reg.id)
        this.ctx.emit('client/changed', { kind: 'clientModules' })
      }
    })
  }

  /** 当前 client 模块快照（含重复 id 顺序上的注册先后）。 */
  list(): ClientModuleRegistration[] {
    return [...this.byId.values()]
  }

  /** 按 id 取单个声明；未注册返回 undefined。 */
  get(id: ClientModuleId): ClientModuleRegistration | undefined {
    return this.byId.get(id)
  }
}