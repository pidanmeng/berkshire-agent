/**
 * 数据集同步编排（单写者：唯一把 provider 取数写进 DuckDB 的路径）。
 *
 * `runDatasetSync(ctx, dataset, args, cache?)`：resolve 偏好路由（门控：无候选源 fail-closed）→
 * provider.fetch → 按 `ctx.datasets` 声明的**物化策略**落库 → 覆盖日期登记 → 广播
 * `database/dataset-updated`（可附热缓存 generation）。语义：手动「采集」= 刷新该 dataset 的本地
 * 快照，行数确定（重复采集不累积重复行）。
 *
 * **物化策略（S2 扩展缝：按声明通用接入）**：
 * - `embedded`：按 `columnSchema`（标识/时间列 VARCHAR、数值列 DOUBLE，单一事实源
 *   `@berkshire/core` dataContract）建内嵌表 → 事务化整表替换（BEGIN + DELETE + 批量 INSERT +
 *   COMMIT；失败 ROLLBACK，不留半填充态）。
 * - `parquet-view`：行先写入同名 staging 内嵌表 → `COPY … TO '<parquet 快照>' (FORMAT PARQUET)`
 *   → 挂 `read_parquet` 视图 → 撤 staging。查询/覆盖登记都走视图。**S3 原子替换**：先 `COPY` 到
 *   `.tmp` 临时文件，再 `fileReplace` 重命名落位（Windows 读锁穿透：重试若干次），保证读者拿到的
 *   是「整份新快照」而非半写文件；视图挂全局 glob（`*.parquet`），predicate 下推由 DuckDB
 *   `read_parquet` 惰性扫描承担（大 L1 历史 lazy scan，不把全量表搬进内存）。分区多文件粒度仍 S3。
 *
 * **覆盖登记（S2 覆盖 seam）**：写库成功后计算 min/max（找 date/trade_date/datetime/
 * period_end/announce_date 列；无日期列 → null）经 `ctx.datasets.recordCoverage` 登记。
 * 数据写是权威的原子结果；覆盖 seam 属登记性附加能力——其 provider 缺失/写入失败**不推翻
 * 已落库的数据**，只留痕（fail-closed 语义体现在 `recordCoverage` 自身：无 provider 时响亮抛错，
 * 调用方（本编排）把它降级为日志，不让覆盖问题吞掉/误报数据写结果）。
 *
 * **热缓存失效（S3-cache-performance）**：`cache`（可选）若传入，在数据**落库成功后** bump 该
 * dataset 的 generation 并逐出缓存槽，且遍历失效元作用域（coverage 快照反映所有 dataset）；
 * 广播事件携带新 generation（前端 query 失效判据）。generation 是失效判据，写路径必须 bump，
 * 读端以 generation 判断是否复用——**禁「已写文件却返回旧内存对象」**（docs/data-model.md §5）。
 *
 * 诚实边界：generation 原子发布标记仍目标态；parquet-view 分区写/多文件 glob 仍目标态。
 */
import type { Context } from '@berkshire/cordis'
import type { DatasetId } from '@berkshire/core'
import type { DatasetDeclaration } from '@berkshire/core'
import type { DatasetCoverage } from '@berkshire/core'
import { defaultBkHome } from '@berkshire/boot'
import { mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { DatasetCache } from './cache'
import { META_SCOPE } from './cache'
import '@berkshire/core'

/** 一次同步的结果（供协议层返回给调用方）。 */
export interface SyncResult {
  dataset: DatasetId
  rows: number
  at: number
  /** 本次写后该 dataset 的热缓存 generation（未维护缓存 → 缺省）。 */
  generation?: number
}

/** DuckDB 标识符转义（双引号翻倍）。 */
export function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/** 一个值的 SQL 字面量（受控数据集的转义：字符串单引号翻倍、数值校验、null/NaN → NULL）。 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  // 其余（Date/对象）→ JSON 字符串（受控 provider 不应产出；保守转义不伪造）。
  return `'${JSON.stringify(value).replaceAll("'", "''")}'`
}

/** provider.fetch 结果归一为行数组（行必须是普通对象；非数组 fail-closed）。 */
function toRows(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) {
    throw new Error(`[sync] provider.fetch 返回非行数组（fail-closed）: ${typeof raw}`)
  }
  const rows: Record<string, unknown>[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`[sync] provider.fetch 返回的行不是对象（fail-closed）`)
    }
    rows.push(item as Record<string, unknown>)
  }
  return rows
}

const INSERT_BATCH = 500

/**
 * 原子替换文件（异步）：把 `tmpPath` 重命名为 `targetPath`（同目录 rename 原子；Windows 上目标
 * 文件可能被读者/杀软短时占用 → 短退避重试若干次，穿透读锁，对齐 TSP `replace_with_retry`）。
 * 重试耗尽仍失败 → 清理临时文件并响亮抛错（不留下半写产物）。
 */
export async function replaceWithRetry(tmpPath: string, targetPath: string, retries = 6): Promise<void> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmpPath, targetPath)
      return
    } catch (err) {
      if (attempt >= retries) {
        try {
          rmSync(tmpPath, { force: true })
        } catch {
          // 清理临时文件失败只记录，不覆盖原错误。
        }
        throw new Error(
          `[sync] parquet 快照原子替换失败（Windows 读锁穿透重试 ${retries} 次后仍失败）: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        )
      }
      await sleep(10 * (attempt + 1))
    }
  }
}

/** 建表 DDL（embedded 表或 parquet-view 的 staging 表共用；列类型取声明的 `columnSchema`）。 */
function createTableSql(decl: DatasetDeclaration, table: string): string {
  const cols = decl.columnSchema
    .map((c) => `${quoteIdent(c.name)} ${c.type}`)
    .join(', ')
  return `CREATE TABLE IF NOT EXISTS ${table} (${cols})`
}

/** 把行批量插入某表（事务由调用方包裹）。 */
async function insertRows(
  ctx: Context,
  decl: DatasetDeclaration,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const cols = decl.columnSchema
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH)
    const values = batch
      .map((row) => cols.map((c) => sqlLiteral(row[c.name])).join(', '))
      .map((cols) => `(${cols})`)
      .join(', ')
    if (values.length === 0) continue
    await ctx.database.exec(
      `INSERT INTO ${table} (${cols.map((c) => quoteIdent(c.name)).join(', ')}) VALUES ${values}`,
    )
  }
}

/** 事务化「DELETE + 批量 INSERT」整表替换（刷新语义：失败 ROLLBACK 恢复旧表，不留半填充态）。 */
async function replaceTable(
  ctx: Context,
  decl: DatasetDeclaration,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await ctx.database.exec('BEGIN')
  try {
    await ctx.database.exec(`DELETE FROM ${table}`)
    await insertRows(ctx, decl, table, rows)
    await ctx.database.exec('COMMIT')
  } catch (err) {
    // 失败回滚，绝不把部分写入的中间态落库。
    try {
      await ctx.database.exec('ROLLBACK')
    } catch {
      // 回滚失败（连接态异常）只记录，不覆盖原错误。
    }
    throw err
  }
}

/** 从已取行里算出覆盖范围（找日期列；无日期列 → null，不伪造）。 */
function coverageScope(
  decl: DatasetDeclaration,
  rows: Array<Record<string, unknown>>,
): { minDate: string | null; maxDate: string | null; tradingDays: number } {
  const dateCol = decl.columns.find((c) =>
    ['date', 'trade_date', 'datetime', 'period_end', 'announce_date'].includes(String(c)),
  )
  if (!dateCol) return { minDate: null, maxDate: null, tradingDays: 0 }
  const dates = rows
    .map((r) => String(r[dateCol] ?? ''))
    .filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d))
  if (dates.length === 0) return { minDate: null, maxDate: null, tradingDays: 0 }
  dates.sort()
  return {
    minDate: dates[0]!,
    maxDate: dates[dates.length - 1]!,
    tradingDays: new Set(dates).size,
  }
}

/**
 * 执行一次数据集同步：按声明物化策略落库（embedded 表 / parquet-view 视图）→ 覆盖登记 →
 * 热缓存失效（bump generation）→ 广播 `database/dataset-updated`。无候选源 / fetch 失败 /
 * DB 不可用一律响亮抛错（fail-closed）。`cache`（可选）为 S3 热缓存层：数据落库成功后 bump
 * 该 dataset generation + 遍历失效元作用域（coverage 快照），事件携带新 generation。
 */
export async function runDatasetSync(
  ctx: Context,
  dataset: DatasetId,
  args: Record<string, unknown> = {},
  cache?: DatasetCache,
): Promise<SyncResult> {
  const decl = ctx.datasets.get(dataset)
  if (!decl) {
    throw new Error(`[sync] 未知 dataset '${String(dataset)}'（fail-closed）`)
  }
  const provider = await ctx.dataSources.resolve(dataset)
  // 编排注入 `database` 服务：某些 provider（如扶摇 adj_factor）需要 DuckDB read_parquet
  // 读事件 dump。对不需要它的 provider 是无害重名透传（被静默忽略）。
  const raw = await provider.fetch(dataset, { database: ctx.database, ...args })
  const rows = toRows(raw)
  const table = quoteIdent(String(dataset))

  if (decl.materialization === 'parquet-view') {
    // parquet-view：staging 内嵌表整表替换 → COPY 出 parquet 快照（临时文件 + 原子重命名落位，
    // S3 replace_with_retry / Windows 读锁穿透）→ 挂 read_parquet 视图 → 撤 staging。
    const staging = quoteIdent(`__bk_staging_${String(dataset)}`)
    const bkHome = defaultBkHome()
    const dir = join(bkHome, 'data', String(dataset))
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${String(dataset)}.parquet`).replace(/\\/g, '/')
    const tmpFile = join(dir, `.${String(dataset)}.tmp`).replace(/\\/g, '/')
    await ctx.database.exec(createTableSql(decl, staging))
    await replaceTable(ctx, decl, staging, rows)
    // COPY staging → 临时 parquet 快照（先落 tmp，后续 rename 原子替换；失败抛错，视图保持旧快照）。
    await ctx.database.exec(
      `COPY (SELECT * FROM ${staging}) TO '${tmpFile.replaceAll("'", "''")}' (FORMAT PARQUET)`,
    )
    await replaceWithRetry(tmpFile, file)
    await ctx.database.exec(`DROP VIEW IF EXISTS ${table}`)
    const glob = join(dir, '*.parquet').replace(/\\/g, '/')
    await ctx.database.exec(
      `CREATE OR REPLACE VIEW ${table} AS SELECT * FROM read_parquet('${glob.replaceAll("'", "''")}')`,
    )
    await ctx.database.exec(`DROP TABLE IF EXISTS ${staging}`)
  } else {
    // embedded：按声明列建内嵌表 → 事务化整表替换。
    await ctx.database.exec(createTableSql(decl, table))
    await replaceTable(ctx, decl, table, rows)
  }

  // 覆盖登记（S2 覆盖 seam）：数据写已提交，登记失败只留痕、不推翻写结果。
  const scope = coverageScope(decl, rows)
  const coverage: DatasetCoverage = {
    dataset,
    minDate: scope.minDate,
    maxDate: scope.maxDate,
    tradingDays: scope.tradingDays,
    rows: rows.length,
    source: provider.id,
    materialization: decl.materialization,
    recordedAt: Date.now(),
  }
  try {
    await ctx.datasets.recordCoverage(coverage)
  } catch (err) {
    ctx.log.append('dataSources/coverage-skip', {
      dataset: String(dataset),
      reason: err instanceof Error ? err.message : String(err),
    })
  }

  // 热缓存失效链（S3）：数据已落库成功 → bump 该 dataset generation（逐出旧槽）+ 遍历失效
  // 元作用域（coverage 快照反映所有 dataset）；随后广播带新 generation 的写事件，读端以其判失效。
  let generation: number | undefined
  if (cache) {
    cache.invalidate(dataset)
    cache.invalidateMeta()
    generation = cache.generationOf(dataset)
  }

  const result: SyncResult = { dataset, rows: rows.length, at: Date.now(), generation }
  ctx.emit('database/dataset-updated', result)
  ctx.log.append('dataSources/sync', {
    dataset: String(dataset),
    provider: String(provider.id),
    materialization: decl.materialization,
    rows: rows.length,
  })
  return result
}
