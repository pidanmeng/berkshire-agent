import { Service } from 'cordis'
import type { Context } from 'cordis'
import type { NotifyPayload, NotifyProvider } from '../types'

/**
 * `ctx.notifier` —— 通知能力缝的 **Service Definition**（三角色之「定义」）。
 *
 * 能力缝三角色（docs/capability-seams.md §1、§3）：
 * - **Service Definition**：本类（`super(ctx, 'notifier')`）；
 * - **Provider**：注册方（v1 的 `@berkshire/plugin-notify-console`），实现
 *   `NotifyProvider.send` 并经 `register()` 挂入，返回可撤销 disposer；
 * - **Consumer**：调用 `send()` 的一方（模型/前端/监控等）。
 *
 * `send()` 先广播 `'notify/request'`（@mode emit，能力策略事件，供策略/观察者在不改
 * provider 的前提下挂接），再逐一投递给已注册 provider。**无 provider 时 fail-closed**：
 * 显式抛错，绝不静默吞掉通知。
 */
export class NotifyService extends Service {
  private providers = new Map<string, NotifyProvider>()

  constructor(ctx: Context) {
    super(ctx, 'notifier')
  }

  /** 注册一个 provider；返回可撤销 disposer。重复 id **响亮失败**。 */
  register(provider: NotifyProvider): () => void {
    return this.ctx.effect(() => {
      if (this.providers.has(provider.id)) {
        throw new Error(`notifier provider "${provider.id}" already registered`)
      }
      this.providers.set(provider.id, provider)
      return () => {
        this.providers.delete(provider.id)
      }
    })
  }

  /** 已注册 provider 数。 */
  get size(): number {
    return this.providers.size
  }

  /** 是否已有可投递的 provider。 */
  get available(): boolean {
    return this.providers.size > 0
  }

  /** 广播 + 投递一条通知；返回实际投递成功的 provider id 列表。 */
  async send(payload: NotifyPayload): Promise<string[]> {
    this.ctx.emit('notify/request', payload)
    const delivered: string[] = []
    for (const provider of this.providers.values()) {
      await provider.send(payload)
      delivered.push(provider.id)
    }
    if (delivered.length === 0) {
      throw new Error(
        `notify: no provider registered for message "${payload.message}" (fail-closed)`,
      )
    }
    return delivered
  }

  // TODO(v2): per-channel 路由偏好、并行/串行 mode、provider 可用性探测与 pending 标记。
}