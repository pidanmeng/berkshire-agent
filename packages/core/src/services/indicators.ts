import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import {
  computeIndicators,
  type IndicatorResultRow,
  type IndicatorSourceRow,
} from '../indicators'

// ctx.indicators —— 指标现算能力缝的 Service Definition 增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    indicators: Indicators
  }
}

/**
 * `ctx.indicators` 能力缝的 **Provider 契约**（三角色之「提供方」）：对一组 Enriched 基点列
 * （前复权 OHLCV，停牌日已剔除）现算派生指标，**不落表**（docs/data-model.md §1.3）。
 *
 * 内置 Provider 是 [indicators.ts](../indicators.ts) 的纯函数实现（MA/EMA/MACD/BOLL/KDJ/ATR/RSI/
 * 动量/波动率）；插件可经 `register()` 追加/覆盖指标列（返回行须与输入行数一致，否则 fail-closed）。
 */
export interface IndicatorsProvider {
  compute(series: IndicatorSourceRow[], needed?: readonly string[]): IndicatorResultRow[]
}

/**
 * `ctx.indicators` —— 指标现算能力缝的 **Service Definition**（docs/capability-seams.md §3）。
 *
 * 三角色：
 * - **Definition**：本类 + `IndicatorsProvider` 契约 + `IndicatorSourceRow`/`IndicatorResultRow` 类型；
 * - **Provider**：内置纯函数实现（`indicators.ts`）+ 插件经 `register()` 贡献指标列（返回行数
 *   校验一致，否则响亮失败）；
 * - **Consumer**：sidecar 的 Enriched 读取现算（`computeIndicatorsFromDb`）与数据管理页/图表。
 *
 * `compute(series, needed?)`：内置现算全套指标，随后叠加已注册 provider 的列；结果行不落存储。
 */
export class Indicators extends Service {
  private providers: IndicatorsProvider[] = []

  constructor(ctx: Context) {
    super(ctx, 'indicators')
  }

  /** 注册一个指标 Provider；返回可撤销 disposer。 */
  register(provider: IndicatorsProvider): () => void {
    return this.ctx.effect(() => {
      this.providers.push(provider)
      return () => {
        const i = this.providers.indexOf(provider)
        if (i >= 0) this.providers.splice(i, 1)
      }
    })
  }

  /**
   * 现算一组指标（`needed` 存在时仅返回请求列，见 `computeIndicators`）。先跑内置纯函数现算，
   * 再把各注册 provider 的列叠加覆盖（后注册者优先）。各行并列，绝不伪造窗口不足的 null。
   */
  compute(series: IndicatorSourceRow[], needed?: readonly string[]): IndicatorResultRow[] {
    let rows = computeIndicators(series, needed)
    for (const provider of this.providers) {
      const extra = provider.compute(series, needed)
      if (extra.length !== rows.length) {
        throw new Error(
          `[indicators] provider 返回行数 ${extra.length} 与输入 ${rows.length} 不一致（fail-closed）`,
        )
      }
      rows = rows.map((row, i) => ({ ...row, ...extra[i] }))
    }
    return rows
  }
}