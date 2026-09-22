import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { DatasetId, DataSourceId } from '../brand'
import type { DatasetColumnType } from '../dataContract'
import {
  ADJ_FACTOR_COLUMNS,
  CALENDAR_COLUMNS,
  DAILY_COLUMNS,
  ENRICHED_STORAGE_COLS,
  FINANCIAL_COLUMNS,
  INDEX_COLUMNS,
  INSTRUMENT_COLUMNS,
  MINUTE_COLUMNS,
  columnSqlType,
} from '../dataContract'

// ctx.datasets —— 服务类型增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    datasets: Datasets
  }
  interface Events {
    /**
     * 一个 dataset 的覆盖日期登记完成（`ctx.datasets.recordCoverage` 写入后广播）。
     * @mode emit
     * @param payload.dataset 已登记覆盖的 dataset id
     * @param payload.rows 覆盖行数
     */
    'datasets/coverage-updated'(payload: { dataset: DatasetId; rows: number }): void
  }
}

/** 内置 dataset id 常量（品牌化；消费方从这里取，绝不手写裸 string）。 */
export const DATASET_INSTRUMENTS = 'instruments' as DatasetId
export const DATASET_DAILY = 'daily' as DatasetId
export const DATASET_ADJ_FACTOR = 'adj_factor' as DatasetId
export const DATASET_ENRICHED = 'enriched' as DatasetId
export const DATASET_INDEX = 'index' as DatasetId
export const DATASET_MINUTE = 'minute' as DatasetId
export const DATASET_FINANCIAL = 'financial' as DatasetId
export const DATASET_CALENDAR = 'calendar' as DatasetId
// 实时快照（存量能力，非「八组基础数据」系列，保留供 fuyao/realtime 消费）。
export const DATASET_REALTIME = 'realtime' as DatasetId

/** 物化策略：`embedded` 直接落 DuckDB 内嵌表；`parquet-view` 落 Parquet 分区 + 视图。 */
export type DatasetMaterialization = 'embedded' | 'parquet-view'

/** 一列的类型声明（`DatasetDeclaration.columnSchema` 条目）。 */
export interface DatasetColumn {
  name: string
  type: DatasetColumnType
}

/** Hive 风格分区（大 L1 历史用 parquet-view + 该分区列模式）。 */
export interface DatasetPartition {
  /** 分区列名。 */
  column: 'date' | 'trade_date' | 'datetime'
  /** 分区模式，如 `date=YYYY-MM-DD`。 */
  pattern: string
}

/** 同步元信息（契约/展示层；运行时 cadence 执行归定时任务 S3）。 */
export interface DatasetSyncMeta {
  /** 拉取节奏（daily::日更 / intraday::盘中 / event::事件驱动）。 */
  cadence?: string
  /** 增量窗口（如 `10d` / `60d` / `latest-1`）。 */
  window?: string
  /** 全量回补窗口说明（同步上限）。 */
  fullWindow?: string
}

/**
 * 一个 dataset 的声明（`ctx.datasets` 注册表条目，core 脊）。
 *
 * 数据契约（docs/data-model.md §2）：每个 dataset 登记一份声明，驱动表创建、物化（含
 * parquet-view + 分区 + generation 原子发布）、同步与门控、以及**覆盖日期**元模型
 * （`DatasetCoverage`）。`materialization`/`partition`/`generation` 与类型化列声明
 * （`columnSchema`）在本包**契约层冻结**；运行时执行（建表/挂 parquet-view 视图/整表替换）由
 * sidecar `sync.ts` 按声明驱动（S2 落地），generation 原子发布标记仍目标态（S3）。
 */
export interface DatasetDeclaration {
  /** dataset id（跨边界品牌化）。 */
  id: DatasetId
  /** 面向用户的中文标签。 */
  label: string
  /** 物化策略：`embedded`（直接落 `.duckdb` 内嵌表）| `parquet-view`（分区 Parquet + 视图）。 */
  materialization: DatasetMaterialization
  /** 标准/归一化列名（docs/data-model.md §3）；与 `columnSchema` 一一对应。 */
  columns: readonly string[]
  /** 每列的显式类型声明（类型映射契约的单一事实源，替代按命名约定猜类型）。 */
  columnSchema: readonly DatasetColumn[]
  /**
   * Hive 分区描述（`materialization: 'parquet-view'` 的**大 L1 历史**数据集声明分区列/模式；
   * `embedded` 可不设）。运行时物化仍目标态。
   */
  partition?: DatasetPartition
  /** 是否维护 generation 原子发布标记（写路径多步刷新后原子替换用）。缺省 false。 */
  generation?: boolean
  /** 缺省路由源（`ctx.dataSources` 无偏好时优先）；可选。 */
  defaultSource?: { provider: DataSourceId }
  /** 同步元信息（cadence/window/fullWindow）。 */
  sync?: DatasetSyncMeta
  /**
   * （S2 扩展缝）可选的自声明 schema/契约版本（供第三方数据组做版本对齐/审计，
   * 如 `'1.0.0'`）。内置数据集不设；第三方数据组可声明以在注册/变更时校验「版本不匹配」。
   * 不设则无版本语义。
   */
  version?: string
}

/** S2 扩展缝：staged 注册的**校验规则**（重复 id / 非法列名 / 版本不匹配 → 响亮失败）。 */

/** dataset id 合法模式（防御拼接 SQL 前做标识符白名单，防注入/防凭格式猜类型）。 */
export const DATASET_ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/
/** 列名合法模式（DuckDB/SQL 标识符白名单）。 */
export const COLUMN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
/** 自声明版本合法模式（`x.y.z` 或类似的宽松安全串）。 */
export const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** DuckDB/标准 SQL 保留字（做列名时须拒绝，防注入/防建表失败）。 */
const RESERVED_IDENTS = new Set([
  'SELECT','INSERT','UPDATE','DELETE','TABLE','VIEW','FROM','WHERE','DROP','ALTER',
  'CREATE','UNION','ALL','AND','OR','NOT','NULL','TRUE','FALSE','BY','GROUP','ORDER',
  'HAVING','LIMIT','AS','ON','JOIN','CASE','WHEN','THEN','ELSE','END','IN','IS','LIKE',
])

/**
 * **staged 校验**（TSP 扩展注册表语义仿写）：注册前全量校验，任何一项非法 → 响亮抛错，
 * 且**不触碰注册表**（fail 即丢弃，不留半注册残留）。调用方（`register`）在校验通过后才
 * 把声明装载进 `byId`。
 */
export function validateDatasetDeclaration(decl: DatasetDeclaration): void {
  const fail = (msg: string): never => {
    throw new Error(`[datasets] dataset 注册校验失败：${msg}`)
  }
  if (!decl || typeof decl !== 'object') fail('声明缺失')
  const id = String(decl.id)
  if (typeof decl.id !== 'string' || decl.id === '') fail('dataset id 必须是非空字符串')
  if (!DATASET_ID_RE.test(id)) fail(
    `dataset id '${id}' 非法（须匹配 ${DATASET_ID_RE}，防 SQL 注入/防凭格式猜类型）`,
  )
  if (typeof decl.label !== 'string' || decl.label.trim() === '') fail(`dataset '${id}' 缺 label`)
  if (decl.materialization !== 'embedded' && decl.materialization !== 'parquet-view') {
    fail(`dataset '${id}' 物化策略非法: ${String(decl.materialization)}`)
  }
  if (!Array.isArray(decl.columns) || decl.columns.length === 0) {
    fail(`dataset '${id}' 缺列声明（columns 至少一列）`)
  }
  const seen = new Set<string>()
  for (const raw of decl.columns) {
    const c = String(raw)
    if (typeof raw !== 'string' || raw === '') fail(`dataset '${id}' 含空列名`)
    if (!COLUMN_NAME_RE.test(c)) fail(`dataset '${id}' 列名 '${c}' 非法（须匹配 ${COLUMN_NAME_RE}）`)
    if (RESERVED_IDENTS.has(c.toUpperCase())) fail(`dataset '${id}' 列名 '${c}' 是保留字`)
    if (seen.has(c)) fail(`dataset '${id}' 重复列名 '${c}'`)
    seen.add(c)
  }
  if (!Array.isArray(decl.columnSchema) || decl.columnSchema.length !== decl.columns.length) {
    fail(`dataset '${id}' columnSchema 必须与 columns 一一对应`)
  }
  decl.columnSchema.forEach((col, i) => {
    const expectName = decl.columns[i]
    if (!col || String(col.name) !== String(expectName) || (col.type !== 'VARCHAR' && col.type !== 'DOUBLE')) {
      fail(`dataset '${id}' columnSchema[${i}] 与 columns 不匹配或类型非法`)
    }
  })
  if (decl.materialization === 'parquet-view') {
    if (!decl.partition || !decl.partition.column || !decl.partition.pattern) {
      fail(`dataset '${id}' parquet-view 缺分区声明（partition.column/pattern）`)
    }
  } else if (decl.partition) {
    fail(`dataset '${id}' embedded 不应声明 partition`)
  }
  if (decl.version !== undefined && (typeof decl.version !== 'string' || !VERSION_RE.test(decl.version))) {
    fail(`dataset '${id}' version 非法（须匹配 ${VERSION_RE}）`)
  }
}

/** 由规范化列集派生每 dataset 的显式列类型声明（`columnSchema`）。 */
export function datasetColumnSchema(
  columns: readonly string[],
): readonly DatasetColumn[] {
  return columns.map((name) => ({ name, type: columnSqlType(name) }))
}

/**
 * 覆盖日期记录元模型（契约层，docs/data-model.md §2「覆盖日期」）。运行时登记经
 * `ctx.datasets.recordCoverage` seam 写入（S2 落地：sidecar 的 DuckDB 元表 provider；
 * S2-coverage-date-registry 并行包可在此之上扩展读 API/缺洞自检）。
 */
export interface DatasetCoverage {
  dataset: DatasetId
  /** 已覆盖区间的起始日期（YYYY-MM-DD）；空库 → null。 */
  minDate: string | null
  /** 已覆盖区间的截止日期（YYYY-MM-DD）；空库 → null。 */
  maxDate: string | null
  /** 覆盖区间内的交易日数（calendar 数据可用）。 */
  tradingDays?: number
  /** 覆盖区间内的实际行数。 */
  rows: number
  /** 数据来源 provider id。 */
  source: DataSourceId
  /** 物化策略。 */
  materialization: DatasetMaterialization
  /** 记录生成时间戳（ms）。 */
  recordedAt: number
  /** 目标覆盖起始（期望最小日期；供「缺洞修复」对照，见 data-model.md §5）。 */
  coverageStart?: string
  /** 覆盖是否完整（minDate/maxDate 是否达到预期）。 */
  isComplete?: boolean
}

/**
 * 内置 dataset 声明（八组基础数据 + 实时快照）。与 `@berkshire/plugin-datasource-fuyao`
 * 等 provider 声明对齐；列集继承 docs/data-model.md §3 的规范化列（`INSTRUMENT_COLUMNS`/
 * `DAILY_COLUMNS`/`ADJ_FACTOR_COLUMNS`/`MINUTE_COLUMNS`/`ENRICHED_STORAGE_COLS`/`INDEX_COLUMNS`/
 * `FINANCIAL_COLUMNS`/`CALENDAR_COLUMNS`）。本包**只声明契约**：不建表、不写 `sync.ts` 写路径。
 */
export const BUILTIN_DATASETS: readonly DatasetDeclaration[] = [
  {
    id: DATASET_INSTRUMENTS,
    label: '个股维表',
    materialization: 'embedded',
    columns: INSTRUMENT_COLUMNS,
    columnSchema: datasetColumnSchema(INSTRUMENT_COLUMNS),
    sync: { cadence: 'event', window: '全量 + 变更增量' },
  },
  {
    id: DATASET_DAILY,
    label: '日K（原始价）',
    materialization: 'embedded',
    columns: DAILY_COLUMNS,
    columnSchema: datasetColumnSchema(DAILY_COLUMNS),
    sync: { cadence: 'daily', window: '10d / 深窗口', fullWindow: '≤10y 分片' },
  },
  {
    id: DATASET_ADJ_FACTOR,
    label: '除权因子（逐事件）',
    materialization: 'embedded',
    columns: ADJ_FACTOR_COLUMNS,
    columnSchema: datasetColumnSchema(ADJ_FACTOR_COLUMNS),
    sync: { cadence: 'event', window: '全量事件 + 增量' },
  },
  {
    id: DATASET_ENRICHED,
    label: 'Enriched（复权 OHLCV + 基点列）',
    materialization: 'parquet-view',
    partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
    generation: true,
    columns: ENRICHED_STORAGE_COLS,
    columnSchema: datasetColumnSchema(ENRICHED_STORAGE_COLS),
    sync: { cadence: 'daily', window: '最新 + 增量回补' },
  },
  {
    id: DATASET_INDEX,
    label: '指数日K',
    materialization: 'embedded',
    columns: INDEX_COLUMNS,
    columnSchema: datasetColumnSchema(INDEX_COLUMNS),
    sync: { cadence: 'daily', window: '10d / 指数全量' },
  },
  {
    id: DATASET_MINUTE,
    label: '分钟K（北京 naive 墙钟）',
    materialization: 'embedded',
    columns: MINUTE_COLUMNS,
    columnSchema: datasetColumnSchema(MINUTE_COLUMNS),
    sync: { cadence: 'intraday', window: '浅源（留存约 2 个月）' },
  },
  {
    id: DATASET_FINANCIAL,
    label: '财务（PIT，逐列最新期）',
    materialization: 'embedded',
    columns: FINANCIAL_COLUMNS,
    columnSchema: datasetColumnSchema(FINANCIAL_COLUMNS),
    sync: { cadence: 'daily', window: '最新 1 期 / 按公告日' },
  },
  {
    id: DATASET_CALENDAR,
    label: '股票日历 / 交易日',
    materialization: 'embedded',
    columns: CALENDAR_COLUMNS,
    columnSchema: datasetColumnSchema(CALENDAR_COLUMNS),
    sync: { cadence: 'event', window: '年度全量' },
  },
  {
    id: DATASET_REALTIME,
    label: '实时快照',
    materialization: 'embedded',
    columns: [
      'symbol', 'name', 'last_price', 'prev_close', 'open', 'high', 'low',
      'volume', 'amount', 'change_pct', 'change_amount', 'timestamp',
    ] as const,
    columnSchema: datasetColumnSchema([
      'symbol', 'name', 'last_price', 'prev_close', 'open', 'high', 'low',
      'volume', 'amount', 'change_pct', 'change_amount', 'timestamp',
    ]),
    sync: { window: '实时' },
  },
]

/**
 * **覆盖日期登记的能力缝 Provider 契约**（三角色之「提供方」；Consumer 为同步编排 `sync.ts`）。
 *
 * S2 扩展缝把「每组数据记录覆盖日期」做成可插拔 seam：任何 provider（本仓库由 sidecar 的
 * DuckDB 元表 provider 实现，见 `packages/sidecar/src/coverage-provider.ts`；并行包
 * S2-coverage-date-registry 可在此基础上扩展读 API/缺洞自检）经 `ctx.datasets.registerCoverage`
 * 挂入即可；无 provider 时 `recordCoverage`/`reportCoverage` **fail-closed 明确不可用**。
 */
export interface CoverageProvider {
  /** provider 稳定 id（注册/注销去重用）。 */
  id: string
  /** 登记/更新一个 dataset 的覆盖记录（幂等：重复同步同组只更新不累积）。 */
  record(record: DatasetCoverage): Promise<void>
  /** 读某 dataset 的覆盖记录；未登记返回 null（fail-closed，不伪造「已覆盖」）。 */
  read(dataset: DatasetId): Promise<DatasetCoverage | null>
}

/**
 * `ctx.datasets` —— dataset/schema 注册表 + 覆盖日期登记 seam（core 脊，docs/capability-seams.md §2）。
 *
 * - **注册表**：内置八组基础数据 + 实时快照 + 非内置 `register()`（S2 扩展缝：staged 校验、
 *   卸载可逆）。Consumer（sidecar `sync.ts`、数据管理页、`ctx.dataSources` 路由）经
 *   `list()`/`get()` 消费声明；第三方数据组经 `register()` 声明后即进入同步/门控/展示链路。
 * - **覆盖 seam**：`registerCoverage`/`recordCoverage`/`reportCoverage` —— 同步编排写库成功后经
 *   `recordCoverage` 登记 min/max/rows/source；无 provider 时 fail-closed。
 */
export class Datasets extends Service {
  private byId = new Map<DatasetId, DatasetDeclaration>()
  private coverageProvider: CoverageProvider | null = null

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

  /**
   * 注册一个 dataset 声明（S2 扩展缝：任何 Cordis 插件都可新增数据集）。
   *
   * **staged 注册 + fail-closed**：校验（重复 id / 非法列名 / 非法物化 / 版本不匹配 / 保留字）
   * 全部在校验通过前完成——任何一项非法即响亮抛错，且**不触碰注册表**（fail 即丢弃，不留
   * 半注册残留）。校验通过后经 `ctx.effect` 装载（注册即效应），返回可撤销 disposer：插件卸载
   * 或 service 卸载时逆序撤销该数据集及其驱动链路。
   */
  register(decl: DatasetDeclaration): () => void {
    // 1) staged：先全量校验（非法 → 抛错，byId 不变），再查重复。
    validateDatasetDeclaration(decl)
    if (this.byId.has(decl.id)) {
      throw new Error(`[datasets] 重复 dataset id '${String(decl.id)}'`)
    }
    // 2) 校验通过后才 effect 装载（可逆）。effect 内二次重复保护（并发/先注册竞争）。
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

  /** 注册一个 coverage provider；返回可撤销 disposer。重复注册响亮失败。 */
  registerCoverage(provider: CoverageProvider): () => void {
    return this.ctx.effect(() => {
      if (this.coverageProvider) {
        throw new Error(`[datasets] coverage provider "${this.coverageProvider.id}" already registered`)
      }
      this.coverageProvider = provider
      return () => {
        if (this.coverageProvider === provider) this.coverageProvider = null
      }
    })
  }

  /** 登记/更新某 dataset 的覆盖记录（fail-closed：无 provider / 记录不完整 → 响亮抛错）。 */
  async recordCoverage(record: DatasetCoverage): Promise<void> {
    if (!this.coverageProvider) {
      throw new Error('[datasets] 无 coverage provider（fail-closed）')
    }
    if (record.dataset === undefined || !Number.isFinite(record.rows) || record.rows < 0) {
      throw new Error('[datasets] recordCoverage 记录不完整（fail-closed）')
    }
    await this.coverageProvider.record(record)
    this.ctx.emit('datasets/coverage-updated', { dataset: record.dataset, rows: record.rows })
  }

  /** 读某 dataset 的覆盖记录；无 provider 或未登记 → null（fail-closed，不伪造「已覆盖」）。 */
  async reportCoverage(dataset: DatasetId): Promise<DatasetCoverage | null> {
    if (!this.coverageProvider) return null
    return this.coverageProvider.read(dataset)
  }
}