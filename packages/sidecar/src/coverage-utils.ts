/**
 * 覆盖日期注册表的**扩展工具**（S2-coverage-date-registry 交付面）：
 *
 * - `scanDatasetTable`：重扫某 dataset 的实际落库表，得到「事实覆盖」min/max/rows（表不存在/空表
 *   → 未覆盖，不伪造）；
 * - `rescanAndRecordCoverage`：**手动重算覆盖**（数据被外部/旧版本写入后校准）——重扫 + 经
 *   `ctx.datasets.recordCoverage` 登记（来源取已登记记录优先，否则当前可解析 provider）；
 * - `coverageGaps`（纯函数）/`coverageGapsFor`：**缺洞自检钩子（最小面）**——比对目标窗口与实际
 *   min/max，输出缺失区间列表。
 *
 * 写入口/Provider 由 `coverage-provider.ts` + `ctx.datasets.recordCoverage` 提供（单写者，
 * `dataset_coverage` 元表，幂等 upsert）；本模块在其上补「重算 + 查询 + 缺洞」三类 Consumer 能力，
 * 供协议层（`data-sources/coverage*`）与数据管理页消费。
 *
 * 诚实边界：`tradingDays` 是「去重 date 数」（数据本身只含交易日 → 等价交易日数；真实日历语义
 * 归 `market-calendar`）；`coverageGaps` 按**日历日**粒度判缺（非交易日一并列出，交易日细化属目标态，
 * 不伪造「交易日语义」）。
 */
import type { Context } from '@berkshire/cordis'
import type { DatasetCoverage, DatasetId, DataSourceId } from '@berkshire/core'
import { quoteIdent, sqlLiteral } from './sync'
import '@berkshire/core'

/** 从 dataset 声明里找「日期/时间列」（与 `sync.ts` 覆盖登记同一口径）。 */
export const DATE_LIKE_COLUMNS = ['date', 'trade_date', 'datetime', 'period_end', 'announce_date']

async function tableExists(ctx: Context, name: string): Promise<boolean> {
  const rows = await ctx.database.query<{ n: number }>(
    `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='main' AND table_name=${sqlLiteral(name)}`,
  )
  return (rows[0]?.n ?? 0) > 0
}

/** 一次重扫的事实覆盖（未建表/空表 → 未覆盖：min/max null、rows 0，不伪造）。 */
export interface ScannedCoverage {
  minDate: string | null
  maxDate: string | null
  tradingDays: number
  rows: number
}

/** 重扫某 dataset 的实际落库表（内嵌表或 parquet-view 视图皆可）。 */
export async function scanDatasetTable(
  ctx: Context,
  dataset: DatasetId,
  dateCol: string | null,
): Promise<ScannedCoverage> {
  const table = quoteIdent(String(dataset))
  if (!(await tableExists(ctx, String(dataset)))) {
    return { minDate: null, maxDate: null, tradingDays: 0, rows: 0 }
  }
  if (dateCol) {
    const q = quoteIdent(dateCol)
    const [r] = await ctx.database.query<{ mn: string | null; mx: string | null; n: number; d: number }>(
      `SELECT min(${q}) AS mn, max(${q}) AS mx, count(*) AS n, count(DISTINCT ${q}) AS d FROM ${table}`,
    )
    const n = Number(r?.n ?? 0)
    return {
      minDate: n === 0 ? null : r?.mn ?? null,
      maxDate: n === 0 ? null : r?.mx ?? null,
      tradingDays: Number(r?.d ?? 0),
      rows: n,
    }
  }
  const [r] = await ctx.database.query<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)
  return { minDate: null, maxDate: null, tradingDays: 0, rows: Number(r?.n ?? 0) }
}

/** 确定一个 dataset 的日期列（声明列的既有口径；无日期列 → null）。 */
export function coverageDateColumnOf(columns: readonly string[] | undefined): string | null {
  if (!columns) return null
  return columns.find((c) => DATE_LIKE_COLUMNS.includes(String(c))) ?? null
}

/** 手动重算覆盖：重扫实际表 → 登记；来源取已登记记录优先，否则当前可解析 provider（两者皆无 → fail-closed）。 */
export async function rescanAndRecordCoverage(ctx: Context, dataset: DatasetId): Promise<DatasetCoverage> {
  const decl = ctx.datasets.get(dataset)
  if (!decl) throw new Error(`[coverage] 未知 dataset '${String(dataset)}'（fail-closed）`)
  const existing = await ctx.datasets.reportCoverage(dataset)
  let source = existing?.source
  if (!source) {
    try {
      source = (await ctx.dataSources.resolve(dataset)).id
    } catch {
      source = undefined
    }
  }
  if (!source) {
    throw new Error(
      `[coverage] 数据集 '${String(dataset)}' 无法确定来源（无已登记记录且无可解析 provider），拒绝重算（fail-closed）`,
    )
  }
  const dateCol = coverageDateColumnOf(decl.columns)
  const scanned = await scanDatasetTable(ctx, dataset, dateCol)
  const record: DatasetCoverage = {
    dataset,
    minDate: scanned.minDate,
    maxDate: scanned.maxDate,
    tradingDays: scanned.tradingDays,
    rows: scanned.rows,
    source: source as DataSourceId,
    materialization: decl.materialization,
    recordedAt: Date.now(),
  }
  await ctx.datasets.recordCoverage(record)
  return record
}

/** 覆盖日期——一次缺失区间的两侧端点（含首尾，yyyy-mm-dd）。 */
export interface CoverageGap {
  start: string
  end: string
}

/** `coverageGaps` 的返回：目标窗口 vs 实际覆盖区间的差异（最小面）。 */
export interface CoverageGapsResult {
  dataset: DatasetId
  /** 目标窗口起始（未给 → 实际覆盖下限）。 */
  targetStart: string | null
  /** 目标窗口截止（未给 → 实际覆盖上限）。 */
  targetEnd: string | null
  /** 实际覆盖区间（未登记 → null）。 */
  actualMin: string | null
  actualMax: string | null
  /** 缺失区间（按日历日粒度；交易日细化属目标态）。 */
  missing: CoverageGap[]
  /** 是否「targetStart→targetEnd 全被覆盖」（任一端不可判定 → false 保守）。 */
  complete: boolean
}

/** 日期字符串加一天（yyyy-mm-dd；纯字符串步进，不做时区运算）。 */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/**
 * 纯函数缺洞检测（可单测）：给定目标窗口 + 实际覆盖区间，输出缺失区间列表。
 *
 * 最小面：仅比对窗口端点 vs 实际 `min/max`，输出前导/尾部缺失（或整窗未覆盖）。**交易日细化**
 * （跳过非交易日、缺口只列表内交易日）依赖 `market-calendar`，属目标态；当前按**日历日**粒度，
 * 缺口两端含所有自然日（含周末，诚实不伪造「交易日语义」）。
 */
export function coverageGaps(
  dataset: DatasetId,
  targetStart: string | null,
  targetEnd: string | null,
  actualMin: string | null,
  actualMax: string | null,
): CoverageGapsResult {
  const missing: CoverageGap[] = []
  const complete =
    targetStart !== null &&
    targetEnd !== null &&
    actualMin !== null &&
    actualMax !== null &&
    String(actualMin) <= String(targetStart) &&
    String(actualMax) >= String(targetEnd)

  // 目标窗口未给整段时无法判缺口（missing 空，交给调用方提示「目标未给定」）。
  if (targetStart !== null && targetEnd !== null) {
    if (actualMin === null || actualMax === null || String(actualMin) > String(targetStart)) {
      // 前导缺失：[targetStart, dayBefore(actualMin)] 或整个窗口（无覆盖）。
      const leadEnd =
        actualMin !== null && String(actualMin) >= String(targetStart)
          ? addDays(String(actualMin), -1)
          : targetEnd
      if (String(targetStart) <= String(leadEnd)) missing.push({ start: targetStart, end: leadEnd })
    }
    if (actualMin !== null && actualMax !== null && String(actualMax) < String(targetEnd)) {
      // 尾部缺失：[dayAfter(actualMax), targetEnd]。
      const trailStart = addDays(String(actualMax), 1)
      if (String(trailStart) <= String(targetEnd)) missing.push({ start: trailStart, end: targetEnd })
    }
  }

  return { dataset, targetStart, targetEnd, actualMin, actualMax, missing, complete }
}

/** 缺洞自检读路径：查某 dataset 覆盖 + 比对目标窗口。 */
export async function coverageGapsFor(
  ctx: Context,
  dataset: DatasetId,
  start?: string,
  end?: string,
): Promise<CoverageGapsResult> {
  const cov = await ctx.datasets.reportCoverage(dataset)
  const actualMin = cov?.minDate ?? null
  const actualMax = cov?.maxDate ?? null
  const targetStart = start && start !== '' ? start : (actualMin ?? null)
  const targetEnd = end && end !== '' ? end : (actualMax ?? null)
  return coverageGaps(dataset, targetStart, targetEnd, actualMin, actualMax)
}

/**
 * 覆盖登记的用户面快照项（`data-sources/coverage` / `data-sources/list.coverage` 共用的 DTO）。
 * 未登记数据集 → `covered:false`、min/max 为 null（fail-closed，不伪造「已覆盖」）。
 */
export interface CoverageEntryDto {
  dataset: string
  label: string
  /** 是否已有覆盖登记（未同步 → false）。 */
  covered: boolean
  minDate: string | null
  maxDate: string | null
  tradingDays: number | null
  rows: number
  source: string | null
  materialization: string
  recordedAt: number | null
  coverageStart: string | null
  isComplete: boolean | null
}

/** 全部已声明数据组的覆盖快照（数据管理页 / 协议读 API 消费）。DB 不可用 → fail-closed 抛错。 */
export async function listCoverageEntries(ctx: Context): Promise<CoverageEntryDto[]> {
  const out: CoverageEntryDto[] = []
  for (const d of ctx.datasets.list()) {
    const cov = await ctx.datasets.reportCoverage(d.id)
    out.push({
      dataset: String(d.id),
      label: d.label,
      covered: cov !== null,
      minDate: cov?.minDate ?? null,
      maxDate: cov?.maxDate ?? null,
      tradingDays: cov?.tradingDays ?? null,
      rows: cov?.rows ?? 0,
      source: cov ? String(cov.source) : null,
      materialization: d.materialization,
      recordedAt: cov?.recordedAt ?? null,
      coverageStart: cov?.coverageStart ?? null,
      isComplete: cov?.isComplete ?? null,
    })
  }
  return out
}