/**
 * 事件推送器单测（T1 补测：`attachEventPusher` 的 `client/changed` 推送分支）。
 *
 * `process.test.ts` 已覆盖 notify/capabilities 的进程级推送；本测试不经 stdio，直接用真实
 * `ctx` 挂 `attachEventPusher`，验证 `ctx.clientModules` / `ctx.slots` 的注册与卸除会向宿主
 * 写出 `{ event: 'client/changed', payload: { kind } }` 的 ndjson 行，且 disposer 可逆、无泄漏。
 *
 * 运行：`bun test packages/sidecar/test`。
 */
import { describe, expect, test } from 'bun:test'
import * as core from '@berkshire/core'
import type { ClientModuleId } from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { attachEventPusher } from '../src/events'

const resolver: Resolver = (name) =>
  ({ '@berkshire/core': core })[name]

async function mount(): Promise<Boot> {
  const boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  return boot
}

describe('attachEventPusher · client/changed 推送（T1）', () => {
  test('clientModules.register → 推 {event,payload:{kind:clientModules}}；卸载再推一次', async () => {
    const boot = await mount()
    const lines: string[] = []
    const detach = attachEventPusher(boot.ctx, (l) => lines.push(l))

    const off = boot.ctx.clientModules.register({
      id: 'demo-minimal' as ClientModuleId,
      slot: 'stock-preview.footer',
      url: 'bk:///node_modules/@berkshire/plugin-demo/dist/client/index.js',
    })
    // 注册即推送（kind=clientModules）
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'client/changed', payload: { kind: 'clientModules' } }),
    )

    lines.length = 0
    off() // 卸除再推一次（disposer 可逆）
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'client/changed', payload: { kind: 'clientModules' } }),
    )

    detach()
    await boot.dispose()
  })

  test('slots.register（kind=slots）与 clientModules 各自推不同 kind', async () => {
    const boot = await mount()
    const lines: string[] = []
    const detach = attachEventPusher(boot.ctx, (l) => lines.push(l))

    const offSlot = boot.ctx.slots.register('stock-preview.footer', { id: 'demo', order: 20 })
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'client/changed', payload: { kind: 'slots' } }),
    )

    lines.length = 0
    boot.ctx.clientModules.register({
      id: 'demo-b' as ClientModuleId,
      slot: 'watchlist.toolbar',
      url: 'bk:///node_modules/@berkshire/other/dist/client/index.js',
    })
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'client/changed', payload: { kind: 'clientModules' } }),
    )

    offSlot()
    detach()
    await boot.dispose()
  })

  test('detach 后注册不再推送（disposer 摘监听）', async () => {
    const boot = await mount()
    const lines: string[] = []
    const detach = attachEventPusher(boot.ctx, (l) => lines.push(l))
    detach()

    lines.length = 0
    boot.ctx.clientModules.register({
      id: 'x' as ClientModuleId,
      slot: 'stock-preview.footer',
      url: 'bk:///node_modules/@berkshire/plugin-demo/dist/client/index.js',
    })
    expect(lines).toHaveLength(0)

    await boot.dispose()
  })
})