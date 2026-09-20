import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { StorageProvider } from '../types'
import type { StorageNamespaceId } from '../brand'

// ctx.storage + 其自有事件 —— 能力缝三角色之「定义」的 Service Definition 增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    storage: StorageService
  }
  interface Events {
    /**
     * 一次持久的键值变化（`storage/set` 或 `storage/remove` 成功后广播），供宿主侧
     * 订阅后经 `storage/changed` 推送 webview（前端薄客户端重拉快照）。
     * @mode emit
     * @param payload.ns 变化的命名空间（品牌 id）
     * @param payload.key 变化的键名
     */
    'storage/changed'(payload: { ns: StorageNamespaceId; key: string }): void
  }
}

/**
 * `ctx.storage` —— 持久化能力缝的 **Service Definition**（三角色之「定义」，WP-2）。
 *
 * 能力缝三角色（docs/capability-seams.md §1/§3）：
 * - **Service Definition**：本类（`super(ctx, 'storage')`）；
 * - **Provider**：注册方（WP-2 由 sidecar 的 `createFileStorageProvider(bkHome)` 实现），
 *   把键值落盘到 `$BK_HOME/state/<ns>/<key>.json`，经 `register()` 挂入，返回可撤销 disposer；
 * - **Consumer**：调用 `get/set/remove/list` 的插件/前端（WP-2 的 demo 插件演示挂载时读写）。
 *
 * 诚实边界：本方案是 `$BK_HOME/state` 的**轻量 JSON 持久化**，明确**不是** DuckDB——DuckDB
 * 单写者/表结构仍是目标态。`set`/`remove` 成功后会广播 `storage/changed`（@mode emit）。
 * **无 provider 时 fail-closed**：任一读写显式抛错，绝不静默降级为内存态。
 */
export class StorageService extends Service {
  private provider: StorageProvider | null = null

  constructor(ctx: Context) {
    super(ctx, 'storage')
  }

  /** 注册一个 provider；返回可撤销 disposer。重复注册**响亮失败**。 */
  register(provider: StorageProvider): () => void {
    return this.ctx.effect(() => {
      if (this.provider) {
        throw new Error(`storage provider "${this.provider.id}" already registered`)
      }
      this.provider = provider
      return () => {
        // 仅当仍是同一个 provider 时才摘除（避免误删后来者）。
        if (this.provider === provider) this.provider = null
      }
    })
  }

  /** 是否已有可用 provider。 */
  get available(): boolean {
    return this.provider !== null
  }

  private requireProvider(): StorageProvider {
    if (!this.provider) {
      throw new Error('[storage] no provider registered (fail-closed)')
    }
    return this.provider
  }

  /** 读一个键（缺失返回 `undefined`；坏文件/越权 fail-closed 抛错）。 */
  async get<T>(ns: StorageNamespaceId, key: string): Promise<T | undefined> {
    return this.requireProvider().get<T>(ns, key)
  }

  /** 写一个键（JSON 序列化 + 原子改名写）；成功后广播 `storage/changed`。 */
  async set(ns: StorageNamespaceId, key: string, value: unknown): Promise<void> {
    await this.requireProvider().set(ns, key, value)
    this.ctx.emit('storage/changed', { ns, key })
  }

  /** 删除一个键（缺失视为成功）；成功后广播 `storage/changed`。 */
  async remove(ns: StorageNamespaceId, key: string): Promise<void> {
    await this.requireProvider().remove(ns, key)
    this.ctx.emit('storage/changed', { ns, key })
  }

  /** 列出某命名空间下全部键名。 */
  async list(ns: StorageNamespaceId): Promise<string[]> {
    return this.requireProvider().list(ns)
  }

  // TODO(v2): storage-duckdb provider、事务/复杂查询/schema 迁移、范围遍历与订阅。
}