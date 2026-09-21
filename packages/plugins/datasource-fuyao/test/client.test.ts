import { describe, expect, test } from 'bun:test'
import { FuyaoClient, FuyaoError, type FetchLike } from '../src/client'

/** 造一个返回固定信封的 mock fetch。 */
function mockFetch(payload: unknown, status = 200): FetchLike {
  return async () => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

describe('FuyaoClient 信封解包', () => {
  test('缺 API Key → FuyaoError', () => {
    expect(() => new FuyaoClient({ apiKey: '' })).toThrow(FuyaoError)
    expect(() => new FuyaoClient({ apiKey: '  ' })).toThrow(FuyaoError)
  })

  test('code=0 → 解出 data；非 JSON → FuyaoError', async () => {
    const ok = new FuyaoClient({
      apiKey: 'k',
      fetchImpl: mockFetch({ code: 0, data: { presigned_url: 'https://example.com/dump.parquet' } }),
    })
    await expect(ok.dumpDownloadUrl('adjustment-factors')).resolves.toEqual({
      presigned_url: 'https://example.com/dump.parquet',
    })

    const bad = new FuyaoClient({ apiKey: 'k', fetchImpl: async () => new Response('not json', { status: 200 }) })
    await expect(bad.dumpDownloadUrl('adjustment-factors')).rejects.toThrow(FuyaoError)
  })

  test('code!=0 / HTTP 非 200 → FuyaoError（fail-closed）', async () => {
    const err = new FuyaoClient({ apiKey: 'k', fetchImpl: mockFetch({ code: 4001, message: '限频' }) })
    await expect(err.dumpDownloadUrl('adjustment-factors')).rejects.toThrow(/4001/)

    const http = new FuyaoClient({ apiKey: 'k', fetchImpl: mockFetch({}, 500) })
    await expect(http.dumpDownloadUrl('adjustment-factors')).rejects.toThrow(/HTTP 500/)
  })

  test('快照分页：实测形态 {timestamp,total,item} 与文档形态 {count,data} 都兼容', async () => {
    const c1 = new FuyaoClient({
      apiKey: 'k',
      fetchImpl: mockFetch({ code: 0, data: { timestamp: 1_700_000_000_000, total: 2, item: [{ thscode: '600000.SH' }] } }),
    })
    const p1 = await c1.snapshotPage()
    expect(p1.rows).toHaveLength(1)
    expect(p1.total).toBe(2)
    expect(p1.serverTs).toBe(1_700_000_000_000)

    const c2 = new FuyaoClient({
      apiKey: 'k',
      fetchImpl: mockFetch({ code: 0, data: { count: 2, data: [{ thscode: '000001.SZ' }] } }),
    })
    const p2 = await c2.snapshotPage()
    expect(p2.rows).toHaveLength(1)
    expect(p2.total).toBe(2)
  })
})

describe('FuyaoClient 请求形状', () => {
  test('historical 请求携带 adjust=none 与北京零点 ms 入参', async () => {
    let captured: URL | null = null
    const client = new FuyaoClient({
      apiKey: 'k',
      fetchImpl: async (input) => {
        captured = input instanceof URL ? input : new URL(String(input))
        return new Response(JSON.stringify({ code: 0, data: { item: [] } }), { status: 200 })
      },
    })
    await client.historicalKline('600000.SH', 1_700_000_000_000, 1_700_086_400_000)
    expect(captured!.pathname).toBe('/api/a-share/prices/historical')
    expect(captured!.searchParams.get('adjust')).toBe('none')
    expect(captured!.searchParams.get('thscode')).toBe('600000.SH')
    expect(captured!.searchParams.get('interval')).toBe('1d')
  })
})
