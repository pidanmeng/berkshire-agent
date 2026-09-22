/**
 * 跨 provider 共享的**纯数据契约工具**（无 cordis 依赖、无 I/O）。
 *
 * 这些是数据契约红线（docs/data-model.md §6）的落地实现点：比例/百分比口径、volume
 * 单位换算、窗口内 pre_close/change_pct 的**同源推导**、前复权 `adj=raw/Π(ex_factor)`
 * 单一实现、以及每数据集的**显式列类型映射**。各数据源 provider（fuyao / csv …）统一
 * 从这里取，避免同一口径在不同插件里各写一份而漂移。
 *
 * 诚实边界：本文件是挂载**单一事实源**——`sidecar/sync.ts` 写路径经 `DatasetDeclaration.columnSchema`
 * （本文件 `columnSqlType` 派生）落库，两侧同源不再各写一份映射；Enriched 生成入口 `toEnrichedRows`
 * 与派生指标现算 `computeIndicators` / `ctx.indicators`（[indicators.ts](./indicators.ts)）也复用它，
 * 不悄悄改口径。
 */

/**
 * 物理落库列类型。标识/时间类列存 `VARCHAR`，数值列存 `DOUBLE`（价格/量/比率口径在
 * 本文件单一实现；不引入整数/布尔列以保持价量口径一致、避免隐式转换漂移）。
 */
export type DatasetColumnType = 'VARCHAR' | 'DOUBLE'

/* ─── 规范化列集（继承 TSP schemas，docs/data-model.md §3）─── */

/** 个股维表。 */
export const INSTRUMENT_COLUMNS = [
  'symbol', 'name', 'exchange', 'asset_type', 'source', 'list_date', 'status',
] as const

/** 日K（原始价）。 */
export const DAILY_COLUMNS = [
  'symbol', 'asset_type', 'source', 'date', 'open', 'high', 'low', 'close',
  'volume', 'amount', 'pre_close', 'change_pct',
] as const

/** 除权因子（逐事件非累积）。 */
export const ADJ_FACTOR_COLUMNS = ['symbol', 'asset_type', 'source', 'trade_date', 'ex_factor'] as const

/** Enriched 窄表存储基点列（复权 OHLCV + 原始价 + 不可现算列；派生指标现算不落表）。 */
export const ENRICHED_STORAGE_COLS = [
  'symbol', 'date',
  'open', 'high', 'low', 'close',                // 前复权 (forward-adjusted)
  'volume', 'amount',
  'raw_close', 'raw_high', 'raw_low',             // 不复权原始价
  'turnover_rate',                                 // 依赖历史股本，不可现算
  'consecutive_limit_ups', 'consecutive_limit_downs', // 递归状态
  'quote_ts',                                      // 行情时间戳（ms）
] as const

/** 指数日K：与 daily 同列族，以 `index_code` 取代 `symbol`，`asset_type=index`。 */
export const INDEX_COLUMNS = [
  'index_code', 'asset_type', 'source', 'date', 'open', 'high', 'low', 'close',
  'volume', 'amount', 'pre_close', 'change_pct',
] as const

/** 分钟K：`datetime` 为北京 naive 墙钟。 */
export const MINUTE_COLUMNS = [
  'symbol', 'asset_type', 'source', 'datetime', 'open', 'high', 'low', 'close',
  'volume', 'amount', 'freq',
] as const

/** 财务（PIT）：宽表归一化，逐列按公告日取最新期（`key/value` 为指标键-值对）。 */
export const FINANCIAL_COLUMNS = ['symbol', 'table', 'period_end', 'announce_date', 'key', 'value'] as const

/** 股票日历/交易日：是否开盘、是否约半天、节假日标记。 */
export const CALENDAR_COLUMNS = ['trade_date', 'open', 'close', 'status'] as const

/** 标识/时间类列（存 VARCHAR）；其余列按 DOUBLE 落库。契约的单一事实源，勿在别处另写一分。 */
export const IDENTIFIER_OR_TIME_COLUMNS = new Set<string>([
  'symbol', 'index_code', 'name', 'exchange', 'asset_type', 'source', 'table', 'key', 'freq',
  'list_date', 'status',
  'date', 'datetime', 'trade_date', 'period_end', 'announce_date', 'quote_ts',
])

/** 某列的物理落库类型（标识/时间 → VARCHAR，数值 → DOUBLE）。 */
export function columnSqlType(column: string): DatasetColumnType {
  return IDENTIFIER_OR_TIME_COLUMNS.has(column) ? 'VARCHAR' : 'DOUBLE'
}

/* ─── 数值/单位/百分比口径（单一实现）─── */

/** 数值化：非有限值 → null（不伪造）。 */
export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** volume 股 → 手（floor）；null/非数值 → null。 */
export function volumeToHand(value: unknown): number | null {
  const n = toFloat(value)
  return n === null ? null : Math.floor(n / 100)
}

/**
 * 给一批日K行按 symbol 计算 pre_close/change_pct（**同源推导**：序列内前一交易日收盘；
 * 窗口首行无前收 → null，绝不填 0/启发式猜测）。调用方负责先把行按日期升序排好或交由
 * 本函数按 symbol 内排序。
 *
 * 鲁棒性：**无 symbol 行原样透传**（pre_close/change_pct 置空，不静默丢弃）；日期缺失或非
 * yyyy-mm-dd ISO 的行不参与链式推导（避免 `String(null)='null'` 排到最前导致错拿前收）。
 */
export function derivePreClose(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const bySymbol = new Map<string, Array<Record<string, unknown>>>()
  for (const r of rows) {
    const sym = String(r['symbol'] ?? '')
    if (!sym) {
      out.push({ ...r, pre_close: null, change_pct: null })
      continue
    }
    const list = bySymbol.get(sym) ?? []
    list.push(r)
    bySymbol.set(sym, list)
  }
  for (const list of bySymbol.values()) {
    // 仅「日期可排序」的行参与链式推导；其余原样透传（不伪造前收）。
    const valid = list.filter((r) => typeof r['date'] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r['date']))
    valid.sort((a, b) => String(a['date']).localeCompare(String(b['date'])))
    const validSet = new Set(valid)
    for (const row of list) {
      if (!validSet.has(row)) {
        out.push({ ...row, pre_close: null, change_pct: null })
        continue
      }
      const idx = valid.indexOf(row)
      const prev = idx > 0 ? toFloat(valid[idx - 1]!['close']) : null
      const close = toFloat(row['close'])
      out.push(
        Object.assign(row, {
          pre_close: prev,
          change_pct: prev !== null && prev !== 0 && close !== null ? (close - prev) / prev : null,
        }),
      )
    }
  }
  return out
}

/* ─── 前复权口径（adj = raw / Π(事件后 ex_factor)，单一实现）─── */

/** 一次除权因子事件（`ex_factor` 为逐事件非累积比值）。 */
export interface AdjFactorEvent {
  trade_date: string
  ex_factor: number
}

/**
 * 构造前复权乘数函数：对某日期返回「该日期**之后**所有事件因子」的累乘（TSP：
 * `adjusted = raw / Π(事件后 ex_factor)`；事件当日 bar 已是除权价，不调整）。无适用事件
 * → 1（原价回落）。新建函数 O(n log n)，单次求值 O(log n)；调用方负责每 symbol 各建一个
 * （因子按 symbol 独立）。
 *
 * 空/无日期行/非数值事件的 `ex_factor` 在累乘中跳过（不伪造）。
 */
export function forwardAdjustFactor(events: readonly AdjFactorEvent[]): (date: string) => number {
  const sorted = events
    .filter((e) => typeof e.trade_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.trade_date))
    .filter((e) => typeof e.ex_factor === 'number' && Number.isFinite(e.ex_factor))
    .sort((a, b) => a.trade_date.localeCompare(b.trade_date))
  // 后缀累积：cum[i] = Π_{j>=i} ex_factor，即「从 sorted[i] 这个事件起（含）及之后」的累乘。
  const cum: number[] = new Array(sorted.length)
  let acc = 1
  for (let i = sorted.length - 1; i >= 0; i--) {
    acc *= sorted[i]!.ex_factor
    cum[i] = acc
  }
  return (date: string) => {
    // 二分找第一个 trade_date **严格大于** date 的事件（事件当日 bar 不调整）。
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid]!.trade_date <= date) lo = mid + 1
      else hi = mid
    }
    return lo >= sorted.length ? 1 : (cum[lo] as number)
  }
}

/** 单根K线的复权计算：`a = raw / factor`；非数值/非法乘数 → null（不伪造）。 */
export function forwardAdjust(
  row: { high?: unknown; low?: unknown; close?: unknown },
  factor: number,
): { high: number | null; low: number | null; close: number | null } {
  return {
    high: adjustPrice(toFloat(row.high), factor),
    low: adjustPrice(toFloat(row.low), factor),
    close: adjustPrice(toFloat(row.close), factor),
  }
}

/**
 * 前复权单价位换算（**单一实现**，`forwardAdjust`/`toEnrichedRows` 均复用它，不各写一份）：
 * `a = value / factor`；非数值（value===null）或非法乘数（非有限 / ≤0）→ 原值/ null 透传
 * （不伪造）。`value` 须已是 `toFloat` 归一后的数值或 null。
 */
export function adjustPrice(value: number | null, factor: number): number | null {
  const valid = Number.isFinite(factor) && factor > 0
  return value === null || !valid ? value : value / factor
}

/* ─── Enriched 变换：原始日K + 除权因子 → 前复权窄表基点列（docs/data-model.md §3/§6）─── */

/**
 * TSP `filter_halt_days` 语义：`open==0 且 high==0` **或** `volume==0 且 amount==0` 判停牌。
 * `close==0` 单列**不**判停牌（避免把「收盘价恰为 0 的异常行」当停牌误删）。所有判据都经
 * `toFloat` 归一：缺失列 → null ≠ 0 → 不判停牌（不伪造）。返回该行是否停牌。
 */
export function isHaltDay(row: Record<string, unknown>): boolean {
  const open = toFloat(row['open'])
  const high = toFloat(row['high'])
  const volume = toFloat(row['volume'])
  const amount = toFloat(row['amount'])
  return (open === 0 && high === 0) || (volume === 0 && amount === 0)
}

/** 过滤停牌日（`isHaltDay` 为 true 的行剔除，其余原样保留）。 */
export function filterHaltDays(rows: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((r) => !isHaltDay(r))
}

/** 按 symbol 聚合除权因子事件（`Map<symbol, AdjFactorEvent[]>`）。 */
export function groupAdjFactors(
  events: readonly { symbol?: unknown; trade_date?: unknown; ex_factor?: unknown }[],
): Map<string, AdjFactorEvent[]> {
  const bySymbol = new Map<string, AdjFactorEvent[]>()
  for (const ev of events) {
    const sym = String(ev.symbol ?? '')
    if (!sym) continue
    const factor = toFloat(ev.ex_factor)
    const date = typeof ev.trade_date === 'string' ? ev.trade_date : ''
    if (factor === null || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue
    const list = bySymbol.get(sym) ?? []
    list.push({ trade_date: date, ex_factor: factor })
    bySymbol.set(sym, list)
  }
  return bySymbol
}

/**
 * Enriched 生成（**前复权窄表基点列**，docs/data-model.md §3 `ENRICHED_STORAGE_COLS`）：
 * 原始日K（open/high/low/close 为不复权价 + volume/amount）经 `filterHaltDays` 剔除停牌日后，
 * 每 symbol 用 `forwardAdjustFactor`（`adj = raw / Π(事件后 ex_factor)`，事件当日不调整）算出
 * **前复权 open/high/low/close**，并保留 `raw_close/raw_high/raw_low` 原始价。派生指标**不在本
 * 函数计算、不落表**（归 `ctx.indicators` 现算，见 [indicators.ts](./indicators.ts)）。
 *
 * 依赖历史股本/递归状态的列（`turnover_rate`/`consecutive_limit_ups`/`consecutive_limit_downs`）
 * 及行情时间戳 `quote_ts` 在本最小链路中**如实置 null**（不伪造）。
 *
 * **fail-closed**：行缺 symbol / 日期非法 / 原始价全部缺失 → 显式抛错（禁止静默吐「看似合理」
 * 的复权价）；停牌日（`isHaltDay`）是约定剔除、非数据缺口，正常跳过。
 */
export function toEnrichedRows(
  rawRows: readonly Record<string, unknown>[],
  factors: readonly { symbol?: unknown; trade_date?: unknown; ex_factor?: unknown }[],
): Record<string, unknown>[] {
  const factorMap = groupAdjFactors(factors)
  // 按 symbol 分组（保序）；缺 symbol → fail-closed。
  const bySymbol = new Map<string, Record<string, unknown>[]>()
  for (const r of rawRows) {
    const sym = String(r['symbol'] ?? '')
    if (!sym) throw new Error(`[enriched] 原始日K行缺 symbol（fail-closed）`)
    const list = bySymbol.get(sym) ?? []
    list.push(r)
    bySymbol.set(sym, list)
  }

  const out: Record<string, unknown>[] = []
  for (const [symbol, barsRaw] of bySymbol) {
    const bars = filterHaltDays(barsRaw).sort((a, b) =>
      String(a['date']).localeCompare(String(b['date'])),
    )
    const adjFactor = forwardAdjustFactor(factorMap.get(symbol) ?? [])
    for (const bar of bars) {
      const date = String(bar['date'] ?? '')
      if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
        throw new Error(`[enriched] ${symbol} 行日期缺失/非法（fail-closed）: ${JSON.stringify(date)}`)
      }
      const rawOpen = toFloat(bar['open'])
      const rawHigh = toFloat(bar['high'])
      const rawLow = toFloat(bar['low'])
      const rawClose = toFloat(bar['close'])
      if (rawOpen === null && rawHigh === null && rawLow === null && rawClose === null) {
        throw new Error(`[enriched] ${symbol}@${date} 原始价全部缺失（fail-closed）`)
      }
      const factor = adjFactor(date)
      out.push({
        symbol,
        date,
        open: adjustPrice(rawOpen, factor),
        high: adjustPrice(rawHigh, factor),
        low: adjustPrice(rawLow, factor),
        close: adjustPrice(rawClose, factor),
        volume: toFloat(bar['volume']),
        amount: toFloat(bar['amount']),
        raw_close: rawClose,
        raw_high: rawHigh,
        raw_low: rawLow,
        turnover_rate: null,
        consecutive_limit_ups: null,
        consecutive_limit_downs: null,
        quote_ts: null,
      })
    }
  }
  return out
}