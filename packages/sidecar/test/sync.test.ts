/**
 * S2 扩展到同步链路（`runDatasetSync`）的集成测试——真实 DuckDB（`@duckdb/node-api`）。
 * - embedded：按声明 `columnSchema` 建内嵌表 → 事务整表替换 → 覆盖登记（min/max/rows/source）；
 * - 幂等：重复同步同组只替换不累积；
 * - parquet-view：写 parquet 快照 + 挂 read_parquet 视图 → 可查询 + 覆盖登记 materialization；
 * - fail-closed：无候选源 / 未知 dataset → 响亮抛错。
 *
 * 依赖：模块流 imported 自 sidecar **源码**；`@berkshire/core`/`@berkshire/boot` 经 dist（需先
 * `bun run build:packages` 重建 core）。
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'
import * as corePlug from '@berkshire/core'
import { Boot, setBkHome } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  datasetColumnSchema,
  type DataSourceId,
  type DatasetDeclaration,
  type DatasetId,
} from '@berkshire/core'
import { runDatasetSync } from '../src/sync'
import { createDuckDbProvider } from '../src/duckdb-provider'
import { createCoverageProvider } from '../src/coverage-provider'
import { createFileStorageProvider } from '../src/storage-provider'

const resolver: Resolver = (name) => ({ '@berkshire/core': corePlug })[name]

const EMBEDDED_ID = 'custom_ohlc' as DatasetId
const PV_ID = 'custom_pv' as DatasetId

let home: string
let boot: Boot

function registerTestSource(): void {
  boot.ctx.dataSources.register({
    id: 'demo-src' as DataSourceId,
    label: 'demo-src',
    datasets: {
      [EMBEDDED_ID]: { available: true },
      [PV_ID]: { available: true },
    } as never,
    async fetch(dataset: DatasetId) {
      switch (String(dataset)) {
        case String(EMBEDDED_ID):
          return [
            { symbol: '600000.SH', date: '2025-01-06', close: 10.5 },
            { symbol: '600000.SH', date: '2025-01-07', close: 10.8 },
          ]
        case String(PV_ID):
          return [
            { date: '2025-01-06', factor: 'momentum', pnl: 1.2 },
            { date: '2025-01-07', factor: 'momentum', pnl: 0.9 },
          ]
        default:
          throw new Error(`未注册测试数据集 '${String(dataset)}'（fail-closed）`)
      }
    },
  })
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'bk-sync-test-'))
  setBkHome(home)
  boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  // 对齐真实 sidecar 装配：storage provider（路由偏好读取需要）+ DuckDB provider + 覆盖 provider。
  boot.ctx.storage.register(createFileStorageProvider(home))
  boot.ctx.database.register(createDuckDbProvider(home))
  boot.ctx.datasets.registerCoverage(createCoverageProvider(boot.ctx))

  // 测试数据集声明（embedded + parquet-view）。
  boot.ctx.datasets.register({
    id: EMBEDDED_ID,
    label: '嵌入样例',
    materialization: 'embedded',
    columns: ['symbol', 'date', 'close'],
    columnSchema: datasetColumnSchema(['symbol', 'date', 'close']),
  })
  boot.ctx.datasets.register({
    id: PV_ID,
    label: 'parquet-view 样例',
    materialization: 'parquet-view',
    partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
    columns: ['date', 'factor', 'pnl'],
    // 'factor' 是分类字符串列，须显式 VARCHAR（不在内置白名单，datasetColumnSchema 会误判 DOUBLE）。
    columnSchema: [
      { name: 'date', type: 'VARCHAR' },
      { name: 'factor', type: 'VARCHAR' },
      { name: 'pnl', type: 'DOUBLE' },
    ],
  } satisfies DatasetDeclaration)
  registerTestSource()
})

afterAll(async () => {
  try {
    await boot.dispose()
  } finally {
    if (home) rmSync(home, { recursive: true, force: true })
  }
})

describe('runDatasetSync · embedded 物化（S2 扩展缝通用接入）', () => {
  test('按声明 columnSchema 建表 + 整表替换 + 覆盖登记（min/max/rows/source）', async () => {
    const r = await runDatasetSync(boot.ctx, EMBEDDED_ID, {})
    expect(r.rows).toBe(2)
    const rows = await boot.ctx.database.query(`SELECT * FROM "${String(EMBEDDED_ID)}" ORDER BY date`)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ symbol: '600000.SH', date: '2025-01-06', close: 10.5 })

    const cov = await boot.ctx.datasets.reportCoverage(EMBEDDED_ID)
    expect(cov).toMatchObject({
      dataset: EMBEDDED_ID,
      minDate: '2025-01-06',
      maxDate: '2025-01-07',
      rows: 2,
      materialization: 'embedded',
      source: 'demo-src',
    })
    expect(cov?.tradingDays).toBe(2)
  })

  test('幂等：重复同步同组只替换不累积', async () => {
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {})
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {})
    const rows = await boot.ctx.database.query(`SELECT * FROM "${String(EMBEDDED_ID)}"`)
    expect(rows).toHaveLength(2)
    const cov = await boot.ctx.datasets.reportCoverage(EMBEDDED_ID)
    expect(cov?.rows).toBe(2)
  })
})

describe('runDatasetSync · parquet-view 物化（S2 扩展缝通用接入）', () => {
  test('写 parquet 快照 + 挂 read_parquet 视图 → 可查询 + 覆盖登记', async () => {
    const r = await runDatasetSync(boot.ctx, PV_ID, {})
    expect(r.rows).toBe(2)
    // parquet 快照文件已落盘
    const file = join(home, 'data', String(PV_ID), `${String(PV_ID)}.parquet`)
    expect(existsSync(file)).toBe(true)
    // 视图可查询
    const rows = await boot.ctx.database.query(`SELECT * FROM "${String(PV_ID)}" ORDER BY date`)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: '2025-01-06', pnl: 1.2 })
    // 覆盖登记 materialization = parquet-view
    const cov = await boot.ctx.datasets.reportCoverage(PV_ID)
    expect(cov?.materialization).toBe('parquet-view')
    expect(cov?.rows).toBe(2)
    expect(cov?.minDate).toBe('2025-01-06')
  }, 15000)
})

describe('runDatasetSync · fail-closed', () => {
  test('未知 dataset → 响亮抛错', async () => {
    await expect(runDatasetSync(boot.ctx, 'no_such' as DatasetId, {})).rejects.toThrow(/未知 dataset/)
  })
})