import { describe, expect, test } from 'bun:test'
import {
  computeIndicatorsFromDb,
  createEnrichedProvider,
  enrichFromDb,
  type IndicatorCompute,
  type ReadQuery,
} from '../src/enriched'
import type { IndicatorResultRow } from '@berkshire/core'

/** 假 DuckDB 查询面：按 SQL 里的表名返回构造数据；缺表抛错（对齐真实 DuckDB fail-closed）。 */
function fakeDb(tables: { daily?: Array<Record<string, unknown>>; adj_factor?: Array<Record<string, unknown>>; enriched?: Array<Record<string, unknown>> }): ReadQuery {
  return {
    async query<T>(sql: string) {
      if (sql.includes('FROM daily') || sql.includes('FROM\n daily') || sql.includes(' from daily')) {
        if (!tables.daily) throw new Error('Table "daily" does not exist')
        return tables.daily as T[]
      }
      if (sql.includes('FROM adj_factor')) {
        if (!tables.adj_factor) throw new Error('Table "adj_factor" does not exist')
        return tables.adj_factor as T[]
      }
      if (sql.includes('FROM enriched')) {
        if (!tables.enriched) throw new Error('Table "enriched" does not exist')
        return tables.enriched as T[]
      }
      throw new Error(`unexpected query: ${sql}`)
    },
  }
}

const DAILY = [
  { symbol: 'A', date: '2024-01-02', open: 10, high: 12, low: 8, close: 11, volume: 100, amount: 1100 },
  { symbol: 'A', date: '2024-01-05', open: 30, high: 32, low: 29, close: 31, volume: 200, amount: 6200 },
]
const ADJ = [{ symbol: 'A', trade_date: '2024-01-04', ex_factor: 2 }]

describe('enrichFromDb（读 daily + adj_factor → 前复权窄表基点列）', () => {
  test('前复权：事件前 bar 除因子，事件后 bar 原价；raw_* 保留原始价', async () => {
    const rows = await enrichFromDb(fakeDb({ daily: DAILY, adj_factor: ADJ }))
    expect(rows.map((r) => r.date)).toEqual(['2024-01-02', '2024-01-05'])
    expect(rows[0]).toMatchObject({ symbol: 'A', date: '2024-01-02', open: 5, close: 5.5, raw_close: 11 })
    expect(rows[1]).toMatchObject({ date: '2024-01-05', open: 30, close: 31, raw_close: 31 })
  })

  test('fail-closed：daily 表缺失 → 报错', async () => {
    await expect(enrichFromDb(fakeDb({ adj_factor: ADJ }))).rejects.toThrow(/需先采集 daily/)
  })

  test('fail-closed：adj_factor 表缺失 → 报错（禁当「无事件」）', async () => {
    await expect(enrichFromDb(fakeDb({ daily: DAILY }))).rejects.toThrow(/需先采集 adj_factor/)
  })

  test('adj_factor 表存在但相应标的无事件 → 正常（factor=1）', async () => {
    const rows = await enrichFromDb(fakeDb({ daily: DAILY, adj_factor: [] }))
    expect(rows[0]).toMatchObject({ date: '2024-01-02', open: 10, close: 11 })
  })

  test('缺 daily/读取失败 → 变量名注入正确；停牌日剔除', async () => {
    const withHalt = [
      { symbol: 'A', date: '2024-01-02', open: 0, high: 0, low: 0, close: 0, volume: 0, amount: 0 },
      { symbol: 'A', date: '2024-01-05', open: 30, high: 32, low: 29, close: 31, volume: 200, amount: 6200 },
    ]
    const rows = await enrichFromDb(fakeDb({ daily: withHalt, adj_factor: [] }))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2024-01-05' })
  })
})

describe('createEnrichedProvider（derived provider，经 runDatasetSync 消费）', () => {
  test('datasets 声明 enriched 可用；fetch 需 args.database', async () => {
    const p = createEnrichedProvider()
    expect(String(p.id)).toBe('enriched')
    expect(p.datasets).toMatchObject({ enriched: { available: true } })
    await expect(
      p.fetch('enriched' as never, { symbols: 'A' }),
    ).rejects.toThrow(/需要 database/)
  })

  test('fetch 读 daily/adj_factor 变换出 enriched 行', async () => {
    const p = createEnrichedProvider()
    const rows = (await p.fetch('enriched' as never, {
      database: fakeDb({ daily: DAILY, adj_factor: ADJ }),
    })) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ close: 5.5, raw_close: 11 })
  })

  test('fetch 非 enriched dataset → fail-closed 报错', async () => {
    const p = createEnrichedProvider()
    await expect(
      p.fetch('daily' as never, { database: fakeDb({ daily: DAILY, adj_factor: ADJ }) }),
    ).rejects.toThrow(/只服务 enriched/)
  })
})

describe('computeIndicatorsFromDb（派生指标按需现算，不落表）', () => {
  const ENRICHED = Array.from({ length: 20 }, (_, i) => {
    const close = 10 + i
    return { symbol: 'A', date: `2024-01-${String(i + 1).padStart(2, '0')}`, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 100 + i }
  })

  test('读 enriched 表 → 现算全套指标；needed 裁剪到请求列', async () => {
    const db = fakeDb({ enriched: ENRICHED })
    const all = await computeIndicatorsFromDb(db, { symbol: 'A' })
    expect(all).toHaveLength(20)
    expect(all[19]).toMatchObject({ date: '2024-01-20' })
    // needed 裁剪：仅 date + 请求列。
    const pruned = await computeIndicatorsFromDb(db, { symbol: 'A', needed: ['ma5', 'rsi_14'] })
    expect(Object.keys(pruned[19]!).sort()).toEqual(['date', 'ma5', 'rsi_14'].sort())
  })

  test('fail-closed：enriched 表缺失 / 无该标的 → 报错；缺 symbol → 报错', async () => {
    await expect(computeIndicatorsFromDb(fakeDb({}), { symbol: 'A' })).rejects.toThrow(/需先采集 enriched/)
    await expect(
      computeIndicatorsFromDb(fakeDb({ enriched: [] }), { symbol: 'A' }),
    ).rejects.toThrow(/无 symbol/)
    await expect(computeIndicatorsFromDb(fakeDb({ enriched: ENRICHED }), { symbol: '' })).rejects.toThrow(/需传非空 symbol/)
  })

  test('注入 compute（能力缝）生效：注册 Provider 的列真正进入读出结果', async () => {
    const db = fakeDb({ enriched: ENRICHED })
    // 模拟 `ctx.indicators.compute`：先跑内置、再叠加注册 Provider 贡献的列。这里用一个
    // spy 包装验证「注入的 compute 必须被调用」——不再允许 Consumer 绕开 seam 直用纯函数。
    let called = false
    const spy: IndicatorCompute = (series) => {
      called = true
      // 测试只关心「注入的 compute 被调用 + 产出被透传」，非全量指标列 → 转 IndicatorResultRow。
      return series.map((r) => ({ date: r.date, extra_marker: 42 })) as unknown as IndicatorResultRow[]
    }
    const out = await computeIndicatorsFromDb(
      db,
      { symbol: 'A', needed: ['date', 'extra_marker'] },
      undefined,
      spy,
    )
    expect(called).toBe(true)
    expect(out).toHaveLength(20)
    expect(out[0]).toMatchObject({ date: '2024-01-01', extra_marker: 42 })
  })
})