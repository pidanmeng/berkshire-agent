import { z } from 'zod'
import type { Context } from 'cordis'
import type { ClientModuleId } from '@berkshire/core'
import { fundFlowStyle, moneyFlowStyle, watchlistToolbarStyle } from './client/styles'

import '@berkshire/core'
// 上方 `import '@berkshire/core'` 已把 `declare module 'cordis'` 的增强带入本模块，
// 使 `ctx.slots` / `ctx.clientModules` / `ctx.log` 可用类型（能力缝三角色：
// core 提供 Service Definition，本插件作为 Consumer/Provider 把页面 + 组件 + 样式挂进槽位）。

/**
 * demo 插件：**一个插件同时给出 页面 + 前端组件 + scoped 样式**（能力块 A/B/C 一体化验证）。
 *
 * - 声明依赖：`inject: ['slots', 'clientModules', 'log']`（解析而非手工排序）；
 * - 提供：三种 `ctx.slots` 声明 + 对应 `ctx.clientModules` bundle 声明（各带 scoped 样式）：
 *   - `stock-preview.footer` 底部组件（`demo-fund-flow`，能力块 A）
 *   - `watchlist.toolbar` 工具栏组件（`demo-watchlist-toolbar`，能力块 A）
 *   - `analysis.menu` 资金流向页 `money-flow`（`/analysis/money-flow`，能力块 B + A + C）
 * - **webview 半身随插件包走**：页面/组件 JSX 与前端 scoped 样式定义在 `./client/*`
 *   （组件经 `@berkshire/plugin-demo/client` 入口静态 import；样式单一来源 `./client/styles.ts`，
 *   本文件从这里取样式去注册）。这是走向 `bk://` 远程 bundle 之前的现实中间步（仍静态打包）。
 * - 可逆：全部注册经 `ctx.effect` 包裹并逐一记录 disposer，卸载时**逆序**撤销——
 *   装上即出现、卸下即消失且 scoped 样式不残留（由 webview `ClientModuleHost` 接 `client/changed` 同步）。
 * - 诚实：无 database（仍目标态），后端只走 `ctx.log` + 静态占位数据；样式中不出现真实行情，
 *   页面组件里的表格也显式标注「demo 占位」。
 */
export const name = 'demo'

export const inject = ['slots', 'clientModules', 'log'] as string[]

export const Config = z.object({
  /** 是否注册 `stock-preview.footer` 底部组件（能力块 A）。 */
  enableFooter: z.boolean().default(true),
  /** 是否注册 `watchlist.toolbar` 工具栏组件（能力块 A）。 */
  enableToolbar: z.boolean().default(true),
  /** 是否注册 `analysis.menu` 资金流向页（能力块 B）。 */
  enableMenu: z.boolean().default(true),
})
export type Config = z.infer<typeof Config>

/** `analysis.menu` 页（能力块 B）的静态路径；core `CORE_ROUTE_PATHS` 不含此路径（可注册）。 */
export const MONEY_FLOW_PATH = '/analysis/money-flow'

export function apply(ctx: Context, config: Config): () => void {
  return ctx.effect(() => {
    const disposers: Array<() => void> = []

    // A+C：`stock-preview.footer` 底部组件 + scoped 样式。
    if (config.enableFooter) {
      disposers.push(ctx.slots.register('stock-preview.footer', { id: 'demo-fund-flow', order: 20 }))
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-fund-flow' as ClientModuleId,
          slot: 'stock-preview.footer',
          bundle: 'client/demo-fund-flow.js',
          style: fundFlowStyle,
        }),
      )
    }

    // A+C：`watchlist.toolbar` 工具栏组件 + scoped 样式。
    if (config.enableToolbar) {
      disposers.push(
        ctx.slots.register('watchlist.toolbar', { id: 'demo-watchlist-toolbar', order: 10 }),
      )
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-watchlist-toolbar' as ClientModuleId,
          slot: 'watchlist.toolbar',
          bundle: 'client/demo-watchlist-toolbar.js',
          style: watchlistToolbarStyle,
        }),
      )
    }

    // B+A+C：`analysis.menu` 资金流向页（菜单项 + 分析页 client 模块 + scoped 样式）。
    if (config.enableMenu) {
      disposers.push(
        ctx.slots.register('analysis.menu', {
          id: 'demo-money-flow',
          order: 30,
          title: '资金流向（demo）',
          route: { path: MONEY_FLOW_PATH },
        }),
      )
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-money-flow' as ClientModuleId,
          slot: 'analysis.menu',
          bundle: 'client/demo-money-flow.js',
          style: moneyFlowStyle,
        }),
      )
    }

    // 后端逻辑走已有能力缝：无 database，用 `ctx.log` 留痕（诚实：数据为占位，非真实行情）。
    ctx.log.append('demo', {
      registered: disposers.length,
      slots: [
        config.enableFooter ? 'stock-preview.footer' : null,
        config.enableToolbar ? 'watchlist.toolbar' : null,
        config.enableMenu ? 'analysis.menu' : null,
      ].filter((s): s is string => Boolean(s)),
    })

    // 卸载**逆序**撤销全部注册：先摘 analysis 页 bundle/菜单，再摘 toolbar，最后摘 footer。
    return () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!()
    }
  })
}