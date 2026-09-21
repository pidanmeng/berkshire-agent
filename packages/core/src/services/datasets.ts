import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { DatasetId, DataSourceId } from '../brand'

// ctx.datasets —— 服务类型增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    datasets: Datasets
  }
}

/**
 * 一个 dataset 的声明（`ctx.datasets` 注册表条目，core 脊）。
 *
 * 数据契约（docs/data-model.md §2）：每个 dataset 登记一份声明，驱动表创建、物化、
 * 同步与门控。v1 落地最小子集：`id/label/materialization/columns/defaultSource`；
 * `partition`/`generation`/复杂 `sync` 仍目标态（parquet-view 物化、Rust 单写者）。
 */
export interface DatasetDeclaration {
  /** dataset id（跨边界品牌化）。 */
  id: DatasetId
  /** 面向用户的中文标签。 */
  label: string
  /** 物化策略：v1 全部 `embedded`（直接落 `.duckdb` 内嵌表）；parquet-view 目标态。 */
  materialization: 'embedded' | 'parquet-view'
  /** 标准/归一化列名（见 docs/data-model.md §3；v1 以字符串表登记，约束类型目标态）。 */
  columns: readonly string[]
  /** 缺省路由源（`ctx.dataSources` 无偏好时优先）；可选。 */
  defaultSource?: { provider: DataSourceId }
  /** 同步元信息（cadence/window 目标态；v1 仅登记窗口语义字符串供页面展示）。 */
  sync?: { window?: string }
}

/**
 * 内置 dataset 声明（v1）：与 `@berkshire/plugin-datasource-fuyao` 等 provider 声明对齐。
 * 列名继承 docs/data-model.md §3 的归一化列（DAILY_COLUMNS / ADJ_FACTOR_COLUMNS /
 * MINUTE_COLUMNS）；financial 为宽表归一化（多表 latest 期）。
 */
export const BUILTIN_DATASETS: readonly DatasetDeclaration[] = [
  {
    id: 'realtime' as DatasetId,
    label: '实时快照',
    materialization: 'embedded',
    columns: [
      'symbol', 'name', 'last_price', 'prev_close', 'open', 'high', 'low',
      'volume', 'amount', 'change_pct', 'change_amount', 'timestamp',
    ],
    sync: { window: '实时' },
  },
  {
    id: 'daily' as DatasetId,
    label: '日K（原始价）',
    materialization: 'embedded',
    columns: [
      'symbol', 'source', 'date', 'open', 'high', 'low', 'close',
      'volume', 'amount', 'pre_close', 'change_pct',
    ],
    sync: { window: '10d / 深窗口' },
  },
  {
    id: 'adj_factor' as DatasetId,
    label: '除权因子',
    materialization: 'embedded',
    columns: ['symbol', 'source', 'trade_date', 'ex_factor'],
    sync: { window: '全量事件 + 增量' },
  },
  {
    id: 'financial' as DatasetId,
    label: '财务（最新期）',
    materialization: 'embedded',
    columns: ['symbol', 'source', 'table', 'period_end', 'announce_date', 'key', 'value'],
    sync: { window: '最新 1 期' },
  },
  {
    id: 'minute' as DatasetId,
    label: '1分钟K',
    materialization: 'embedded',
    columns: ['symbol', 'source', 'datetime', 'open', 'high', 'low', 'close', 'volume', 'amount', 'freq'],
    sync: { window: '浅源（留存约 2 个月）' },
  },
]

/**
 * `ctx.datasets` —— dataset/schema 注册表（core 脊，docs/capability-seams.md §2）。
 *
 * v1 落地最小子集：内置声明的登记与查询（`list()`/`get()`）。驱动 `ctx.dataSources`
 * 的门控（每 dataset 的候选源）与数据管理页的「数据集路由」区展示。
 */
export class Datasets extends Service {
  private byId = new Map<DatasetId, DatasetDeclaration>()

  constructor(ctx: Context) {
    super(ctx, 'datasets')
    // 内置声明在构造时装载（core 脊自带的标准化数据集）。
    for (const d of BUILTIN_DATASETS) {
      this.byId.set(d.id, d)
    }
  }

  /** 全部已声明 dataset（按注册顺序）。 */
  list(): DatasetDeclaration[] {
    return [...this.byId.values()]
  }

  /** 按 id 取声明；未知 id 返回 undefined。 */
  get(id: DatasetId): DatasetDeclaration | undefined {
    return this.byId.get(id)
  }

  /** 注册一个 dataset 声明（供未来非内置 dataset 使用）；重复 id 响亮失败。 */
  register(decl: DatasetDeclaration): () => void {
    return this.ctx.effect(() => {
      if (this.byId.has(decl.id)) {
        throw new Error(`[datasets] 重复 dataset id '${String(decl.id)}'`)
      }
      this.byId.set(decl.id, decl)
      return () => {
        this.byId.delete(decl.id)
      }
    })
  }
}
