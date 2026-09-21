import { z } from 'zod'
import type { Context } from '@berkshire/cordis'
import { EXAMPLE_DATASETS } from './datasets'
import { createExampleProvider } from './provider'

import '@berkshire/core'

/**
 * 参考扩展插件（S2 扩展缝的证明/消费面）：一个 Cordis 插件如何新增数据组。
 *
 * 它两件事一起做，演示「三角色」在单个插件里如何装配：
 * - **Definition + Provider**：经 `ctx.datasets.register` 声明本插件自己的两个自定义数据组
 *   （staged 校验 + 可逆 disposer），经 `ctx.dataSources.register` 挂上取数 provider；
 * - **Consumer 之外**：数据组一旦声明，同步编排（sidecar `sync.ts`）、数据管理页、覆盖登记
 *   seam 自动消费——无需插件额外接线。
 *
 * 可逆：所有注册经 `disposers` 逆序撤销，插件卸载即连带撤销其数据组/物化链路（注册即效应）。
 */
export const name = 'datasource-example'

export const inject = ['datasets', 'dataSources', 'log'] as string[]

export const Config = z.object({
  /** 是否在装配时同时注册数据组声明（缺省 true；供测试演示「声明与源分离」）。 */
  declareDatasets: z.boolean().default(true),
})
export type Config = z.infer<typeof Config>

export async function apply(ctx: Context, config: Config): Promise<() => void> {
  const disposers: Array<() => void> = []

  if (config.declareDatasets) {
    for (const d of EXAMPLE_DATASETS) {
      disposers.push(ctx.datasets.register(d))
    }
  }
  disposers.push(ctx.dataSources.register(createExampleProvider()))

  ctx.log.append('datasource-example', {
    note: '已注册',
    datasets: EXAMPLE_DATASETS.map((d) => String(d.id)),
  })

  return () => {
    for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!()
  }
}