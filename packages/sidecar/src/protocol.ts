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
import type { CapabilityId, DatasetId, DataSourceId, StorageNamespaceId } from '@berkshire/core'
import type { NotifyPayload } from '@berkshire/core'
import { runDatasetSync } from './sync'
import { safeStringify } from './json-safe'
import { coverageGapsFor, listCoverageEntries, rescanAndRecordCoverage } from './coverage-utils'
import { META_SCOPE, type DatasetCache } from './cache'

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

/** 桥接装配阶段（首启供给）：sidecar 是否已按 `$BK_HOME/cordis.yml` 装配完成。 */
export type BootPhase = 'ready' | 'provisioning'

async function dispatch(method: string, params: Record<string, unknown>, ctx: Context, cache?: DatasetCache): Promise<unknown> {
  switch (method) {
    case 'boot/status':
      // 装配完成阶段（ready）：宿主据此把 webview 切到「已初始化/在线」。provisioning 阶段由
      // handleProvisionLine 服务于 `boot/status`，此处只服务 ready。
      return { phase: 'ready' }

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

    case 'storage/get': {
      // 读一个键（$BK_HOME/state JSON 持久化，WP-2）。缺失返回 null；坏文件/越权 fail-closed → APP。
      const { ns, key } = params
      if (typeof ns !== 'string' || ns === '') throw new ProtocolError(ESC.PARAMS, 'storage/get requires non-empty string "ns"')
      if (typeof key !== 'string' || key === '') throw new ProtocolError(ESC.PARAMS, 'storage/get requires non-empty string "key"')
      try {
        return (await ctx.storage.get(ns as StorageNamespaceId, key)) ?? null
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'storage/set': {
      const { ns, key, value } = params
      if (typeof ns !== 'string' || ns === '') throw new ProtocolError(ESC.PARAMS, 'storage/set requires non-empty string "ns"')
      if (typeof key !== 'string' || key === '') throw new ProtocolError(ESC.PARAMS, 'storage/set requires non-empty string "key"')
      // `value` 必须显式提供（可为任何 JSON，含 null）——缺值属调用方 bug，fail-closed。
      if (!('value' in params)) throw new ProtocolError(ESC.PARAMS, 'storage/set requires "value"')
      try {
        await ctx.storage.set(ns as StorageNamespaceId, key, value)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
      // 成功：返回 null（payload 已在 set 内广播 storage/changed）。
      return null
    }

    case 'storage/remove': {
      const { ns, key } = params
      if (typeof ns !== 'string' || ns === '') throw new ProtocolError(ESC.PARAMS, 'storage/remove requires non-empty string "ns"')
      if (typeof key !== 'string' || key === '') throw new ProtocolError(ESC.PARAMS, 'storage/remove requires non-empty string "key"')
      try {
        await ctx.storage.remove(ns as StorageNamespaceId, key)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
      return null
    }

    case 'storage/list': {
      const { ns } = params
      if (typeof ns !== 'string' || ns === '') throw new ProtocolError(ESC.PARAMS, 'storage/list requires non-empty string "ns"')
      try {
        return await ctx.storage.list(ns as StorageNamespaceId)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    // ---- 数据源能力缝（dataSources/datasets/database）：数据管理页 + 同步编排 ----

    case 'data-sources/list': {
      // 数据管理页主快照：全部 provider（含逐 dataset 可用性）+ 全部 dataset 声明 + 每 dataset
      // 当前解析结果（偏好路由）+ 覆盖日期快照（S2 覆盖 seam）。
      // 无候选源 → resolved 为 null（页面据此展示缺源，fail-closed）。
      const providers = await ctx.dataSources.list()
      const datasets = ctx.datasets.list()
      const resolved: Record<string, string | null> = {}
      for (const d of datasets) {
        try {
          resolved[String(d.id)] = String((await ctx.dataSources.resolve(d.id)).id)
        } catch {
          resolved[String(d.id)] = null
        }
      }
      return {
        providers,
        datasets: datasets.map((d) => ({
          id: String(d.id),
          label: d.label,
          materialization: d.materialization,
          columns: [...d.columns],
          sync: d.sync,
          version: d.version,
        })),
        resolved,
        // 覆盖快照走读透缓存（meta 作用域）：命中复用、写路径 invalidateMeta 后自动失效。
        coverage: cache
          ? await cache.read(META_SCOPE, 'coverage', () => listCoverageEntries(ctx))
          : await listCoverageEntries(ctx),
      }
    }

    case 'data-sources/coverage': {
      // 覆盖日期登记快照（S2 覆盖 seam）：全部已声明数据组覆盖记录；未登记 → covered:false
      // （fail-closed，不伪造「已覆盖」）。S3 走读透缓存（meta 作用域，写后失效）。
      return cache
        ? await cache.read(META_SCOPE, 'coverage', () => listCoverageEntries(ctx))
        : await listCoverageEntries(ctx)
    }

    case 'data-sources/coverage-refresh': {
      // 手动重算覆盖：重扫某 dataset 的实际落库表（min/max/rows）→ 重新登记
      // （用于数据被外部/旧版本写入后校准）。返回该数据集更新后的覆盖快照。
      const { dataset } = params
      if (typeof dataset !== 'string' || dataset === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/coverage-refresh requires non-empty string "dataset"')
      }
      try {
        const record = await rescanAndRecordCoverage(ctx, dataset as DatasetId)
        const d = ctx.datasets.get(dataset as DatasetId)
        return {
          dataset: String(record.dataset),
          label: d?.label ?? String(dataset),
          covered: true,
          minDate: record.minDate,
          maxDate: record.maxDate,
          tradingDays: record.tradingDays ?? null,
          rows: record.rows,
          source: String(record.source),
          materialization: record.materialization,
          recordedAt: record.recordedAt,
          coverageStart: record.coverageStart ?? null,
          isComplete: record.isComplete ?? null,
        }
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'data-sources/coverage-gaps': {
      // 缺洞自检钩子（最小面）：比对目标窗口与实际覆盖区间，输出缺失区间列表。
      const { dataset, start, end } = params
      if (typeof dataset !== 'string' || dataset === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/coverage-gaps requires non-empty string "dataset"')
      }
      if (start !== undefined && typeof start !== 'string') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/coverage-gaps "start" must be a string when present')
      }
      if (end !== undefined && typeof end !== 'string') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/coverage-gaps "end" must be a string when present')
      }
      try {
        return await coverageGapsFor(ctx, dataset as DatasetId, start, end)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'data-sources/candidates': {
      const { dataset } = params
      if (typeof dataset !== 'string' || dataset === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/candidates requires non-empty string "dataset"')
      }
      return (await ctx.dataSources.candidates(dataset as DatasetId) ).map((p) => String(p))
    }

    case 'data-sources/set-preference': {
      const { dataset, provider } = params
      if (typeof dataset !== 'string' || dataset === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/set-preference requires non-empty string "dataset"')
      }
      if (typeof provider !== 'string' || provider === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/set-preference requires non-empty string "provider"')
      }
      try {
        return await ctx.dataSources.setPreference(dataset as DatasetId, provider as DataSourceId)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'data-sources/probe': {
      const { provider, apiKey } = params
      if (typeof provider !== 'string' || provider === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/probe requires non-empty string "provider"')
      }
      if (apiKey !== undefined && typeof apiKey !== 'string') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/probe "apiKey" must be a string when present')
      }
      return await ctx.dataSources.probe(provider as DataSourceId, apiKey)
    }

    case 'data-sources/sync': {
      const { dataset, params: syncParams } = params
      if (typeof dataset !== 'string' || dataset === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/sync requires non-empty string "dataset"')
      }
      if (syncParams !== undefined && (typeof syncParams !== 'object' || syncParams === null || Array.isArray(syncParams))) {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/sync "params" must be an object when present')
      }
      try {
        return await runDatasetSync(ctx, dataset as DatasetId, (syncParams ?? {}) as Record<string, unknown>, cache)
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'database/tables': {
      try {
        return await ctx.database.tables()
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    case 'data-sources/enriched-indicators': {
      // Enriched 派生指标**按需现算**（窄表只存基点列、指标不落宽表）：从 enriched 表读某标的
      // 基点列，用 `ctx.indicators` 现算 MA/EMA/MACD/BOLL/KDJ/ATR/RSI/动量/波动率。数据契约红线
      // 见 [enriched.ts](./enriched.ts)；无该标的 / 表缺失 → fail-closed 报错。
      const { symbol, start, end, needed } = params
      if (typeof symbol !== 'string' || symbol === '') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/enriched-indicators requires non-empty string "symbol"')
      }
      if (start !== undefined && typeof start !== 'string') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/enriched-indicators "start" must be a string')
      }
      if (end !== undefined && typeof end !== 'string') {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/enriched-indicators "end" must be a string')
      }
      if (needed !== undefined && (!Array.isArray(needed) || needed.some((n) => typeof n !== 'string'))) {
        throw new ProtocolError(ESC.PARAMS, 'data-sources/enriched-indicators "needed" must be a string[]')
      }
      const { computeIndicatorsFromDb } = await import('./enriched')
      try {
        // 走能力缝：注入 `ctx.indicators.compute`（先内置、再叠加已注册 Provider 的列），杜绝
        // Consumer 绕开 seam 直用纯函数而丢弃注册列。
        return await computeIndicatorsFromDb(ctx.database, {
          symbol,
          start,
          end,
          needed: needed as string[] | undefined,
        }, cache, (series, needed_) => ctx.indicators.compute(series, needed_))
      } catch (err) {
        throw new ProtocolError(ESC.APP, err instanceof Error ? err.message : String(err))
      }
    }

    default:
      throw new ProtocolError(ESC.METHOD, `unknown method "${method}"`)
  }
}

export function serializeResult(id: number, result: unknown): string {
  // JSON 安全序列化（bigint→number|string，fail-closed）：`database/tables` 等含 bigint
  // 的快照不再因 `JSON.stringify` 抛 `Do not know how to serialize a BigInt`。
  return safeStringify({ id, result })
}

export function serializeError(error: RpcError): string {
  return safeStringify(error)
}

export interface HandleLineDeps {
  ctx: Context
  /** S3 热读缓存（generation-bounded 读透缓存）。缺省则不启用缓存路径（测试/无缓存装配）。 */
  cache?: DatasetCache
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
    const result = await dispatch(req.method, req.params, deps.ctx, deps.cache)
    return { lines: [serializeResult(req.id, result)], shutdown: false }
  } catch (err) {
    const code = err instanceof ProtocolError ? err.code : ESC.INTERNAL
    const message = err instanceof Error ? err.message : String(err)
    return { lines: [serializeError({ id: req.id, error: { code, message } })], shutdown: false }
  }
}

/**
 * 「待供给（provisioning）」阶段的无 ctx 单行处理：`$BK_HOME/cordis.yml` 尚不存在时，sidecar
 * 不装配任何插件、也不崩溃（否则首启只能黑屏/离线），而是保活应答 `boot/status`，让宿主据此
 * 展示首启引导、写入 cordis.yml 后由宿主重启本进程进入 ready。其余方法一律 METHOD(…fail-closed)，
 * 绝不吞、绝不伪造「已装配」结果。
 */
export async function handleProvisionLine(
  netline: string,
  phase: BootPhase,
): Promise<HandleLineResult> {
  const parsed = parseLine(netline)
  if (parsed.status === 'ignore') return { lines: [], shutdown: false }
  if (parsed.status === 'error') {
    return { lines: [serializeError(parsed.error)], shutdown: false }
  }
  const req = parsed.req
  if (req.method === 'shutdown') {
    return { lines: [serializeResult(req.id, null)], shutdown: true }
  }
  if (req.method === 'boot/status') {
    return { lines: [serializeResult(req.id, { phase })], shutdown: false }
  }
  return {
    lines: [
      serializeError({
        id: req.id,
        error: { code: ESC.METHOD, message: `unknown method "${req.method}" (unprovisioned)` },
      }),
    ],
    shutdown: false,
  }
}