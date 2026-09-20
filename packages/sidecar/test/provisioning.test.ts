/**
 * 首启供给（provisioning）协议测试：cordis.yml 缺失时 sidecar 不崩溃、应答 boot/status，
 * 装配完成后 boot/status 应答 ready。与 protocol.test.ts 的协议态互补。
 * 运行：`bun run --cwd packages/sidecar test`。
 */
import { describe, expect, test } from 'bun:test'
import * as core from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { ESC, handleLine, handleProvisionLine, serializeError } from '../src/protocol'

const resolver: Resolver = (name) => ({ '@berkshire/core': core })[name]

function parseOne(line: string): unknown {
  return JSON.parse(line)
}

describe('handleProvisionLine（待供给阶段，无 cordis.yml）', () => {
  test('boot/status → { phase: "provisioning" }，不 shutdown', async () => {
    const r = await handleProvisionLine('{"id":1,"method":"boot/status"}', 'provisioning')
    expect(r.shutdown).toBe(false)
    expect(r.lines.length).toBe(1)
    expect(parseOne(r.lines[0]!)).toEqual({ id: 1, result: { phase: 'provisioning' } })
  })

  test('非 boot/* 方法 → METHOD(-32601) fail-closed（不伪造已装配）', async () => {
    const r = await handleProvisionLine('{"id":2,"method":"capabilities/list"}', 'provisioning')
    expect(r.shutdown).toBe(false)
    expect(r.lines.length).toBe(1)
    const msg = parseOne(r.lines[0]!)
    expect(msg).toMatchObject({ id: 2, error: { code: ESC.METHOD } })
  })

  test('shutdown → 置 shutdown，返回 null 响应', async () => {
    const r = await handleProvisionLine('{"id":3,"method":"shutdown"}', 'provisioning')
    expect(r.shutdown).toBe(true)
    expect(parseOne(r.lines[0]!)).toEqual({ id: 3, result: null })
  })

  test('不受 method 参数影响透传（params 归一化）', async () => {
    const r = await handleProvisionLine('{"id":4,"method":"boot/status","params":{"x":1}}', 'provisioning')
    expect(parseOne(r.lines[0]!)).toEqual({ id: 4, result: { phase: 'provisioning' } })
  })

  test('解析失败分支照常返回标准错误（不崩）', async () => {
    const r = await handleProvisionLine('not json', 'provisioning')
    expect(r.lines.length).toBe(1)
    const parsed = parseOne(r.lines[0]!)
    expect(parsed).toMatchObject({ error: { code: ESC.PARSE } })
  })
})

describe('装配完成后（ready）', () => {
  test('dispatch 的 boot/status → { phase: "ready" }（真实 ctx）', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    const deps = { ctx: boot.ctx }
    const r = await handleLine('{"id":1,"method":"boot/status"}', deps)
    expect(r.shutdown).toBe(false)
    expect(parseOne(r.lines[0]!)).toEqual({ id: 1, result: { phase: 'ready' } })
    await boot.dispose()
  })

  test('未知方法仍 METHOD（fail-closed）', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    const r = await handleLine('{"id":2,"method":"nope"}', { ctx: boot.ctx })
    expect(r.shutdown).toBe(false)
    const parsed = parseOne(r.lines[0]!)
    expect(parsed).toMatchObject({ id: 2, error: { code: ESC.METHOD } })
    await boot.dispose()
  })
})

describe('serializeError（共用）', () => {
  test('字节形态含 id + error{code,message}', () => {
    expect(serializeError({ id: 9, error: { code: ESC.METHOD, message: 'x' } })).toBe(
      '{"id":9,"error":{"code":-32601,"message":"x"}}',
    )
  })
})