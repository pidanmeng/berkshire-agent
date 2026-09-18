import { Service } from 'cordis'
import type { Context } from 'cordis'
import type { LogEntry } from '../types'

/**
 * `ctx.log` —— 追加式工作/事件日志（核心脊 sessions/log 的 v1 内存实现）。
 *
 * 目标态：由 `sessions`/`log` 落 DuckDB，跨重载存活（见 docs/architecture.md §2 / §6、
 * docs/capability-seams.md §2）。v1 仅实现**进程内追加式内存日志**，用于记录在途工作
 * 与事件，证明「追加、不可变、可回读」的脊语义；持久化留 TODO（v2）。
 */
export class LogService extends Service {
  private entries: LogEntry[] = []
  private nextId = 1

  constructor(ctx: Context) {
    super(ctx, 'log')
  }

  /** 追加一条记录，返回不可变序号。 */
  append(event: string, data: unknown = undefined): LogEntry {
    const entry: LogEntry = { id: this.nextId++, event, data, at: Date.now() }
    this.entries.push(entry)
    return entry
  }

  /** 当前已记录条数（快照）。 */
  get count(): number {
    return this.entries.length
  }

  /** 追加式只读快照（返回拷贝，调用方无法改写内部数组）。 */
  list(): readonly LogEntry[] {
    return this.entries.slice()
  }

  /** 按事件名过滤（含按区间索引的有序子集）。 */
  filter(event: string): readonly LogEntry[] {
    return this.entries.filter((entry) => entry.event === event)
  }

  // TODO(v2): 持久化到 DuckDB `sessions_log` 表；跨重载存活。当前为目标态。
}