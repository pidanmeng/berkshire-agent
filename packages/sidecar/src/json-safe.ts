/**
 * JSON 安全序列化（桥接/快照 bigint 修复，S1）。
 *
 * 问题根因：`@duckdb/node-api` 的 `runAndReadAll(...).getRowObjects()` 对 BIGINT/UINT/
 * HUGEINT/Decimal 等列在 JS 侧返回 `bigint`；`JSON.stringify` 遇 `bigint` 抛
 * `TypeError: Do not know how to serialize a BigInt`，被 `handleLine` 收成 `-32603 INTERNAL`，
 * 使「本该成功的快照变成错误响应」。本模块提供一个**确定性、可逆、fail-closed** 的 JSON 安全
 * 序列化出口，供 RPC 响应（`protocol.serializeResult`/`serializeError`）与事件推送（`events.ts`）
 * 统一使用，也供 DuckDB Provider 出口做双保险归一。
 *
 * 纪律（数据契约红线，docs/data-model.md §6）：
 * - `bigint` 能无损表示为 number（`|value| <= Number.MAX_SAFE_INTEGER`）→ number；
 * - 否则 → 十进制**字符串**（`value.toString()`）保证精度不丢，**禁止** `Number(x)` 硬转
 *   导致精度漂移后被下游当作精确值；
 * - number/string 的选择是稳定确定的，读侧写侧对同一数值理解一致；
 * - `undefined` 语义对齐 `JSON.stringify`：对象属性 → **省略该键**（可选字段缺省的正确 JSON
 *   表示，round-trip 后属性缺席与 `field?: T` 一致）、数组元素 → `null`；仅**顶层** `undefined`
 *   无法表示 → 显式抛错；
 * - 其余无法确定性表示的非法入参（循环引用 / function / symbol）**显式抛** `JsonSafeError`
 *   并携带路径上下文（fail-closed），绝不静默丢字段或写坏 ndjson 行。
 */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE = -MAX_SAFE

/** 无法确定性序列化为 JSON 时抛出的可读错误（携带字段路径上下文）。 */
export class JsonSafeError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${message} (at ${path === '' ? '<root>' : path})`)
    this.name = 'JsonSafeError'
  }
}

/**
 * 把任意值深归一化为 JSON 安全的普通值（`bigint`→number|string，递归经数组/对象）。
 * 循环引用、`undefined`、function、symbol 一律 fail-closed 抛 `JsonSafeError`。
 */
export function toSafeJsonValue(value: unknown): unknown {
  return normalize(value, new Set(), '')
}

function normalize(value: unknown, stack: Set<object>, path: string): unknown {
  if (value === null) return value
  switch (typeof value) {
    case 'number':
    case 'string':
    case 'boolean':
      return value
    case 'bigint': {
      // 精度红线：safe 范围内→number；范围外→十进制字符串，绝不四舍五入（禁止 Number 硬转）。
      return value >= MIN_SAFE && value <= MAX_SAFE ? Number(value) : value.toString()
    }
    case 'undefined':
      throw new JsonSafeError(path, 'cannot serialize undefined')
    case 'function':
      throw new JsonSafeError(path, 'cannot serialize function')
    case 'symbol':
      throw new JsonSafeError(path, 'cannot serialize symbol')
    case 'object': {
      if (stack.has(value)) {
        throw new JsonSafeError(path, 'circular reference')
      }
      if (Array.isArray(value)) {
        stack.add(value)
        // `undefined` 数组元素对齐 JSON.stringify → null（不允许它递归到顶层抛错分支）。
        const out = value.map((el, i) => (el === undefined ? null : normalize(el, stack, `${path}[${i}]`)))
        stack.delete(value)
        return out
      }
      const obj = value as Record<string, unknown>
      stack.add(value)
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(obj)) {
        // 对象属性值为 undefined → 省略该键（可选字段缺省的正确 JSON 表示，round-trip 无损）。
        if (obj[key] === undefined) continue
        out[key] = normalize(obj[key], stack, path ? `${path}.${key}` : key)
      }
      stack.delete(value)
      return out
    }
    default:
      throw new JsonSafeError(path, `cannot serialize ${typeof value}`)
  }
}

/** 序列化为单行 JSON 字符串；无法安全序列化时报 `JsonSafeError`（fail-closed）。 */
export function safeStringify(value: unknown): string {
  return JSON.stringify(toSafeJsonValue(value))
}