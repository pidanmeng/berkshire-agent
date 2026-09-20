import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { CapabilityReg } from '../types'
import type { CapabilityId } from '../brand'

// ctx.capabilities + 其自有事件 —— 服务/事件类型增强 co-locate（@mode emit）
declare module '@berkshire/cordis' {
  interface Context {
    capabilities: CapabilityRegistry
  }
  interface Events {
    /**
     * 能力可用性变化（注册或卸除后广播）。
     * @mode emit
     * @param payload.capability 变化的能力 id
     * @param payload.usable 变化后的可用性
     */
    'capabilities/changed'(payload: { capability: CapabilityId; usable: boolean }): void
  }
}

/**
 * `ctx.capabilities` —— 能力注册表与可用性门控（核心脊）。
 *
 * 目标态（docs/capability-seams.md §4）：`CAPABILITY_REGISTRY` +
 * `build_capability_matrix`，把 provider 声明的 datasets 合并成每个能力
 * `{ usable, effective, candidates, pending }`，全部门控以 `usable` 为准。
 * v1 只实现**最小可用子集**：按 `@mode emit` 事件广播能力注册/卸除，并提供
 * fail-closed 的 `usable` 判断；能力矩阵（effective/candidates/pending）、
 * CAPABILITY_REGISTRY 常量与 `build_capability_matrix` 留 TODO（v2）。
 */
export class CapabilityRegistry extends Service {
  private caps = new Map<CapabilityId, CapabilityReg>()

  constructor(ctx: Context) {
    super(ctx, 'capabilities')
  }

  /**
   * 注册一项能力。返回可撤销 disposer；卸载/失效后 `usable` 恢复 false 并广播
   * `capabilities/changed`（@mode emit）。重复注册**响亮失败**（fail-closed）。
   */
  register(reg: CapabilityReg): () => void {
    return this.ctx.effect(() => {
      if (this.caps.has(reg.id)) {
        throw new Error(`capability "${reg.id}" already registered`)
      }
      this.caps.set(reg.id, reg)
      this.ctx.emit('capabilities/changed', { capability: reg.id, usable: true })
      return () => {
        this.caps.delete(reg.id)
        this.ctx.emit('capabilities/changed', { capability: reg.id, usable: false })
      }
    })
  }

  /** 通用门控：该能力当前是否可用（所有门控以 `usable` 为准，fail-closed）。 */
  usable(id: CapabilityId): boolean {
    return this.caps.has(id)
  }

  /** 能力矩阵快照（v1 为注册表全量；effective/candidates/pending 留 v2）。 */
  matrix(): readonly CapabilityReg[] {
    return [...this.caps.values()]
  }

  // TODO(v2): CAPABILITY_REGISTRY 常量 + build_capability_matrix + effective/candidates/pending。
}