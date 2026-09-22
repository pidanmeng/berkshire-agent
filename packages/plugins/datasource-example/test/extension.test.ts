/**
 * 参考扩展插件的自测：声明面合法（staged 校验通过）、seed 函数产出符合数据契约口径。
 * （端到端装配/同步/卸载由 sidecar `test/dataset-extension.test.ts` 与 `test/sync.test.ts` 覆盖。）
 */
import { describe, expect, test } from 'bun:test'
import { validateDatasetDeclaration, type DatasetColumnType } from '@berkshire/core'
import { EXAMPLE_DATASETS, FACTOR_PNL_ID, SECTOR_MOMENTUM_ID } from '../src/datasets'
import { sectorMomentumSeed, factorPnlSeed } from '../src/provider'

describe('datasource-example 声明面', () => {
  test('两个自定义数据组声明均通过 staged 校验（含 parquet-view 分区）', () => {
    expect(EXAMPLE_DATASETS).toHaveLength(2)
    for (const d of EXAMPLE_DATASETS) {
      expect(() => validateDatasetDeclaration(d)).not.toThrow()
    }
  })

  test('columnSchema 与 columns 一一对应，类型显式合法（含非内置分类字符串列 VARCHAR）', () => {
    for (const d of EXAMPLE_DATASETS) {
      expect(d.columnSchema.map((c) => c.name)).toEqual([...d.columns])
      for (const c of d.columnSchema) {
        expect(['VARCHAR', 'DOUBLE'] as DatasetColumnType[]).toContain(c.type)
      }
    }
    // 教学点：'sector'/'factor' 不在内置 VARCHAR 白名单，作者已显式声明为 VARCHAR。
    const sector = EXAMPLE_DATASETS.find((d) => d.id === SECTOR_MOMENTUM_ID)!
    expect(sector.columnSchema.find((c) => c.name === 'sector')!.type).toBe('VARCHAR')
    const factor = EXAMPLE_DATASETS.find((d) => d.id === FACTOR_PNL_ID)!
    expect(factor.columnSchema.find((c) => c.name === 'factor')!.type).toBe('VARCHAR')
  })

  test('覆盖登记所需的日期列就位（embedded 与 parquet-view 均有 date）', () => {
    expect(EXAMPLE_DATASETS.find((d) => d.id === SECTOR_MOMENTUM_ID)!.columns).toContain('date')
    expect(EXAMPLE_DATASETS.find((d) => d.id === FACTOR_PNL_ID)!.columns).toContain('date')
  })
})

describe('datasource-example seed', () => {
  test('seed 产出有限数值 + ISO 日期；全字段有限可落库', () => {
    for (const row of sectorMomentumSeed()) {
      expect(String(row['date'])).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const k of ['symbol_count', 'avg_change_pct', 'turnover']) {
        expect(Number.isFinite(Number(row[k]))).toBe(true)
      }
    }
    for (const row of factorPnlSeed()) {
      expect(String(row['date'])).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isFinite(Number(row['pnl']))).toBe(true)
    }
  })
})