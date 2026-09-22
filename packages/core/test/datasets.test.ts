import { describe, expect, test } from 'bun:test'
import type { DataSourceId, DatasetId } from '../src/brand'
import { columnSqlType } from '../src/dataContract'
import {
  BUILTIN_DATASETS,
  DATASET_ADJ_FACTOR,
  DATASET_CALENDAR,
  DATASET_DAILY,
  DATASET_ENRICHED,
  DATASET_FINANCIAL,
  DATASET_INDEX,
  DATASET_INSTRUMENTS,
  DATASET_MINUTE,
  DATASET_REALTIME,
  datasetColumnSchema,
  validateDatasetDeclaration,
  type DatasetCoverage,
  type DatasetDeclaration,
} from '../src/services/datasets'

const DATASET_IDS = [
  'instruments', 'daily', 'adj_factor', 'enriched', 'index', 'minute', 'financial', 'calendar',
] as const

/**
 * 八组基础数据集 + 覆盖日期元模型的**契约层**测试：声明齐备、列/类型一一对应、
 * 物化/分区/generation 登记、品牌化 id、`DatasetCoverage` 类型可用。
 */

describe('内置数据集声明（BUILTIN_DATASETS）', () => {
  test('包含八组基础数据 id + 实时快照，且 id 无重复', () => {
    const ids = BUILTIN_DATASETS.map((d) => String(d.id))
    // 八组基础数据 id（canonical）既在内置声明里、也在规范化清单里。
    for (const id of [
      DATASET_INSTRUMENTS, DATASET_DAILY, DATASET_ADJ_FACTOR, DATASET_ENRICHED,
      DATASET_INDEX, DATASET_MINUTE, DATASET_FINANCIAL, DATASET_CALENDAR,
    ]) {
      expect(ids).toContain(String(id))
      expect((DATASET_IDS as readonly string[])).toContain(String(id))
    }
    // 实时快照是存量能力，仅确保在内置声明里（不在八组 canonical 清单）。
    expect(ids).toContain(String(DATASET_REALTIME))
    // 品牌化 id 全仓唯一。
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('每组的 columns 与 columnSchema 一一对应，类型 = columnSqlType', () => {
    for (const d of BUILTIN_DATASETS) {
      expect(d.columnSchema.map((c) => c.name)).toEqual([...d.columns])
      for (const col of d.columnSchema) {
        expect(col.type).toBe(columnSqlType(col.name))
      }
    }
  })

  test('物化/分区/generation：enriched 是 parquet-view + date 分区 + generation；其余 embedded', () => {
    const enriched = BUILTIN_DATASETS.find((d) => d.id === DATASET_ENRICHED)!
    expect(enriched.materialization).toBe('parquet-view')
    expect(enriched.partition).toEqual({ column: 'date', pattern: 'date=YYYY-MM-DD' })
    expect(enriched.generation).toBe(true)
    for (const d of BUILTIN_DATASETS) {
      if (d.id === DATASET_ENRICHED) continue
      expect(d.materialization).toBe('embedded')
    }
  })

  test('每个 dataset 都有说明性同步元信息', () => {
    for (const d of BUILTIN_DATASETS) {
      expect(typeof d.sync?.window).toBe('string')
    }
  })
})

describe('品牌化 id 常量 & DatasetCoverage 契约', () => {
  test('dataset 常量与内置声明 id 对齐（品牌化 string）', () => {
    const declared = new Set(BUILTIN_DATASETS.map((d) => String(d.id)))
    for (const id of [
      DATASET_INSTRUMENTS, DATASET_DAILY, DATASET_ADJ_FACTOR, DATASET_ENRICHED,
      DATASET_INDEX, DATASET_MINUTE, DATASET_FINANCIAL, DATASET_CALENDAR, DATASET_REALTIME,
    ]) {
      expect(declared.has(String(id))).toBe(true)
    }
  })

  test('datasetColumnSchema 类型映射正确', () => {
    expect(datasetColumnSchema(['symbol', 'date', 'close']).map((c) => c.type)).toEqual([
      'VARCHAR', 'VARCHAR', 'DOUBLE',
    ])
  })

  test('DatasetCoverage 类型可构造（供 UI / S2 覆盖记录消费）', () => {
    const cov: DatasetCoverage = {
      dataset: DATASET_DAILY,
      minDate: '2024-01-01',
      maxDate: '2024-06-01',
      rows: 1000,
      source: 'fuyao' as DataSourceId,
      materialization: 'embedded',
      recordedAt: 1700000000000,
      coverageStart: '2020-01-01',
      isComplete: false,
    }
    expect(cov.dataset).toBe(DATASET_DAILY)
    expect(cov.isComplete).toBe(false)
    expect(cov.tradingDays).toBeUndefined()
  })
})

describe('S2 扩展缝 · staged 校验（validateDatasetDeclaration）', () => {
  const valid = (over: Partial<DatasetDeclaration> = {}): DatasetDeclaration => ({
    id: 'custom_demo' as DatasetId,
    label: '自定义数据组',
    materialization: 'embedded',
    columns: ['date', 'close'],
    columnSchema: datasetColumnSchema(['date', 'close']),
    ...over,
  })

  test('合法声明通过校验', () => {
    expect(() => validateDatasetDeclaration(valid())).not.toThrow()
    // parquet-view 需分区；合法版本格式通过。
    expect(() =>
      validateDatasetDeclaration(
        valid({
          materialization: 'parquet-view',
          partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
          version: '1.0.0',
        }),
      ),
    ).not.toThrow()
  })

  test('非法 dataset id → 响亮报错', () => {
    expect(() => validateDatasetDeclaration(valid({ id: 'Bad Id!' as DatasetId }))).toThrow(/dataset id/)
    expect(() => validateDatasetDeclaration(valid({ id: '1abc' as DatasetId }))).toThrow(/dataset id/)
  })

  test('非法/重复/保留字列名 → 响亮报错', () => {
    expect(() =>
      validateDatasetDeclaration(valid({ columns: ['bad col', 'close'] })),
    ).toThrow(/列名/)
    expect(() =>
      validateDatasetDeclaration(valid({ columns: ['close', 'close'] })),
    ).toThrow(/重复列名/)
    expect(() =>
      validateDatasetDeclaration(valid({ columns: ['select', 'close'] })),
    ).toThrow(/保留字/)
  })

  test('columnSchema 与 columns 不匹配 / 非法类型 → 响亮报错', () => {
    expect(() =>
      validateDatasetDeclaration(
        valid({ columnSchema: [{ name: 'date', type: 'VARCHAR' }] }),
      ),
    ).toThrow(/columnSchema/)
    expect(() =>
      validateDatasetDeclaration(
        valid({ columnSchema: [{ name: 'date', type: 'INTEGER' as 'VARCHAR' }] }),
      ),
    ).toThrow(/columnSchema/)
  })

  test('物化策略：parquet-view 缺分区 / embedded 带分区 → 响亮报错', () => {
    expect(() =>
      validateDatasetDeclaration(valid({ materialization: 'parquet-view' })),
    ).toThrow(/分区/)
    expect(() =>
      validateDatasetDeclaration(
        valid({ partition: { column: 'date', pattern: 'date=YYYY-MM-DD' } }),
      ),
    ).toThrow(/embedded/)
  })

  test('版本不匹配（非法 version 格式）→ 响亮报错', () => {
    expect(() => validateDatasetDeclaration(valid({ version: 'v 1.0' }))).toThrow(/version/)
  })
})