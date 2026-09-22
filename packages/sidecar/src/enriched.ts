/**
 * Enriched（复权 OHLCV + 派生现算）数据能力的 **sidecar 侧实现**（能力缝三角色之 Provider/Consumer）。
 *
 * - **写路径（单写者渲染）**：把 `daily`（原始日K）+ `adj_factor`（除权因子）经
 *   `dataContract.toEnrichedRows`（前复权窄表基点列，派生生不落宽表）变换成 enriched 行，由
 *   `runDatasetSync(ctx, 'enriched')` 事务化整表替换写库（单写者=侧边桥唯一写入口，data-model.md §1）。
 *   `createEnrichedProvider()` 作为 `ctx.dataSources` 的一个 **derived provider** 注册，fetch 时读
 *   已落库的 daily/adj_factor 表 → 变换 → 返回 enriched 行，使 `data-sources/sync` 对 `enriched`
 *   走既有编排（覆盖登记由 S2-coverage-date-registry 挂 runDatasetSync 写路径自动覆盖，本包不另写）。
 * - **读路径（派生指标按需现算）**：`computeIndicatorsFromDb` 从 `enriched` 表读基点列，用
 *   `ctx.indicators` seam 现算 MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率（**不落表**），供协议
 *   `data-sources/enriched-indicators` 与未来的图表消费。
 *
 * 数据契约红线（data-model.md §6）：复权基于除权事件（`adj = raw / Π(事件后 ex_factor)`）；
 * 停牌日读数由 `toEnrichedRows` 剔除；`daily` 缺失 → fail-closed 报错；`adj_factor` 表缺失 →
 * fail-closed 报错（**禁**把「未做除权」当作「无事件」静默出前复权价）。
 */
import type { DatasetId, DataSourceId, DataSourceProvider, DatasetAvailability } from '@berkshire/core'
import {
  computeIndicators,
  toEnrichedRows,
  type IndicatorResultRow,
  type IndicatorSourceRow,
} from '@berkshire/core'
import type { DatasetCache } from './cache'

/** 指标现算入口签名（能力缝 Consumers：默认纯函数 `computeIndicators`，协议层可注入 `ctx.indicators.compute` 走 seam 合并）。 */
export type IndicatorCompute = (
  series: IndicatorSourceRow[],
  needed?: readonly string[],
) => IndicatorResultRow[]

/** provider 稳定 id（品牌化）。 */
const ENRICHED_PROVIDER_ID = 'enriched' as DataSourceId

/** 一个只读 DuckDB 查询面（`ctx.database` 的子集契约，测试可注入假实现）。 */
export interface ReadQuery {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}

/** 解析 `args.symbols`（string / string[]）→ 去重后的符号数组。 */
function parseSymbols(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/** SQL `symbol IN (...)` 子句（受控值均转义单引号）；空 → ''。 */
function inClause(symbols: string[]): string {
  if (symbols.length === 0) return ''
  return ` WHERE symbol IN (${symbols.map((s) => `'${s.replaceAll("'", "''")}'`).join(', ')})`
}

/**
 * 从已落库的 `daily` + `adj_factor` 读数据并变换成 enriched 窄表基点列。
 * `args.symbols`（可选）限制标的；`daily` 表缺失 → fail-closed；`adj_factor` 表缺失 → fail-closed
 * （**不**静默当「无事件」）；`adj_factor` 表存在但无行 → 正常（该标的无除权事件，factor=1）。
 */
export async function enrichFromDb(
  database: ReadQuery,
  args: Record<string, unknown> = {},
  cache?: DatasetCache,
): Promise<Record<string, unknown>[]> {
  const symbols = parseSymbols(args['symbols'])
  const clause = inClause(symbols)
  // 读透缓存（enriched 作用域）：同一批次（symbols 子集）从 daily/adj_factor 的原始读取可命中；
  // enriched 写路径（runDatasetSync('enriched')）会 bump generation 使旧槽失效，杜绝返回旧内存对象。
  const key = symbols.length > 0 ? `source:${symbols.join(',')}` : 'source:all'
  return cache
    ? await cache.read('enriched' as DatasetId, key, async () => {
        return readSourceRows(database, clause)
      })
    : readSourceRows(database, clause)
}

async function readSourceRows(
  database: ReadQuery,
  clause: string,
): Promise<Record<string, unknown>[]> {
  let daily: Array<Record<string, unknown>>
  try {
    daily = await database.query<Record<string, unknown>>(
      `SELECT symbol, date, open, high, low, close, volume, amount FROM daily ${clause} ORDER BY symbol, date`,
    )
  } catch (err) {
    throw new Error(
      `[enriched] 读取原始日K(daily)失败：${err instanceof Error ? err.message : String(err)}（需先采集 daily，fail-closed）`,
    )
  }
  let adj: Array<Record<string, unknown>>
  try {
    adj = await database.query<Record<string, unknown>>(
      `SELECT symbol, trade_date, ex_factor FROM adj_factor ${clause}`,
    )
  } catch (err) {
    throw new Error(
      `[enriched] 读取除权因子(adj_factor)失败：${err instanceof Error ? err.message : String(err)}` +
        `（需先采集 adj_factor；禁把「未做除权」当「无事件」出前复权价，fail-closed）`,
    )
  }
  return toEnrichedRows(daily, adj)
}

/**
 * `ctx.dataSources` 的 **derived provider**：声明服务 `enriched`，fetch 时读 `daily`/`adj_factor`
 * 变换出 enriched 窄表基点列。经 `runDatasetSync` 消费（单写者落库 + 覆盖登记协作）。
 */
export function createEnrichedProvider(): DataSourceProvider {
  return {
    id: ENRICHED_PROVIDER_ID,
    label: 'enriched（复权 OHLCV + 派生现算）',
    datasets: { enriched: { available: true } } as Partial<Record<DatasetId, DatasetAvailability>>,
    async fetch(dataset, args) {
      if (String(dataset) !== 'enriched') {
        throw new Error(`[enriched] provider 只服务 enriched（收到 '${String(dataset)}'，fail-closed）`)
      }
      const database = args['database'] as ReadQuery | undefined
      if (!database) {
        throw new Error('[enriched] fetch 需要 database（sync 编排注入 ctx.database，fail-closed）')
      }
      return enrichFromDb(database, args)
    },
  }
}

/** `data-sources/enriched-indicators` 入参。 */
export interface EnrichedIndicatorsArgs {
  symbol: string
  start?: string
  end?: string
  needed?: string[]
}

/**
 * **派生指标按需现算**（Consumer）：从 `enriched` 表读某标的基点列（停牌日已在变换时剔除），用
 * `ctx.indicators` 现算全套指标（`needed` 存在时仅返回请求列），**不落宽表**。`enriched` 表缺失/
 * 无该标的 → 显式报错（fail-closed，不伪造）。
 *
 * `compute`（默认纯函数 `computeIndicators`）：协议层注入 `ctx.indicators.compute` 走**能力缝**
 * （先内置、再叠加已注册 Provider 的列），保证第三方经 `ctx.indicators.register()` 挂的指标列
 * 真正进入读出结果（三角色完整——不允许 Consumer 绕开 seam 直用纯函数而丢弃注册列）。
 */
export async function computeIndicatorsFromDb(
  database: ReadQuery,
  args: EnrichedIndicatorsArgs,
  cache?: DatasetCache,
  compute: IndicatorCompute = computeIndicators,
): Promise<IndicatorResultRow[]> {
  const symbol = String(args.symbol ?? '').trim()
  if (!symbol) throw new Error('[enriched] enriched-indicators 需传非空 symbol（fail-closed）')
  const startClause = typeof args.start === 'string' && args.start ? ` AND date >= '${args.start.replaceAll("'", "''")}'` : ''
  const endClause = typeof args.end === 'string' && args.end ? ` AND date <= '${args.end.replaceAll("'", "''")}'` : ''
  // 读透缓存（enriched 作用域）：按 (symbol, start, end) 缓存该标的基点列；派生指标每轮按
  // `needed` 现算（便宜）。enriched 写路径 bump generation 后旧槽失效（热读「enriched 最新日」命中）。
  const key = `indicators:${symbol}:${args.start ?? ''}:${args.end ?? ''}`
  const rows = cache
    ? await cache.read('enriched' as DatasetId, key, () => readEnrichedSeries(database, symbol, startClause, endClause))
    : await readEnrichedSeries(database, symbol, startClause, endClause)
  if (rows.length === 0) {
    throw new Error(`[enriched] enriched 表中无 symbol='${symbol}' 的数据（fail-closed）`)
  }
  const series = rows
    .filter((r) => typeof r['date'] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(r['date'])))
    .map((r) => ({
      date: String(r['date']),
      open: r['open'] as number | null | undefined,
      high: r['high'] as number | null | undefined,
      low: r['low'] as number | null | undefined,
      close: r['close'] as number | null | undefined,
      volume: r['volume'] as number | null | undefined,
    }))
  return compute(series, args.needed)
}

async function readEnrichedSeries(
  database: ReadQuery,
  symbol: string,
  startClause: string,
  endClause: string,
): Promise<Array<Record<string, unknown>>> {
  try {
    return await database.query<Record<string, unknown>>(
      `SELECT symbol, date, open, high, low, close, volume FROM enriched` +
        ` WHERE symbol = '${symbol.replaceAll("'", "''")}'${startClause}${endClause} ORDER BY date`,
    )
  } catch (err) {
    throw new Error(
      `[enriched] 读取 enriched 失败：${err instanceof Error ? err.message : String(err)}（需先采集 enriched，fail-closed）`,
    )
  }
}