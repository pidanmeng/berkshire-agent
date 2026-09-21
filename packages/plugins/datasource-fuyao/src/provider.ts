/**
 * 扶摇（同花顺金融数据 API）数据源 provider —— 移植自
 * `tick-stock-panel/backend/app/plugins/fuyao/provider.py` 的 TS 版。
 *
 * 实现数据集（按功能分类，每个数据集独立路由到本 provider 或其它 provider）：
 * - `realtime`   A 股全市场快照（分页，1 次请求）
 * - `daily`      日K原始价（adjust=none 锁定，≤10 年/次自动分片；volume 股→手）
 * - `adj_factor` 除权因子（adjustment-factors 事件 dump + 原始日K前收盘，交易所公式
 *                 推导单事件比值，涨跌停自检）
 * - `financial`  财务三表 + 指标（latest 期），EAV 行输出（key/value 列）
 * - `minute`     声明存在但**未落地**（quota-h 私有网关另行实现）→ available:false
 *
 * 单位与口径（数据契约红线，不可凭字段名推断）：
 * - 扶摇 price_change_ratio_pct 为百分数数值（1.74 = +1.74%）→ 本项目契约为小数制
 *   （0.0174）→ 此处显式 /100。
 * - volume 单位为股，本项目日K/实时契约为手 → floor(股/100)。
 * - 日K取数 adjust=none 锁定（官方 forward 序列事件间有逐日漂移，项目内禁止使用）。
 * - 所有 *ms 时间为北京时间零点（= UTC 前一日 16:00），+8h 转交易日。
 * - ex_factor 为单事件比值（非累积）。
 *
 * 依赖：`args.database`（sync 编排注入的 `ctx.database`）仅在 `adj_factor` 用
 * DuckDB 的 read_parquet 读事件 dump；缺省时该数据集 fail-closed 报错。
 */
import { FuyaoClient, FuyaoError, type FetchLike } from './client'
import { derivePreClose, toFloat, volumeToHand } from '@berkshire/core'
import type { DataSourceId, DataSourceProvider, DatasetAvailability, DatasetId } from '@berkshire/core'

export interface FuyaoProviderDeps {
  /** 当前 API Key（取自 env `FUYAO_API_KEY`；空串 = 未配置）。 */
  getApiKey(): Promise<string>
  /** 事件 dump 缓存目录（绝对路径；provider 负责 mkdir）。 */
  cacheDir(): string
  /** 注入 fetch（测试用）；缺省全局 fetch。 */
  fetchImpl?: FetchLike
  /** 留痕回调（wire 到 ctx.log.append）。 */
  log?(event: string, data?: unknown): void
}

const SH_MS = 28_800_000 // 北京时间零点 = UTC 前一日 16:00
const HIST_MAX_SPAN_MS = 3650 * 86_400_000 // historical 单次窗口上限 10 年
const HIST_INTERVAL_MS = 120 // 单标的请求节流
const PREV_CLOSE_BACKDAYS = 30 // 因子推导：除权日前收盘回看天数
const ADJ_DUMP_KIND = 'adjustment-factors'
const API_KEY_ENV = 'FUYAO_API_KEY'

// 项目财务表名 → 扶摇报表端点名
const STATEMENT_ENDPOINTS = {
  income: 'income-statements',
  balance_sheet: 'balance-sheets',
  cash_flow: 'cash-flow-statements',
} as const
const STATEMENT_TABLES = Object.keys(STATEMENT_ENDPOINTS)

// 字段映射：扶摇原始字段 → canonical 列（EAV 的 key 名；指标 latest 期单行）。
const INCOME_FIELD_MAP: Record<string, string> = {
  operating_income: 'revenue',
  operating_costs: 'operating_cost',
  sales_fee: 'selling_expense',
  manage_fee: 'admin_expense',
  research_and_development_expenses: 'rd_expense',
  operating_profit: 'operating_profit',
  interest_expenses: 'financial_expense', // 近似口径：扶摇只给利息费用
  profit_total: 'total_profit',
  income_tax_expense: 'income_tax',
  net_profit: 'net_income',
  parent_holder_net_profit: 'net_income_attributable',
  basic_eps: 'basic_eps',
}
const BALANCE_FIELD_MAP: Record<string, string> = {
  assets_total: 'total_assets',
  total_current_assets: 'total_current_assets',
  non_current_nets_total: 'total_non_current_assets',
  cash: 'cash_and_equivalents',
  accounts_receivable: 'accounts_receivable',
  total_debt: 'total_liabilities',
  holder_equity_total: 'total_equity',
}
const CASHFLOW_FIELD_MAP: Record<string, string> = {
  act_cash_flow_net: 'net_operating_cash_flow',
  invest_cash_flow_net: 'net_investing_cash_flow',
  financing_cash_flow_net: 'net_financing_cash_flow',
  pay_fixed_assets_etc_cash: 'capex',
  cash_equivalents_net_addition: 'net_cash_change',
}
const METRICS_FIELD_MAP: Record<string, string> = {
  index_weighted_avg_roe: 'roe',
  total_assets_net_ratio: 'roa',
  sale_gross_margin: 'gross_margin',
  sale_net_interest_ratio: 'net_margin',
  assets_debt_ratio: 'debt_to_asset_ratio',
  calculate_operating_income_yoy_growth_ratio: 'revenue_yoy',
  calculate_parent_holder_net_profit_yoy_growth_ratio: 'net_income_yoy',
  operating_cash_flow_net_divide_income: 'operating_cash_to_revenue',
  inventory_turnover_ratio: 'inventory_turnover',
}

/** 取一行里第一个非空字段（多候选字段兼容）。 */
function first(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (row[n] !== null && row[n] !== undefined) return row[n]
  }
  return undefined
}

/** 扶摇 *ms（北京零点）→ ISO 交易日（yyyy-mm-dd）。非法值 → null。 */
function dateOfMs(value: unknown): string | null {
  const n = toFloat(value)
  if (n === null) return null
  return new Date(n + SH_MS).toISOString().slice(0, 10)
}

/** ISO 日期（yyyy-mm-dd）→ 扶摇 start/end 入参口径 ms（北京零点，不依赖本机时区）。 */
function msOfDate(iso: string): number {
  return (Date.parse(iso) / 1000 - 28_800) * 1000
}

/** 交易所除权参考价（half-up 保留 2 位；denom≤0 → null）。 */
function refPrice(
  prevClose: number,
  dividend: number,
  bonus: number,
  allot: number,
  allotPrice: number,
): number | null {
  const denom = 1 + bonus + allot
  if (denom <= 0) return null
  const x = (prevClose - dividend + allot * allotPrice) / denom
  return Math.floor(x * 100 + 0.5) / 100
}

/** 按代码前缀给涨跌停幅度（自检容差用）：创业板/科创板 20%，北交所 30%，主板 10%。 */
function priceLimit(symbol: string): number {
  const code = symbol.split('.')[0] ?? ''
  if (/^(300|301|688|689)/.test(code)) return 0.2
  if (/^(8|4|92)/.test(code)) return 0.3
  return 0.1
}

/** 快照行 → 内部 realtime record（change_pct 小数制、volume 股→手）。 */
function mapSnapshotRow(
  row: Record<string, unknown>,
  fetchedMs: number,
): Record<string, unknown> | null {
  const symbol = row['thscode']
  if (typeof symbol !== 'string' || symbol === '') return null
  const last = toFloat(row['last_price'])
  const prev = toFloat(first(row, 'prev_price', 'prev_close_price'))
  const pct = toFloat(row['price_change_ratio_pct'])
  let changePct = pct !== null ? pct / 100 : null
  let changeAmount = toFloat(row['price_change'])
  if (changeAmount === null && last !== null && prev !== null) changeAmount = last - prev
  if (changePct === null && changeAmount !== null && prev !== null && prev !== 0) {
    changePct = changeAmount / prev
  }
  const volume = toFloat(row['volume'])
  return {
    symbol,
    name: typeof row['name'] === 'string' ? row['name'] : null,
    last_price: last,
    prev_close: prev,
    open: toFloat(row['open_price']),
    high: toFloat(first(row, 'high_price', 'highest_price')),
    low: toFloat(first(row, 'low_price', 'lowest_price')),
    volume: volumeToHand(volume),
    amount: toFloat(row['turnover']),
    change_pct: changePct,
    change_amount: changeAmount,
    timestamp: fetchedMs,
  }
}

/** historical 原始行（价格元、volume 股）→ 内部日K行（volume 手）。 */
function klineRow(symbol: string, bar: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol,
    date: dateOfMs(bar['date_ms']),
    open: toFloat(bar['open_price']),
    high: toFloat(bar['high_price']),
    low: toFloat(bar['low_price']),
    close: toFloat(bar['close_price']),
    volume: volumeToHand(bar['volume']),
    amount: toFloat(bar['turnover']),
  }
}

/** 单标的原始日K（≤10 年分片；中途失败软返回已得行，不抛出）。 */
async function historicalBars(
  client: FuyaoClient,
  symbol: string,
  startIso: string,
  endIso: string,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = []
  let s = msOfDate(startIso)
  const e = msOfDate(endIso)
  while (s <= e) {
    const chunkEnd = Math.min(e, s + HIST_MAX_SPAN_MS - 1)
    try {
      out.push(...(await client.historicalKline(symbol, s, chunkEnd, 'none')))
    } catch (err) {
      if (err instanceof FuyaoError) {
        // 软返回已得行；由调用方（页面/编排）可见告警。
        return out
      }
      throw err
    }
    if (s + HIST_MAX_SPAN_MS <= e) await new Promise((r) => setTimeout(r, HIST_INTERVAL_MS))
    s = chunkEnd + 1
  }
  return out
}

/** 给一批日K行按 symbol 计算 pre_close/change_pct —— 来自 `@berkshire/core` dataContract（同源推导）。 */

/**
 * 构造扶摇 provider。`getApiKey` 每次求值（配置后即时生效）。
 */
export function createFuyaoProvider(deps: FuyaoProviderDeps): DataSourceProvider {
  const staticDatasets = {
    realtime: { available: true },
    daily: { available: true },
    adj_factor: { available: true },
    financial: { available: true },
    minute: { available: false, reason: 'minute（quota-h 私有网关）未落地，另行实现' },
  } as Partial<Record<DatasetId, DatasetAvailability>>

  function clientFor(apiKey: string): FuyaoClient {
    return new FuyaoClient({
      apiKey,
      fetchImpl: deps.fetchImpl,
      timeoutMs: 20_000,
    })
  }

  async function requireClient(): Promise<FuyaoClient> {
    const key = (await deps.getApiKey()).trim()
    if (!key) throw new FuyaoError(`未配置 ${API_KEY_ENV}（可在数据管理页填写并探存）`)
    return clientFor(key)
  }

  return {
    id: 'fuyao' as DataSourceId,
    label: 'fuyao',

    datasets: staticDatasets,

    async getAvailability(dataset) {
      if (String(dataset) === 'minute') {
        return { available: false, reason: 'minute（quota-h 私有网关）未落地，另行实现' }
      }
      const key = (await deps.getApiKey()).trim()
      if (!key) {
        return {
          available: false,
          reason: `缺少 API Key（配置 ${API_KEY_ENV} 或在数据管理页填写）`,
        }
      }
      return staticDatasets[dataset] ?? { available: false }
    },

    async probe({ apiKey }) {
      try {
        const client = clientFor((apiKey ?? '').trim())
        await client.snapshotPage(1)
        return { ok: true }
      } catch (err) {
        return { ok: false, reason: err instanceof FuyaoError ? err.message : String(err) }
      }
    },

    async fetch(dataset, args) {
      switch (String(dataset)) {
        case 'realtime':
          return fetchRealtime()
        case 'daily':
          return fetchDaily(args)
        case 'adj_factor':
          return fetchAdjFactor(args)
        case 'financial':
          return fetchFinancial(args)
        case 'minute':
          throw new FuyaoError('扶摇 minute（quota-h）未落地（fail-closed）')
        default:
          throw new FuyaoError(`扶摇不支持数据集 '${String(dataset)}'`)
      }
    },
  }

  // ---- realtime ----

  async function fetchRealtime(): Promise<Array<Record<string, unknown>>> {
    const client = await requireClient()
    const { rows, serverTs } = await client.snapshotAll()
    const fetchedMs = serverTs > 0 ? serverTs : Date.now()
    const out: Array<Record<string, unknown>> = []
    let dropped = 0
    for (const row of rows) {
      const rec = mapSnapshotRow(row, fetchedMs)
      if (rec) out.push(rec)
      else dropped++
    }
    if (dropped > 0 && out.length === 0) {
      // 整页都识别不出 thscode → 大概率接口 schema 变了，明确报错而非静默空数据。
      throw new FuyaoError('扶摇快照全部行缺少 thscode 字段，疑似接口结构变化（fail-closed）')
    }
    deps.log?.('fuyao/realtime', { rows: out.length, dropped })
    return out
  }

  // ---- daily ----

  async function fetchDaily(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const symbols = parseSymbols(args['symbols'])
    if (symbols.length === 0) {
      deps.log?.('fuyao/daily', { note: '未传 symbols，跳过', rows: 0 })
      return []
    }
    const endIso = typeof args['end'] === 'string' && args['end'] ? args['end'] : todayIso()
    const startIso = typeof args['start'] === 'string' && args['start'] ? args['start'] : minusDays(endIso, 365)
    const client = await requireClient()
    const out: Array<Record<string, unknown>> = []
    for (const symbol of symbols) {
      const bars = await historicalBars(client, symbol, startIso, endIso)
      for (const bar of bars) out.push({ source: 'fuyao', ...klineRow(symbol, bar) })
    }
    deps.log?.('fuyao/daily', { symbols: symbols.length, rows: out.length, start: startIso, end: endIso })
    return derivePreClose(out)
  }

  // ---- adj_factor ----

  /** 事件 dump → 清洗（全零过滤/同日合并/配股缺价过滤）→ 窗口/标的过滤。 */
  async function loadAdjEvents(
    client: FuyaoClient,
    database: { query<T>(sql: string, params?: unknown[]): Promise<T[]> },
    args: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const { mkdirSync, existsSync, writeFileSync, renameSync } = await import('node:fs')
    const { join } = await import('node:path')
    const cacheDir = deps.cacheDir()
    mkdirSync(cacheDir, { recursive: true })

    const info = await client.dumpDownloadUrl(ADJ_DUMP_KIND)
    const url = info['presigned_url'] ?? ''
    const release = (url.match(/releases\/(\d+)\//)?.[1] ?? 'unknown') as string
    const dest = join(cacheDir, `adj_factors__${release}.parquet`)
    if (!existsSync(dest)) {
      if (!url) throw new FuyaoError('扶摇 adjustment-factors dump 未返回预签名 URL')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 120_000)
      try {
        const resp = await (deps.fetchImpl ?? fetch)(url, { signal: ac.signal })
        if (resp.status !== 200) throw new FuyaoError(`dump 下载失败 HTTP ${resp.status}`)
        const buf = Buffer.from(await resp.arrayBuffer())
        const tmp = `${dest}.part`
        writeFileSync(tmp, buf)
        renameSync(tmp, dest)
      } finally {
        clearTimeout(timer)
      }
      deps.log?.('fuyao/adj_factor', { note: 'dump 已下载', release, dest })
    }

    const today = todayIso()
    const rows = await database.query<Record<string, unknown>>(
      `SELECT thscode AS symbol,
              CAST(date_ms AS BIGINT) AS date_ms,
              COALESCE(dividend_per_share, 0) AS dividend,
              COALESCE(per_share_bonus, 0) AS bonus,
              COALESCE(allotment_ratio, 0) AS allot,
              COALESCE(allotment_price, 0) AS allot_price
       FROM read_parquet('${dest.replaceAll("'", "''")}')`,
    )
    const symbols = parseSymbols(args['symbols'])
    const startIso = typeof args['start'] === 'string' && args['start'] ? args['start'] : null
    const endIso = typeof args['end'] === 'string' && args['end'] ? args['end'] : null

    const events: Array<Record<string, unknown>> = []
    const merged = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      const symbol = String(row['symbol'] ?? '')
      if (!symbol) continue
      if (symbols.length > 0 && !symbols.includes(symbol)) continue
      const exDate = dateOfMs(row['date_ms'])
      if (!exDate) continue
      if (exDate > today) continue // 未来已公告事件无前收盘，留给滚动增量
      if (toFloat(row['dividend']) === 0 && toFloat(row['bonus']) === 0 && toFloat(row['allot']) === 0) continue
      const allot = toFloat(row['allot']) ?? 0
      const allotPrice = toFloat(row['allot_price']) ?? 0
      if (allot > 0 && allotPrice <= 0) continue // 配股但配股价缺失 → 无法推导
      if (startIso && exDate < startIso) continue
      if (endIso && exDate > endIso) continue
      const key = `${symbol}|${exDate}`
      const prev = merged.get(key)
      if (prev) {
        // 同日拆行合并（分红/送转各一行）：成分求和，配股价取 max（参考实现口径）。
        prev['dividend'] = (toFloat(prev['dividend']) ?? 0) + (toFloat(row['dividend']) ?? 0)
        prev['bonus'] = (toFloat(prev['bonus']) ?? 0) + (toFloat(row['bonus']) ?? 0)
        prev['allot'] = (toFloat(prev['allot']) ?? 0) + (toFloat(row['allot']) ?? 0)
        prev['allot_price'] = Math.max(toFloat(prev['allot_price']) ?? 0, allotPrice)
      } else {
        merged.set(key, { symbol, ex_date: exDate, dividend: row['dividend'], bonus: row['bonus'], allot: row['allot'], allot_price: row['allot_price'] })
      }
    }
    for (const ev of merged.values()) events.push(ev)
    return events
  }

  async function fetchAdjFactor(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const database = args['database'] as { query<T>(sql: string, params?: unknown[]): Promise<T[]> } | undefined
    if (!database) {
      throw new FuyaoError('扶摇 adj_factor 需要 database（sync 编排注入 ctx.database）读取事件 dump（fail-closed）')
    }
    const client = await requireClient()
    const events = await loadAdjEvents(client, database, args)
    if (events.length === 0) {
      deps.log?.('fuyao/adj_factor', { events: 0 })
      return []
    }
    const out: Array<Record<string, unknown>> = []
    const bySymbol = new Map<string, Array<Record<string, unknown>>>()
    for (const ev of events) {
      const sym = String(ev['symbol'])
      const list = bySymbol.get(sym) ?? []
      list.push(ev)
      bySymbol.set(sym, list)
    }
    for (const [symbol, evs] of bySymbol) {
      const exDates = evs.map((e) => String(e['ex_date'])).sort()
      const firstEx = exDates[0]!
      const lastEx = exDates[exDates.length - 1]!
      const closes = await fetchCloses(client, symbol, minusDays(firstEx, PREV_CLOSE_BACKDAYS), lastEx)
      if (closes.length === 0) {
        deps.log?.('fuyao/adj_factor', { symbol, note: '无原始日K，跳过其事件', events: evs.length })
        continue
      }
      for (const ev of evs) {
        const exd = String(ev['ex_date'])
        const prevDays = closes.filter((c) => c.date < exd)
        if (prevDays.length === 0) continue
        const p = prevDays[prevDays.length - 1]!.close
        const ref = refPrice(p, toFloat(ev['dividend']) ?? 0, toFloat(ev['bonus']) ?? 0, toFloat(ev['allot']) ?? 0, toFloat(ev['allot_price']) ?? 0)
        if (ref === null || ref <= 0) continue
        const factor = p / ref
        const exDays = closes.filter((c) => c.date >= exd)
        if (exDays.length > 0) {
          const ret = exDays[0]!.close / (p / factor) - 1
          if (Math.abs(ret) > priceLimit(symbol) + 0.02) {
            deps.log?.('fuyao/adj_factor', { symbol, exd, note: '涨跌停自检剔除', ret })
            continue
          }
        }
        out.push({ symbol, source: 'fuyao', trade_date: exd, ex_factor: factor })
      }
    }
    deps.log?.('fuyao/adj_factor', { events: events.length, factors: out.length })
    return out
  }

  // ---- financial ----

  async function fetchFinancial(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
    const symbols = parseSymbols(args['symbols'])
    if (symbols.length === 0) {
      deps.log?.('fuyao/financial', { note: '未传 symbols，跳过', rows: 0 })
      return []
    }
    const client = await requireClient()
    const out: Array<Record<string, unknown>> = []
    for (const symbol of symbols) {
      for (const table of STATEMENT_TABLES) {
        const fieldMap = table === 'income' ? INCOME_FIELD_MAP : table === 'balance_sheet' ? BALANCE_FIELD_MAP : CASHFLOW_FIELD_MAP
        const rows = await client.financialStatements(table, symbol, 1)
        for (const r of rows) {
          const periodEnd = dateOfMs(r['period_end_ms'])
          const announceDate = dateOfMs(r['report_date_ms'])
          for (const [rawKey, canonical] of Object.entries(fieldMap)) {
            const value = toFloat(r[rawKey])
            if (value === null) continue
            out.push({ symbol, source: 'fuyao', table, period_end: periodEnd, announce_date: announceDate, key: canonical, value })
          }
        }
      }
      // 指标（latest 期）：report 参数取利润表最新一期的 yyyy-N；未披露期接口报错 → 跳过。
      const latest = await client.financialStatements('income', symbol, 1)
      const firstRow = latest[0]
      if (firstRow) {
        const fy = toFloat(firstRow['fiscal_year'])
        const fp = String(firstRow['fiscal_period'] ?? '').toUpperCase()
        const report = `${fy !== null ? Math.trunc(fy) : ''}-${fp === 'FY' ? 4 : fp.replace(/^Q/, '')}`
        if (/^\d{4}-[1-4]$/.test(report)) {
          try {
            const abilities = await client.financialIndicators(symbol, report)
            for (const ability of abilities) {
              const indicators = ability['indicators']
              if (!Array.isArray(indicators)) continue
              for (const ind of indicators as Array<Record<string, unknown>>) {
                const canonical = METRICS_FIELD_MAP[String(ind['index_id'])]
                if (!canonical) continue
                const value = toFloat(ind['value'])
                if (value === null) continue
                const periodEnd = dateOfMs(firstRow['period_end_ms'])
                const announceDate = dateOfMs(firstRow['report_date_ms'])
                out.push({ symbol, source: 'fuyao', table: 'metrics', period_end: periodEnd, announce_date: announceDate, key: canonical, value })
              }
            }
          } catch {
            // 该期无数据（参考实现实测 code=5003）→ 跳过，不伪造。
          }
        }
      }
    }
    deps.log?.('fuyao/financial', { symbols: symbols.length, rows: out.length })
    return out
  }
}

// ---- 工具 ----

function parseSymbols(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim())
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function minusDays(iso: string, days: number): string {
  const d = new Date(Date.parse(iso) - days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** 取某标的 [startIso, endIso] 的原始日K（date/close 列），供因子推导配价。 */
async function fetchCloses(
  client: FuyaoClient,
  symbol: string,
  startIso: string,
  endIso: string,
): Promise<Array<{ date: string; close: number }>> {
  const bars = await historicalBars(client, symbol, startIso, endIso)
  const out: Array<{ date: string; close: number }> = []
  for (const b of bars) {
    const date = typeof b['date'] === 'string' ? b['date'] : null
    const close = toFloat(b['close'])
    if (date && close !== null) out.push({ date, close })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
