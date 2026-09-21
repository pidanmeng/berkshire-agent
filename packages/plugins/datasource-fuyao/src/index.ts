import { z } from 'zod'
import type { Context } from '@berkshire/cordis'
import { defaultBkHome } from '@berkshire/boot'
import { createFuyaoProvider, createCalendarProbe } from './provider'

import '@berkshire/core'

/**
 * 扶摇（同花顺金融数据 API）数据源 provider 插件（能力缝三角色之「提供方」）。
 *
 * - 声明依赖：`inject: ['dataSources', 'marketTime', 'log']`（解析而非手工排序）；
 * - 提供：把自己作为 `DataSourceProvider` 经 `ctx.dataSources.register()` 挂入能力缝，
 *   覆盖 realtime / daily / adj_factor / financial / calendar（minute 声明未落地）；
 *   另经 `ctx.marketTime.registerProbe()` 注册交易日探针（走 `tradingDays()`，供 S3 定时任务）。
 * - 凭据：只从环境变量 `FUYAO_API_KEY` 读取（数据管理页可实探验证，但**不落盘明文**
 *   ——对齐 AGENTS.md 凭据红线）。诚实标注：`ctx.credentials` 能力缝仍目标态，v1 用 env 取值。
 * - 可逆：全部注册经 `ctx.effect` 包裹，卸载即撤销（provider 摘除、其余源路由照常）。
 */
export const name = 'datasource-fuyao'

export const inject = ['dataSources', 'marketTime', 'log'] as string[]

export const Config = z.object({
  /** 事件 dump 缓存目录（缺省 `$BK_HOME/cache/fuyao`）。 */
  cacheDir: z.string().optional(),
  /** 覆盖 fetch 实现（测试注入；生产勿配）。 */
  fetchImpl: z.custom<typeof fetch>().optional(),
})
export type Config = z.infer<typeof Config>

export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const provider = createFuyaoProvider({
    async getApiKey() {
      // 只读环境变量；空串 = 未配置。不读 storage、不落盘明文（AGENTS.md 凭据红线）。
      return process.env['FUYAO_API_KEY'] ?? ''
    },
    cacheDir: () => {
      const base = config.cacheDir ?? `${defaultBkHome()}/cache`
      return `${base}/fuyao`
    },
    fetchImpl: config.fetchImpl,
    log: (event, data) => ctx.log.append(event, data),
  })

  const reg = ctx.dataSources.register(provider)
  const detachProbe = ctx.marketTime.registerProbe(
    createCalendarProbe({
      getApiKey: () => Promise.resolve(process.env['FUYAO_API_KEY'] ?? ''),
      fetchImpl: config.fetchImpl,
    }),
  )
  ctx.log.append('datasource-fuyao', { note: '已注册', datasets: ['realtime', 'daily', 'adj_factor', 'financial', 'calendar', 'minute(未落地)'] })

  return () => {
    reg()
    detachProbe()
  }
}
