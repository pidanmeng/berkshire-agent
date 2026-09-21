/**
 * 数据集同步编排（单写者：唯一把 provider 取数写进 DuckDB 的路径）。
 *
 * `runDatasetSync(ctx, dataset, args)`：resolve 偏好路由 → provider.fetch → 建表（按
 * `ctx.datasets` 声明的列，内嵌物化）→ **事务化的整表替换**（BEGIN + DELETE + 批量 INSERT +
 * COMMIT；失败 ROLLBACK，不留半填充态）→ 广播 `database/dataset-updated`。语义：手动「采集」=
 * 刷新该 dataset 的本地快照，行数确定（重复采集不累积重复行）。
 *
 * 列类型映射按命名约定（金融口径）：标识/时间类列存 VARCHAR（date/datetime/period_end/
 * announce_date/trade_date/symbol/name/source/table/key/freq/timestamp），其余数值类列
 * 存 DOUBLE；数值列遇非有限数值 → NULL（不伪造）。表名/列名来自 `ctx.datasets` 声明
 * （内置白名单），插值前按 DuckDB 标识符转义（双引号翻倍）。
 *
 * 诚实边界：schema 迁移/分区/parquet-view/generation 标记仍目标态；本实现是内嵌表的
 * 建表-替换最小链路。
 */
import type { Context } from '@berkshire/cordis'
import type { DatasetId } from '@berkshire/core'
import '@berkshire/core'

/** 一次同步的结果（供协议层返回给调用方）。 */
export interface SyncResult {
  dataset: DatasetId
  rows: number
  at: number
}

/** 标识/时间类列名（存 VARCHAR）；其余列按 DOUBLE 落库。 */
const TEXT_COLUMNS = new Set([
  'symbol', 'name', 'source', 'table', 'key', 'freq',
  'date', 'datetime', 'period_end', 'announce_date', 'trade_date', 'timestamp',
])

function columnType(name: string): string {
  return TEXT_COLUMNS.has(name) ? 'VARCHAR' : 'DOUBLE'
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

/** 一个值的 SQL 字面量（受控数据集的转义：字符串单引号翻倍、数值校验、null/NaN → NULL）。 */
function sqlLiteral(value: unknown): string {
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
 * 执行一次数据集同步：建表（若缺）→ 整表替换写入 → 广播 `database/dataset-updated`。
 * 无候选源 / fetch 失败 / DB 不可用一律响亮抛错（fail-closed）。
 */
export async function runDatasetSync(
  ctx: Context,
  dataset: DatasetId,
  args: Record<string, unknown> = {},
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

  // 建表（内嵌物化）：按声明列 + 命名约定类型。
  const createSql = `CREATE TABLE IF NOT EXISTS ${table} (${decl.columns
    .map((c) => `${quoteIdent(c)} ${columnType(c)}`)
    .join(', ')})`
  await ctx.database.exec(createSql)

  // 整表替换（刷新语义）：显式事务包裹「DELETE + 批量 INSERT」，避免重复采集累积重复行，
  // 也保证中途失败（任一 INSERT 抛错）即 ROLLBACK 恢复旧表，不留空/半填充态（data-model.md §5
  // 「构建新快照后原子替换」）。建表放事务外（IF NOT EXISTS 幂等）。
  await ctx.database.exec('BEGIN')
  try {
    await ctx.database.exec(`DELETE FROM ${table}`)
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH)
      const values = batch
        .map((row) =>
          decl.columns.map((c) => sqlLiteral(row[c])).join(', '),
        )
        .map((cols) => `(${cols})`)
        .join(', ')
      if (values.length === 0) continue
      await ctx.database.exec(
        `INSERT INTO ${table} (${decl.columns.map((c) => quoteIdent(c)).join(', ')}) VALUES ${values}`,
      )
    }
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

  const result: SyncResult = { dataset, rows: rows.length, at: Date.now() }
  ctx.emit('database/dataset-updated', result)
  ctx.log.append('dataSources/sync', {
    dataset: String(dataset),
    provider: String(provider.id),
    rows: rows.length,
  })
  return result
}
