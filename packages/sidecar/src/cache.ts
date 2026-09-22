/**
 * 热读缓存层 + generation 管理（S3-cache-performance）。
 *
 * 在数据组/同步链路之上建立**热读缓存 + 失效链**：热门数据集读（如 enriched 最新日、
 * instruments、coverage 快照、实时快照）命中内存缓存放大读吞吐；写路径（`sync.ts`）做完
 * **生成新快照后原子替换**落库，随后 bump generation 并失效；读端以 generation 判读是否可
 * 复用缓存，杜绝「已写文件（已 bump）却返回旧内存对象」。
 *
 * 语义（对齐 TSP `repository.py` 的 Polars 缓存 + 原子替换 + generation）：
 * - **绑 generation**：每个 dataset（含虚拟元作用域 `__meta__`）维护一个单调递增 generation。
 *   写路径 bump 它；读 `read()` 若缓存条目的 generation === 当前 generation → 命中复用，否则
 *   miss → `builder()` 构建新快照；
 * - **build-new-then-swap**：`builder()` 返回新值后**原子替换**缓存引用写入，且只在「构建期
 *   generation 未变」时才写——若构建期间发生了并发写（generation 被 bump），丢弃本次写入，
 *   下次读会再构建（不拿旧 generation 的新值覆盖新 generation，防「并发写不覆盖」）；
 * - **失效链闭环**：持久化写落库 → `invalidate(dataset)`（bump generation + 逐出该 dataset
 *   全部缓存槽）→ 事件广播（`database/dataset-updated` 带 generation）→ 前端 query 失效。
 *   元作用域（coverage 快照等跨 dataset 聚合）在任一 dataset 写后经 `invalidateMeta()` 一并失效。
 *
 * 严格边界：本层**只缓存不篡改值**——`builder()` 读源数据契约（前复权/CN_TZ/停牌）由上游
 * 保证，缓存只做「命中即原样返回同一对象」，不改口径、不伪造（docs/data-model.md §5/§6）。
 * 缓存对象是**内存视图**；本层与 DuckDB 单写者在同一进程，写路径已由 provider 串行化，
 * generation 是额外的失效判据（不是跨进程锁——Rust 单写者/缓存仍目标态）。
 */
import type { DatasetId } from '@berkshire/core'

/** 元作用域：跨 dataset 的聚合快照（如 coverage 全量）存这里，任一 dataset 写后失效。 */
export const META_SCOPE = '__meta__' as const

/** 缓存作用域：一个 dataset（或元作用域「一个聚合」）的多个缓存槽按 `key` 区分。 */
export type CacheScope = DatasetId | typeof META_SCOPE

/** 一个缓存槽（内存视图 + 它构建时锁定的 generation）。 */
interface CacheSlot<T = unknown> {
  value: T
  /** 构建时的 generation（== 命中所需当前 generation）。 */
  generation: number
  storedAt: number
  hits: number
}

/** 缓存统计（性能基准/诊断用）。 */
export interface CacheStats {
  hits: number
  misses: number
  /** 当前存活缓存槽数。 */
  slots: number
  /** 各作用域当前 generation。 */
  generations: Record<string, number>
}

/** 单作用域缓存槽键分隔符（dataset/key 不会含 `::`：key 由调用方传白名单常量）。 */
const SEP = '::'

/**
 * 构造热读缓存。单例应创建于 sidecar 装配期并串进同步编排/读路径（见 `packages/sidecar/src/index.ts`）。
 */
export class DatasetCache {
  private slots = new Map<string, CacheSlot<any>>()
  private gens = new Map<CacheScope, number>()
  private hits = 0
  private misses = 0

  /** 当前 generation（未写过 → 0）。 */
  generationOf(scope: CacheScope): number {
    return this.gens.get(scope) ?? 0
  }

  /**
   * 读透缓存：命中（槽的 generation === 当前 generation）→ 原样返回缓存值（不改口径）；
   * miss → `builder()` 构建新快照 → **构建成功后**若 generation 未变则原子替换写入再返回。
   * 并发写发生（构建期 generation 被 bump）→ 本次结果不写入缓存，但照常返回给本次调用
   * （写路径权威、已落库；缓存下轮失效后重建）。
   */
  async read<T>(scope: CacheScope, key: string, builder: () => Promise<T> | T): Promise<T> {
    if (key === '' || key.includes(SEP)) {
      throw new Error(`[cache] 非法缓存 key '${key}'（fail-closed：必须非空且不含分隔符）`)
    }
    const slotKey = `${String(scope)}${SEP}${key}`
    const gen = this.generationOf(scope)
    const slot = this.slots.get(slotKey)
    if (slot && slot.generation === gen) {
      this.hits++
      slot.hits++
      return slot.value
    }
    this.misses++
    const value = await builder()
    // build-new-then-swap：只在「构建期 generation 未变」时写入，避免旧 generation 的结果
    // 覆盖并发新写（对齐「并发写不覆盖」语义）。
    if (this.generationOf(scope) === gen) {
      this.slots.set(slotKey, { value, generation: gen, storedAt: Date.now(), hits: 0 })
    }
    return value
  }

  /** **同步形态**读透（builder 为同步值）。内部与 `read()` 同一失效语义（hit/miss + 原子替换）。 */
  readSync<T>(scope: CacheScope, key: string, builder: () => T): T {
    if (key === '' || key.includes(SEP)) {
      throw new Error(`[cache] 非法缓存 key '${key}'（fail-closed：必须非空且不含分隔符）`)
    }
    const slotKey = `${String(scope)}${SEP}${key}`
    const gen = this.generationOf(scope)
    const slot = this.slots.get(slotKey)
    if (slot && slot.generation === gen) {
      this.hits++
      slot.hits++
      return slot.value
    }
    this.misses++
    const value: T = builder()
    if (this.generationOf(scope) === gen) {
      this.slots.set(slotKey, { value, generation: gen, storedAt: Date.now(), hits: 0 })
    }
    return value
  }

  /**
   * 写路径失效：bump 该作用域的 generation + 逐出其全部缓存槽，返回新 generation。
   * 单写者的数据**落库成功后**调用；此后任何旧 generation 的槽都判失效。
   */
  invalidate(scope: CacheScope): number {
    const gen = (this.gens.get(scope) ?? 0) + 1
    this.gens.set(scope, gen)
    const prefix = `${String(scope)}${SEP}`
    for (const key of [...this.slots.keys()]) {
      if (key.startsWith(prefix)) this.slots.delete(key)
    }
    return gen
  }

  /** 失效全部元作用域聚合（任一 dataset 写后调用：coverage 快照等反映所有 dataset）。 */
  invalidateMeta(): number {
    return this.invalidate(META_SCOPE)
  }

  /** 失效全部缓存（跨 dataset 全清，如 DB 重建/热更重启准备）。 */
  clearAll(): void {
    this.slots.clear()
  }

  /** 统计（性能基准/诊断）。 */
  stats(): CacheStats {
    const generations: Record<string, number> = {}
    for (const [scope, gen] of this.gens) generations[String(scope)] = gen
    return {
      hits: this.hits,
      misses: this.misses,
      slots: this.slots.size,
      generations,
    }
  }
}

/** 便捷工厂（README/TSP 对齐：单例装配期创建）。 */
export function createDatasetCache(): DatasetCache {
  return new DatasetCache()
}