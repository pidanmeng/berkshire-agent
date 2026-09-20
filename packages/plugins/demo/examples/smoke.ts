/**
 * demo 插件冒烟（T3 复现开关）：验证「装上即出现、卸下即消失且样式不残留」。
 *
 * 直接走 boot 的 `composeEntries`（与 sidecar 同一装配路径）：
 *  - layers = [base, demo]          → demo 启用：clientModules 6 条、routes 1 项（money-flow，section=分析）。
 *  - layers = [base, demo, demo-off]→ demo 禁用：clientModules 0 条、routes 0 项。
 *
 * 运行：`bun run packages/plugins/demo/examples/smoke.ts`
 * 诚实：只验证 sidecar 侧注册表/快照的「装上/卸下」，webview 挂载由 ClientModuleHost 接
 * `client/list` + `client/changed`（样式随之移除，见 loader 的 injectModuleStyle disposer）。
 * 这里不碰 DuckDB、不碰 `bk://` 远程 bundle（均仍目标态）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'
import { Boot } from '@berkshire/boot'
import type { PatchOverlay } from '@berkshire/boot'
import * as core from '@berkshire/core'
import * as notify from '@berkshire/plugin-notify-console'
import * as demo from '../src/index'

const REPO = resolve(import.meta.dir, '../../../..')

const resolver = (name: string) =>
  ({
    '@berkshire/core': core,
    '@berkshire/plugin-notify-console': notify,
    '@berkshire/plugin-demo': demo,
  })[name]

const patch = (path: string) =>
  parse(readFileSync(resolve(REPO, path), 'utf8')) as PatchOverlay

function fail(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

async function verifyCounts(
  label: string,
  layers: PatchOverlay[],
  expectModules: number,
  expectRoutes: number,
  expectRoutesPath?: string,
): Promise<void> {
  const boot = new Boot()
  await boot.mountFromLayers(layers, resolver, (m) => console.log(`  [patch] ${m}`))
  const mods = boot.ctx.clientModules.list()
  const routes = boot.ctx.slots.routes()
  if (mods.length !== expectModules) fail(`${label}: 期望 ${expectModules} 个 client 模块，got ${mods.length}`)
  if (routes.length !== expectRoutes) fail(`${label}: 期望 ${expectRoutes} 个路由，got ${routes.length}`)
  if (expectRoutesPath && !routes.some((m) => m.path === expectRoutesPath)) {
    fail(`${label}: 缺路由路径 ${expectRoutesPath}，got ${JSON.stringify(routes)}`)
  }
  console.log(`✓ ${label}: clientModules=${mods.length} routes=${routes.length}`)
  if (mods.length) console.log(`    modules=${JSON.stringify(mods.map((m) => ({ id: m.id, slot: m.slot, url: m.url, exportName: m.exportName ?? 'default' })))}`)
  if (routes.length) console.log(`    routes=${JSON.stringify(routes)}`)
  await boot.dispose()
}

async function main(): Promise<void> {
  const base = patch('packages/bundle/base/cordis.patch.yml')
  const demoOn = patch('packages/bundle/demo/cordis.patch.yml')
  const demoOff = patch('packages/bundle/demo-off/cordis.patch.yml')

  // 装上：demo 贡献 footer + toolbar + money-flow 页 + 应用壳三布局组件。
  await verifyCounts('装上（[base, demo]）', [base, demoOn], 6, 1, '/analysis/money-flow')

  // 卸下：叠加 demo-off（整行 disabled:true）→ 全部消失。
  await verifyCounts('卸下（[base, demo, demo-off]）', [base, demoOn, demoOff], 0, 0)

  console.log('✔ demo 插件冒烟通过')
}

void main().catch((err) => {
  console.error(`[demo-smoke][fatal] ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
  process.exit(1)
})