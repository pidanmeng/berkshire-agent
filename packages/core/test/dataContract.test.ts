import { describe, expect, test } from 'bun:test'
import {
  ADJ_FACTOR_COLUMNS,
  CALENDAR_COLUMNS,
  DAILY_COLUMNS,
  ENRICHED_STORAGE_COLS,
  FINANCIAL_COLUMNS,
  INDEX_COLUMNS,
  INSTRUMENT_COLUMNS,
  MINUTE_COLUMNS,
  columnSqlType,
  derivePreClose,
  forwardAdjust,
  forwardAdjustFactor,
  toFloat,
  volumeToHand,
} from '../src/dataContract'

/**
 * 数据契约红线（docs/data-model.md §6）在 `dataContract.ts` 的**单一实现**回归测试：
 * 类型映射、数值/单位口径、复权口径不漂移。
 */

describe('规范化列集（docs/data-model.md §3）', () => {
  test('八组基础数据列集存在且关键列就位', () => {
    expect(INSTRUMENT_COLUMNS).toContain('symbol')
    expect(INSTRUMENT_COLUMNS).toContain('status')
    expect(DAILY_COLUMNS).toEqual([
      'symbol', 'asset_type', 'source', 'date', 'open', 'high', 'low', 'close',
      'volume', 'amount', 'pre_close', 'change_pct',
    ])
    expect(ADJ_FACTOR_COLUMNS).toEqual(['symbol', 'asset_type', 'source', 'trade_date', 'ex_factor'])
    // enriched 窄表：复权 OHLC + 原始价 + 不可现算列。
    expect(ENRICHED_STORAGE_COLS).toContain('raw_close')
    expect(ENRICHED_STORAGE_COLS).toContain('turnover_rate')
    expect(ENRICHED_STORAGE_COLS).toContain('consecutive_limit_ups')
    expect(ENRICHED_STORAGE_COLS).toContain('quote_ts')
    // 无重复列。
    for (const cols of [
      INSTRUMENT_COLUMNS, DAILY_COLUMNS, ADJ_FACTOR_COLUMNS, ENRICHED_STORAGE_COLS,
      INDEX_COLUMNS, MINUTE_COLUMNS, FINANCIAL_COLUMNS, CALENDAR_COLUMNS,
    ]) {
      expect(new Set(cols).size).toBe(cols.length)
    }
  })
})

describe('类型映射契约（columnSqlType）', () => {
  test('标识/时间列 → VARCHAR', () => {
    for (const c of ['symbol', 'index_code', 'name', 'exchange', 'asset_type', 'source',
      'table', 'key', 'freq', 'list_date', 'status',
      'date', 'datetime', 'trade_date', 'period_end', 'announce_date', 'quote_ts']) {
      expect(columnSqlType(c)).toBe('VARCHAR')
    }
  })
  test('数值列 → DOUBLE', () => {
    for (const c of ['open', 'high', 'low', 'close', 'volume', 'amount', 'pre_close',
      'change_pct', 'ex_factor', 'turnover_rate', 'raw_close', 'raw_high', 'raw_low',
      'consecutive_limit_ups', 'consecutive_limit_downs', 'last_price']) {
      expect(columnSqlType(c)).toBe('DOUBLE')
    }
  })
  test('未知列缺省 DOUBLE（数值列默认，不悄悄改类型）', () => {
    expect(columnSqlType('anything_new')).toBe('DOUBLE')
  })
})

describe('数值/单位口径（不回归）', () => {
  test('toFloat：非有限值 → null（不伪造）', () => {
    expect(toFloat(1.5)).toBe(1.5)
    expect(toFloat('12')).toBe(12)
    expect(toFloat(null)).toBeNull()
    expect(toFloat(undefined)).toBeNull()
    expect(toFloat(Number.NaN)).toBeNull()
    expect(toFloat(Number.POSITIVE_INFINITY)).toBeNull()
  })
  test('volumeToHand：股 → 手（floor）', () => {
    expect(volumeToHand(100)).toBe(1)
    expect(volumeToHand(250)).toBe(2)
    expect(volumeToHand(null)).toBeNull()
    expect(volumeToHand('0')).toBe(0)
  })
  test('derivePreClose：窗口内同源推导，首行前收 → null', () => {
    const rows = derivePreClose([
      { symbol: 'A', date: '2024-01-02', close: 10 },
      { symbol: 'A', date: '2024-01-03', close: 11 },
      { symbol: 'A', date: '2024-01-04', close: 12.1 },
    ])
    expect(rows[0]).toMatchObject({ symbol: 'A', pre_close: null, change_pct: null })
    expect(rows[1]).toMatchObject({ pre_close: 10, change_pct: 0.1 })
    const eps = 1e-9
    expect(Math.abs((rows[2]!.change_pct as number) - (12.1 - 11) / 11)).toBeLessThan(eps)
  })
  test('derivePreClose：无 symbol 行原样透传、不伪造', () => {
    const rows = derivePreClose([{ close: 5 }])
    expect(rows[0]).toMatchObject({ close: 5, pre_close: null, change_pct: null })
  })
})

describe('前复权口径（adj = raw / Π(事件后 ex_factor)，单一实现）', () => {
  test('后缀累积：取「严格晚于」该日期的事件累乘；事件当日 bar 不调整', () => {
    const factor = forwardAdjustFactor([
      { trade_date: '2024-01-02', ex_factor: 2 },
      { trade_date: '2024-01-04', ex_factor: 3 },
    ])
    // 事件之后（无事件更晚）→ 1（bar 已在当前除权刻度）。
    expect(factor('2024-01-05')).toBe(1)
    // 事件当日不调整（当日 bar 已是除权价）→ 只乘其后的 01-04 → 3。
    expect(factor('2024-01-04')).toBe(1)
    expect(factor('2024-01-02')).toBeCloseTo(3)
    // 事件之间 → 只乘其后的事件。
    expect(factor('2024-01-03')).toBeCloseTo(3)
    // 最晚事件之前的日期 → 两个事件都在其后 → 累乘 2*3=6。
    expect(factor('2023-12-31')).toBeCloseTo(6)
  })
  test('空/杂乱事件：无适用因子 → 1，不伪造', () => {
    const factor = forwardAdjustFactor([
      { trade_date: 'bad-date', ex_factor: 2 },
      { trade_date: '2024-01-02', ex_factor: Number.NaN },
    ])
    expect(factor('2024-01-05')).toBe(1)
    expect(factor('2024-01-01')).toBe(1)
  })
  test('forwardAdjust：raw / factor；非法乘数/非数值 → null 或不改', () => {
    expect(forwardAdjust({ high: 20, low: 8, close: 12 }, 4)).toEqual({
      high: 5, low: 2, close: 3,
    })
    expect(forwardAdjust({ high: 20, close: 12 }, 0)).toEqual({ high: 20, low: null, close: 12 })
    expect(forwardAdjust({ close: Number.NaN }, 4)).toEqual({ high: null, low: null, close: null })
  })
})