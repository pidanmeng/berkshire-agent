/**
 * S3-cache-performance 可复现微基准（Node sidecar 侧；Rust `cargo test -p bk-core` 目标态不可用，
 * 见 docs/data-model.md §7 诚实标注）。
 *
 * 运行：`cd packages/sidecar && bun run bench`（需先 `bun run build:packages` 重建 core）。
 *
 * 度量三项：
 * 1. **读缓存命中**：coverage 快照读透缓存 miss vs hit 的平均延迟（命中应远快于 miss 的 DB 读）；
 * 2. **写后读一致**：sync 写后 generation bump + 缓存失效，随后缓存读立即见新数据（断言，防回归）；
 * 3. **大数据集查询**：parquet-view 谓词下推式切片查询延迟（DuckDB lazy scan，不入全量内存）。
 *
 * 输出为一次性可复现的表格；断言失败以非 0 退出（bench 兼做性能断言）。
 */
import * as corePlug from '@berkshire/core'
import { Boot, setBkHome } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { datasetColumnSchema, type DataSourceId, type DatasetDeclaration, type DatasetId } from '@berkshire/core'
import { runDatasetSync } from '../src/sync'
import { createDuckDbProvider } from '../src/duckdb-provider'
import { createCoverageProvider } from '../src/coverage-provider'
import { createFileStorageProvider } from '../src/storage-provider'
import { createDatasetCache, META_SCOPE } from '../src/cache'
import { listCoverageEntries } from '../src/coverage-utils'

const resolver: Resolver = (name) => ({ '@berkshire/core': corePlug })[name]

const EMBEDDED_ID = 'bench_ohlc' as DatasetId
const PV_ID = 'bench_pv' as DatasetId

const N_DAYS = 2500 // 每个标的 2500 个交易日（≈10 年日K 量级）
const N_SYMBOLS = 20

/** 生成确定性的基准行（同一数据契约口径，值可复现）。 */
function genDaily(symbols: number, days: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (let s = 0; s < symbols; s++) {
    const sym = `600${String(s).padStart(3, '0')}.SH`
    for (let d = 0; d < days; d++) {
      const dt = new Date(Date.UTC(2025, 0, 1 + d)) // 每次用新基期 +d，避免累积漂移
      out.push({
        symbol: sym,
        date: dt.toISOString().slice(0, 10),
        open: 10 + (s % 5),
        high: 11 + (s % 5),
        low: 9 + (s % 5),
        close: 10.5 + (s % 5),
        volume: 1000 + d,
        amount: 100000 + d * 10,
      })
    }
  }
  return out
}

function genPv(symbols: number, days: number): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (let s = 0; s < symbols; s++) {
    for (let d = 0; d < days; d++) {
      const dt = new Date(Date.UTC(2025, 0, 1 + d)) // 每次用新基期 +d，避免累积漂移
      out.push({
        date: dt.toISOString().slice(0, 10),
        factor: `f${s % 7}`,
        pnl: (s + d) / 1000,
      })
    }
  }
  return out
}

async function main(): Promise<void> {
  const home = mkdtempSync(join(tmpdir(), 'bk-bench-'))
  try {
    setBkHome(home)
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    boot.ctx.storage.register(createFileStorageProvider(home))
    boot.ctx.database.register(createDuckDbProvider(home))
    boot.ctx.datasets.registerCoverage(createCoverageProvider(boot.ctx))
    boot.ctx.datasets.register({
      id: EMBEDDED_ID,
      label: 'bench embedded',
      materialization: 'embedded',
      columns: ['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'amount'],
      columnSchema: datasetColumnSchema(['symbol', 'date', 'open', 'high', 'low', 'close', 'volume', 'amount']),
    } satisfies DatasetDeclaration)
    boot.ctx.datasets.register({
      id: PV_ID,
      label: 'bench parquet-view',
      materialization: 'parquet-view',
      partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
      columns: ['date', 'factor', 'pnl'],
      columnSchema: [
        { name: 'date', type: 'VARCHAR' },
        { name: 'factor', type: 'VARCHAR' },
        { name: 'pnl', type: 'DOUBLE' },
      ],
    } satisfies DatasetDeclaration)
    boot.ctx.dataSources.register({
      id: 'bench-src' as DataSourceId,
      label: 'bench-src',
      datasets: { [EMBEDDED_ID]: { available: true }, [PV_ID]: { available: true } } as never,
      async fetch(dataset: DatasetId) {
        if (String(dataset) === String(EMBEDDED_ID)) return genDaily(N_SYMBOLS, N_DAYS)
        if (String(dataset) === String(PV_ID)) return genPv(N_SYMBOLS, N_DAYS)
        throw new Error(`未知基准数据集 ${String(dataset)}`)
      },
    })
    const cache = createDatasetCache()

    // 预热：同步两次（第二次验证幂等 + generation 单调）。
    const r1 = await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    const r2 = await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    if (!(r1.generation === 1 && r2.generation === 2)) {
      throw new Error(`[bench] generation 未单调递增（${r1.generation} → ${r2.generation}）`)
    }
    await runDatasetSync(boot.ctx, PV_ID, {}, cache)

    // 1) 读缓存命中 vs miss（coverage 快照读透）。
    const builder = () => listCoverageEntries(boot.ctx)
    const N = 300
    const t0 = performance.now()
    let v = await cache.read(META_SCOPE, 'coverage', builder) // 首次 miss（预热）
    const missTotal = performance.now() - t0
    let last: unknown = v
    const t1 = performance.now()
    for (let i = 0; i < N; i++) {
      last = await cache.read(META_SCOPE, 'coverage', builder) // 命中
    }
    const hitTotal = performance.now() - t1

    // 2) 写后读一致断言：sync 写后缓存读立即见新数据（generation 已推进、旧槽已逐出）。
    await runDatasetSync(boot.ctx, EMBEDDED_ID, {}, cache)
    const after = await cache.read(EMBEDDED_ID, 'all', () =>
      boot.ctx.database.query(`SELECT count(*) AS n FROM "${String(EMBEDDED_ID)}"`),
    )
    const n = Number((after[0] as { n?: unknown } | undefined)?.['n'] ?? 0)
    if (n !== N_SYMBOLS * N_DAYS) {
      throw new Error(`[bench] 写后读不一致：期望 ${N_SYMBOLS * N_DAYS} 行，实得 ${n}`)
    }

    // 3) parquet-view 谓词下推切片查询（1 个交易日的子集；DuckDB lazy scan）。
    const t2 = performance.now()
    const M = 200
    let slice: unknown[] = []
    for (let i = 0; i < M; i++) {
      slice = await boot.ctx.database.query(
        `SELECT date, pnl FROM "${String(PV_ID)}" WHERE date = '2025-01-05'`,
      )
    }
    const pqTotal = performance.now() - t2
    if (slice.length !== N_SYMBOLS) {
      throw new Error(`[bench] 谓词下推切片行数不符：期望 ${N_SYMBOLS}，实得 ${slice.length}`)
    }

    const st = cache.stats()
    // eslint-disable-next-line no-console
    console.log(`
=== S3-cache-performance 微基准（sidecar Node 侧；可复现） ===
数据集规模：embedded=${N_SYMBOLS * N_DAYS} 行 / parquet-view=${N_SYMBOLS * N_DAYS} 行
1) 读缓存命中（coverage 快照，N=${N} 次）:
   miss  单次 ≈ ${(missTotal).toFixed(2)} ms（首次 DB 构建）
   hit   单次 ≈ ${(hitTotal / N).toFixed(4)} ms（内存复用；累计 ${hitTotal.toFixed(2)} ms / ${N} 次）
   cache stats: hits=${st.hits} misses=${st.misses} slots=${st.slots}
2) 写后读一致：generation=${cache.generationOf(EMBEDDED_ID)}（单调递增）→ 缓存读 ${n} 行 ✓
3) parquet-view 谓词下推（date 切片，M=${M} 次）:
   单次 ≈ ${(pqTotal / M).toFixed(2)} ms（lazy scan，只读目标分区行）
断言全部通过 → exit 0
`)
    await boot.dispose()
    // eslint-disable-next-line no-console
    console.log('result=pass')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[bench] 失败：${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})