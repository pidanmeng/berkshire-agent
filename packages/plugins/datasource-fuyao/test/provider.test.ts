import { describe, expect, test } from 'bun:test'
import { createFuyaoProvider, createCalendarProbe, calendarRow, calendarDate, type FuyaoProviderDeps } from '../src/provider'
import type { FetchLike } from '../src/client'
import type { DatasetId } from '@berkshire/core'

const REALTIME = 'realtime' as DatasetId
const DAILY = 'daily' as DatasetId
const ADJ_FACTOR = 'adj_factor' as DatasetId
const FINANCIAL = 'financial' as DatasetId
const MINUTE = 'minute' as DatasetId
const CALENDAR = 'calendar' as DatasetId

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

/** 按 URL 路由的 mock：路径 → 返回体。 */
function routeFetch(routes: Record<string, () => unknown>): FetchLike {
  return async (input) => {
    const url = input instanceof URL ? input : new URL(String(input))
    const handler = routes[url.pathname]
    if (!handler) return jsonResponse({ code: 0, data: {} }, 404)
    return jsonResponse({ code: 0, data: handler() })
  }
}

function makeProvider(overrides: Partial<FuyaoProviderDeps> = {}) {
  return createFuyaoProvider({
    getApiKey: async () => 'test-key',
    cacheDir: () => '/tmp/fuyao-cache',
    log: () => undefined,
    ...overrides,
  })
}

describe('扶摇 provider 可用性（按 Key 动态求值）', () => {
  test('配置 Key → 四数据集可用，minute 不可用', async () => {
    const p = makeProvider()
    expect((await p.getAvailability!(REALTIME)).available).toBe(true)
    expect((await p.getAvailability!(DAILY)).available).toBe(true)
    expect((await p.getAvailability!(ADJ_FACTOR)).available).toBe(true)
    expect((await p.getAvailability!(FINANCIAL)).available).toBe(true)
    expect((await p.getAvailability!(MINUTE)).available).toBe(false)
  })

  test('未配置 Key → 可用性 false + 原因（fail-closed 展示面）', async () => {
    const p = makeProvider({ getApiKey: async () => '' })
    const a = await p.getAvailability!(DAILY)
    expect(a.available).toBe(false)
    expect(a.reason).toContain('API Key')
  })

  test('probe：有效 Key → ok；接口错误 → ok:false + 原因', async () => {
    const p = makeProvider({
      fetchImpl: routeFetch({ '/api/a-share/prices/snapshot': () => ({ item: [], total: 0 }) }),
    })
    expect(await p.probe!({ apiKey: 'good' })).toEqual({ ok: true })

    const bad = makeProvider({
      fetchImpl: async () => jsonResponse({ code: 4001, message: 'bad key' }),
    })
    const r = await bad.probe!({ apiKey: 'bad' })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('4001')
  })
})

describe('扶摇 provider realtime 口径', () => {
  test('change_pct 百分数→小数制、volume 股→手、thscode→symbol', async () => {
    const p = makeProvider({
      fetchImpl: routeFetch({
        '/api/a-share/prices/snapshot': () => ({
          timestamp: 1_700_000_000_000,
          total: 1,
          item: [
            {
              thscode: '600000.SH',
              name: '浦发银行',
              last_price: 10.5,
              prev_price: 10.0,
              price_change_ratio_pct: 5.0, // 扶摇百分数 → 内部小数制 0.05
              price_change: 0.5,
              open_price: 10.1,
              high_price: 10.6,
              low_price: 9.9,
              volume: 123_456, // 股 → 手 1234
              turnover: 1_234_567,
            },
          ],
        }),
      }),
    })
    const rows = (await p.fetch(REALTIME, {})) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(1)
    expect(rows[0]!['symbol']).toBe('600000.SH')
    expect(rows[0]!['change_pct']).toBeCloseTo(0.05, 10)
    expect(rows[0]!['volume']).toBe(1234)
    expect(rows[0]!['timestamp']).toBe(1_700_000_000_000)
  })

  test('全部行缺 thscode → fail-closed 抛错（疑似接口结构变化）', async () => {
    const p = makeProvider({
      fetchImpl: routeFetch({
        '/api/a-share/prices/snapshot': () => ({ item: [{ foo: 'bar' }], total: 1 }),
      }),
    })
    await expect(p.fetch(REALTIME, {})).rejects.toThrow(/thscode/)
  })
})

describe('扶摇 provider daily 口径', () => {
  test('adjust=none 请求 + volume 股→手 + 窗口内 pre_close/change_pct 推导', async () => {
    const captured: string[] = []
    const p = makeProvider({
      fetchImpl: async (input) => {
        const url = input instanceof URL ? input : new URL(String(input))
        captured.push(url.searchParams.get('adjust') ?? '')
        if (url.pathname === '/api/a-share/prices/historical') {
          const start = Number(url.searchParams.get('start'))
          return jsonResponse({
            code: 0,
            data: {
              item: [
                { date_ms: start, open_price: 10, high_price: 11, low_price: 9.9, close_price: 10.5, volume: 200_000, turnover: 2_100_000 },
                { date_ms: start + 86_400_000, open_price: 10.5, high_price: 11.5, low_price: 10.2, close_price: 11, volume: 300_000, turnover: 3_300_000 },
              ],
            },
          })
        }
        return jsonResponse({ code: 0, data: {} })
      },
    })
    const rows = (await p.fetch(DAILY, {
      symbols: ['600000.SH'],
      start: '2026-01-05',
      end: '2026-01-06',
    })) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(captured.every((a) => a === 'none')).toBe(true)
    expect(rows[0]!['symbol']).toBe('600000.SH')
    expect(rows[0]!['volume']).toBe(2000)
    expect(rows[0]!['date']).toBe('2026-01-05')
    expect(rows[0]!['pre_close']).toBe(null)
    expect(rows[1]!['pre_close']).toBeCloseTo(10.5, 10)
    expect(rows[1]!['change_pct']).toBeCloseTo(0.5 / 10.5, 10)
  })
})

describe('扶摇 provider financial', () => {
  test('三表 latest + 指标 → EAV 行（canonical key）', async () => {
    const p = makeProvider({
      fetchImpl: routeFetch({
        '/api/a-share/financials/income-statements': () => ({
          item: [{
            fiscal_year: 2026,
            fiscal_period: 'Q1',
            period_end_ms: 1_700_000_000_000,
            report_date_ms: 1_700_100_000_000,
            operating_income: 1_000_000,
            operating_costs: 600_000,
          }],
        }),
        '/api/a-share/financials/balance-sheets': () => ({
          item: [{ period_end_ms: 1_700_000_000_000, report_date_ms: 1_700_100_000_000, assets_total: 5_000_000 }],
        }),
        '/api/a-share/financials/cash-flow-statements': () => ({
          item: [{ period_end_ms: 1_700_000_000_000, report_date_ms: 1_700_100_000_000, act_cash_flow_net: 100_000 }],
        }),
        '/api/a-share/financials/indicators': () => ({
          abilities: [{ indicators: [{ index_id: 'index_weighted_avg_roe', value: 12.5 }] }],
        }),
      }),
    })
    const rows = (await p.fetch(FINANCIAL, { symbols: ['600000.SH'] })) as Array<Record<string, unknown>>
    const keys = rows.map((r) => `${r['table']}:${r['key']}`).sort()
    expect(keys).toContain('income:revenue')
    expect(keys).toContain('income:operating_cost')
    expect(keys).toContain('balance_sheet:total_assets')
    expect(keys).toContain('cash_flow:net_operating_cash_flow')
    expect(keys).toContain('metrics:roe')
    const roe = rows.find((r) => r['table'] === 'metrics' && r['key'] === 'roe')
    expect(roe!['value']).toBe(12.5)
  })

  test('PIT：多期保留——每期按自己的 period_end/announce_date 各落 EAV 行，不丢历史、不预填', async () => {
    // 利润表返回两期（近一期在前，早一期在后），两期 operating_income 不同、公告日不同。
    const p = makeProvider({
      fetchImpl: routeFetch({
        '/api/a-share/financials/income-statements': () => ({
          item: [
            {
              fiscal_year: 2026,
              fiscal_period: 'Q1',
              period_end_ms: 1_713_000_000_000, // 北京 2024-04-13
              report_date_ms: 1_714_000_000_000, // 北京 2024-04-25（公告）
              operating_income: 2_000_000,
            },
            {
              fiscal_year: 2025,
              fiscal_period: 'Q4',
              period_end_ms: 1_706_000_000_000, // 北京 2024-01-23
              report_date_ms: 1_707_000_000_000, // 北京 2024-02-04（公告）
              operating_income: 1_500_000,
            },
          ],
        }),
        '/api/a-share/financials/balance-sheets': () => ({ item: [] }),
        '/api/a-share/financials/cash-flow-statements': () => ({ item: [] }),
        '/api/a-share/financials/indicators': () => ({
          abilities: [{ indicators: [{ index_id: 'index_weighted_avg_roe', value: 12.5 }] }],
        }),
      }),
    })
    const rows = (await p.fetch(FINANCIAL, { symbols: ['600000.SH'] })) as Array<Record<string, unknown>>
    const revenue = rows.filter((r) => r['table'] === 'income' && r['key'] === 'revenue')
    // 两期都被保留（不丢历史）→ 2 行，各带自己的 period_end/announce_date。
    expect(revenue).toHaveLength(2)
    const byValue = new Map(revenue.map((r) => [Number(r['value']), r]))
    const earlier = byValue.get(1_500_000)
    expect(earlier).toBeTruthy()
    expect(earlier!['period_end']).toBe('2024-01-23')
    expect(earlier!['announce_date']).toBe('2024-02-04')
    const latest = byValue.get(2_000_000)
    expect(latest).toBeTruthy()
    expect(latest!['period_end']).toBe('2024-04-13')
    // 指标取最新期（第 0 行 = 近一期）→ 其 period_end 与最新一期一致。
    const roe = rows.find((r) => r['table'] === 'metrics' && r['key'] === 'roe')
    expect(roe!['period_end']).toBe('2024-04-13')
  })
})

describe('扶摇 provider minute 未落地', () => {
  test('fetch(minute) fail-closed 抛错', async () => {
    const p = makeProvider()
    await expect(p.fetch(MINUTE, {})).rejects.toThrow(/minute/)
  })
})

describe('扶摇 provider calendar（交易日历）', () => {
  test('配置 Key → calendar 可用', async () => {
    const p = makeProvider()
    expect((await p.getAvailability!(CALENDAR)).available).toBe(true)
  })

  test('calendarRow：防御性归一为 trade_date/open/close/status', () => {
    expect(calendarRow({ trade_date: '2026-01-05', is_open: 1, close_time: '15:00' })).toEqual({
      trade_date: '2026-01-05',
      open: true,
      close: '15:00',
      status: 'open',
    })
    // 半天市标记 → status 带 half-day
    expect(calendarRow({ date: '2026-02-16', is_open: true, is_half_day: true })!['status']).toBe('half-day')
    // 容错字段名（cal_date + *_ms 北京零点）
    expect(calendarDate({ cal_date: '2026-01-05' })).toBe('2026-01-05')
    expect(calendarDate({ date_ms: 1_730_000_000_000 })).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 休市行：open=false → status closed
    expect(calendarRow({ date: '2026-01-05', open: '0', status: 'holiday' })).toEqual({
      trade_date: '2026-01-05',
      open: false,
      close: null,
      status: 'holiday',
    })
    // 无合法日期 → null（跳过不伪造）
    expect(calendarRow({ foo: 'bar' })).toBeNull()
  })

  test('fetch(calendar) 走 trading-days 接口并归一为 calendar 行', async () => {
    const p = makeProvider({
      fetchImpl: routeFetch({
        '/api/a-share/calendar/trading-days': () => ({
          item: [
            { date: '2026-01-05', is_open: true },
            { date: '2026-01-06', is_open: true },
            { date: '2026-02-16', is_open: true, is_half_day: true },
          ],
        }),
      }),
    })
    const rows = (await p.fetch(CALENDAR, {})) as Array<Record<string, unknown>>
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ trade_date: '2026-01-05', open: true, close: null, status: 'open' })
    expect(rows[2]!['status']).toBe('half-day')
  })
})

describe('扶摇日历探针 createCalendarProbe（market-time 降档链）', () => {
  test('窗口内：交易日 true（长 TTL）/ 非交易日 false（短 TTL）', async () => {
    const probe = createCalendarProbe({
      getApiKey: async () => 'test-key',
      fetchImpl: routeFetch({
        '/api/a-share/calendar/trading-days': () => ({
          item: [{ date: '2026-01-05' }, { date: '2026-01-06' }, { date: '2026-01-09' }],
        }),
      }),
    })
    expect(await probe.probe('2026-01-05')).toEqual({ trading: true, ttlMs: 6 * 3_600_000 })
    // 07 在窗口（05~09）内但非交易日（休市）→ 短 TTL
    const closed = await probe.probe('2026-01-07')
    expect(closed.trading).toBe(false)
    expect(closed.ttlMs).toBe(10 * 60_000)
  })

  test('窗口外 / 缺 Key / 空数据 → 抛错（触发 market-time 降档）', async () => {
    const probe = createCalendarProbe({
      getApiKey: async () => 'test-key',
      fetchImpl: routeFetch({
        '/api/a-share/calendar/trading-days': () => ({ item: [{ date: '2026-01-05' }] }),
      }),
    })
    await expect(probe.probe('2025-12-01')).rejects.toThrow(/超出扶摇交易日窗口/)

    const noKey = createCalendarProbe({
      getApiKey: async () => '',
      fetchImpl: routeFetch({}),
    })
    await expect(noKey.probe('2026-01-05')).rejects.toThrow(/FUYAO_API_KEY/)

    const empty = createCalendarProbe({
      getApiKey: async () => 'test-key',
      fetchImpl: routeFetch({ '/api/a-share/calendar/trading-days': () => ({ item: [] }) }),
    })
    await expect(empty.probe('2026-01-05')).rejects.toThrow(/无可用交易日/)
  })
})
