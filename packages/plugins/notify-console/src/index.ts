import { z } from 'zod'
import type { Context } from '@berkshire/cordis'
import type { CapabilityId, NotifyProvider } from '@berkshire/core'

import '@berkshire/core'
// 上方 `import '@berkshire/core'` 已把 `declare module '@berkshire/cordis'` 的增强带入本模块，
// 使 `ctx.notifier` / `ctx.log` / `ctx.capabilities` 可用类型。

/**
 * 第一个插件：**notify-console** —— 走能力缝三角色的 Provider。
 *
 * - 声明依赖：经 `inject` 声明依赖 `notifier`/`log`/`capabilities`（解析而非手工排序）；
 * - 提供：把自己作为 `NotifyProvider` 经 `ctx.notifier.register()` 挂入能力缝；
 * - 响应：监听 `'notify/request'`（@mode emit），把每条通知追加到 `ctx.log`；
 * - 能力：向 `ctx.capabilities` 声明 `notify-console` 能力，供 fail-closed 的 `usable` 门控；
 * - 可逆：所有注册经 effect 包裹，卸载时**逆序**清理（摘监听 → 撤能力 → 摘 provider）。
 *
 * 这样既演示了「装一个插件→声明依赖→触发 typed 事件→插件响应」，也演示了卸载语义。
 */
export const name = 'notify-console'

export const inject = ['notifier', 'log', 'capabilities'] as string[]

export const Config = z.object({
  channel: z.string().default('console'),
  /** 是否把通知回显到 stdout。 */
  echo: z.boolean().default(true),
})
export type Config = z.infer<typeof Config>

export function apply(ctx: Context, config: Config): () => void {
  const providerId = 'notify-console'
  const capabilityId = 'notify-console' as CapabilityId

  const provider: NotifyProvider = {
    id: providerId,
    async send(payload) {
      if (config.echo) {
        console.log(`[${config.channel}] ${payload.message}`)
      }
    },
  }

  // 注册即效应：所有副作用都经 ctx.effect 包裹，卸载即逆序撤销。
  return ctx.effect(() => {
    // 依赖已由 inject 保证可用；此处显式断言，避免静默缺省（fail-fast）。
    if (!(ctx as Context).notifier) {
      throw new Error('notify-console: dependency "notifier" is not available')
    }

    // 1) 提供方 → 能力缝（返回内部 disposer）
    const offProvider = ctx.notifier.register(provider)
    // 2) 消费方监听 → typed 事件，追加到追加式日志
    const offListener = ctx.on('notify/request', (payload) => {
      ctx.log.append('notify/request', {
        provider: providerId,
        message: payload.message,
        level: payload.level,
      })
    })
    // 3) 能力声明 → 供 usable 门控
    const offCapability = ctx.capabilities.register({
      id: capabilityId,
      label: 'Console 通知',
    })

    // 卸载时**逆序**清理：先摘监听、撤能力，最后摘 provider。
    return () => {
      offListener()
      offCapability()
      offProvider()
    }
  })
}