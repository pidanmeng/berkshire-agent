/**
 * 覆盖日期注册表（S2-coverage-date-registry）集成测试：
 * - `coverageGaps` 纯函数（缺失区间计算）；
 * - **写路径登记**：`runDatasetSync` 成功后自动登记 min/max/rows/source（真实 DuckDB 元表）；
 * - **去重**：重复同步同组只更新不累积（`dataset_coverage` 按 dataset 键 upsert）；
 * - **读路径**：`ctx.datasets.reportCoverage` / 协议 `data-sources/coverage`（未登记 fail-closed
 *   → covered:false）；
 * - **手动重算**：`rescanAndRecordCoverage` 重扫实际落库表（外部写入后校准）；
 * - **缺洞自检**：`coverageGapsFor`。
 *
 * 运行：`bun test packages/sidecar/test`（需 bun 在 PATH；DuckDB 原生加载失败则自动跳过本文件——
 * 用 `mkdtemp` 临时 home，不污染仓库 fixtures）。
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as core from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import type { DataSourceId, DataSourceProvider, DatasetId } from '@berkshire/core'
import { createDuckDbProvider } from '../src/duckdb-provider'
import { createCoverageProvider } from '../src/coverage-provider'
import { createFileStorageProvider } from '../src/storage-provider'
import { runDatasetSync } from '../src/sync'
import { coverageGaps, coverageGapsFor, rescanAndRecordCoverage } from '../src/coverage-utils'
import { handleLine } from '../src/protocol'

const resolver: Resolver = (name) => ({ '@berkshire/core': core })[name]

const DATASET_DAILY = 'daily' as DatasetId

/** 假数据源 provider：声明可服务 daily，fetch 返回两行固定日K（零网络）。 */
function fakeProvider(): DataSourceProvider {
  return {
    id: 'fake-fuyao' as DataSourceId,
    label: 'fake-fuyao',
    datasets: { [DATASET_DAILY]: { available: true } },
    async fetch(_dataset, _args) {
      return [
        { symbol: '600000.SH', asset_type: 'stock', source: 'fuyao', date: '2024-01-02', open: 10, high: 12, low: 9, close: 11, volume: 1000, amount: 11000, pre_close: 10, change_pct: 0.1 },
        { symbol: '600000.SH', asset_type: 'stock', source: 'fuyao', date: '2024-01-05', open: 11, high: 13, low: 10, close: 12, volume: 1200, amount: 14400, pre_close: 11, change_pct: 0.0909 },
      ]
    },
  }
}

/** 挂载核心脊 + 真实 DuckDB provider + 覆盖 provider + storage + 假数据源 provider。 */
async function mount() {
  const boot = new Boot()
  const home = mkdtempSync(join(tmpdir(), 'bk-coverage-'))
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  boot.ctx.database.register(createDuckDbProvider(home))
  boot.ctx.storage.register(createFileStorageProvider(home))
  boot.ctx.datasets.registerCoverage(createCoverageProvider(boot.ctx))
  boot.ctx.dataSources.register(fakeProvider())
  return { boot, home }
}

describe('coverageGaps（纯函数缺洞检测，最小面）', () => {
  test('目标窗口完全覆盖 → 无缺失、complete=true', () => {
    const r = coverageGaps(DATASET_DAILY, '2024-01-02', '2024-01-05', '2024-01-02', '2024-01-05')
    expect(r.complete).toBe(true)
    expect(r.missing).toEqual([])
  })

  test('前导缺失 → 一区（目标更早）', () => {
    const r = coverageGaps(DATASET_DAILY, '2023-12-20', '2024-01-05', '2024-01-02', '2024-01-05')
    expect(r.missing).toEqual([{ start: '2023-12-20', end: '2024-01-01' }])
    expect(r.complete).toBe(false)
  })

  test('尾部缺失 → 一区（目标更晚）', () => {
    const r = coverageGaps(DATASET_DAILY, '2024-01-02', '2024-01-10', '2024-01-02', '2024-01-05')
    expect(r.missing).toEqual([{ start: '2024-01-06', end: '2024-01-10' }])
    expect(r.complete).toBe(false)
  })

  test('完全无覆盖 → 整个目标窗口列为缺失', () => {
    const r = coverageGaps(DATASET_DAILY, '2024-01-02', '2024-01-05', null, null)
    expect(r.missing).toEqual([{ start: '2024-01-02', end: '2024-01-05' }])
    expect(r.complete).toBe(false)
  })

  test('目标窗口未给全 → 无法判定缺口，complete=false', () => {
    const r = coverageGaps(DATASET_DAILY, null, null, '2024-01-02', '2024-01-05')
    expect(r.missing).toEqual([])
    expect(r.complete).toBe(false)
  })
})

describe('覆盖登记：写路径 + 读路径 + 去重（真实 DuckDB）', () => {
  test('runDatasetSync 成功后自动登记 min/max/rows/source；重复同步只更新不累积', async () => {
    const { boot, home } = await mount()
    try {
      const res = await runDatasetSync(boot.ctx, DATASET_DAILY, {})
      expect(res.rows).toBe(2)

      const cov = await boot.ctx.datasets.reportCoverage(DATASET_DAILY)
      expect(cov).not.toBeNull()
      expect(cov!.minDate).toBe('2024-01-02')
      expect(cov!.maxDate).toBe('2024-01-05')
      expect(cov!.rows).toBe(2)
      expect(cov!.tradingDays).toBe(2)
      expect(String(cov!.source)).toBe('fake-fuyao')
      expect(cov!.materialization).toBe('embedded')

      // 协议读 API：data-sources/coverage 返回全部声明组，daily covered:true、其余 covered:false。
      const line = await handleLine('{"id":1,"method":"data-sources/coverage","params":{}}', { ctx: boot.ctx })
      const msg = JSON.parse(line.lines[0]!) as {
        result: Array<{ dataset: string; covered: boolean; minDate: string | null; rows: number }>
      }
      const daily = msg.result.find((c) => c.dataset === DATASET_DAILY)
      expect(daily?.covered).toBe(true)
      expect(daily?.minDate).toBe('2024-01-02')
      // 未登记数据集 fail-closed：covered:false、不伪造日期。
      for (const c of msg.result) {
        if (c.dataset === DATASET_DAILY) continue
        expect(c.covered).toBe(false)
        expect(c.minDate).toBeNull()
        expect(c.rows).toBe(0)
      }

      // 去重：再同步一次 → dataset_coverage 仍只 1 行（upsert 覆盖，不累积）。
      await runDatasetSync(boot.ctx, DATASET_DAILY, {})
      const rows = await boot.ctx.database.query<{ n: number }>(
        "SELECT count(*) AS n FROM dataset_coverage WHERE dataset = 'daily'",
      )
      expect(Number(rows[0]!.n)).toBe(1)
    } finally {
      await boot.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('覆盖手动重算 + 缺洞自检', () => {
  test('rescanAndRecordCoverage 重扫实际表（模拟外部/旧版本写入后校准）', async () => {
    const { boot, home } = await mount()
    try {
      await runDatasetSync(boot.ctx, DATASET_DAILY, {})
      let cov = await boot.ctx.datasets.reportCoverage(DATASET_DAILY)
      expect(cov!.maxDate).toBe('2024-01-05')

      // 模拟外部写入：直接 INSERT 一条更晚日期的行（绕过同步，模拟旧版本/外部工具落库）。
      await boot.ctx.database.exec(
        "INSERT INTO \"daily\" (symbol, asset_type, source, date, open, high, low, close, volume, amount, pre_close, change_pct) VALUES ('000001.SZ', 'stock', 'external', '2024-01-08', 1, 1, 1, 1, 100, 100, 1, 0)",
      )

      const refreshed = await rescanAndRecordCoverage(boot.ctx, DATASET_DAILY)
      expect(refreshed.maxDate).toBe('2024-01-08')
      expect(refreshed.rows).toBe(3)

      // 缺洞自检：目标窗口 [2023-12-20, 2024-01-08] → 前导缺失。
      const gaps = await coverageGapsFor(boot.ctx, DATASET_DAILY, '2023-12-20', '2024-01-08')
      expect(gaps.complete).toBe(false)
      expect(gaps.missing.some((g) => g.end === '2024-01-01')).toBe(true)
    } finally {
      await boot.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('refresh 在无可解析来源且无已登记记录时 fail-closed 抛错', async () => {
    const { boot, home } = await mount()
    try {
      await expect(rescanAndRecordCoverage(boot.ctx, 'calendar' as DatasetId)).rejects.toThrow(/无法确定来源/)
    } finally {
      await boot.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})