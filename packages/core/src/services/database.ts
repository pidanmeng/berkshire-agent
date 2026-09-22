import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { DatasetId } from '../brand'
import type { DatasetMaterialization, DatasetPartition } from './datasets'

// ctx.database + 其自有事件 —— 服务/事件类型增强 co-locate（@mode emit）
//
// 分层说明：本事件归 **core 耐久数据层**（描述 DuckDB 持久化写完成），由**写路径派发**——
// sidecar 的同步编排 `runDatasetSync`（packages/sidecar/src/sync.ts，单写者）在落库成功后
// `ctx.emit('database/dataset-updated', …)`。属有意设计（与 sidecar 侧「在途」的 `sync/*`
// 事件分层不同），非声明/派发错位；故类型在此声明、派发在 sidecar。
declare module '@berkshire/cordis' {
  interface Context {
    database: DatabaseService
  }
  interface Events {
    /**
     * 一个 dataset 的 DuckDB 落库完成（同步编排写库成功后广播）。
     * @mode emit
     * @param payload.dataset 已更新的 dataset id
     * @param payload.rows 本次写入的行数
     * @param payload.at 落库完成时间戳（ms）
     * @param payload.generation 本次写后的热缓存 generation（S3 缓存失效判据；未维护缓存 → 缺省）
     */
    'database/dataset-updated'(payload: {
      dataset: DatasetId
      rows: number
      at: number
      generation?: number
    }): void
  }
}

/** 一张内嵌表的名称与行数（数据管理页「本地库」区展示）。 */
export interface DatabaseTableInfo {
  name: string
  rowCount: number
  /** 对应 dataset 的物化策略（`embedded`/`parquet-view`）；与 `ctx.datasets` 声明对照。 */
  materialization?: DatasetMaterialization
  /** 分区信息（`parquet-view` 物化的大历史数据集；`embedded` 缺省）。 */
  partition?: DatasetPartition
  /** 最近一次 generation 原子发布标记（未维护 → null）。 */
  generation?: string | null
}

/**
 * `ctx.database` 能力缝的 **Provider 契约**（三角色之「提供方」）。
 *
 * v1 由 sidecar 的 `@berkshire/duckdb` provider（`packages/sidecar/src/duckdb-provider.ts`，
 * `@duckdb/node-api`）实现，读写 `$BK_HOME/berkshire.duckdb`。**单写者纪律**：所有对
 * DuckDB 的写入只经本服务（`exec`），插件/前端禁止绕过直接裸写 DB 文件
 * （docs/data-model.md §1）。诚实边界：Rust 单写者（`duckdb-rs`）仍目标态。
 */
export interface DatabaseProvider {
  /** provider 稳定 id（用于注册/注销与去重）。 */
  id: string
  /** 连接是否就绪（连接失败/加载失败 → false，fail-closed 展示面）。 */
  isReady(): Promise<boolean>
  /** 执行查询，返回行数组（数组元素为列名→值的普通对象）。 */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  /** 执行写/DDL（单写者：一切 DuckDB 写入只经此入口）。 */
  exec(sql: string, params?: unknown[]): Promise<void>
  /** 列出全部内嵌表及行数（数据管理页展示）。 */
  tables(): Promise<DatabaseTableInfo[]>
}

/**
 * `ctx.database` —— DuckDB 访问的 **Service Definition**（core 脊，docs/capability-seams.md §2）。
 *
 * 三角色：Definition 本类；Provider 由 sidecar 注册（对齐 `storage-file` 的挂法）；
 * Consumer 为同步编排（sidecar `sync.ts`）、数据管理页、未来的 `ctx.market`。
 * **无 provider 时 fail-closed**：任一调用显式抛错，绝不静默降级为内存态。
 */
export class DatabaseService extends Service {
  private provider: DatabaseProvider | null = null

  constructor(ctx: Context) {
    super(ctx, 'database')
  }

  /** 注册一个 provider；返回可撤销 disposer。重复注册**响亮失败**。 */
  register(provider: DatabaseProvider): () => void {
    return this.ctx.effect(() => {
      if (this.provider) {
        throw new Error(`database provider "${this.provider.id}" already registered`)
      }
      this.provider = provider
      return () => {
        if (this.provider === provider) this.provider = null
      }
    })
  }

  /** 是否已有可用 provider。 */
  get available(): boolean {
    return this.provider !== null
  }

  private requireProvider(): DatabaseProvider {
    if (!this.provider) {
      throw new Error('[database] no provider registered (fail-closed)')
    }
    return this.provider
  }

  /** 连接是否就绪。 */
  isReady(): Promise<boolean> {
    return this.requireProvider().isReady()
  }

  /** 查询（行数组）。 */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.requireProvider().query<T>(sql, params)
  }

  /** 执行写/DDL（单写者入口）。 */
  exec(sql: string, params?: unknown[]): Promise<void> {
    return this.requireProvider().exec(sql, params)
  }

  /** 内嵌表清单（名称 + 行数）。 */
  tables(): Promise<DatabaseTableInfo[]> {
    return this.requireProvider().tables()
  }

  // TODO(v2): storage-duckdb provider、Rust 单写者、parquet-view 物化、generation/版本标记。
}
