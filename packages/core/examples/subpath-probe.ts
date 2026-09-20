// 探针（示例，可删）：验证 @berkshire/core 子路径导出可独立解析（B 级真义落地验证）。
// 用法：bun run packages/core/examples/subpath-probe.ts
import { LogService } from '@berkshire/core/services/log'
import { NotifyService } from '@berkshire/core/seams/notify'
import { Slots } from '@berkshire/core/services/slots'
import { ClientModules } from '@berkshire/core/services/clientModules'
import type { LogEntry } from '@berkshire/core/types'
import type { CapabilityId } from '@berkshire/core/brand'
import { Context } from '@berkshire/cordis'

// 只引入服务定义即可各自把 ctx.* / Events 的类型增强带入本模块。
export async function main(): Promise<void> {
  const ctx = new Context()
  new LogService(ctx)
  new Slots(ctx)
  new ClientModules(ctx)
  new NotifyService(ctx)

  const entry: LogEntry = ctx.log!.append('probe', { ok: true })
  ctx.slots!.claims('analysis.menu')
  ctx.clientModules!.list()
  const _branded: CapabilityId = undefined as unknown as CapabilityId
  void entry
  void _branded
}

if (import.meta.url.endsWith('subpath-probe.ts')) void main()