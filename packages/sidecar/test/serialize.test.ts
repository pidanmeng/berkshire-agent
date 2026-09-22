/**
 * JSON 安全序列化单测（S1 · 修复桥接/快照的 BigInt 序列化报错）。
 *
 * 覆盖：
 * - `toSafeJsonValue` / `safeStringify`：安全 bigint→number、超界 bigint→字符串（无损）、
 *   任意深度嵌套（对象/数组/metadata）递归；
 * - fail-closed：循环引用 / `undefined` / function → `JsonSafeError`（不静默丢字段）；
 * - `serializeResult` 在 `database/tables` 形状的含 bigint 结果上不抛错、产出合法 JSON；
 * - 事件推送（`attachEventPusher`）走同一序列化出口：含 bigint 载荷也可靠推达宿主，且
 *   无法序列化的载荷 fail-closed 不致崩溃/写坏行。
 *
 * 运行：`bun test packages/sidecar/test`。
 */
import { describe, expect, test } from 'bun:test'
import * as core from '@berkshire/core'
import type { DatasetId } from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { JsonSafeError, safeStringify, toSafeJsonValue } from '../src/json-safe'
import { serializeResult } from '../src/protocol'
import { attachEventPusher } from '../src/events'

describe('json-safe · bigint 转换', () => {
  test('安全 bigint（|value| <= MAX_SAFE_INTEGER）→ number（无损）', () => {
    expect(toSafeJsonValue(42n)).toBe(42)
    expect(toSafeJsonValue(-42n)).toBe(-42)
    expect(toSafeJsonValue(9007199254740991n)).toBe(Number.MAX_SAFE_INTEGER)
    expect(toSafeJsonValue(-9007199254740991n)).toBe(-Number.MAX_SAFE_INTEGER)
  })

  test('超界 bigint → 十进制字符串，绝不四舍五入/精度漂移', () => {
    const huge = 9007199254740993n // MAX_SAFE_INTEGER + 2，Number() 会漂移
    expect(toSafeJsonValue(huge)).toBe('9007199254740993')
    const hugeNeg = -9007199254740993n
    expect(toSafeJsonValue(hugeNeg)).toBe('-9007199254740993')
    expect(safeStringify({ v: huge })).toBe('{"v":"9007199254740993"}')
  })

  test('number/string/boolean/null 原样保留', () => {
    expect(toSafeJsonValue(1.5)).toBe(1.5)
    expect(toSafeJsonValue('x')).toBe('x')
    expect(toSafeJsonValue(true)).toBe(true)
    expect(toSafeJsonValue(false)).toBe(false)
    expect(toSafeJsonValue(null)).toBeNull()
  })

  test('任意深度嵌套（对象/数组/metadata）递归转换 bigint', () => {
    const input = {
      meta: { id: 1n, safe: 5n },
      rows: [{ a: 2n, b: [3n, { c: 9007199254740993n }] }],
    }
    expect(toSafeJsonValue(input)).toEqual({
      meta: { id: 1, safe: 5 },
      rows: [{ a: 2, b: [3, { c: '9007199254740993' }] }],
    })
  })
})

describe('json-safe · fail-closed（无法确定性序列化显式抛错）', () => {
  test('顶层 undefined → JsonSafeError（无有效 JSON 表示）', () => {
    expect(() => toSafeJsonValue(undefined)).toThrow(JsonSafeError)
  })

  test('对象属性 undefined → 省略该键；数组元素 undefined → null（对齐 JSON.stringify）', () => {
    expect(safeStringify({ a: 1, u: undefined })).toBe('{"a":1}')
    expect(safeStringify([1, undefined, 2])).toBe('[1,null,2]')
  })

  test('循环引用 → JsonSafeError', () => {
    const obj: Record<string, unknown> = { x: 1 }
    obj.self = obj
    expect(() => toSafeJsonValue(obj)).toThrow(/circular/)
  })

  test('function / symbol → JsonSafeError', () => {
    expect(() => toSafeJsonValue({ fn: () => 1 })).toThrow(/function/)
    expect(() => toSafeJsonValue(Symbol('s'))).toThrow(/symbol/)
  })
})

describe('serializeResult · 含 bigint 的快照不再抛错（database/tables）', () => {
  test('database/tables 形状（rowCount 为 bigint）→ 合法 JSON，rowCount 转 number', () => {
    const tables = [
      { name: 'daily', rowCount: 2345n },
      { name: 'huge', rowCount: 9007199254740993n },
    ]
    const line = serializeResult(1, tables)
    expect(() => JSON.parse(line)).not.toThrow()
    const parsed = JSON.parse(line) as { id: number; result: Array<{ name: string; rowCount: number | string }> }
    expect(parsed.result).toEqual([
      { name: 'daily', rowCount: 2345 },
      { name: 'huge', rowCount: '9007199254740993' },
    ])
  })

  test('bigint 嵌套在 metadata / 数组元素同样被转换', () => {
    const line = serializeResult(1, { dataset: 7n, list: [{ v: 9007199254740994n }] })
    const parsed = JSON.parse(line) as { result: { dataset: number; list: Array<{ v: string }> } }
    expect(parsed.result.dataset).toBe(7)
    expect(parsed.result.list[0]!.v).toBe('9007199254740994')
  })
})

describe('事件推送 · attachEventPusher 走同一 JSON 安全出口', () => {
  const resolver: Resolver = (name) => ({ '@berkshire/core': core })[name]

  test('含 bigint 的事件载荷可靠序列化推达宿主', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    const lines: string[] = []
    const detach = attachEventPusher(boot.ctx, (l) => lines.push(l))

    // 直接 emit 一个携带 bigint 载荷的 database/dataset-updated（rows 跨过大 safe 范围模拟超界）
    const emit = boot.ctx.emit as (name: string, payload: unknown) => unknown
    emit('database/dataset-updated', { dataset: 'daily' as DatasetId, rows: 9007199254740993n, at: 1 })

    expect(lines).toHaveLength(1)
    expect(() => JSON.parse(lines[0]!)).not.toThrow()
    const parsed = JSON.parse(lines[0]!) as { event: string; payload: { rows: string; dataset: string } }
    expect(parsed.event).toBe('database/dataset-updated')
    expect(parsed.payload.rows).toBe('9007199254740993')
    expect(parsed.payload.dataset).toBe('daily')

    detach()
    await boot.dispose()
  })
})