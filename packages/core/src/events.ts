/**
 * 类型化事件与服务的 `declare module 'cordis'` 增强（照抄 dsh 模式，
 * docs/reference/cordis-pattern-report.md §5）。
 *
 * 消费方通过 `ctx.inject` / `ctx.<key>` 经类型增强访问核心服务，禁止直接 import
 * 第三方服务实现；事件在 JSDoc 里用 `@mode` 标注派发模式。
 *
 * > v1 直接对 `cordis` 官方包做 `declare module`。目标态的 `@berkshire/cordis`
 * > （vendor 重命名）仍是 v2 范畴——届时把这里的模块名换成 scoped 改变即可。
 */
import type { LogService } from './services/log'
import type { CapabilityRegistry } from './services/capabilities'
import type { NotifyService } from './seams/notify'
import type { Slots } from './services/slots'
import type { ClientModules } from './services/clientModules'
import type { CapabilityId } from './brand'
import type { NotifyPayload } from './types'

declare module 'cordis' {
  interface Context {
    log: LogService
    capabilities: CapabilityRegistry
    notifier: NotifyService
    slots: Slots
    clientModules: ClientModules
  }

  interface Events {
    /**
     * 能力可用性变化（注册或卸除后广播）。
     * @mode emit
     * @param payload.capability 变化的能力 id
     * @param payload.usable 变化后的可用性
     */
    'capabilities/changed'(payload: { capability: CapabilityId; usable: boolean }): void
    /**
     * 一次通知请求的广播观察点（能力策略事件——策略/记录器在不改 provider
     * 的前提下挂接，见 docs/quick-reference.md 事件域速查）。
     * @mode emit
     * @param payload 通道路由无关的通知负载
     */
    'notify/request'(payload: NotifyPayload): void
    /**
     * client 插件图变化（slot 占用 或 clientModules 注册变更），供 owner 推给宿主/webview。
     * @mode emit
     * @param payload.kind 变化来源：'slots'（slot 占用变）或 'clientModules'（bundle 变）
     */
    'client/changed'(payload: { kind: 'slots' | 'clientModules' }): void
  }
}