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
import type { ClientModuleId, StorageNamespaceId, StorageProvider } from '@berkshire/core'
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

/** 内存 Provider：让 `storage/changed` 推送用例不触碰磁盘。 */
function inlineProvider(): StorageProvider {
  const map = new Map<string, unknown>()
  return {
    id: 'inline',
    async get<T>(ns: StorageNamespaceId, key: string): Promise<T | undefined> {
      return map.get(`${String(ns)}\u0000${key}`) as T | undefined
    },
    async set(ns: StorageNamespaceId, key: string, value: unknown): Promise<void> {
      map.set(`${String(ns)}\u0000${key}`, value)
    },
    async remove(ns: StorageNamespaceId, key: string): Promise<void> {
      map.delete(`${String(ns)}\u0000${key}`)
    },
    async list(ns: StorageNamespaceId): Promise<string[]> {
      const prefix = `${String(ns)}\u0000`
      return [...map.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
    },
  }
}

describe('attachEventPusher · storage/changed 推送（WP-2）', () => {
  test('storage/set → 推 {event,payload:{ns,key}}；remove 再推一次', async () => {
    const boot = await mount()
    boot.ctx.storage.register(inlineProvider())
    const lines: string[] = []
    const detach = attachEventPusher(boot.ctx, (l) => lines.push(l))

    await boot.ctx.storage.set('demo' as StorageNamespaceId, 'k', 1)
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'storage/changed', payload: { ns: 'demo', key: 'k' } }),
    )

    lines.length = 0
    await boot.ctx.storage.remove('demo' as StorageNamespaceId, 'k')
    expect(lines).toContainEqual(
      JSON.stringify({ event: 'storage/changed', payload: { ns: 'demo', key: 'k' } }),
    )

    detach()
    await boot.dispose()
  })
})

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