/**
 * 协议层（纯函数，无 I/O、不碰 Boot）：一行请求 → 一行响应/错误。
 *
 * 对应 T0 定稿的桥接协议（见 ../README.md）：简版 JSON-RPC 2.0 子集，ndjson stdio。
 * `handleLine(netline, deps)` 把「一行请求」的解析、分发与序列化抽成可单测的纯函数，
 * 供 T4 直接单测；事件推送由 `attachEventPusher` 单独挂到 ctx 上，不在本层混写。
 *
 * 诚实边界：所有输出为**内存视图**（capabilities/log 均为进程内状态），持久化目标态。
 * fail-closed：解析失败 / 未知方法 / 业务错误一律返回 `{ id, error }`，绝不吞、绝不写
 * 「看似合理」的结果。
 */
import type { Context } from '@berkshire/cordis'
import '@berkshire/core'
import type { CapabilityId } from '@berkshire/core'
import type { NotifyPayload } from '@berkshire/core'

/** 简版 JSON-RPC 2.0 错误码（T0 协议）。 */
export const ESC = {
  PARSE: -32700,
  INVALID: -32600,
  METHOD: -32601,
  PARAMS: -32602,
  INTERNAL: -32603,
  APP: -32000,
} as const

export interface RpcRequest {
  id: number
  method: string
  params: Record<string, unknown>
}

export interface RpcError {
  id: number | null
  error: { code: number; message: string }
}

export type ParseResult =
  | { status: 'ignore' }
  | { status: 'ok'; req: RpcRequest }
  | { status: 'error'; error: RpcError }

/** 解析一行 ndjson。空行忽略；非法 JSON / 缺字段 → 对应标准错误码（id 未知则 null）。 */
export function parseLine(raw: string): ParseResult {
  const line = raw.trim()
  if (line === '') return { status: 'ignore' }

  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return { status: 'error', error: { id: null, error: { code: ESC.PARSE, message: 'invalid JSON' } } }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'error', error: { id: null, error: { code: ESC.INVALID, message: 'request must be an object' } } }
  }
  const { id, method } = value as Record<string, unknown>
  if (typeof id !== 'number' || typeof method !== 'string' || method === '') {
    const errId = typeof id === 'number' ? id : null
    return {
      status: 'error',
      error: { id: errId, error: { code: ESC.INVALID, message: 'request requires numeric id + non-empty string method' } },
    }
  }
  const params = (value as Record<string, unknown>).params
  const cleanParams =
    params !== null && typeof params === 'object' && !Array.isArray(params)
      ? (params as Record<string, unknown>)
      : {}
  return { status: 'ok', req: { id, method, params: cleanParams } }
}

/** 业务/协议错误（携带错误码）。 */
export class ProtocolError extends Error {
  constructor(readonly code: number, message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

const LEVELS = ['info', 'warn', 'error'] as const

async function dispatch(method: string, params: Record<string, unknown>, ctx: Context): Promise<unknown> {
  switch (method) {
    case 'capabilities/list':
      return ctx.capabilities
        .matrix()
        .map((c) => ({ id: c.id, label: c.label, usable: ctx.capabilities.usable(c.id) }))

    case 'capabilities/usable': {
      const id = params.id
      if (typeof id !== 'string' || id === '') {
        throw new ProtocolError(ESC.PARAMS, 'capabilities/usable requires string "id"')
      }
      return ctx.capabilities.usable(id as CapabilityId)
    }

    case 'notify/send': {
      const { message, level, channel } = params
      if (typeof message !== 'string' || message === '') {
        throw new ProtocolError(ESC.PARAMS, 'notify/send requires non-empty string "message"')
      }
      if (level !== undefined && (typeof level !== 'string' || !(LEVELS as readonly string[]).includes(level))) {
        throw new ProtocolError(ESC.PARAMS, `notify/send invalid level: ${JSON.stringify(level)}`)
      }
      const payload: NotifyPayload = {
        message,
        level: level as NotifyPayload['level'],
        channel: typeof channel === 'string' ? channel : undefined,
      }
      try {
        return await ctx.notifier.send(payload)
      } catch (err) {
        // 无 provider / 投递失败一律 fail-closed → 应用错误码（T0：-32000），不吞。
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'log/list': {
      const event = typeof params.event === 'string' ? params.event : undefined
      return event ? ctx.log.filter(event) : ctx.log.list()
    }

    case 'client/list':
      // client 插件图快照（slot → 可动态 import 的 client 入口）：直接投 `ctx.clientModules` 注册表，
      // 不含 $BK_HOME 逻辑（ROI：宿主 Rust bridge 把插件自报的绝对入口规范化成 `bk://`，见 bk_protocol.rs）。
      return ctx.clientModules.list()

    case 'routes/list':
      // 动态路由/导航快照（能力块 B/页面，路由契约化）：所有带 `route` 声明的已排序导航项
      // （任意 slot，含 slot 归属；静态路径、不覆盖核心、全局唯一）。
      return ctx.slots.routes()

    default:
      throw new ProtocolError(ESC.METHOD, `unknown method "${method}"`)
  }
}

export function serializeResult(id: number, result: unknown): string {
  return JSON.stringify({ id, result })
}

export function serializeError(error: RpcError): string {
  return JSON.stringify(error)
}

export interface HandleLineDeps {
  ctx: Context
}

export interface HandleLineResult {
  /** 要写往 stdout 的 ndjson 行。 */
  lines: string[]
  /** 是否触发 shutdown（宿主收到后负责 boot 逆序销毁 + 退出）。 */
  shutdown: boolean
}

/** 处理一行请求，返回应输出的响应/错误行（纯函数，不写 I/O）。 */
export async function handleLine(netline: string, deps: HandleLineDeps): Promise<HandleLineResult> {
  const parsed = parseLine(netline)
  if (parsed.status === 'ignore') return { lines: [], shutdown: false }
  if (parsed.status === 'error') {
    return { lines: [serializeError(parsed.error)], shutdown: false }
  }
  const req = parsed.req
  if (req.method === 'shutdown') {
    return { lines: [serializeResult(req.id, null)], shutdown: true }
  }
  try {
    const result = await dispatch(req.method, req.params, deps.ctx)
    return { lines: [serializeResult(req.id, result)], shutdown: false }
  } catch (err) {
    const code = err instanceof ProtocolError ? err.code : ESC.INTERNAL
    const message = err instanceof Error ? err.message : String(err)
    return { lines: [serializeError({ id: req.id, error: { code, message } })], shutdown: false }
  }
}