import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { LogEntry } from '../types'

// ctx.log —— 服务类型增强 co-locate 到这里（DSH「类型跟着服务走」，见 docs/capability-seams.md §1）
declare module '@berkshire/cordis' {
  interface Context {
    log: LogService
  }
}

/**
 * `ctx.log` 的**插件组件**（路径 A：服务「随处定义随处消费」的示范）。
 *
 * 这让 `log` 成为一个**可独立装载的 Cordis 插件**（自注册 `ctx.log`）——不再需要透过
 * `@berkshire/core` 的 `core.ts` 集中 `new`。任何装配方都能按需 `ctx.plugin(Log, {...})`，
 * DSH 的 `TimerService` 正是这种「Service 类作为插件组件、随装配装载」的形态。
 *
 * `LogService` 仍是 `Service` 子类（构造即 `super(ctx,'log')` 自注册）；本插件只是把它
 * 变成「谁需要谁装载」的装配单元。核心脊 `core.ts` 默认装载它（见 core.ts），故现有
 * `inject:['log']` 消费方（boot/sidecar/notify-console/demo）无需任何改动。
 */
export const Log = {
  name: '@berkshire/core/log',

  inject: [] as string[],

  Config: undefined,

  apply(ctx: Context): void {
    new LogService(ctx)
  },
}

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