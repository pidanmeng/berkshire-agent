import { z } from 'zod'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@berkshire/cordis'
import type { ClientModuleId } from '@berkshire/core'
// 插件独立打包阶段编译产物（P3：CSS Modules → 哈希类名 + 注入代码，lightningcss）。
// 同一份文件也供 `.tsx` webview 半身拿哈希类名——sidecar 只取 `css` 作为注入代码交给 host。
import { fundFlow, moneyFlow, watchlistToolbar, navExtra, statusItem, settingsCard } from './client/styles.generated'

import '@berkshire/core'

/**
 * webview 半身的 **client 入口 URL**（M3）：插件只自报自己的入口与具名导出，宿主零硬编码；
 * 宿主侧 `to_bk_url`（Rust bridge.rs）再把 `$BK_HOME` 内的入口规范化成 `bk://` 供 webview 动态 `import()`。
 *
 * 运行态有两种真实装载位置，入口必须对两者都解析到**真实存在**的文件：
 * - **已构建包（prod/`bun add` 进 home）**：`exports["."]` 指向 `dist/index.js`，`import.meta.url`
 *   是 dist → `./client/index.js`（已编译 client 入口）；
 * - **dev 源码态**：bun 把 workspace 插件解析到 `src/index.ts`，`import.meta.url` 是 src →
 *   `./client/index.tsx`（client 源；webview 经 Vite `/@fs/` 变换 serve，组件 .tsx 归 Vite Fast Refresh）。
 * 两个候选里取第一个落盘存在的，避免旁支路径（如 src 下无 index.js）产生 404。
 */
const CLIENT_ENTRY_URL = (() => {
  // 已构建 client 入口（dist）：相对运行文件取 ./client/index.js。
  const distEntry = new URL('./client/index.js', import.meta.url)
  if (existsSync(fileURLToPath(distEntry))) return distEntry.href
  // dev 源码态：client 源是 ./client/index.tsx（Vite 经 /@fs 变换）。
  return new URL('./client/index.tsx', import.meta.url).href
})()
// 上方 `import '@berkshire/core'` 已把 `declare module '@berkshire/cordis'` 的增强带入本模块，
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
 * - **webview 半身随插件包走 + 宿主运行时动态 import**：页面/组件 JSX 与前端 scoped 样式定义在
 *   `./client/*`（**CSS Modules**——作者源 `./client/*.module.css` 由插件独立打包阶段
 *   `scripts/compile-styles.ts`（lightningcss）编译成 `styles.generated.ts`，本文件从这里取 `css`
 *   注入代码去注册，`.tsx` 从同一份拿哈希类名）。M3 起 host 不再静态 import `@berkshire/plugin-demo/client`，
 *   而是按 `client/list` 快照里的 `url`+`exportName` **运行时 `import()` 已构建 client 入口**
 *   （`CLIENT_ENTRY_URL`，宿主规范化成 `bk://`），宿主零硬编码。
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
  /** 是否注册应用壳布局挂点组件（应用壳：侧边栏导航追加项 / 状态栏状态项 / 设置卡片）。 */
  enableShellWidgets: z.boolean().default(true),
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
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoFundFlow',
          style: fundFlow.css,
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
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoWatchlistToolbar',
          style: watchlistToolbar.css,
        }),
      )
    }

    // B+A+C：`analysis.menu` 资金流向页（菜单项 + 分析页 client 模块 + scoped 样式）。
    // 应用壳：路由带 `section: '分析'` 分组展示在侧边栏。
    if (config.enableMenu) {
      disposers.push(
        ctx.slots.register('analysis.menu', {
          id: 'demo-money-flow',
          order: 30,
          title: '资金流向（demo）',
          section: '分析',
          route: { path: MONEY_FLOW_PATH },
        }),
      )
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-money-flow' as ClientModuleId,
          slot: 'analysis.menu',
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoMoneyFlow',
          style: moneyFlow.css,
        }),
      )
    }

    // 应用壳布局挂点证明：侧边栏导航追加项 + 状态栏状态项 + 设置卡片（各带 scoped 样式）。
    if (config.enableShellWidgets) {
      disposers.push(
        ctx.slots.register('layout.navigation.extra', { id: 'demo-nav-extra', order: 10 }),
      )
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-nav-extra' as ClientModuleId,
          slot: 'layout.navigation.extra',
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoNavExtra',
          style: navExtra.css,
        }),
      )
      disposers.push(
        ctx.slots.register('layout.statusbar.right', { id: 'demo-status-item', order: 10 }),
      )
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-status-item' as ClientModuleId,
          slot: 'layout.statusbar.right',
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoStatusItem',
          style: statusItem.css,
        }),
      )
      disposers.push(ctx.slots.register('settings.cards', { id: 'demo-settings-card', order: 10 }))
      disposers.push(
        ctx.clientModules.register({
          id: 'demo-settings-card' as ClientModuleId,
          slot: 'settings.cards',
          url: CLIENT_ENTRY_URL,
          exportName: 'DemoSettingsCard',
          style: settingsCard.css,
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
        config.enableShellWidgets ? 'layout.navigation.extra' : null,
        config.enableShellWidgets ? 'layout.statusbar.right' : null,
        config.enableShellWidgets ? 'settings.cards' : null,
      ].filter((s): s is string => Boolean(s)),
    })

    // 卸载**逆序**撤销全部注册：设置/状态/导航追加项 → analysis 页 → toolbar → footer。
    return () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!()
    }
  })
}