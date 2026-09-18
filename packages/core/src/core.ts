import { z } from 'zod'
import type { Context } from 'cordis'
import { LogService } from './services/log'
import { CapabilityRegistry } from './services/capabilities'
import { NotifyService } from './seams/notify'
import './events'

/**
 * 核心脊装配插件：装载即提供 `ctx.log` / `ctx.capabilities` / `ctx.notifier`。
 *
 * 每个 `new XService(ctx)` 都经 `Service` 基类以 `ctx.fiber.effect` 自注册，因此
 * 「注册即效应」——本插件卸载时三个服务会被逆序撤销、消费者明确失败。
 *
 * v1 只实现核心脊的 sessions/log、capabilities 与 notifier(能力缝定义) 三条；
 * database/datasets/market/slots/clientModules/scheduler 仍是目标态（Todo）。
 */
export const name = '@berkshire/core'

export const inject = [] as string[]

export const Config = z.object({})

export function apply(_ctx: Context, _config: z.infer<typeof Config>): void {
  new LogService(_ctx)
  new CapabilityRegistry(_ctx)
  new NotifyService(_ctx)
}

// TODO(v2): database、datasets、market、slots、clientModules、scheduler 核心脊服务。