/**
 * CSV 数据源 provider —— 最小第二 provider，证明「每个接口（数据集）都可用其它 provider
 * 实现」的分功能路由（与扶摇同 seam，可在数据管理页按数据集切换）。
 *
 * 文件布局（目录可配，缺省 `$BK_HOME/data/csv`）：
 * - `daily.csv`        日K（列：symbol,date,open,high,low,close,volume,amount）
 * - `realtime.csv`     实时快照（列：symbol,name,last_price,prev_close,open,high,low,volume,amount,change_pct,change_amount,timestamp）
 * - `adj_factor.csv`   除权因子（列：symbol,trade_date,ex_factor）
 *
 * 单位口径：volume 已按**内部口径（手）**填写（与扶摇 provider 归一后一致，见 data-model.md §3）；
 * 不做单位换算（CSV 是用户自备数据，文档注明即可）。坏行（缺必需列/数值不可解析）→ 跳过并留痕，
 * 绝不伪造；文件缺失 → 对应 dataset available:false + 原因（fail-closed 展示面）。
 *
 * 诚实边界：无 schema 迁移/校验、不做分区；仅作多源路由的证明性最小实现。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { derivePreClose, toFloat } from '@berkshire/core'
import type { DataSourceId, DataSourceProvider, DatasetAvailability, DatasetId } from '@berkshire/core'

export interface CsvProviderDeps {
  /** CSV 根目录（绝对路径）。 */
  dataDir(): string
  /** 留痕回调（wire 到 ctx.log.append）。 */
  log?(event: string, data?: unknown): void
}

interface CsvColumn {
  name: string
  /** 是否为必填（缺失 → 整行跳过）。 */
  required?: boolean
  /** 是否数值列（解析为 number，NaN → null）。 */
  numeric?: boolean
}

const DAILY_COLS: readonly CsvColumn[] = [
  { name: 'symbol', required: true },
  { name: 'date', required: true },
  { name: 'open', numeric: true },
  { name: 'high', numeric: true },
  { name: 'low', numeric: true },
  { name: 'close', required: true, numeric: true },
  { name: 'volume', numeric: true },
  { name: 'amount', numeric: true },
]
const REALTIME_COLS: readonly CsvColumn[] = [
  { name: 'symbol', required: true },
  { name: 'name' },
  { name: 'last_price', numeric: true },
  { name: 'prev_close', numeric: true },
  { name: 'open', numeric: true },
  { name: 'high', numeric: true },
  { name: 'low', numeric: true },
  { name: 'volume', numeric: true },
  { name: 'amount', numeric: true },
  { name: 'change_pct', numeric: true },
  { name: 'change_amount', numeric: true },
  { name: 'timestamp' },
]
const ADJ_COLS: readonly CsvColumn[] = [
  { name: 'symbol', required: true },
  { name: 'trade_date', required: true },
  { name: 'ex_factor', required: true, numeric: true },
]

/** 极简 CSV 解析（无引号内换行场景；字段内逗号不做引号包裹处理——文档注明格式限制）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    rows.push(line.split(',').map((cell) => cell.trim()))
  }
  return rows
}

/** 从一列 CSV 行解析出对象数组（按列定义转数值/缺省）。坏行（缺必填/数值坏）跳过并留痕。 */
function rowsToObjects(
  grid: string[][],
  cols: readonly CsvColumn[],
  log?: (event: string, data?: unknown) => void,
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i]!
    if (cells.length === 0) continue
    const row: Record<string, unknown> = {}
    let bad = false
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c]!
      const raw = cells[c]
      if (raw === undefined || raw === '') {
        if (col.required) bad = true
        row[col.name] = null
        continue
      }
      if (col.numeric) {
        const n = toFloat(raw)
        if (n === null) {
          // 数值列不可解析：必填 → 坏行；可选 → null。
          if (col.required) bad = true
          row[col.name] = null
        } else {
          row[col.name] = n
        }
      } else {
        row[col.name] = raw
      }
    }
    if (bad) {
      log?.('datasource-csv/skip', { row: i + 1, note: '缺必需列/数值不可解析' })
      continue
    }
    out.push(row)
  }
  return out
}

function hasDailyFiles(dir: string): boolean {
  if (existsSync(join(dir, 'daily.csv'))) return true
  const sub = join(dir, 'daily')
  return existsSync(sub) && readdirSync(sub).some((f) => f.toLowerCase().endsWith('.csv'))
}

function loadDaily(dir: string, log?: (event: string, data?: unknown) => void): Array<Record<string, unknown>> {
  const single = join(dir, 'daily.csv')
  if (existsSync(single)) {
    return rowsToObjects(parseCsv(readFileSync(single, 'utf8')), DAILY_COLS, log)
  }
  const sub = join(dir, 'daily')
  if (existsSync(sub)) {
    const files = readdirSync(sub).filter((f) => f.toLowerCase().endsWith('.csv'))
    const out: Array<Record<string, unknown>> = []
    for (const f of files) {
      const rows = rowsToObjects(parseCsv(readFileSync(join(sub, f), 'utf8')), DAILY_COLS, log)
      for (const r of rows) {
        // 文件名如 600000.SH.csv → 兜底 symbol（行内缺 symbol 时）。
        if (!r['symbol']) r['symbol'] = f.replace(/\.csv$/i, '')
      }
      out.push(...rows)
    }
    return out
  }
  return []
}

function loadRealtime(dir: string, log?: (event: string, data?: unknown) => void): Array<Record<string, unknown>> {
  const file = join(dir, 'realtime.csv')
  if (!existsSync(file)) return []
  return rowsToObjects(parseCsv(readFileSync(file, 'utf8')), REALTIME_COLS, log)
}

function loadAdj(dir: string, log?: (event: string, data?: unknown) => void): Array<Record<string, unknown>> {
  const file = join(dir, 'adj_factor.csv')
  if (!existsSync(file)) return []
  return rowsToObjects(parseCsv(readFileSync(file, 'utf8')), ADJ_COLS, log)
}

export function createCsvProvider(deps: CsvProviderDeps): DataSourceProvider {
  const staticDatasets = {
    daily: { available: true },
    realtime: { available: true },
    adj_factor: { available: true },
  } as Partial<Record<DatasetId, DatasetAvailability>>

  async function availability(dataset: DatasetId): Promise<DatasetAvailability> {
    const dir = deps.dataDir()
    switch (String(dataset)) {
      case 'daily': {
        const ok = hasDailyFiles(dir)
        return ok ? { available: true } : { available: false, reason: `未找到 ${join(dir, 'daily.csv')} 或 daily/*.csv` }
      }
      case 'realtime': {
        const ok = existsSync(join(dir, 'realtime.csv'))
        return ok ? { available: true } : { available: false, reason: `未找到 ${join(dir, 'realtime.csv')}` }
      }
      case 'adj_factor': {
        const ok = existsSync(join(dir, 'adj_factor.csv'))
        return ok ? { available: true } : { available: false, reason: `未找到 ${join(dir, 'adj_factor.csv')}` }
      }
      default:
        return { available: false, reason: 'csv provider 不支持该数据集' }
    }
  }

  return {
    id: 'csv' as DataSourceId,
    label: 'csv',

    datasets: staticDatasets,
    getAvailability: availability,

    async fetch(dataset, args) {
      void args
      const dir = deps.dataDir()
      switch (String(dataset)) {
        case 'daily': {
          const rows = loadDaily(dir, deps.log)
          deps.log?.('datasource-csv/daily', { rows: rows.length, dir })
          return derivePreClose(rows)
        }
        case 'realtime': {
          const rows = loadRealtime(dir, deps.log)
          deps.log?.('datasource-csv/realtime', { rows: rows.length, dir })
          return rows
        }
        case 'adj_factor': {
          const rows = loadAdj(dir, deps.log)
          deps.log?.('datasource-csv/adj_factor', { rows: rows.length, dir })
          return rows
        }
        default:
          throw new Error(`csv provider 不支持数据集 '${String(dataset)}'（fail-closed）`)
      }
    },
  }
}
