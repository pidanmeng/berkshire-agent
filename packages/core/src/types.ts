/**
 * 核心共用数据类型。
 *
 * 这些都是 v1 真正落地、被 `ctx.log` / `ctx.capabilities` / `ctx.notifier` 使用
 * 的类型；DuckDB 持久化、能力矩阵等仍是目标态（见各文件内 TODO）。
 */
import type { CapabilityId } from './brand'

/** 一条追加式工作/事件日志记录（sessions/log 核心脊的 v1 内存实现）。 */
export interface LogEntry {
  /** 自增序号，追加即分配。 */
  id: number
  /** 事件名（如 'notify/request'）。 */
  event: string
  /** 记录负载（含 message、level 等）。 */
  data: unknown
  /** 单调壁钟时间戳（毫秒）。 */
  at: number
}

/** 一条通知道负载（见 `'notify/request'` 事件，@mode emit）。 */
export interface NotifyPayload {
  /** 通知正文。 */
  message: string
  /** 级别。 */
  level?: 'info' | 'warn' | 'error'
  /** 期望投递渠道（由 provider 自行决定是否采纳；缺省不设限）。 */
  channel?: string
}

/** 能力缝 `ctx.notifier` 的 Provider 契约（三角色之「提供方」）。 */
export interface NotifyProvider {
  /** provider 稳定 id（用于注册/注销与去重）。 */
  id: string
  /** 实际投递一条通知。 */
  send(payload: NotifyPayload): Promise<void> | void
}

/** 能力缝 `ctx.capabilities` 的可注册能力声明。 */
export interface CapabilityReg {
  id: CapabilityId
  label: string
}