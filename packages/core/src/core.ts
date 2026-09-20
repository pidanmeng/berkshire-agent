import { z } from 'zod'
import type { Context } from '@berkshire/cordis'
import { Log, LogService } from './services/log'
import { CapabilityRegistry } from './services/capabilities'
import { NotifyService } from './seams/notify'
import { StorageService } from './seams/storage'
import { Slots } from './services/slots'
import { ClientModules } from './services/clientModules'
import './events'

/**
 * 核心脊装配插件：装载即提供 `ctx.log` / `ctx.capabilities` / `ctx.notifier` /
 * `ctx.storage` / `ctx.slots` / `ctx.clientModules`。
 *
 * 路径 A 示范：`ctx.log` 已作为**独立插件组件（`Log`）**装载（`ctx.plugin(Log)`），其余五服务
 * 仍是 `new XService(ctx)` 直装。每个服务无论以哪种形态装载，都经 `Service` 基类以
 * `ctx.fiber.effect` 自注册，因此「注册即效应」——本插件卸载时服务被逆序撤销、消费者明确失败。
 *
 * v1 实现核心脊的 sessions/log、capabilities、notifier(seam)、storage(seam)、slots、
 * clientModules 六条；database/datasets/market/scheduler 仍是目标态（Todo）。
 */
export const name = '@berkshire/core'

export const inject = [] as string[]

export const Config = z.object({})

export async function apply(_ctx: Context, _config: z.infer<typeof Config>): Promise<void> {
  await _ctx.plugin(Log)
  new CapabilityRegistry(_ctx)
  new NotifyService(_ctx)
  new StorageService(_ctx)
  new Slots(_ctx)
  new ClientModules(_ctx)
}

// TODO(v2): database、datasets、market、scheduler 核心脊服务。