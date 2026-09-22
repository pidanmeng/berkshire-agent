/**
 * 技术指标**纯函数库**（`ctx.indicators` 的默认 Provider 实现；无 cordis 依赖、无 I/O）。
 *
 * 派生指标（MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率）遵循「窄表存储 + 派生现算」纪律
 * （docs/data-model.md §1.3）：Enriched 只落 `ENRICHED_STORAGE_COLS` 基点列，指标按需现算、
 * **不落宽表**。口径继承 TSP（[tick-stock-panel-contracts.md §4](../docs/reference/tick-stock-panel-contracts.md#4-indicator-pipeline)）
 * 的指标词汇（ma5..60 / ema / macd(dif,dea,hist) / boll(upper,mid,lower) / kdj(k,d,j) / atr_14 /
 * rsi_6/14/24 / momentum_*d / annual_vol_20d）。
 *
 * **诚实口径（不伪造）**：窗口数据不足处一律返回 null，不填 0/启发式猜测；遇停牌日应在
 * 进入本层前由 `filterHaltDays`（dataContract.ts）剔除（现算窗口对停牌日正确的约定由调用方
 * 保证——先滤停牌、再算指标）。输入序列中的 null 视为空缺并按各指标语义跳过/结转。
 */

/** 一条指标输入行（Enriched 前复权 OHLCV，停牌日已剔除）。 */
export interface IndicatorSourceRow {
  date: string
  open?: number | null
  high?: number | null
  low?: number | null
  close?: number | null
  volume?: number | null
}

/** 指标输出单元（null = 窗口数据不足/空缺，不伪造）。 */
export type IndicatorValue = number | null

/** 判定可参与计算的数值（null/非有限 → 不作为有效样本）。 */
function ok(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 简单移动平均：窗口内样本全为有限值才出结果，否则 null；遇到空缺口窗口从缺口后重置。 */
export function sma(values: readonly (number | null | undefined)[], period: number): IndicatorValue[] {
  const out: IndicatorValue[] = new Array(values.length).fill(null)
  if (period <= 0) return out
  const queue: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    if (!ok(values[i])) {
      queue.length = 0
      sum = 0
      continue
    }
    const v = values[i] as number
    queue.push(v)
    sum += v
    if (queue.length > period) {
      sum -= queue.shift() as number
    }
    out[i] = queue.length === period ? sum / period : null
  }
  return out
}

/**
 * 指数移动平均：首样本以首值播种；随后 `ema = v*m + ema_prev*(1-m)`，`m = 2/(period+1)`。
 * 空缺口（null）结转上一 EMA（对齐 Polars `ewm(ignore_na=true)`），不填 0。
 */
export function ema(values: readonly (number | null | undefined)[], period: number): IndicatorValue[] {
  const out: IndicatorValue[] = new Array(values.length).fill(null)
  if (period <= 0) return out
  const m = 2 / (period + 1)
  let prev: number | null = null
  for (let i = 0; i < values.length; i++) {
    if (!ok(values[i])) {
      out[i] = prev
      continue
    }
    const v = values[i] as number
    prev = prev === null ? v : v * m + prev * (1 - m)
    out[i] = prev
  }
  return out
}

/** 单值 RSI：连续上涨无下跌 → 100；横盘（gain=loss=0）→ 50（中立，不伪造）。 */
function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/**
 * Wilder RSI：前 `period` 个涨跌均值播种，随后 `avg=(avg*(period-1)+cur)/period`。
 * 输出对齐输入、下标即收盘位置；样本不足 `period+1` → null。输入须为全有限值序列
 * （调用方先滤停牌/空缺；此处对非有限值按「无涨跌」保守处理以避免漂移）。
 */
export function rsiSeries(closes: readonly (number | null | undefined)[], period = 14): IndicatorValue[] {
  const out: IndicatorValue[] = new Array(closes.length).fill(null)
  if (period <= 0 || closes.length <= period) return out
  // 播种：取前 period+1 个可比较的（有限）收盘差值。停牌已滤，此处全有限。
  let gainSum = 0
  let lossSum = 0
  let seeded = false
  for (let i = 1; i <= period; i++) {
    const prev = closes[i - 1]
    const cur = closes[i]
    if (ok(prev) && ok(cur)) {
      const d = (cur as number) - (prev as number)
      if (d >= 0) gainSum += d
      else lossSum -= d
      seeded = true
    }
  }
  if (!seeded) return out
  let avgGain = gainSum / period
  let avgLoss = lossSum / period
  out[period] = rsiFrom(avgGain, avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const prev = closes[i - 1]
    const cur = closes[i]
    if (ok(prev) && ok(cur)) {
      const d = (cur as number) - (prev as number)
      const gain = d > 0 ? d : 0
      const loss = d < 0 ? -d : 0
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
    }
    out[i] = rsiFrom(avgGain, avgLoss)
  }
  return out
}

/** MACD：`dif = emaFast - emaSlow`；`dea = ema(dif)`；`hist = dif - dea`（不含 ×2 缩放，口径在 JSDoc 明示）。 */
export function macd(
  closes: readonly (number | null | undefined)[],
  fast = 12,
  slow = 26,
  signal = 9,
): { dif: IndicatorValue[]; dea: IndicatorValue[]; hist: IndicatorValue[] } {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const dif: IndicatorValue[] = closes.map((_, i) =>
    emaFast[i] === null || emaSlow[i] === null ? null : (emaFast[i] as number) - (emaSlow[i] as number),
  )
  const dea = ema(dif, signal)
  const hist: IndicatorValue[] = dif.map((d, i) =>
    d === null || dea[i] === null ? null : d - (dea[i] as number),
  )
  return { dif, dea, hist }
}

/** BOLL（布林）：mid=MA(period)，upper/lower=mid±mult×窗口总体标准差（population stddev，ddof=0）。 */
export function boll(
  closes: readonly (number | null | undefined)[],
  period = 20,
  mult = 2,
): { upper: IndicatorValue[]; mid: IndicatorValue[]; lower: IndicatorValue[] } {
  const mid = sma(closes, period)
  const upper: IndicatorValue[] = new Array(closes.length).fill(null)
  const lower: IndicatorValue[] = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1)
    if (win.some((v) => !ok(v))) continue
    const nums = win as number[]
    const mean = nums.reduce((a, b) => a + b, 0) / period
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    const m = mid[i] as number
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
  }
  return { upper, mid, lower }
}

/**
 * KDJ：RSV = (close - LLV_n) / (HHV_n - LLV_n) × 100（范围 0 时取 50 中立）；K/D 用
 * A 股 SMA 递推 `S[i]=(cur + (k-1)*S[i-1])/k`（K 初始 50、D 初始 50）；J = 3K - 2D。
 */
export function kdj(
  highs: readonly (number | null | undefined)[],
  lows: readonly (number | null | undefined)[],
  closes: readonly (number | null | undefined)[],
  n = 9,
  k = 3,
  d = 3,
): { k: IndicatorValue[]; d: IndicatorValue[]; j: IndicatorValue[] } {
  const len = closes.length
  const rsv: IndicatorValue[] = new Array(len).fill(null)
  for (let i = n - 1; i < len; i++) {
    const hWin = highs.slice(i - n + 1, i + 1)
    const lWin = lows.slice(i - n + 1, i + 1)
    const c = closes[i]
    if (!ok(c)) continue
    const hh = Math.max(...hWin.map((v) => (ok(v) ? (v as number) : -Infinity)))
    const ll = Math.min(...lWin.map((v) => (ok(v) ? (v as number) : Infinity)))
    if (!Number.isFinite(hh) || !Number.isFinite(ll)) continue
    rsv[i] = hh === ll ? 50 : ((c as number - ll) / (hh - ll)) * 100
  }
  const kOut: IndicatorValue[] = new Array(len).fill(null)
  const dOut: IndicatorValue[] = new Array(len).fill(null)
  const jOut: IndicatorValue[] = new Array(len).fill(null)
  let prevK = 50
  let prevD = 50
  for (let i = 0; i < len; i++) {
    if (rsv[i] === null) continue
    prevK = (rsv[i] as number + (k - 1) * prevK) / k
    prevD = (prevK + (d - 1) * prevD) / d
    kOut[i] = prevK
    dOut[i] = prevD
    jOut[i] = 3 * prevK - 2 * prevD
  }
  return { k: kOut, d: dOut, j: jOut }
}

/**
 * ATR（Wilder）：`TR = max(high-low, |high-prevClose|, |low-prevClose|)`（首根用 high-low）；
 * ATR 以首 `period` 根 TR 均值播种，随后 `atr=(atr*(period-1)+tr)/period`。
 */
export function atr(
  highs: readonly (number | null | undefined)[],
  lows: readonly (number | null | undefined)[],
  closes: readonly (number | null | undefined)[],
  period = 14,
): IndicatorValue[] {
  const len = highs.length
  const out: IndicatorValue[] = new Array(len).fill(null)
  if (period <= 0) return out
  const tr: (number | null)[] = new Array(len).fill(null)
  for (let i = 0; i < len; i++) {
    const h = highs[i]
    const l = lows[i]
    if (!ok(h) || !ok(l)) continue
    const hc = h as number
    const lc = l as number
    if (i === 0) {
      tr[i] = hc - lc
      continue
    }
    const prevC = closes[i - 1]
    const prevClose = ok(prevC) ? (prevC as number) : null
    let t = hc - lc
    if (prevClose !== null) {
      t = Math.max(t, Math.abs(hc - prevClose), Math.abs(lc - prevClose))
    }
    tr[i] = t
  }
  // 播种
  let seedSum = 0
  let seeded = false
  for (let i = 0; i < period && i < len; i++) {
    if (tr[i] !== null) {
      seedSum += tr[i] as number
      seeded = true
    }
  }
  if (!seeded) return out
  let prev = seedSum / period
  if (period - 1 < len) out[period - 1] = prev
  for (let i = period; i < len; i++) {
    if (tr[i] === null) {
      out[i] = prev
      continue
    }
    prev = (prev * (period - 1) + (tr[i] as number)) / period
    out[i] = prev
  }
  return out
}

/** 动量：`close[i] / close[i-period] - 1`（period 期收益率）；样本不足 → null。 */
export function momentum(
  closes: readonly (number | null | undefined)[],
  period: number,
): IndicatorValue[] {
  const out: IndicatorValue[] = new Array(closes.length).fill(null)
  if (period <= 0) return out
  for (let i = period; i < closes.length; i++) {
    const prev = closes[i - period]
    const cur = closes[i]
    if (ok(prev) && ok(cur) && (prev as number) !== 0) {
      out[i] = ((cur as number) / (prev as number)) - 1
    }
  }
  return out
}

/**
 * 年化波动率：窗口内简单收益率的 **样本标准差（ddof=1）** × √252（A 股年化交易日）。
 * **满窗才出**：窗口内任一收盘缺项/非有限/前收为 0（无法求收益率）→ null（对齐 sma/boll 的
 * 「窗口不足 null 不伪造」，不拿「稀疏/跨缺口窗口拼出的收益率」伪装成满窗波动率）。
 */
export function annualVolatility(
  closes: readonly (number | null | undefined)[],
  period = 20,
): IndicatorValue[] {
  const out: IndicatorValue[] = new Array(closes.length).fill(null)
  if (period <= 1) return out
  for (let i = period; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1)
    if (win.some((v) => !ok(v))) continue
    const nums = win as number[]
    if (nums.some((v) => v === 0)) continue
    const returns: number[] = []
    for (let j = 1; j < nums.length; j++) {
      returns.push(nums[j]! / nums[j - 1]! - 1)
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)
    out[i] = Math.sqrt(variance) * Math.sqrt(252)
  }
  return out
}

/** `computeIndicators` 产出的一个指标行（列集继承 TSP §4 指标词汇；null=窗口不足）。 */
export interface IndicatorResultRow {
  date: string
  ma5: IndicatorValue
  ma10: IndicatorValue
  ma20: IndicatorValue
  ma30: IndicatorValue
  ma60: IndicatorValue
  ema5: IndicatorValue
  ema10: IndicatorValue
  ema20: IndicatorValue
  macd_dif: IndicatorValue
  macd_dea: IndicatorValue
  macd_hist: IndicatorValue
  boll_upper: IndicatorValue
  boll_mid: IndicatorValue
  boll_lower: IndicatorValue
  kdj_k: IndicatorValue
  kdj_d: IndicatorValue
  kdj_j: IndicatorValue
  atr_14: IndicatorValue
  rsi_6: IndicatorValue
  rsi_14: IndicatorValue
  rsi_24: IndicatorValue
  momentum_5d: IndicatorValue
  momentum_10d: IndicatorValue
  momentum_20d: IndicatorValue
  momentum_30d: IndicatorValue
  momentum_60d: IndicatorValue
  annual_vol_20d: IndicatorValue
}

const CLOSE_WINDOWS = [5, 10, 20, 30, 60] as const
const EMA_WINDOWS = [5, 10, 20] as const
const MOMENTUM_WINDOWS = [5, 10, 20, 30, 60] as const

/**
 * 由 Enriched 前复权 OHLCV 行现算全套派生指标（**不落存储**）。`needed` 存在时仅返回
 * `date` + 所请求列（裁剪面，TSP `needed` 依赖闭包的口径落地）；缺省返回全量列。内部始终
 * 全量现算（指标无跨列依赖、裁剪仅为输出过滤），诚实标注：O(n) 现算、不为裁剪省算。
 */
export function computeIndicators(
  rows: readonly IndicatorSourceRow[],
  needed?: readonly string[],
): IndicatorResultRow[] {
  const closes = rows.map((r) => (r.close === null || r.close === undefined ? null : r.close))
  const highs = rows.map((r) => (r.high === null || r.high === undefined ? null : r.high))
  const lows = rows.map((r) => (r.low === null || r.low === undefined ? null : r.low))

  const ma = new Map<number, IndicatorValue[]>()
  for (const w of CLOSE_WINDOWS) ma.set(w, sma(closes, w))
  const emaM = new Map<number, IndicatorValue[]>()
  for (const w of EMA_WINDOWS) emaM.set(w, ema(closes, w))
  const { dif, dea, hist } = macd(closes)
  const { upper, mid, lower } = boll(closes)
  const k = kdj(highs, lows, closes)
  const a = atr(highs, lows, closes)
  const rsi6 = rsiSeries(closes, 6)
  const rsi14 = rsiSeries(closes, 14)
  const rsi24 = rsiSeries(closes, 24)
  const mom = new Map<number, IndicatorValue[]>()
  for (const w of MOMENTUM_WINDOWS) mom.set(w, momentum(closes, w))
  const vol = annualVolatility(closes)

  const full: IndicatorResultRow[] = rows.map((r, i) => ({
    date: r.date,
    ma5: ma.get(5)![i] ?? null,
    ma10: ma.get(10)![i] ?? null,
    ma20: ma.get(20)![i] ?? null,
    ma30: ma.get(30)![i] ?? null,
    ma60: ma.get(60)![i] ?? null,
    ema5: emaM.get(5)![i] ?? null,
    ema10: emaM.get(10)![i] ?? null,
    ema20: emaM.get(20)![i] ?? null,
    macd_dif: dif[i] ?? null,
    macd_dea: dea[i] ?? null,
    macd_hist: hist[i] ?? null,
    boll_upper: upper[i] ?? null,
    boll_mid: mid[i] ?? null,
    boll_lower: lower[i] ?? null,
    kdj_k: k.k[i] ?? null,
    kdj_d: k.d[i] ?? null,
    kdj_j: k.j[i] ?? null,
    atr_14: a[i] ?? null,
    rsi_6: rsi6[i] ?? null,
    rsi_14: rsi14[i] ?? null,
    rsi_24: rsi24[i] ?? null,
    momentum_5d: mom.get(5)![i] ?? null,
    momentum_10d: mom.get(10)![i] ?? null,
    momentum_20d: mom.get(20)![i] ?? null,
    momentum_30d: mom.get(30)![i] ?? null,
    momentum_60d: mom.get(60)![i] ?? null,
    annual_vol_20d: vol[i] ?? null,
  }))

  if (!needed || needed.length === 0) return full
  const keys = new Set(needed)
  // 裁剪面：仅携带 date + 所请求列（其余键省略），供按需消费方（页/读取）取列。
  return full.map((row) => {
    const out: Record<string, unknown> = { date: row.date }
    for (const key of keys) {
      out[key] = (row as unknown as Record<string, unknown>)[key] ?? null
    }
    return out as unknown as IndicatorResultRow
  })
}