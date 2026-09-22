/**
 * `ctx.database` 能力缝的 **DuckDB Provider**（三角色之「提供方」，WP：数据源能力缝落地）。
 *
 * 用官方 `@duckdb/node-api`（N-API 原生绑定）在 sidecar 进程内打开 `$BK_HOME/berkshire.duckdb`，
 * 提供 `exec`（写/DDL）/`query`（读）/`tables`（表+行数）/`isReady`。注册方式对齐 `storage-file`
 * （`packages/sidecar/src/index.ts` 装配时挂上），生命周期随 sidecar。
 *
 * 纪律：
 * - **单写者**：一切对 DuckDB 的写入只经 `exec`（sidecar 内唯一写入口）；插件/前端经
 *   `ctx.database` 读写，禁止绕过直接裸写 DB 文件（docs/data-model.md §1）。
 * - **串行执行**：所有语句（读/写）排一条 promise 链顺序执行，避免并发交错坏库。
 * - **惰性打开 + fail-closed**：首次调用才 `DuckDBInstance.create`（打开失败不崩 boot，
 *   记 openError，后续调用响亮抛错）；`isReady()` 返回打开是否成功。
 * - **参数 fail-closed**：本 provider 只接受裸 SQL；传入 params 一律显式抛错（不用时
 *   静默忽略——宁缺勿假）。行插入由 sync.ts 用转义字面量批量生成 VALUES。
 *
 * 诚实边界：Rust 单写者（`duckdb-rs`）、parquet-view 物化、generation/版本标记仍目标态；
 * 本实现是 Node 侧单写者（单一进程内单一入口），非跨进程锁。
 */
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { join } from 'node:path'
import type { DatabaseProvider, DatabaseTableInfo } from '@berkshire/core'
import { toSafeJsonValue } from './json-safe'

/** DuckDB 文件名（固定于 `$BK_HOME` 下，不越界）。 */
export const DB_FILE = 'berkshire.duckdb'

/** 构造一个基于 `$BK_HOME/berkshire.duckdb` 的 Provider。 */
export function createDuckDbProvider(bkHome: string): DatabaseProvider {
  const dbPath = join(bkHome, DB_FILE)
  let instance: DuckDBInstance | null = null
  let connection: DuckDBConnection | null = null
  let openError: Error | null = null
  let openPromise: Promise<void> | null = null
  // 所有语句排一条链，保证串行、不交错（单写者 + 串行双保险）。
  let chain: Promise<void> = Promise.resolve()

  async function open(): Promise<void> {
    if (openPromise) return openPromise
    openPromise = (async () => {
      try {
        instance = await DuckDBInstance.create(dbPath)
        connection = await instance.connect()
      } catch (err) {
        openError = err instanceof Error ? err : new Error(String(err))
        throw openError
      }
    })()
    return openPromise
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task)
    // 失败也释放链（错误由调用方处理），绝不卡死后续语句。
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    id: 'duckdb-node',

    async isReady() {
      try {
        await open()
        return true
      } catch {
        return false
      }
    },

    async exec(sql: string, params?: unknown[]): Promise<void> {
      if (params && params.length > 0) {
        throw new Error('[database] duckdb provider 不支持参数化 exec（fail-closed）')
      }
      await open()
      return enqueue(async () => {
        await connection!.run(sql)
      })
    },

    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      if (params && params.length > 0) {
        throw new Error('[database] duckdb provider 不支持参数化 query（fail-closed）')
      }
      await open()
      return enqueue(async () => {
        const result = await connection!.runAndReadAll(sql)
        // Provider 出口即归一（bigint→number|string，与协议层双保险）：BIGINT/UINT/HUGEINT
        // 列不再让下游 `JSON.stringify` 抛 `Do not know how to serialize a BigInt`。
        return toSafeJsonValue(result.getRowObjects()) as T[]
      })
    },

    async tables(): Promise<DatabaseTableInfo[]> {
      await open()
      return enqueue(async () => {
        const list = await connection!.runAndReadAll(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
        )
        const names = (list.getRowObjects() as Array<{ table_name: string }>).map((r) => r.table_name)
        const out: DatabaseTableInfo[] = []
        for (const name of names) {
          const count = await connection!.runAndReadAll(
            `SELECT count(*) AS n FROM "main"."${name.replaceAll('"', '""')}"`,
          )
          // count(*) 在 DuckDB 返回 BIGINT→JS `bigint`；此处归一为 number（safe 范围），
          // 避免 `database/tables` 快照因 bigint 序列化失败（S1 修复）。
          const n = (toSafeJsonValue((count.getRowObjects() as Array<Record<string, unknown>>)[0]) as {
            n: number
          } | undefined)?.n ?? 0
          out.push({ name, rowCount: n })
        }
        return out
      })
    },
  }
}

/** 装配期诊断辅助：返回 DB 目标路径（真实打开错误在 provider 实例内惰性暴露）。 */
export function duckDbPath(bkHome: string): string {
  return join(bkHome, DB_FILE)
}
