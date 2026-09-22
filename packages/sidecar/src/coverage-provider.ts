/**
 * `ctx.datasets` 覆盖日期登记能力的 **DuckDB Provider**（S2 覆盖 seam 之「提供方」）。
 *
 * 把覆盖记录写到 `$BK_HOME/berkshire.duckdb` 的 `dataset_coverage` 元表（幂等 upsert：按
 * dataset 键 `INSERT OR REPLACE`，重复同步同组只更新不累积）。**单写者纪律**：一切 DuckDB
 * 写入只经 `ctx.database.exec`，不裸写 DB 文件（docs/data-model.md §1）。
 *
 * 读路径 `read(dataset)` 供 `ctx.datasets.reportCoverage` 返回覆盖记录；未登记 → null
 * （fail-closed，不伪造「已覆盖」）。S2-coverage-date-registry 并行包可在此元表之上扩展
 * 读 API / 缺洞自检 / 数据管理页展示，无需重写写入口。
 */
import type { Context } from '@berkshire/cordis'
import type { CoverageProvider, DatasetCoverage, DatasetId, DataSourceId } from '@berkshire/core'
import { quoteIdent, sqlLiteral } from './sync'
import '@berkshire/core'

/** 覆盖元表名（docs/data-model.md §4 表集，S2 落地）。 */
export const COVERAGE_TABLE = 'dataset_coverage'

/** 构造一个基于 `ctx.database`（DuckDB 单写者）的覆盖 provider。惰性建表，失败 fail-closed 抛错。 */
export function createCoverageProvider(ctx: Context): CoverageProvider {
  let ensured = false

  async function ensure(): Promise<void> {
    if (ensured) return
    await ctx.database.exec(
      `CREATE TABLE IF NOT EXISTS ${quoteIdent(COVERAGE_TABLE)} (
        dataset VARCHAR PRIMARY KEY,
        min_date VARCHAR,
        max_date VARCHAR,
        trading_days DOUBLE,
        rows DOUBLE,
        source VARCHAR,
        materialization VARCHAR,
        coverage_start VARCHAR,
        is_complete BOOLEAN,
        recorded_at DOUBLE
      )`,
    )
    ensured = true
  }

  return {
    id: 'duckdb-coverage',

    async record(record: DatasetCoverage): Promise<void> {
      await ensure()
      // 幂等更新：按 dataset 键先删后插（显式事务，保证「重复同步同组只更新不累积」）。
      await ctx.database.exec('BEGIN')
      try {
        await ctx.database.exec(
          `DELETE FROM ${quoteIdent(COVERAGE_TABLE)} WHERE dataset = ${sqlLiteral(String(record.dataset))}`,
        )
        await ctx.database.exec(
          `INSERT INTO ${quoteIdent(COVERAGE_TABLE)} (
            dataset, min_date, max_date, trading_days, rows, source,
            materialization, coverage_start, is_complete, recorded_at
          ) VALUES (
            ${sqlLiteral(String(record.dataset))},
            ${sqlLiteral(record.minDate)},
            ${sqlLiteral(record.maxDate)},
            ${sqlLiteral(record.tradingDays)},
            ${sqlLiteral(record.rows)},
            ${sqlLiteral(String(record.source))},
            ${sqlLiteral(record.materialization)},
            ${sqlLiteral(record.coverageStart)},
            ${sqlLiteral(record.isComplete)},
            ${sqlLiteral(record.recordedAt)}
          )`,
        )
        await ctx.database.exec('COMMIT')
      } catch (err) {
        try {
          await ctx.database.exec('ROLLBACK')
        } catch {
          // 回滚失败只记录，不覆盖原错误。
        }
        throw err
      }
    },

    async read(dataset: DatasetId): Promise<DatasetCoverage | null> {
      await ensure()
      const rows = await ctx.database.query<Record<string, unknown>>(
        `SELECT dataset, min_date, max_date, trading_days, rows, source,
                materialization, coverage_start, is_complete, recorded_at
         FROM ${quoteIdent(COVERAGE_TABLE)}
         WHERE dataset = ${sqlLiteral(String(dataset))} LIMIT 1`,
      )
      if (rows.length === 0) return null
      const r = rows[0]!
      return {
        dataset: String(r.dataset) as DatasetId,
        minDate: (r.min_date as string | null) ?? null,
        maxDate: (r.max_date as string | null) ?? null,
        tradingDays: r.trading_days == null ? undefined : Number(r.trading_days),
        rows: Number(r.rows),
        source: String(r.source) as DataSourceId,
        materialization: r.materialization === 'parquet-view' ? 'parquet-view' : 'embedded',
        coverageStart: (r.coverage_start as string | null) ?? undefined,
        isComplete: r.is_complete == null ? undefined : Boolean(r.is_complete),
        recordedAt: Number(r.recorded_at),
      }
    },
  }
}