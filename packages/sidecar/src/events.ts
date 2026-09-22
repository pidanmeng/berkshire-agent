import type { Context } from '@berkshire/cordis'
import '@berkshire/core'
import { safeStringify } from './json-safe'

/** 订阅内部事件，把 `{ event, payload }` 即时序列化为 ndjson 推送行写到宿主。 */
export type EventPusher = (line: string) => void

/**
 * 序列化一条事件推送；若 payload 无法安全序列化（循环引用 / undefined / 含 bigint 之外的
 * 非法值），fail-closed：**不写坏 ndjson 行、不静默丢字段**，而是记 stderr 并携带事件名上下文。
 */
function pushEvent(emit: EventPusher, event: string, payload: unknown): void {
  try {
    emit(safeStringify({ event, payload }))
  } catch (err) {
    // 事件推送无 RPC 响应通道，显式记 stderr（fail-closed），绝不发残缺/伪造行。
    process.stderr.write(
      `[sidecar][events] fail-closed: cannot serialize "${event}" payload: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    )
  }
}

/**
 * 把 sidecar 侧内部事件（均 `@mode emit`）换成 `{ event, payload }` 推送写往 `stdout`。
 *
 * T0 诚实边界：sidecar 只负责「推」，是否把某事件透传成 Tauri event 给 webview，由宿主决定
 * （T2）。事件定义见 core/src/events.ts，payload 即事件载荷。
 *
 * 返回可撤销 disposer（卸载即摘监听，逆序）。
 */
export function attachEventPusher(ctx: Context, emit: EventPusher): () => void {
  const offNotify = ctx.on('notify/request', (payload) => {
    pushEvent(emit, 'notify/request', payload)
  })
  const offCaps = ctx.on('capabilities/changed', (payload) => {
    pushEvent(emit, 'capabilities/changed', payload)
  })
  const offClient = ctx.on('client/changed', (payload) => {
    pushEvent(emit, 'client/changed', payload)
  })
  const offStorage = ctx.on('storage/changed', (payload) => {
    pushEvent(emit, 'storage/changed', payload)
  })
  const offDatabase = ctx.on('database/dataset-updated', (payload) => {
    pushEvent(emit, 'database/dataset-updated', payload)
  })
  const offCoverage = ctx.on('datasets/coverage-updated', (payload) => {
    pushEvent(emit, 'datasets/coverage-updated', payload)
  })
  const offSyncStarted = ctx.on('sync/started', (payload) => {
    pushEvent(emit, 'sync/started', payload)
  })
  const offSyncCompleted = ctx.on('sync/completed', (payload) => {
    pushEvent(emit, 'sync/completed', payload)
  })
  const offSyncFailed = ctx.on('sync/failed', (payload) => {
    pushEvent(emit, 'sync/failed', payload)
  })
  return () => {
    offNotify()
    offCaps()
    offClient()
    offStorage()
    offDatabase()
    offCoverage()
    offSyncStarted()
    offSyncCompleted()
    offSyncFailed()
  }
}