import { describe, expect, test } from 'bun:test'
import {
  adjustPrice,
  filterHaltDays,
  groupAdjFactors,
  isHaltDay,
  toEnrichedRows,
} from '../src/dataContract'

/**
 * Enriched 变换纯函数（docs/data-model.md §6 复权红线）回归：
 * 停牌日 / 前复权 / 窄表基点列 / fail-closed（原始价缺失、日期非法、缺 symbol）不漂移。
 */

describe('filter_halt_days 语义（TSP）', () => {
  test('open==0 且 high==0 → 停牌', () => {
    expect(isHaltDay({ open: 0, high: 0, low: 1, close: 1 })).toBe(true)
  })
  test('volume==0 且 amount==0 → 停牌', () => {
    expect(isHaltDay({ open: 1, high: 1, volume: 0, amount: 0 })).toBe(true)
  })
  test('close==0 单列不判停牌（不误删），open/high/volume 正常 → 非停牌', () => {
    expect(isHaltDay({ open: 1, high: 1, volume: 100, amount: 100, close: 0 })).toBe(false)
    expect(isHaltDay({ open: 0, high: 1, volume: 100, amount: 100 })).toBe(false)
    expect(isHaltDay({ open: 1, high: 1, close: 0 })).toBe(false) // volume/amount 缺失 → null≠0
  })
  test('filterHaltDays 剔除停牌行，其余原样保留', () => {
    const rows = [
      { symbol: 'A', date: '2024-01-02', open: 0, high: 0, close: 1 },
      { symbol: 'A', date: '2024-01-03', open: 1, high: 1, close: 2 },
    ]
    const out = filterHaltDays(rows)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ date: '2024-01-03' })
  })
})

describe('adjustPrice / groupAdjFactors', () => {
  test('adjustPrice：a = v / factor；非法乘数/非数值透传不伪造', () => {
    expect(adjustPrice(12, 4)).toBe(3)
    expect(adjustPrice(12, 0)).toBe(12)
    expect(adjustPrice(12, Number.NaN)).toBe(12)
    expect(adjustPrice(null, 4)).toBeNull()
  })
  test('groupAdjFactors：按 symbol 归组，过滤非法日期/因子', () => {
    const m = groupAdjFactors([
      { symbol: 'A', trade_date: '2024-01-02', ex_factor: 2 },
      { symbol: 'A', trade_date: 'bad', ex_factor: 3 },
      { symbol: 'B', trade_date: '2024-01-05', ex_factor: '4' },
      { symbol: 'C', trade_date: '2024-01-05', ex_factor: Number.NaN },
    ])
    expect(m.get('A')).toEqual([{ trade_date: '2024-01-02', ex_factor: 2 }])
    expect(m.get('B')).toEqual([{ trade_date: '2024-01-05', ex_factor: 4 }])
    expect(m.get('C')).toBeUndefined()
    expect(m.get('A')![0]!.ex_factor).toBe(2)
  })
})

describe('toEnrichedRows（前复权窄表基点列）', () => {
  test('按原始日K排序 + 前复权 open/high/low/close = raw/factor；raw_* 保留原始价', () => {
    const rows = toEnrichedRows(
      [
        // 乱序：应先按日期排正
        { symbol: 'A', date: '2024-01-05', open: 30, high: 32, low: 29, close: 31, volume: 200, amount: 6200 },
        { symbol: 'A', date: '2024-01-02', open: 10, high: 12, low: 8, close: 11, volume: 100, amount: 1100 },
        { symbol: 'A', date: '2024-01-03', open: 11, high: 12, low: 10, close: 12, volume: 100, amount: 1200 },
      ],
      [
        // 事件：01-04 ex_factor=2 → 01-02/01-03（事件前 bar）= raw/2；01-05（事件后已是除权价）= 原价
        { symbol: 'A', trade_date: '2024-01-04', ex_factor: 2 },
      ],
    )
    expect(rows.map((r) => r.date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-05'])
    // 01-02/01-03：事件（01-04）在其后 → factor=2 → 前复权 = raw/2；raw_* 保留原始价。
    expect(rows[0]).toMatchObject({
      symbol: 'A', date: '2024-01-02', open: 5, high: 6, low: 4, close: 5.5,
      volume: 100, amount: 1100, raw_close: 11, raw_high: 12, raw_low: 8,
    })
    expect(rows[1]).toMatchObject({ date: '2024-01-03', open: 5.5, high: 6, low: 5, close: 6, raw_close: 12 })
    // 01-05：事件（01-04）不晚于它 → factor=1 → 已是前复权刻度，原价不变。
    expect(rows[2]).toMatchObject({
      date: '2024-01-05', open: 30, high: 32, low: 29, close: 31,
      raw_close: 31, raw_high: 32, raw_low: 29,
    })
    // 列集 = ENRICHED_STORAGE_COLS（窄表基点列 + 诚实 null 列）。
    expect(Object.keys(rows[0]!).sort()).toEqual(
      [
        'symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'amount',
        'raw_close', 'raw_high', 'raw_low', 'turnover_rate',
        'consecutive_limit_ups', 'consecutive_limit_downs', 'quote_ts',
      ].sort(),
    )
    expect(rows[0]!.turnover_rate).toBeNull()
    expect(rows[0]!.consecutive_limit_ups).toBeNull()
    expect(rows[0]!.quote_ts).toBeNull()
  })

  test('停牌日（open/high=0）被剔除，不进入 enriched 输出', () => {
    const rows = toEnrichedRows(
      [
        { symbol: 'A', date: '2024-01-02', open: 10, high: 12, low: 8, close: 11, volume: 100, amount: 1100 },
        { symbol: 'A', date: '2024-01-03', open: 0, high: 0, low: 0, close: 0, volume: 0, amount: 0 },
      ],
      [],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2024-01-02', close: 11 })
  })

  test('fail-closed：行缺 symbol → 抛错', () => {
    expect(() => toEnrichedRows([{ date: '2024-01-02', close: 1 }], [])).toThrow(/缺 symbol/)
  })

  test('fail-closed：日期缺失/非法 → 抛错', () => {
    expect(() =>
      toEnrichedRows([{ symbol: 'A', date: 'not-a-date', close: 1 }], []),
    ).toThrow(/日期缺失\/非法/)
  })

  test('fail-closed：原始价全部缺失 → 抛错（禁静默吐复权价）', () => {
    expect(() =>
      toEnrichedRows([{ symbol: 'A', date: '2024-01-02', open: null, high: null, low: null, close: null }], []),
    ).toThrow(/原始价全部缺失/)
    // 部分缺失（有 open）→ 可复权，不抛。
    expect(() =>
      toEnrichedRows([{ symbol: 'A', date: '2024-01-02', open: 10, close: null }], []),
    ).not.toThrow()
  })

  test('原始价缺失用 null 表示（不伪造 0），volume/amount 过 toFloat 归一', () => {
    const rows = toEnrichedRows(
      [{ symbol: 'A', date: '2024-01-02', open: 10, close: 12, volume: 'ab' as unknown as number, amount: undefined }],
      [],
    )
    expect(rows[0]).toMatchObject({ low: null, high: null, volume: null, amount: null, raw_close: 12 })
  })
})