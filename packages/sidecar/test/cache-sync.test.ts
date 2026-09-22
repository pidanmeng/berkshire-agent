/**
 * S3-cache-performance 集成测试：热缓存失效链闭环 + 写后读一致 + parquet 原子替换 + 谓词下推。
 * 真实 DuckDB（`@duckdb/node-api`）。
 *
 * 覆盖：
 * - `runDatasetSync(..., cache)` 写后 bump generation，广播事件携带新 generation；
 * - 写后读立即一致：写完成经读透缓存读 coverage/数据，绝不当缓存「旧内存对象」；
 * - 缓存失效链：coverage 快照（meta 作用域）命中 → sync 写后失效 → 重建；
 * - embedded 写后读一致（缓存不遮蔽新数据）；
 * - parquet-view 原子替换：重复同步无 `.tmp` 残留、视图为最新快照；
 * - 谓词下推：对 parquet-view 视图按 date 切片的查询只返回目标子集（DuckDB lazy scan）。
 *
 * 依赖：模块流 imported 自 sidecar **源码**；`@berkshire/core`/`@berkshire/boot` 经 dist（需先
 * `bun run build:packages` 重建 core）。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import * as corePlug from '@berkshire/core'
import { Boot, setBkHome } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  datasetColumnSchema,
  type DataSourceId,
  type DatasetDeclaration,
  type DatasetId,
} from '@berkshire/core'
import { runDatasetSync } from '../src/sync'
import { createDuckDbProvider } from '../src/duckdb-provider'
import { createCoverageProvider } from '../src/coverage-provider'
import { createFileStorageProvider } from '../src/storage-provider'
import { createDatasetCache, META_SCOPE } from '../src/cache'
import { listCoverageEntries } from '../src/coverage-utils'

const resolver: Resolver = (name) => ({ '@berkshire/core': corePlug })[name]

const EMBEDDED_ID = 'custom_ohlc' as DatasetId
const PV_ID = 'custom_pv' as DatasetId

let home: string
let boot: Boot

function registerTestSource(): void {
  boot.ctx.dataSources.register({
    id: 'demo-src' as DataSourceId,
    label: 'demo-src',
    datasets: {
      [EMBEDDED_ID]: { available: true },
      [PV_ID]: { available: true },
    } as never,
    async fetch(dataset: DatasetId) {
      switch (String(dataset)) {
        case String(EMBEDDED_ID):
          return [
            { symbol: '600000.SH', date: '2025-01-06', close: 10.0 },
            { symbol: '600000.SH', date: '2025-01-07', close: 11.0 },
          ]
        case String(PV_ID):
          return [
            { date: '2025-01-06', factor: 'momentum', pnl: 1.2 },
            { date: '2025-01-07', factor: 'momentum', pnl: 0.9 },
            { date: '2025-01-08', factor: 'value', pnl: 2.1 },
          ]
        default:
          throw new Error(`未注册测试数据集 '${String(dataset)}'（fail-closed）`)
      }
    },
  })
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'bk-cache-sync-test-'))
  setBkHome(home)
  boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  boot.ctx.storage.register(createFileStorageProvider(home))
  boot.ctx.database.register(createDuckDbProvider(home))
  boot.ctx.datasets.registerCoverage(createCoverageProvider(boot.ctx))

  boot.ctx.datasets.register({
    id: EMBEDDED_ID,
    label: '嵌入样例',
    materialization: 'embedded',
    columns: ['symbol', 'date', 'close'],
    columnSchema: datasetColumnSchema(['symbol', 'date', 'close']),
  })
  boot.ctx.datasets.register({
    id: PV_ID,
    label: 'parquet-view 样例',
    materialization: 'parquet-view',
    partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
    columns: ['date', 'factor', 'pnl'],
    columnSchema: [
      { name: 'date', type: 'VARCHAR' },
      { name: 'factor', type: 'VARCHAR' },
      { name: 'pnl', type: 'DOUBLE' },
    ],
  } satisfies DatasetDeclaration)
  registerTestSource()
})

afterAll(async () => {
  try {
    await boot.dispose()
  } finally {
    if (home) rmSync(home, { recursive: true, force: true })
  }
})

describe('S3 失效链闭环 · 写后 bump generation + 事件携带', () => {
  test('runDatasetSync(cache) 写成功后 bump generation，事件携带新 generation', async () => {
    const cache = createDatasetCache()
    const events: Array<Record<string, unknown>> = []
    const unsubscribe = boot.ctx.on('database/dataset-updated', (p) =>
      events.push(p as Record<string, unknown>),
    )
    try {
      const r1 = await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
      expect(r1.generation).toBe(1)
      expect(cache.generationOf(EMBEDDED_ID)).toBe(1)

      const r2 = await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
      expect(r2.generation).toBe(2) // 单调递增
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({ dataset: EMBEDDED_ID, rows: 2 })
      expect(events[0]?.['generation']).toBe(1)
      expect(events[1]?.['generation']).toBe(2)
    } finally {
      unsubscribe()
    }
  })

  test('元作用域在任一 dataset 写后一并失效', async () => {
    const cache = createDatasetCache()
    // 先填充 coverage 读透缓存。
    const before = await cache.read(META_SCOPE, 'coverage', () => ['snapshot'])
    expect(before).toEqual(['snapshot'])
    let after: unknown = before
    // 缓存命中（builder 不调用）：校验缓存生效。
    after = await cache.read(META_SCOPE, 'coverage', () => ['SHOULD_NOT_HIT'])
    expect(after).toEqual(['snapshot'])
    // dataset 写 → bump dataset 且失效 meta 聚合。
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    expect(cache.generationOf(META_SCOPE)).toBe(1)
    // meta 旧槽已逐出 → 重建（读到真实 coverage 快照）。
    const rebuilt = await cache.read(META_SCOPE, 'coverage', () => listCoverageEntries(boot.ctx))
    expect(Array.isArray(rebuilt)).toBe(true)
    expect(cache.stats().slots).toBeGreaterThan(0)
  })
})

describe('S3 写后读一致 · 缓存不遮蔽新数据', () => {
  test('embedded：重复 sync 后经缓存读立即见新数据（禁旧内存对象）', async () => {
    const cache = createDatasetCache()
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    const first = await cache.read(EMBEDDED_ID, 'all', () =>
      boot.ctx.database.query(`SELECT close FROM "${String(EMBEDDED_ID)}"`),
    )
    expect(first).toHaveLength(2)
    // 命中：同一缓存对象（无第二次 DB 读的语义由 builder 不调用体现）。
    const hit = await cache.read(EMBEDDED_ID, 'all', () =>
      boot.ctx.database.query(`SELECT 'BUILDER HIT' AS _x`),
    )
    expect(hit).toBe(first)
    // 写路径（再次 sync）bump generation → 缓存失效 → 下次读重建。
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    expect(cache.generationOf(EMBEDDED_ID)).toBeGreaterThan(0)
    const fresh = await cache.read(EMBEDDED_ID, 'all', () =>
      boot.ctx.database.query(`SELECT close FROM "${String(EMBEDDED_ID)}"`),
    )
    expect(fresh).toHaveLength(2) // 与 first 同结构，但来自重建（generation 已推进）
    expect(cache.stats().hits).toBe(1)
  })
})

describe('S3 parquet-view 原子替换 + 谓词下推', () => {
  test('重复同步无 .tmp 残留、视图为最新快照（写后读一致）', async () => {
    const cache = createDatasetCache()
    await runDatasetSync(boot.ctx, PV_ID, {}, cache)
    await runDatasetSync(boot.ctx, PV_ID, {}, cache)
    const dir = join(home, 'data', String(PV_ID))
    const entries = readdirSync(dir)
    // 原子替换：最终只有 *.parquet，无遗留临时文件。
    expect(entries.some((f) => f.endsWith('.parquet'))).toBe(true)
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false)
    const rows = await boot.ctx.database.query(`SELECT * FROM "${String(PV_ID)}" ORDER BY date`)
    expect(rows).toHaveLength(3)
    expect(rows[2]).toMatchObject({ date: '2025-01-08', pnl: 2.1 })
  }, 15000)

  test('谓词下推：parquet-view 按 date 切片只返回目标子集（不入全量内存）', async () => {
    await runDatasetSync(boot.ctx, PV_ID, {}, createDatasetCache())
    const slice = await boot.ctx.database.query(
      `SELECT date, pnl FROM "${String(PV_ID)}" WHERE date >= '2025-01-07' ORDER BY date`,
    )
    expect(slice).toHaveLength(2)
    expect(slice.map((r) => r['date'])).toEqual(['2025-01-07', '2025-01-08'])
    // 覆盖登记正确（写路径与缓存互不影响值）。
    const cov = await boot.ctx.datasets.reportCoverage(PV_ID)
    expect(cov?.minDate).toBe('2025-01-06')
    expect(cov?.maxDate).toBe('2025-01-08')
    expect(cov?.rows).toBe(3)
  }, 15000)
})