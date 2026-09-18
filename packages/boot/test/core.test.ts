import { describe, expect, test } from 'bun:test'
import * as core from '@berkshire/core'
import * as notify from '@berkshire/plugin-notify-console'
import { Boot, composeEntries } from '../src/index'
import type { Resolver } from '../src/index'
import type { EntryRow } from '../src/index'

/**
 * v1 最小落样例的自动化测试：覆盖
 * 1) 插件正序启动 + inject 依赖就绪；
 * 2) typed 事件触发与响应（'notify/request' @mode emit、'capabilities/changed'）；
 * 3) 反序卸载清理（单元内后注册的先清理 / 卸载后能力不可用 / 释放不泄漏）；
 * 4) 禁用插件后能力不可用（fail-closed）。
 */

const resolver: Resolver = (name) =>
  ({
    '@berkshire/core': core,
    '@berkshire/plugin-notify-console': notify,
  })[name]

const ROWS = {
  core: { id: 'core', name: '@berkshire/core' },
  notify: {
    id: 'notify-console',
    name: '@berkshire/plugin-notify-console',
    config: { channel: 'test', echo: false },
  },
}

/** 一个只用于捕获事件的测试观察者插件；经 inject 依赖 capabilities/notifier。 */
interface CapEvent {
  capability: string
  usable: boolean
}
function makeObserver(captured: CapEvent[]) {
  return {
    name: '@berkshire/test-observer',
    inject: ['capabilities'],
    apply(ctx: Parameters<typeof core.apply>[0]) {
      ctx.on('capabilities/changed', (payload: CapEvent) => {
        captured.push({ capability: payload.capability, usable: payload.usable })
      })
    },
  }
}

/** 挂载 core → observer → notify-console（notify 在最末，保证监听先就位）。 */
async function mountHappy(captured: CapEvent[]) {
  const boot = new Boot()
  await boot.install(ROWS.core, resolver)
  await boot.install({ id: 'observer', name: '@berkshire/test-observer' } as EntryRow, (_n) =>
    makeObserver(captured),
  )
  await boot.install(ROWS.notify, resolver)
  return boot
}

describe('headless 核心脊 · 端到端最小落样例', () => {
  test('1) 插件正序启动：core 服务就绪，依赖经 inject 解析，provider 已注册', async () => {
    const captured: CapEvent[] = []
    const boot = await mountHappy(captured)
    const ctx = boot.ctx

    // 核心脊服务可用（declare module 增强后的类型化访问）
    expect(ctx.log).toBeDefined()
    expect(ctx.capabilities).toBeDefined()
    expect(ctx.notifier).toBeDefined()

    // 依赖经注入解析：notify-console 已把 provider 挂入能力缝
    expect(ctx.notifier.available).toBe(true)
    expect(ctx.notifier.size).toBe(1)
    // 能力已声明且 usable=true
    expect(ctx.capabilities.usable('notify-console' as core.CapabilityId)).toBe(true)
    // 注册过程广播了 capabilities/changed (usable=true)
    expect(captured).toContainEqual({ capability: 'notify-console', usable: true })

    await boot.dispose()
  })

  test('2) typed 事件触发与响应：notify/request 送达 provider + 追加进 log', async () => {
    const boot = await mountHappy([])
    const ctx = boot.ctx
    expect(ctx.log.count).toBe(0)

    const delivered = await ctx.notifier.send({
      message: '交易日 09:30 数据已更新',
      level: 'info',
    })
    expect(delivered).toEqual(['notify-console'])

    const entries = ctx.log.filter('notify/request')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.data).toMatchObject({
      provider: 'notify-console',
      message: '交易日 09:30 数据已更新',
      level: 'info',
    })

    await boot.dispose()
  })

  test('3) 反序卸载清理：插件卸载后能力不可用、监听摘除、不泄漏', async () => {
    const boot = await mountHappy([])
    const ctx = boot.ctx

    // 找到 notify-console 的 fiber（boot 记录挂载顺序）
    const mounted = boot.mounted.find((m) => m.id === 'notify-console' && !m.skipped)!
    const beforeLog = ctx.log.count
    expect(ctx.notifier.available).toBe(true)

    // 仅卸下该插件（核心仍存活）
    await mounted.fiber.dispose()

    // 提供方被撤销 → 能力缝无 provider → 能力不可用
    expect(ctx.notifier.available).toBe(false)
    expect(ctx.notifier.size).toBe(0)
    expect(ctx.capabilities.usable('notify-console' as core.CapabilityId)).toBe(false)
    // 监听被摘除：卸载本身不追加日志
    expect(ctx.log.count).toBe(beforeLog)

    // 无 provider → fail-closed，且日志不增长
    await expect(ctx.notifier.send({ message: 'after unload' })).rejects.toThrow(/fail-closed/)
    expect(ctx.log.count).toBe(beforeLog)

    await boot.dispose()
  })

  test('3b) boot 整体卸除按后装先卸（逆序），disposeOrder 反映依赖顺序', async () => {
    const boot = await mountHappy([])
    const order = await boot.dispose()
    // notify-console、observer 在 core 之前卸除（消费者先于其依赖）
    expect(order[0]).toBe('notify-console')
    expect(order[order.length - 1]).toBe('core')
    // 幂等：二次 dispose 不再重复、顺序不变
    expect(await boot.dispose()).toEqual(order)
  })

  test('4) 禁用插件后能力不可用（fail-closed）', async () => {
    const boot = new Boot()
    await boot.install(ROWS.core, resolver)
    await boot.install({ ...ROWS.notify, disabled: true }, resolver)
    const ctx = boot.ctx

    expect(ctx.notifier.available).toBe(false)
    expect(ctx.capabilities.usable('notify-console' as core.CapabilityId)).toBe(false)
    expect(boot.activeCount).toBe(1) // 只有 core 实际挂载

    await expect(ctx.notifier.send({ message: 'no provider' })).rejects.toThrow(/fail-closed/)
    await boot.dispose()
  })

  test('4b) composeEntries：headless bundle 覆盖行整行禁用 notify-console', () => {
    const base = [
      {
        insert: [
          { id: 'core', name: '@berkshire/core' },
          { id: 'notify-console', name: '@berkshire/plugin-notify-console', config: { channel: 'console' } },
        ],
      },
    ]
    const headless = [{ id: 'notify-console', disabled: true }]
    const rows = composeEntries([base, headless] as Parameters<typeof composeEntries>[0])
    const notifyRow = rows.find((r) => r.id === 'notify-console')!
    expect(notifyRow.disabled).toBe(true)
    // 非 deep-merge：被覆盖行的 config 仍在、disabled 行级生效
    expect(notifyRow.config).toEqual({ channel: 'console' })
  })
})