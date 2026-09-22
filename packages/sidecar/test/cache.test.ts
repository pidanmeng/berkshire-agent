/**
 * S3-cache-performance 热读缓存层（`DatasetCache`）单测——纯内存，无 DB。
 *
 * 覆盖：generation-bounded 读透命中/miss；invalidate 失效链（写后读立即一致）；build-new-then-
 * swap 原子替换（构建期并发写不覆盖）；meta 作用域失效；stats；非法 key fail-closed。
 */
import { describe, expect, test } from 'bun:test'
import { DatasetCache, META_SCOPE, createDatasetCache } from '../src/cache'
import type { DatasetId } from '@berkshire/core'

const D = 'instruments' as DatasetId

describe('DatasetCache · generation-bounded 读透', () => {
  test('首次读为 miss + 构建缓存；同 generation 二次读命中（原样复用同一对象）', async () => {
    const c = createDatasetCache()
    let builds = 0
    const a = await c.read(D, 'all', () => {
      builds++
      return { items: [1, 2, 3] }
    })
    const b = await c.read(D, 'all', async () => {
      // 命中时不调用 builder：若被调用则视为重建。
      builds++
      return { items: [9, 9] }
    })
    expect(builds).toBe(1)
    expect(b).toBe(a) // 原样复用同一内存对象（不改口径）
    const st = c.stats()
    expect(st.hits).toBe(1)
    expect(st.misses).toBe(1)
    expect(st.slots).toBe(1)
    expect(c.generationOf(D)).toBe(0) // 未写过 → 0
  })

  test('invalidate bump generation → 旧槽失效，下次读重建；写后读立即一致', async () => {
    const c = createDatasetCache()
    const first = await c.read(D, 'all', () => ({ v: 'old' }))
    expect(first).toEqual({ v: 'old' })
    // 模拟写路径：数据已落库 → bump generation + 逐出旧槽。
    const gen = c.invalidate(D)
    expect(gen).toBe(1)
    expect(c.generationOf(D)).toBe(1)
    expect(c.stats().slots).toBe(0)
    const second = await c.read(D, 'all', () => ({ v: 'new' }))
    expect(second).toEqual({ v: 'new' }) // 绝不当缓存返回旧内存对象
  })

  test('build-new-then-swap：构建期间发生并发 invalidate → 本次构建结果不覆盖新 generation', async () => {
    const c = createDatasetCache()
    await c.read(D, 'all', () => ({ v: 'baseline' }))
    c.invalidate(D) // bump 到 gen1、逐出旧槽，使下次 read 走 miss 分支（builder 才被执行）
    // builder 构建到一半，并发写完成并再次 bump generation（gen1 → gen2）。
    const val = await c.read(D, 'all', async () => {
      c.invalidate(D) // 模拟写路径在构建期间 bump
      return { v: 'stale-build' }
    })
    expect(val).toEqual({ v: 'stale-build' }) // 本次调用拿到构建结果（写路径权威）
    // 但该结果**不得**写入缓存（generation 已推进），否则旧对象覆盖新快照。
    expect(c.stats().slots).toBe(0)
    // 下次读走新 generation（gen2），重建。
    const next = await c.read(D, 'all', () => ({ v: 'fresh' }))
    expect(next).toEqual({ v: 'fresh' })
  })

  test('invalidateMeta 逐出 meta 聚合槽，保留 dataset 槽；写路径两者兼失效', async () => {
    const c = createDatasetCache()
    await c.read(D, 'all', () => 1)
    await c.read(META_SCOPE, 'coverage', () => 2)
    expect(c.stats().slots).toBe(2)
    c.invalidateMeta()
    expect(c.stats().slots).toBe(1)
    expect(c.stats().generations[String(META_SCOPE)]).toBe(1)
  })

  test('clearAll 全清缓存槽（DB 重建/热更准备）', async () => {
    const c = createDatasetCache()
    await c.read(D, 'a', () => 1)
    await c.read(D, 'b', () => 2)
    expect(c.stats().slots).toBe(2)
    c.clearAll()
    expect(c.stats().slots).toBe(0)
  })

  test('非法 key（空 / 含分隔符）响亮抛错（fail-closed）', async () => {
    const c = createDatasetCache()
    await expect(c.read(D, '', () => 1)).rejects.toThrow(/非法缓存 key/)
    await expect(c.read(D, 'a::b', () => 1)).rejects.toThrow(/非法缓存 key/)
  })
})

describe('DatasetCache · readSync 同步形态', () => {
  test('同步 builder 命中/失效语义一致', () => {
    const c = createDatasetCache()
    expect(c.readSync(D, 'sync-key', () => 'x')).toBe('x')
    expect(c.readSync(D, 'sync-key', () => 'y')).toBe('x') // 命中，builder 未调用
    expect(c.stats().hits).toBe(1)
  })
})

describe('DatasetCache · 实例化/工厂', () => {
  test('createDatasetCache / new DatasetCache 等价', () => {
    const a = createDatasetCache()
    const b = new DatasetCache()
    a.readSync(D, 'k', () => 7)
    b.readSync(D, 'k', () => 8)
    expect(a.readSync(D, 'k', () => -1)).toBe(7)
    expect(b.readSync(D, 'k', () => -1)).toBe(8)
  })
})