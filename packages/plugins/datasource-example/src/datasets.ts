/**
 * 参考扩展插件：**如何写一个新数据组插件**（S2 扩展缝的最小自包含样例）。
 *
 * 本文件把两个**自定义数据组**的声明集中定义（`EXAMPLE_DATASETS`）——既供 `src/index.ts`
 * 装配时经 `ctx.datasets.register` 注册，也供测试/文档直接引用。不碰任何内置八组基础数据，
 * 纯粹展示「一个 Cordis 插件新增数据集」的声明面。
 *
 * **数据契约红线（docs/data-model.md §6）**：本样例数据组遵守规范化列名、类型显式声明、
 * 覆盖登记日期列、fail-closed。**关键：`columnSchema` 要显式写明每列类型**——`sector`/`factor`
 * 这类**分类/标识字符串列**不在内置 `IDENTIFIER_OR_TIME_COLUMNS` 白名单里，`datasetColumnSchema`
 * 这个按名启发式助手会把它们误判成 DOUBLE；自定义数据组作者必须像这里一样显式声明这些字符串列
 * 为 VARCHAR，否则同步落库会因字符串进数值列而 fail-closed。数据是演示用种子值，非真实行情。
 */
import type { DatasetId, DataSourceId } from '@berkshire/core'
import type { DatasetDeclaration } from '@berkshire/core'

/** 参考扩展插件的数据集 id（品牌化，绝不裸 string）。 */
export const SECTOR_MOMENTUM_ID = 'sector_momentum' as DatasetId
export const FACTOR_PNL_ID = 'factor_pnl' as DatasetId

/** 数据源 provider id（品牌化）。 */
export const EXAMPLE_SOURCE_ID = 'datasource-example' as DataSourceId

/** 样例 1（embedded 物化）：板块动量日快照（带 date 列 → 覆盖登记可取 min/max）。 */
export const SECTOR_MOMENTUM_COLUMNS = [
  'date', 'sector', 'symbol_count', 'avg_change_pct', 'turnover',
] as const
const sectorSchema = [
  { name: 'date', type: 'VARCHAR' as const },
  { name: 'sector', type: 'VARCHAR' as const }, // 分类字符串列必须显式 VARCHAR
  { name: 'symbol_count', type: 'DOUBLE' as const },
  { name: 'avg_change_pct', type: 'DOUBLE' as const },
  { name: 'turnover', type: 'DOUBLE' as const },
]

/** 样例 2（parquet-view 物化）：因子收益周报（Hive 分区 date=YYYY-MM-DD）。 */
export const FACTOR_PNL_COLUMNS = ['date', 'factor', 'symbol_count', 'pnl'] as const
const factorSchema = [
  { name: 'date', type: 'VARCHAR' as const },
  { name: 'factor', type: 'VARCHAR' as const }, // 分类字符串列必须显式 VARCHAR
  { name: 'symbol_count', type: 'DOUBLE' as const },
  { name: 'pnl', type: 'DOUBLE' as const },
]

/** 两个自定义数据组的声明（第三方数据组扩展的样板）。 */
export const EXAMPLE_DATASETS: readonly DatasetDeclaration[] = [
  {
    id: SECTOR_MOMENTUM_ID,
    label: '板块动量（参考扩展插件样例）',
    materialization: 'embedded',
    columns: [...SECTOR_MOMENTUM_COLUMNS],
    columnSchema: sectorSchema,
    defaultSource: { provider: EXAMPLE_SOURCE_ID },
    sync: { cadence: 'daily', window: '示例：日更演示数据' },
    version: '1.0.0',
  },
  {
    id: FACTOR_PNL_ID,
    label: '因子收益周报（parquet-view 样例）',
    materialization: 'parquet-view',
    partition: { column: 'date', pattern: 'date=YYYY-MM-DD' },
    columns: [...FACTOR_PNL_COLUMNS],
    columnSchema: factorSchema,
    defaultSource: { provider: EXAMPLE_SOURCE_ID },
    sync: { cadence: 'daily', window: '示例：周报演示数据' },
    version: '1.0.0',
  },
]