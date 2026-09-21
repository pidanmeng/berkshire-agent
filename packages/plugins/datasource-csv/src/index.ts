import { z } from 'zod'
import type { Context } from '@berkshire/cordis'
import { defaultBkHome } from '@berkshire/boot'
import { createCsvProvider } from './provider'

import '@berkshire/core'

/**
 * CSV 数据源 provider 插件（能力缝三角色之「提供方」）——多源路由的证明性最小实现。
 *
 * - 声明依赖：`inject: ['dataSources']`；
 * - 提供：把自己作为 `DataSourceProvider` 经 `ctx.dataSources.register()` 挂入，
 *   覆盖 daily / realtime / adj_factor（按文件存在性动态可用性）；
 * - 可逆：注册经 `ctx.effect` 包裹，卸载即撤销。
 */
export const name = 'datasource-csv'

export const inject = ['dataSources', 'log'] as string[]

export const Config = z.object({
  /** CSV 根目录（缺省 `$BK_HOME/data/csv`）。 */
  dataDir: z.string().optional(),
})
export type Config = z.infer<typeof Config>

export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const provider = createCsvProvider({
    dataDir: () => config.dataDir ?? `${defaultBkHome()}/data/csv`,
    log: (event, data) => ctx.log.append(event, data),
  })

  const reg = ctx.dataSources.register(provider)
  ctx.log.append('datasource-csv', { note: '已注册', datasets: ['daily', 'realtime', 'adj_factor'] })

  return () => {
    reg()
  }
}
