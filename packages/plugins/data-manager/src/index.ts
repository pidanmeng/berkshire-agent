import { z } from 'zod'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Context } from '@berkshire/cordis'
import type { ClientModuleId } from '@berkshire/core'
// 插件独立打包阶段编译产物（CSS Modules → 哈希类名 + 注入代码，lightningcss）。
// 同一份文件也供 `.tsx` webview 半身拿哈希类名——sidecar 只取 `css` 作为注入代码交给 host。
import { dataManager } from './client/styles.generated'

import '@berkshire/core'

/**
 * webview 半身的 **client 入口 URL**（M3，同 demo 插件两态探测）：已构建 `./client/index.js`
 * 落盘命中，否则退回 dev 源态 `./client/index.tsx`（Vite 经 `/@fs` 变换 serve）。
 */
const CLIENT_ENTRY_URL = (() => {
  const distEntry = new URL('./client/index.js', import.meta.url)
  if (existsSync(fileURLToPath(distEntry))) return distEntry.href
  return new URL('./client/index.tsx', import.meta.url).href
})()

/**
 * 数据管理插件（数据源能力缝落地）：注册「数据管理」页（侧边栏「数据」分组，路由 `/data`）。
 *
 * - 声明依赖：`inject: ['slots', 'clientModules', 'log']`（解析而非手工排序）；
 * - 提供：`data.management` 槽的一个注册件（`id: 'data-manager'`）+ 对应 client 模块
 *   （页面内容 `DataManagerPage` + scoped 样式）；
 * - 页面不自连桥：宿主把 `DataManagementApi` 句柄经 `data.management` 槽 context 注入
 *   （见 apps/berkshire-agent `ExtensionRoute`），页面只消费契约；
 * - 可逆：注册经 `ctx.effect` 包裹，卸载即撤销（装上即出现在侧边栏，卸下即消失）。
 */
export const name = 'data-manager'

export const inject = ['slots', 'clientModules', 'log'] as string[]

export const Config = z.object({})
export type Config = z.infer<typeof Config>

/** 数据管理页路由路径；core `CORE_ROUTE_PATHS` 不含此路径（可注册）。 */
export const DATA_MANAGER_PATH = '/data'

export async function apply(ctx: Context, config: Config): Promise<() => void> {
  void config
  const reg = ctx.effect(() => {
    const disposers: Array<() => void> = []

    // 数据管理页（能力块 B）：侧边栏「数据」分组 + 路由 /data + 页面 client 模块 + scoped 样式。
    disposers.push(
      ctx.slots.register('data.management', {
        id: 'data-manager',
        order: 10,
        title: '数据管理',
        section: '数据',
        route: { path: DATA_MANAGER_PATH },
      }),
    )
    disposers.push(
      ctx.clientModules.register({
        id: 'data-manager' as ClientModuleId,
        slot: 'data.management',
        url: CLIENT_ENTRY_URL,
        exportName: 'DataManagerPage',
        style: dataManager.css,
      }),
    )

    ctx.log.append('data-manager', {
      registered: disposers.length,
      slot: 'data.management',
      route: DATA_MANAGER_PATH,
    })

    // 卸载**逆序**撤销全部注册。
    return () => {
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!()
    }
  })

  return () => {
    reg()
  }
}
