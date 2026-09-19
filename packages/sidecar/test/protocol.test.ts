/**
 * 协议层单元测试（T0 契约 → T1 实现 → T4 单测）。覆盖：
 * - `parseLine`：ndjson 解析的失败分支（非法 JSON / 非对象 / 缺 id / 缺 method）与成功归一化；
 * - `serializeResult` / `serializeError` 的字节形态；
 * - `handleLine`：四方法 round-trip、参数校验 fail-closed、未知方法、无 provider 时 app 错误、shutdown。
 *
 * 与 examples/smoke.ts（进程级集成）互补：本测试不经 stdio、不写 I/O，直接以真实 `ctx` 调 `handleLine`。
 * 运行：`bun test packages/sidecar/test`（或 `bun run --cwd packages/sidecar test`）。
 */
import { describe, expect, test } from 'bun:test'
import * as core from '@berkshire/core'
import * as notify from '@berkshire/plugin-notify-console'
import type { ClientModuleId } from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import {
  ESC,
  handleLine,
  parseLine,
  serializeError,
  serializeResult,
} from '../src/protocol'

const resolver: Resolver = (name) =>
  ({
    '@berkshire/core': core,
    '@berkshire/plugin-notify-console': notify,
  })[name]

/** 挂载真实 core（可选 + notify-console）作为 handleLine 的 ctx。 */
async function mount(withNotify: boolean): Promise<Boot> {
  const boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  if (withNotify) {
    await boot.install(
      { id: 'notify-console', name: '@berkshire/plugin-notify-console', config: { channel: 'test', echo: false } },
      resolver,
    )
  }
  return boot
}

describe('parseLine（ndjson 解析）', () => {
  test('空行 / 纯空白 → ignore，不产生输出', () => {
    expect(parseLine('')).toEqual({ status: 'ignore' })
    expect(parseLine('   ')).toEqual({ status: 'ignore' })
    expect(parseLine('\n')).toEqual({ status: 'ignore' })
  })

  test('非法 JSON → PARSE(-32700)，id 未知为 null', () => {
    const r = parseLine('not json')
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.error).toEqual({ id: null, error: { code: ESC.PARSE, message: 'invalid JSON' } })
    }
  })

  test('非对象（数组）→ INVALID(-32600)', () => {
    const r = parseLine('[]')
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error.error.code).toBe(ESC.INVALID)
  })

  test('缺 id → INVALID，id 为 null', () => {
    const r = parseLine('{"method":"m"}')
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error).toEqual({ id: null, error: { code: ESC.INVALID, message: expect.stringContaining('numeric id') as unknown as string } })
  })

  test('id 非 number → INVALID 且原 id 不回填（不信任外带 id）', () => {
    const r = parseLine('{"id":"a","method":"m"}')
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error.id).toBeNull()
  })

  test('id 为 number 但缺 method / method 空串 → INVALID，携带该 id', () => {
    const r1 = parseLine('{"id":3}')
    expect(r1.status).toBe('error')
    if (r1.status === 'error') expect(r1.error.id).toBe(3)

    const r2 = parseLine('{"id":3,"method":""}')
    expect(r2.status).toBe('error')
    if (r2.status === 'error') expect(r2.error.id).toBe(3)
  })

  test('合法请求 → ok，params 归一化为对象', () => {
    const r = parseLine('{"id":7,"method":"m","params":{"a":1}}')
    expect(r).toEqual({ status: 'ok', req: { id: 7, method: 'm', params: { a: 1 } } })
  })

  test('params 缺失 / 非对象 → 归一化为 {}（方法侧自行校验必填）', () => {
    expect(parseLine('{"id":1,"method":"m"}')).toEqual({
      status: 'ok',
      req: { id: 1, method: 'm', params: {} },
    })
    expect(parseLine('{"id":1,"method":"m","params":42}')).toEqual({
      status: 'ok',
      req: { id: 1, method: 'm', params: {} },
    })
  })
})

describe('序列化', () => {
  test('serializeResult 单行 JSON', () => {
    expect(serializeResult(1, { usable: true })).toBe('{"id":1,"result":{"usable":true}}')
  })
  test('serializeError 含错误码与 message', () => {
    expect(serializeError({ id: 5, error: { code: ESC.METHOD, message: 'x' } })).toBe(
      '{"id":5,"error":{"code":-32601,"message":"x"}}',
    )
  })
})

describe('handleLine · 四方法 round-trip（真实 ctx）', () => {
  test('capabilities/list：返回可用能力快照（桥上投影 usable）', async () => {
    const boot = await mount(true)
    const res = await handleLine('{"id":1,"method":"capabilities/list","params":{}}', { ctx: boot.ctx })
    expect(res.shutdown).toBe(false)
    expect(res.lines).toHaveLength(1)
    const msg = JSON.parse(res.lines[0]!) as { id: number; result: Array<{ id: string; usable: boolean }> }
    expect(msg.id).toBe(1)
    const notify = msg.result.find((c) => c.id === 'notify-console')
    expect(notify?.usable).toBe(true)
    await boot.dispose()
  })

  test('capabilities/usable：已知 true / 未知 false（fail-closed，不抛）', async () => {
    const boot = await mount(true)
    const ok = await handleLine('{"id":1,"method":"capabilities/usable","params":{"id":"notify-console"}}', {
      ctx: boot.ctx,
    })
    expect(JSON.parse(ok.lines[0]!)).toEqual({ id: 1, result: true })

    const unknown = await handleLine('{"id":2,"method":"capabilities/usable","params":{"id":"no-such-cap"}}', {
      ctx: boot.ctx,
    })
    expect(JSON.parse(unknown.lines[0]!)).toEqual({ id: 2, result: false })

    // 缺 id → 参数错误
    const missing = await handleLine('{"id":3,"method":"capabilities/usable","params":{}}', { ctx: boot.ctx })
    const err = JSON.parse(missing.lines[0]!) as { id: number; error: { code: number } }
    expect(err.error.code).toBe(ESC.PARAMS)
    await boot.dispose()
  })

  test('notify/send：投递成功、返回 delivered、写入 log', async () => {
    const boot = await mount(true)
    const res = await handleLine(
      '{"id":1,"method":"notify/send","params":{"message":"测试","level":"info"}}',
      { ctx: boot.ctx },
    )
    expect(JSON.parse(res.lines[0]!)).toEqual({ id: 1, result: ['notify-console'] })
    expect(boot.ctx.log.filter('notify/request')).toHaveLength(1)
    await boot.dispose()
  })

  test('notify/send：非法 level → PARAMS；非字符串 level 也拒绝（不靠强转）', async () => {
    const boot = await mount(true)
    const bad = await handleLine('{"id":1,"method":"notify/send","params":{"message":"m","level":"bogus"}}', {
      ctx: boot.ctx,
    })
    const msg = JSON.parse(bad.lines[0]!) as { error: { code: number } }
    expect(msg.error.code).toBe(ESC.PARAMS)

    const numeric = await handleLine('{"id":2,"method":"notify/send","params":{"message":"m","level":42}}', {
      ctx: boot.ctx,
    })
    expect((JSON.parse(numeric.lines[0]!) as { error: { code: number } }).error.code).toBe(ESC.PARAMS)
    await boot.dispose()
  })

  test('notify/send：缺 message → PARAMS', async () => {
    const boot = await mount(true)
    const res = await handleLine('{"id":1,"method":"notify/send","params":{}}', { ctx: boot.ctx })
    expect((JSON.parse(res.lines[0]!) as { error: { code: number } }).error.code).toBe(ESC.PARAMS)
    await boot.dispose()
  })

  test('notify/send：无 provider 时 fail-closed → APP(-32000)，不吞', async () => {
    // 只挂 core，不挂 notify-console → 无 provider
    const boot = await mount(false)
    const res = await handleLine('{"id":1,"method":"notify/send","params":{"message":"m"}}', { ctx: boot.ctx })
    const msg = JSON.parse(res.lines[0]!) as { error: { code: number; message: string } }
    expect(msg.error.code).toBe(ESC.APP)
    expect(msg.error.message).toMatch(/fail-closed|no provider/)
    await boot.dispose()
  })

  test('log/list：返回追加式快照，可按 event 过滤', async () => {
    const boot = await mount(true)
    await handleLine('{"id":1,"method":"notify/send","params":{"message":"m"}}', { ctx: boot.ctx })

    const all = await handleLine('{"id":2,"method":"log/list","params":{}}', { ctx: boot.ctx })
    const allMsg = JSON.parse(all.lines[0]!) as { result: Array<{ event: string }> }
    expect(allMsg.result.some((e) => e.event === 'notify/request')).toBe(true)

    const filtered = await handleLine('{"id":3,"method":"log/list","params":{"event":"no-such"}}', { ctx: boot.ctx })
    expect((JSON.parse(filtered.lines[0]!) as { result: unknown[] }).result).toEqual([])
    await boot.dispose()
  })

  test('未知 method → METHOD(-32601) 且 shutdown=false', async () => {
    const boot = await mount(true)
    const res = await handleLine('{"id":9,"method":"no/such","params":{}}', { ctx: boot.ctx })
    expect(res.shutdown).toBe(false)
    const msg = JSON.parse(res.lines[0]!) as { id: number; error: { code: number } }
    expect(msg.id).toBe(9)
    expect(msg.error.code).toBe(ESC.METHOD)
    await boot.dispose()
  })

  test('shutdown：返回 null 响应并置 shutdown=true', async () => {
    const boot = await mount(true)
    const res = await handleLine('{"id":1,"method":"shutdown","params":{}}', { ctx: boot.ctx })
    expect(res.shutdown).toBe(true)
    expect(JSON.parse(res.lines[0]!)).toEqual({ id: 1, result: null })
    // shutdown 只把标志交给宿主（宿主负责 boot.dispose 逆序清理）；这里确认可正常清理收尾。
    await boot.dispose()
  })
})

describe('handleLine · client/list（T1 client 插件图快照）', () => {
  test('未注册 → 空数组；注册后返回快照；disposer 卸载后消失', async () => {
    const boot = await mount(true)
    const empty = await handleLine('{"id":1,"method":"client/list","params":{}}', { ctx: boot.ctx })
    expect(JSON.parse(empty.lines[0]!)).toEqual({ id: 1, result: [] })

    const offSlot = boot.ctx.slots.register('stock-preview.footer', { id: 'demo', order: 20 })
    const offMod = boot.ctx.clientModules.register({
      id: 'demo-minimal' as ClientModuleId,
      slot: 'stock-preview.footer',
      bundle: 'client/demo-minimal.js',
      style: '.bk-demo-minimal{}',
    })
    const res = await handleLine('{"id":2,"method":"client/list","params":{}}', { ctx: boot.ctx })
    const arr = (
      JSON.parse(res.lines[0]!) as {
        result: Array<{ id: string; slot: string; bundle: string; style?: string }>
      }
    ).result
    expect(arr).toHaveLength(1)
    expect(arr[0]).toMatchObject({
      id: 'demo-minimal',
      slot: 'stock-preview.footer',
      bundle: 'client/demo-minimal.js',
      style: '.bk-demo-minimal{}',
    })

    const offMod2 = boot.ctx.clientModules.register({
      id: 'demo-b' as ClientModuleId,
      slot: 'watchlist.toolbar',
      bundle: 'client/b.js',
    })
    const res2 = await handleLine('{"id":3,"method":"client/list","params":{}}', { ctx: boot.ctx })
    expect((JSON.parse(res2.lines[0]!) as { result: unknown[] }).result).toHaveLength(2)

    // 卸载（disposer 可逆）后从快照消失。
    offMod2()
    const res3 = await handleLine('{"id":4,"method":"client/list","params":{}}', { ctx: boot.ctx })
    expect((JSON.parse(res3.lines[0]!) as { result: unknown[] }).result).toHaveLength(1)

    offMod()
    offSlot()
    await boot.dispose()
  })

  test('重复 id 注册 → 响亮拒绝（fail-closed）', async () => {
    const boot = await mount(true)
    boot.ctx.clientModules.register({
      id: 'dup' as ClientModuleId,
      slot: 'stock-preview.footer',
      bundle: 'a.js',
    })
    expect(() =>
      boot.ctx.clientModules.register({
        id: 'dup' as ClientModuleId,
        slot: 'watchlist.toolbar',
        bundle: 'b.js',
      }),
    ).toThrow(/重复 id/)
    await boot.dispose()
  })

  test('未知 slot 在 clientModules.register 时拒绝（fail-closed）', async () => {
    const boot = await mount(true)
    expect(() =>
      boot.ctx.clientModules.register({
        id: 'x' as ClientModuleId,
        slot: 'no/such' as never,
        bundle: 'a.js',
      }),
    ).toThrow(/未知 slot/)
    await boot.dispose()
  })
})