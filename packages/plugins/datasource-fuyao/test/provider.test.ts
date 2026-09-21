import { describe, expect, test } from 'bun:test'
import { createFuyaoProvider, type FuyaoProviderDeps } from '../src/provider'
import type { FetchLike } from '../src/client'
import type { DatasetId } from '@berkshire/core'

const REALTIME = 'realtime' as DatasetId
const DAILY = 'daily' as DatasetId
const ADJ_FACTOR = 'adj_factor' as DatasetId
const FINANCIAL = 'financial' as DatasetId
const MINUTE = 'minute' as DatasetId

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
})

describe('扶摇 provider minute 未落地', () => {
  test('fetch(minute) fail-closed 抛错', async () => {
    const p = makeProvider()
    await expect(p.fetch(MINUTE, {})).rejects.toThrow(/minute/)
  })
})
