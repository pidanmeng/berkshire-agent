/**
 * 默认定时任务（autopilot）：**应用启动同步 + 收盘同步**（S3-sync-autopilot）。
 *
 * 把 S2 既有能力（`ctx.marketTime` 的交易日/收盘判定 + `ctx.datasets`/`ctx.dataSources`
 * 同步编排 + 覆盖登记 seam）编织成**默认开箱即用的调度**，挂在 sidecar ready 之后：
 *
 * - **启动同步**：应用 ready 后**就近同步一次**各基础数据组（用 `ctx.marketTime` 判断交易日，
 *   节假日不盲拉全量——非交易日只刷 `calendar` 保持探针新鲜，不按全量市场数据拉取）。
 * - **收盘同步**：收盘（`isMarketClosed` + `beijingMinutesOfDay >= AFTERNOON_CLOSE_MIN`，
 *   含周末/节假日前的最后一个交易日收盘后）在交易日触发当日各数据组同步；交易日判定走
 *   `ctx.marketTime` 的日历探针降档链。
 *
 * **数据契约红线 / 单写者**：本调度只调 `runDatasetSync`（sidecar 同步编排，单写者唯一写入口，
 * docs/data-model.md §1），**不裸写 DuckDB**；覆盖登记复用 S2 seam（`runDatasetSync` 内部
 * `recordCoverage`），本包不另写。
 *
 * **失败语义（fail-closed + 自愈 + 可见）**：单组同步失败不拖垮整批（收集失败、记 WARNING、
 * 广播 `sync/failed`）；收盘同步用 `lastCloseRunDate` 持久化幂等（同交易日/重启不重复触发）；
 * 启动同步每进程一次、失败留痕自愈。
 *
 * **事件（`@mode emit`）**：`sync/started` / `sync/completed` / `sync/failed`，
 * 宿主/数据管理页可订阅刷新（见 events.ts 的 attachEventPusher 推送）。
 *
 * **配置（storage 偏好，loud-fail）**：ns `autopilot` / key `config`。缺失 → 内置默认
 * （**默认开箱即用**）；存在但非法 → `parseAutopilotConfig` **响亮抛错**（绝不 `?? default`
 * 藏值），attach 侧捕获降级为 WARNING 并停用该子项（自愈/可见，不崩进程）。
 *
 * 诚实边界：`ctx.scheduler`（core 目标态定时服务）仍未实现；本包在 **sidecar 侧**以进程内
 * `setTimeout`/interval 落地调度，shutdown 逆序清理不残留 tick。`generation` 原子发布、
 * 分区多文件粒度（S3-cache-performance 协同）仍目标态。
 */
import type { Context } from '@berkshire/cordis'
import type { DatasetId, StorageNamespaceId } from '@berkshire/core'
import { beijingMinutesOfDay } from '@berkshire/core'
import { runDatasetSync, type SyncResult } from './sync'
import '@berkshire/core'

/* ─── 同步事件增强（co-locate 到调度所属文件）─── */

declare module '@berkshire/cordis' {
  interface Events {
    /**
     * 一次定时同步开始（startup / close 批次）。
     * @mode emit
     * @param payload.trigger 触发源：`startup`（启动同步）| `close`（收盘同步）
     * @param payload.datasets 本次拟同步的数据组 id（品牌化 `DatasetId`）
     */
    'sync/started'(payload: { trigger: SyncTrigger; datasets: DatasetId[] }): void
    /**
     * 一次定时同步完成（成功组 + 失败组；失败组已在 WARNING 留痕）。
     * @mode emit
     * @param payload.trigger 触发源
     * @param payload.results 成功组（含 rows）
     * @param payload.failed 失败组（含 error）
     */
    'sync/completed'(payload: {
      trigger: SyncTrigger
      results: SyncResultItem[]
      failed: FailureItem[]
    }): void
    /**
     * 一批定时同步出现失败组（`@mode emit`，供宿主/数据管理页展示部分失败）。
     * @mode emit
     * @param payload.trigger 触发源
     * @param payload.failed 失败组（含 error）
     */
    'sync/failed'(payload: { trigger: SyncTrigger; failed: FailureItem[] }): void
  }
}

/* ─── 类型 ─── */

/** 定时同步的两类触发源。 */
export type SyncTrigger = 'startup' | 'close'

/** 一次成功同步的结果条目（`sync/completed` 载荷；dataset 为品牌化 `DatasetId`）。 */
export interface SyncResultItem {
  dataset: DatasetId
  rows: number
}

/** 失败组的错误条目（`sync/failed` / `sync/completed.failed` 载荷；dataset 为品牌化 `DatasetId`）。 */
export interface FailureItem {
  dataset: DatasetId
  error: string
}

/* ─── 配置 ─── */

/** 默认启动同步数据集（fuyao/enriched 可信可服务集；index/minute 依赖额外 provider 时经配置追加）。 */
export const AUTOPILOT_DEFAULT_STARTUP_DATASETS = ['calendar', 'daily', 'adj_factor', 'financial', 'enriched'] as const
/** 默认收盘同步数据集（当日各数据组；calendar 保持探针新鲜）。 */
export const AUTOPILOT_DEFAULT_CLOSE_DATASETS = ['calendar', 'daily', 'adj_factor', 'financial', 'enriched'] as const

/** 非交易日启动同步仍刷 `calendar`（保持日历探针新鲜，不盲拉全量市场数据）。 */
export const AUTOPILOT_OKEVENT_OFFDAY_DATASETS = ['calendar'] as const

/** 默认收盘重检间隔（ms，保守到 15:00 后 1 分钟内首个 tick 命中）。 */
export const AUTOPILOT_DEFAULT_CHECK_INTERVAL_MS = 60_000
/** 默认启动同步同 ready 后立即执行（无额外延迟）。 */
export const AUTOPILOT_DEFAULT_STARTUP_DELAY_MS = 0
/** 收盘判定参考：北京盘中分钟 ≥ 15:00。 */
export const AFTERNOON_CLOSE_MIN = 15 * 60

/** autopilot 配置（storage ns `autopilot` / key `config` 的反序列化契约定形）。 */
export interface AutopilotConfig {
  /** 总开关（默认 true）。 */
  enabled: boolean
  startup: {
    /** 启动同步开关（默认 true）。 */
    enabled: boolean
    /** ready 后延迟启动（ms；测试可注入）。 */
    delayMs: number
    /** 起点同步数据集 id 列表（需为 `[A-Za-z][A-Za-z0-9_-]*` 合法 dataset id）。 */
    datasets: string[]
  }
  close: {
    /** 收盘同步开关（默认 true）。 */
    enabled: boolean
    /** 收盘判定重检间隔（ms，>0）。 */
    checkIntervalMs: number
    /** 收盘同步数据集 id 列表。 */
    datasets: string[]
  }
}

/** 内置默认配置（缺失/未配置时使用；**不是**把非法值 `?? default` 藏成默认）。 */
export const AUTOPILOT_DEFAULT_CONFIG: AutopilotConfig = {
  enabled: true,
  startup: {
    enabled: true,
    delayMs: AUTOPILOT_DEFAULT_STARTUP_DELAY_MS,
    datasets: [...AUTOPILOT_DEFAULT_STARTUP_DATASETS],
  },
  close: {
    enabled: true,
    checkIntervalMs: AUTOPILOT_DEFAULT_CHECK_INTERVAL_MS,
    datasets: [...AUTOPILOT_DEFAULT_CLOSE_DATASETS],
  },
}

/** storage 命名空间 / 键。 */
const AUTOPILOT_NS = 'autopilot' as StorageNamespaceId
const AUTOPILOT_KEY = 'config'
/** 收盘幂等标记键（YYYY-MM-DD）。 */
const LAST_CLOSE_RUN_KEY = 'lastCloseRunDate'

/** dataset id 合法模式（与 `ctx.datasets` 同构白名单，防非法 id 列表）。 */
const DATASET_ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/

function assertBool(name: string, v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Error(`[autopilot] 配置 '${name}' 须为 boolean（loud-fail）`)
  return v
}

function assertPosNum(name: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`[autopilot] 配置 '${name}' 须为正数（loud-fail）`)
  }
  return v
}

function assertDatasets(name: string, v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.some((d) => typeof d !== 'string' || !DATASET_ID_RE.test(d))) {
    throw new Error(`[autopilot] 配置 '${name}' 须为非空合法 dataset id 列表（loud-fail）`)
  }
  return v as string[]
}

/**
 * 嵌套细分组（startup/close）解析：缺失 → `{}`（各字段按未配置取默认）；**存在但非对象**
 * （如字符串/数字/数组）→ 响亮抛错（loud-fail），绝不静默降级为默认藏值。
 */
function assertConfigObject(name: string, v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {}
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`[autopilot] 配置 '${name}' 须为对象（loud-fail）`)
  }
  return v as Record<string, unknown>
}

/**
 * 把 storage 读回的原始反序列化值解析成 `AutopilotConfig`。
 * 缺失 → 返回内置默认（默认开箱即用）；存在但任何字段非法 → **响亮抛错**（绝不静默藏值）。
 */
export function parseAutopilotConfig(raw: unknown): AutopilotConfig {
  // undefined / null → 未配置，用内置默认。
  if (raw === undefined || raw === null) return structuredClone(AUTOPILOT_DEFAULT_CONFIG)
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('[autopilot] 配置须为对象（loud-fail）')
  }
  const o = raw as Record<string, unknown>
  const enabled = o['enabled'] === undefined ? true : assertBool('enabled', o['enabled'])
  const startupRaw = assertConfigObject('startup', o['startup'])
  const closeRaw = assertConfigObject('close', o['close'])
  return {
    enabled,
    startup: {
      enabled: startupRaw['enabled'] === undefined ? true : assertBool('startup.enabled', startupRaw['enabled']),
      delayMs:
        startupRaw['delayMs'] === undefined
          ? AUTOPILOT_DEFAULT_STARTUP_DELAY_MS
          : startupRaw['delayMs'] === 0
            ? 0
            : assertPosNum('startup.delayMs', startupRaw['delayMs']),
      datasets:
        startupRaw['datasets'] === undefined
          ? [...AUTOPILOT_DEFAULT_STARTUP_DATASETS]
          : assertDatasets('startup.datasets', startupRaw['datasets']),
    },
    close: {
      enabled: closeRaw['enabled'] === undefined ? true : assertBool('close.enabled', closeRaw['enabled']),
      checkIntervalMs:
        closeRaw['checkIntervalMs'] === undefined
          ? AUTOPILOT_DEFAULT_CHECK_INTERVAL_MS
          : assertPosNum('close.checkIntervalMs', closeRaw['checkIntervalMs']),
      datasets:
        closeRaw['datasets'] === undefined
          ? [...AUTOPILOT_DEFAULT_CLOSE_DATASETS]
          : assertDatasets('close.datasets', closeRaw['datasets']),
    },
  }
}

/* ─── 触发判定（纯函数，可单测）─── */

/**
 * 启动同步的数据集选择：交易日 → 全量配置组；非交易日（周末/节假日，走 `marketTime`
 * 探针降档判定）→ 只刷 `calendar`（保持探针新鲜，**不盲拉**全量市场数据）。
 */
export function selectStartupDatasets(config: AutopilotConfig, isTrading: boolean): string[] {
  return isTrading ? [...config.startup.datasets] : [...AUTOPILOT_OKEVENT_OFFDAY_DATASETS]
}

/** 收盘触发判定：交易日 && 北京盘中分钟 ≥ 15:00（收盘后，含周末/节假日前最后一个交易日的收盘）。 */
export function hasReachedClose(isTrading: boolean, beijingMinutesOfDay: number): boolean {
  return isTrading && beijingMinutesOfDay >= AFTERNOON_CLOSE_MIN
}

/** 收盘同步幂等判定：当日尚未同步收盘（同比对比 `lastCloseRunDate`）。 */
export function closeDueForToday(lastCloseRunDate: string | null, today: string): boolean {
  return lastCloseRunDate !== today
}

/* ─── 装配侧依赖（测试可注入）─── */

/** autopilot 依赖面（默认从 ctx 构造；测试可注入纯假实现）。 */
export interface AutopilotDeps {
  emit(event: string, payload: unknown): void
  log(event: string, data?: unknown): void
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  readConfig(): Promise<unknown>
  readLastCloseRunDate(): Promise<string | null>
  writeLastCloseRunDate(date: string): Promise<void>
  cnToday(): string
  beijingMinutesOfDay(ms: number): number
  isTradingDay(iso: string): Promise<{ trading: boolean }>
  runSync(dataset: DatasetId, args: Record<string, unknown>): Promise<SyncResult>
}

/** 从真实 `ctx` 构造默认依赖面。 */
export function autopilotDepsFromCtx(ctx: Context): AutopilotDeps {
  return {
    emit: (event, payload) => ctx.emit(event as never, payload),
    log: (event, data) => ctx.log.append(event, data),
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    async readConfig() {
      try {
        return (await ctx.storage.get<unknown>(AUTOPILOT_NS, AUTOPILOT_KEY)) ?? null
      } catch (err) {
        // storage 不可用 → 视为未配置（默认），留痕可见。
        ctx.log.append('autopilot/config-read-failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      }
    },
    async readLastCloseRunDate() {
      try {
        return (await ctx.storage.get<string>(AUTOPILOT_NS, LAST_CLOSE_RUN_KEY)) ?? null
      } catch {
        return null
      }
    },
    async writeLastCloseRunDate(date) {
      try {
        await ctx.storage.set(AUTOPILOT_NS, LAST_CLOSE_RUN_KEY, date)
      } catch (err) {
        // 幂等标记写失败 → 不阻塞同步，留痕（下次可能重复，但同步本身幂等）。
        ctx.log.append('autopilot/last-close-write-failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },
    cnToday: () => ctx.marketTime.cnToday(),
    beijingMinutesOfDay: (ms) => beijingMinutesOfDay(ms),
    isTradingDay: async (iso) => ctx.marketTime.isTradingDay(iso),
    runSync: (dataset, args) => runDatasetSync(ctx, dataset, args),
  }
}

/* ─── 批次执行（事件 + 失败可见）─── */

/**
 * 执行一批定时同步：先广播 `sync/started`，逐个组 `runSync`（单组失败不中断，收集失败、
 * 记 WARNING、广播 `sync/failed`），最后广播 `sync/completed`。幂等由 `runDatasetSync`
 * 的整表替换语义保证（重复触发不累积）。
 */
export async function runSyncBatch(
  deps: AutopilotDeps,
  trigger: SyncTrigger,
  datasets: string[],
): Promise<void> {
  deps.emit('sync/started', { trigger, datasets: datasets as DatasetId[] })
  const results: SyncResultItem[] = []
  const failed: FailureItem[] = []
  for (const ds of datasets) {
    try {
      const r = await deps.runSync(ds as DatasetId, {})
      results.push({ dataset: ds as DatasetId, rows: r.rows })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      failed.push({ dataset: ds as DatasetId, error })
      deps.log('autopilot/failed', { trigger, dataset: String(ds), error })
    }
  }
  if (failed.length > 0) {
    deps.emit('sync/failed', { trigger, failed })
    deps.log('autopilot/completed', {
      trigger,
      ok: results.length,
      failed: failed.length,
      total: datasets.length,
    })
  } else {
    deps.log('autopilot/completed', { trigger, ok: results.length, total: datasets.length })
  }
  deps.emit('sync/completed', { trigger, results, failed })
}

/* ─── 装配（注册即效应，disposer 逆序清理）─── */

/**
 * 把默认定时任务挂到 ready 生命周期：启动同步（一次）+ 收盘同步（周期重检 + 幂等）。
 * 返回可撤销 disposer；shutdown 时逆序清除所有定时器，不残留 tick。所有副作用经
 * `ctx.effect` 包裹，卸载即撤销。
 */
export function attachAutopilot(ctx: Context, deps: AutopilotDeps = autopilotDepsFromCtx(ctx)): () => void {
  return ctx.effect(() => {
    let disposed = false
    let startupHandle: unknown | null = null
    let closeHandle: unknown | null = null
    // 防止启动/收盘批次并发重入（虽幂等，仍避免无谓并行）。
    let batchRunning = false

    const clearTimers = () => {
      if (startupHandle !== null) {
        deps.clearTimeout(startupHandle)
        startupHandle = null
      }
      if (closeHandle !== null) {
        deps.clearTimeout(closeHandle)
        closeHandle = null
      }
    }

    const scheduleClose = (ms: number) => {
      if (disposed) return
      closeHandle = deps.setTimeout(() => {
        closeHandle = null
        void tickClose()
      }, ms)
    }

    const scheduleStartup = (ms: number) => {
      if (disposed) return
      startupHandle = deps.setTimeout(() => {
        startupHandle = null
        void runStartupOnce()
      }, ms)
    }

    // 启动同步：ready 后延后 delayMs，就近同步一次。
    const runStartupOnce = async (): Promise<void> => {
      if (disposed || batchRunning) return
      let config: AutopilotConfig
      try {
        config = parseAutopilotConfig(await deps.readConfig())
      } catch (err) {
        // 配置非法 → loud-fail 留痕，停用（自愈/可见；不崩进程）。启动子项不再触发。
        deps.log('autopilot/config-error', {
          trigger: 'startup',
          error: err instanceof Error ? err.message : String(err),
        })
        return
      }
      if (disposed || !config.enabled || !config.startup.enabled) return
      batchRunning = true
      try {
        const today = deps.cnToday()
        const verdict = await deps.isTradingDay(today)
        const datasets = selectStartupDatasets(config, verdict.trading)
        await runSyncBatch(deps, 'startup', datasets)
      } finally {
        batchRunning = false
      }
    }

    // 收盘同步：周期重检，达到收盘判定且当日未同步 → 触发一次；幂等标记落 storage。
    const tickClose = async (): Promise<void> => {
      if (disposed) return
      let config: AutopilotConfig
      let intervalMs = AUTOPILOT_DEFAULT_CHECK_INTERVAL_MS
      try {
        config = parseAutopilotConfig(await deps.readConfig())
        intervalMs = config.close.checkIntervalMs
        if (disposed) return
        if (config.enabled && config.close.enabled && !batchRunning) {
          const now = deps.now()
          const today = deps.cnToday()
          const verdict = await deps.isTradingDay(today)
          const closed = hasReachedClose(verdict.trading, deps.beijingMinutesOfDay(now))
          const lastRun = await deps.readLastCloseRunDate()
          if (closed && closeDueForToday(lastRun, today)) {
            batchRunning = true
            try {
              await runSyncBatch(deps, 'close', config.close.datasets)
              await deps.writeLastCloseRunDate(today)
            } finally {
              batchRunning = false
            }
          }
        }
      } catch (err) {
        deps.log('autopilot/config-error', {
          trigger: 'close',
          error: err instanceof Error ? err.message : String(err),
        })
      }
      scheduleClose(intervalMs)
    }

    // 启动计时器：ready 后立即就近同步一次（无额外延迟；延迟字段兼容测试注入）。
    scheduleStartup(AUTOPILOT_DEFAULT_STARTUP_DELAY_MS)

    // 收盘周期：先安排一次（轮到判定后再续排）。
    void tickClose()

    return () => {
      disposed = true
      clearTimers()
    }
  })
}