/**
 * 扶摇（同花顺金融数据 API）HTTP 客户端 —— 移植自
 * `tick-stock-panel/backend/app/plugins/fuyao/client.py` 的 TS/fetch 版。
 *
 * 职责：认证（`X-api-key`）、统一信封 `{code, message, data}` 解包、快照分页、
 * 单标的日K、财务、估值、dump 下载信息。不知道 provider / services 层。
 * 文档：https://fuyao.aicubes.cn/docs —— REST + X-api-key。
 *
 * 时间字段口径：所有 `*ms` 字段（含 start/end 入参与 date_ms 出参）均为北京时间零点
 * 对应的 epoch ms（= UTC 前一日 16:00），由 provider 层统一 +8h 换算。
 *
 * 可测性：`fetchImpl` 可注入（默认全局 fetch），单测离线 mock 响应。
 */

/** 扶摇接口错误（配置缺失 / 网络失败 / 信封 code != 0）。 */
export class FuyaoError extends Error {}

const BASE_URL = 'https://fuyao.aicubes.cn'
/** 单页 6000 覆盖全市场（对齐参考实现实测：服务端不截断 limit=6000）。 */
const SNAPSHOT_PAGE_SIZE = 6000
const SNAPSHOT_MAX_PAGES = 50
const PAGE_INTERVAL_MS = 150

/** 注入 fetch 的可测窄签名（Bun 的 `typeof fetch` 含 `preconnect` 等静态成员，mock 难以满足）。 */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface FuyaoClientOptions {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  /** 注入 fetch 实现（测试用；缺省全局 fetch）。 */
  fetchImpl?: FetchLike
}

export interface SnapshotPage {
  rows: Array<Record<string, unknown>>
  total: number
  serverTs: number
}

/**
 * 扶摇 REST 客户端。单实例可复用（fetch 无连接池状态）；同一 client 串行/并发调用均可。
 */
export class FuyaoClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: FetchLike
  lastServerTs = 0

  constructor(opts: FuyaoClientOptions) {
    if (!opts.apiKey.trim()) {
      throw new FuyaoError('未配置 FUYAO_API_KEY')
    }
    this.apiKey = opts.apiKey
    this.baseUrl = opts.baseUrl ?? BASE_URL
    this.timeoutMs = opts.timeoutMs ?? 20_000
    this.fetchImpl = opts.fetchImpl ?? fetch
  }

  // ---- 内部：GET + 信封解包 ----

  private async get(path: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
    const url = new URL(path, this.baseUrl)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), this.timeoutMs)
    let resp: Response
    try {
      resp = await this.fetchImpl(url, { headers: { 'X-api-key': this.apiKey }, signal: ac.signal })
    } catch (err) {
      throw new FuyaoError(`网络请求失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      clearTimeout(timer)
    }
    if (resp.status !== 200) {
      throw new FuyaoError(`HTTP ${resp.status}: ${path}`)
    }
    let payload: Record<string, unknown>
    try {
      payload = (await resp.json()) as Record<string, unknown>
    } catch {
      throw new FuyaoError(`响应不是 JSON: ${path}`)
    }
    const code = payload['code']
    if (code !== 0 && code !== '0' && code !== null && code !== undefined) {
      throw new FuyaoError(`扶摇接口错误 code=${code}: ${String(payload['message'] ?? '')} (${path})`)
    }
    const data = payload['data']
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ---- 快照 ----

  /**
   * 拉取一页 A 股全市场快照。返回 `{ rows, total, serverTs }`。
   * 实测响应 data={timestamp, total, item}；文档示例 data={count, data}。两者都兼容。
   */
  async snapshotPage(limit = SNAPSHOT_PAGE_SIZE, offset = 0): Promise<SnapshotPage> {
    const data = await this.get('/api/a-share/prices/snapshot', { limit, offset })
    const ts = Number(data['timestamp'])
    this.lastServerTs = Number.isFinite(ts) ? ts : 0
    let rows = data['item']
    if (!Array.isArray(rows)) {
      rows = Array.isArray(data['data']) ? data['data'] : []
    }
    const rawTotal = data['total'] ?? data['count'] ?? 0
    const total = Number.isFinite(Number(rawTotal)) ? Number(rawTotal) : 0
    return { rows: rows as Array<Record<string, unknown>>, total, serverTs: this.lastServerTs }
  }

  /**
   * 分页拉取全市场快照。返回 `{ rows, serverTs }`；空数据 / 中途失败抛 FuyaoError。
   */
  async snapshotAll(): Promise<{ rows: Array<Record<string, unknown>>; serverTs: number }> {
    const out: Array<Record<string, unknown>> = []
    let serverTs = 0
    let offset = 0
    for (let page = 0; page < SNAPSHOT_MAX_PAGES; page++) {
      if (page > 0) await this.sleep(PAGE_INTERVAL_MS)
      const { rows, total } = await this.snapshotPage(SNAPSHOT_PAGE_SIZE, offset)
      if (rows.length === 0) break
      out.push(...rows)
      if (serverTs === 0) serverTs = this.lastServerTs
      if (total > 0 && out.length >= total) break
      offset += rows.length
    }
    if (out.length === 0) {
      throw new FuyaoError('全市场快照为空')
    }
    return { rows: out, serverTs }
  }

  // ---- 历史日K ----

  /**
   * 单标的日K（interval=1d 固定，≤10 年窗口由调用方分片）。
   * `adjust` 必须显式传 `"none"` 取原始价（官方 forward 前复权序列存在事件间漂移，禁止使用）。
   */
  async historicalKline(
    thscode: string,
    startMs: number,
    endMs: number,
    adjust = 'none',
  ): Promise<Array<Record<string, unknown>>> {
    const data = await this.get('/api/a-share/prices/historical', {
      thscode,
      interval: '1d',
      adjust,
      start: Math.trunc(startMs),
      end: Math.trunc(endMs),
    })
    const rows = data['item']
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
  }

  // ---- 财务 ----

  /** 单标的财务报表多期序列。stmt: income | balance_sheet | cash_flow。 */
  async financialStatements(
    stmt: string,
    thscode: string,
    limit = 1,
  ): Promise<Array<Record<string, unknown>>> {
    const endpoint = STATEMENT_ENDPOINTS[stmt as keyof typeof STATEMENT_ENDPOINTS]
    if (!endpoint) {
      throw new FuyaoError(`未知财务报表类型: ${stmt}`)
    }
    const data = await this.get(`/api/a-share/financials/${endpoint}`, {
      thscode,
      period: 'quarterly',
      limit: Math.max(1, Math.min(20, limit)),
    })
    const rows = data['item']
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
  }

  /** 单标的单报告期财务指标（report 格式 yyyy-N，N=1..4）。未披露期接口报错 → FuyaoError。 */
  async financialIndicators(thscode: string, report: string): Promise<Array<Record<string, unknown>>> {
    const data = await this.get('/api/a-share/financials/indicators', { thscode, report })
    const abilities = data['abilities']
    return Array.isArray(abilities) ? (abilities as Array<Record<string, unknown>>) : []
  }

  /** 批量估值快照（pe_ttm/pe_mrq/pb_mrq/ps_ttm/pcf_ttm）。服务端单次上限 100 只。 */
  async valuationsSnapshot(thscodes: string[]): Promise<Array<Record<string, unknown>>> {
    const data = await this.get('/api/a-share/valuations/snapshot', {
      thscodes: thscodes.slice(0, 100).join(','),
    })
    const rows = data['item']
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
  }

  // ---- 市场 dump ----

  /** 获取 dump 预签名下载信息（release 号嵌在 presigned_url 的 releases/<date>/ 路径中）。 */
  async dumpDownloadUrl(dumpKind: string): Promise<{ presigned_url?: string }> {
    const data = await this.get(`/api/dump/market-dumps/${dumpKind}/download-url`, {})
    return data as { presigned_url?: string }
  }

  /** 交易日序列（近一年，固定窗口，无入参）。 */
  async tradingDays(): Promise<Array<Record<string, unknown>>> {
    const data = await this.get('/api/a-share/calendar/trading-days', {})
    const rows = data['item']
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
  }
}

const STATEMENT_ENDPOINTS = {
  income: 'income-statements',
  balance_sheet: 'balance-sheets',
  cash_flow: 'cash-flow-statements',
} as const
