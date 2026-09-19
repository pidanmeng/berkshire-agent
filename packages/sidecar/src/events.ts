import type { Context } from 'cordis'
import '@berkshire/core'

/** 订阅内部事件，把 `{ event, payload }` 即时序列化为 ndjson 推送行写到宿主。 */
export type EventPusher = (line: string) => void

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
    emit(JSON.stringify({ event: 'notify/request', payload }))
  })
  const offCaps = ctx.on('capabilities/changed', (payload) => {
    emit(JSON.stringify({ event: 'capabilities/changed', payload }))
  })
  const offClient = ctx.on('client/changed', (payload) => {
    emit(JSON.stringify({ event: 'client/changed', payload }))
  })
  return () => {
    offNotify()
    offCaps()
    offClient()
  }
}