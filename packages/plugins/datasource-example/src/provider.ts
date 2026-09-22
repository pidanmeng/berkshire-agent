/**
 * 参考扩展插件的数据源 provider（S2 扩展缝三角色之「提供方」的需求证明面）。
 *
 * 一个最小 `DataSourceProvider`：声明自己能服务本插件新增的两个自定义数据组（静态可用性
 * true），`fetch` 返回**演示用种子行**（非真实行情，文档如实标注）。seed 无外部依赖，任意
 * 时刻同步都能取到行 → 专门用来端到端证明「一个 Cordis 插件的自定义数据组能被同步/查询/
 * 覆盖登记」链路跑通。数据契约红线：数值列有限数值、日期列 ISO、未知数据集 fail-closed。
 */
import type { DataSourceProvider, DatasetAvailability, DatasetId } from '@berkshire/core'
import { EXAMPLE_SOURCE_ID, FACTOR_PNL_ID, SECTOR_MOMENTUM_ID } from './datasets'

/** 示例：板块动量日快照（种子行，非真实行情）。 */
export function sectorMomentumSeed(): Array<Record<string, unknown>> {
  return [
    { date: '2025-01-06', sector: '银行', symbol_count: 42, avg_change_pct: 1.25, turnover: 0.8 },
    { date: '2025-01-07', sector: '银行', symbol_count: 42, avg_change_pct: -0.3, turnover: 0.75 },
    { date: '2025-01-06', sector: '白酒', symbol_count: 18, avg_change_pct: 2.1, turnover: 1.2 },
    { date: '2025-01-07', sector: '白酒', symbol_count: 18, avg_change_pct: 0.9, turnover: 1.1 },
  ]
}

/** 示例：因子收益周报（种子行，非真实行情）。 */
export function factorPnlSeed(): Array<Record<string, unknown>> {
  return [
    { date: '2025-01-06', factor: 'momentum', symbol_count: 300, pnl: 1.42 },
    { date: '2025-01-13', factor: 'momentum', symbol_count: 300, pnl: 0.86 },
  ]
}

/** 构造 `datasource-example` provider（可用性静态 true，seed 总是可产）。 */
export function createExampleProvider(): DataSourceProvider {
  const able: DatasetAvailability = { available: true }
  return {
    id: EXAMPLE_SOURCE_ID,
    label: 'datasource-example',
    datasets: {
      [SECTOR_MOMENTUM_ID]: able,
      [FACTOR_PNL_ID]: able,
    } as Partial<Record<DatasetId, DatasetAvailability>>,

    async fetch(dataset) {
      switch (String(dataset)) {
        case String(SECTOR_MOMENTUM_ID):
          return sectorMomentumSeed()
        case String(FACTOR_PNL_ID):
          return factorPnlSeed()
        default:
          throw new Error(`datasource-example 不支持数据集 '${String(dataset)}'（fail-closed）`)
      }
    },
  }
}