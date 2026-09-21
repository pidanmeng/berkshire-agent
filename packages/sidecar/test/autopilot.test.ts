/**
 * S3 默认定时任务（autopilot：启动同步 + 收盘同步）单测。
 *
 * 覆盖：
 * - **配置 loud-fail**：`parseAutopilotConfig` 缺失 → 默认；非法 → 响亮抛错（绝不 `?? default` 藏值）；
 * - **触发源判定（纯函数）**：`selectStartupDatasets`（交易日全量 / 非交易日只刷 calendar）、
 *   `hasReachedClose`（交易日 && 盘中 ≥ 15:00）、`closeDueForToday`（次日/幂等）；
 * - **批次执行**：`runSyncBatch` 成功广播 `sync/started`/`sync/completed`；单组失败不中断、记 WARNING、
 *   广播 `sync/failed`（失败可见，不静默）；
 * - **装配**：`attachAutopilot` 用注入的假 deps（可控时钟/定时器）验证启动同步触发、收盘幂等、
 *   disposer 逆序清除定时器（shutdown 不残留 tick）。
 *
 * 运行：`bun test packages/sidecar/test/autopilot.test.ts`（纯内存，无 DuckDB / 无网络）。
 */
import { describe, expect, test } from 'bun:test'
import type { DatasetId, StorageNamespaceId } from '@berkshire/core'
import type { SyncResult } from '../src/sync'
import {
  attachAutopilot,
  autopilotDepsFromCtx,
  parseAutopilotConfig,
  selectStartupDatasets,
  hasReachedClose,
  closeDueForToday,
  runSyncBatch,
  AUTOPILOT_DEFAULT_CONFIG,
  AFTERNOON_CLOSE_MIN,
  AUTOPILOT_OKEVENT_OFFDAY_DATASETS,
  type AutopilotConfig,
  type AutopilotDeps,
} from '../src/autopilot'

/* ─── 假定时器 + 假 deps（可控时钟，确定性）─── */

/** 最小假 ctx：只需 `effect`（execute 回调并透传 disposer），供 attachAutopilot 用。 */
function fakeCtx() {
  return { effect: <T,>(fn: () => T): T => fn() } as never
}

interface FakeTimer {
  handle: number
  fn: () => void
  ms: number
}

interface FakeDepsOpts {
  config?: AutopilotConfig | unknown
  now?: number
  beijingMinutes?: number
  today?: string
  trading?: boolean
  lastCloseRunDate?: string | null
  syncImpl?: (dataset: DatasetId) => SyncResult
}

function makeDeps(opts: FakeDepsOpts = {}) {
  const syncCalls: DatasetId[] = []
  const logCalls: Array<{ event: string; data?: unknown }> = []
  const events: Array<{ event: string; payload: unknown }> = []
  const timers: FakeTimer[] = []
  let nextHandle = 1
  const writtenCloseDate: string[] = []
  let storedConfig: unknown = opts.config ?? null
  let storedLastClose = opts.lastCloseRunDate ?? null

  const deps: AutopilotDeps = {
    emit: (event, payload) => events.push({ event, payload }),
    log: (event, data) => logCalls.push({ event, data }),
    now: () => opts.now ?? 0,
    setTimeout: (fn, ms) => {
      const handle = nextHandle++
      timers.push({ handle, fn, ms })
      return handle
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.handle === handle)
      if (i >= 0) timers.splice(i, 1)
    },
    async readConfig() {
      return storedConfig
    },
    async readLastCloseRunDate() {
      return storedLastClose
    },
    async writeLastCloseRunDate(date) {
      storedLastClose = date
      writtenCloseDate.push(date)
    },
    cnToday: () => opts.today ?? '2025-01-06',
    beijingMinutesOfDay: () => opts.beijingMinutes ?? AFTERNOON_CLOSE_MIN + 5,
    isTradingDay: async () => ({ trading: opts.trading ?? true }),
    async runSync(dataset) {
      syncCalls.push(dataset)
      if (opts.syncImpl) return opts.syncImpl(dataset)
      return { dataset, rows: 2, at: Date.now() }
    },
  }

  function runTimer(fn: () => void) {
    // 执行被排队的回调；startup/close 回调内部会 await 多处，需并发冲洗微任务+宏任务。
    fn()
    return flush()
  }
  // 冲掉 async 链（readConfig → isTradingDay → runSyncBatch → runSync 的多级 await）。
  async function flush(rounds = 8) {
    for (let i = 0; i < rounds; i++) {
      await new Promise<void>((r) => setImmediate(r))
    }
  }

  return {
    deps,
    timers,
    syncCalls,
    logCalls,
    events,
    writtenCloseDate,
    flush,
    get storedLastClose() {
      return storedLastClose
    },
    get storedConfig() {
      return storedConfig
    },
    setStoredConfig(c: unknown) {
      storedConfig = c
    },
    runTimer,
  }
}

/* ─── 配置解析（loud-fail）─── */

describe('parseAutopilotConfig · loud-fail', () => {
  test('缺失（undefined/null）→ 内置默认（默认开箱即用）', () => {
    const a = parseAutopilotConfig(undefined)
    const b = parseAutopilotConfig(null)
    expect(a).toEqual(AUTOPILOT_DEFAULT_CONFIG)
    expect(b).toEqual(AUTOPILOT_DEFAULT_CONFIG)
    expect(a.enabled).toBe(true)
    expect(a.startup.enabled).toBe(true)
    expect(a.close.enabled).toBe(true)
  })

  test('非法类型 → 响亮抛错（绝不 ?? default 藏值）', () => {
    expect(() => parseAutopilotConfig('nope')).toThrow(/配置须为对象/)
    expect(() => parseAutopilotConfig([])).toThrow(/配置须为对象/)
    expect(() => parseAutopilotConfig({ enabled: 'yes' })).toThrow(/enabled.*boolean/)
    expect(() => parseAutopilotConfig({ startup: { enabled: 1 } })).toThrow(/startup.enabled.*boolean/)
    expect(() => parseAutopilotConfig({ close: { checkIntervalMs: -5 } })).toThrow(/checkIntervalMs.*正数/)
    expect(() => parseAutopilotConfig({ startup: { datasets: ['bad id!'] } })).toThrow(/dataset id 列表/)
    // 嵌套细分本身非对象（字符串/数字/数组）→ 响亮抛错，绝不静默降级为默认。
    expect(() => parseAutopilotConfig({ startup: 'garbage' })).toThrow(/startup.*须为对象/)
    expect(() => parseAutopilotConfig({ close: 42 })).toThrow(/close.*须为对象/)
    expect(() => parseAutopilotConfig({ startup: [] })).toThrow(/startup.*须为对象/)
  })

  test('部分合法配置 → 与默认合并（缺字段用默认，非法字段仍抛错）', () => {
    const c = parseAutopilotConfig({ enabled: false, close: { checkIntervalMs: 5000 } })
    expect(c.enabled).toBe(false)
    expect(c.close.checkIntervalMs).toBe(5000)
    expect(c.startup.enabled).toBe(true) // 缺省
    expect(c.startup.datasets).toEqual([...AUTOPILOT_DEFAULT_CONFIG.startup.datasets])
  })
})

/* ─── 触发源判定（纯函数）─── */

describe('启动同步触发源', () => {
  test('交易日 → 全量配置组', () => {
    const c = AUTOPILOT_DEFAULT_CONFIG
    expect(selectStartupDatasets(c, true)).toEqual([...c.startup.datasets])
  })

  test('非交易日（节假日/周末）→ 只刷 calendar，不盲拉全量', () => {
    const c = AUTOPILOT_DEFAULT_CONFIG
    expect(selectStartupDatasets(c, false)).toEqual([...AUTOPILOT_OKEVENT_OFFDAY_DATASETS])
  })
})

describe('收盘触发源（hasReachedClose）', () => {
  test('交易日 && 盘中分钟 ≥ 15:00 → 触发', () => {
    expect(hasReachedClose(true, AFTERNOON_CLOSE_MIN)).toBe(true)
    expect(hasReachedClose(true, AFTERNOON_CLOSE_MIN + 30)).toBe(true)
  })

  test('交易日但盘中 < 15:00（盘中）→ 不触发', () => {
    expect(hasReachedClose(true, AFTERNOON_CLOSE_MIN - 1)).toBe(false)
  })

  test('非交易日（节假日/周末收盘后）→ 不触发（不盲拉全量）', () => {
    expect(hasReachedClose(false, AFTERNOON_CLOSE_MIN + 60)).toBe(false)
  })
})

describe('收盘幂等 / 次日判定（closeDueForToday）', () => {
  test('当日已同步 → 不重复触发', () => {
    expect(closeDueForToday('2025-01-06', '2025-01-06')).toBe(false)
  })
  test('跨到下一交易日（次日）→ 重新触发', () => {
    expect(closeDueForToday('2025-01-06', '2025-01-07')).toBe(true)
  })
  test('从未同步 → 触发', () => {
    expect(closeDueForToday(null, '2025-01-06')).toBe(true)
  })
})

/* ─── 批次执行（事件 + 失败可见）─── */

describe('runSyncBatch · 事件 + 失败可见', () => {
  test('成功组广播 sync/started + sync/completed（零失败）', async () => {
    const { deps, events } = makeDeps()
    await runSyncBatch(deps, 'startup', ['daily', 'calendar'])
    expect(events[0]).toEqual({ event: 'sync/started', payload: { trigger: 'startup', datasets: ['daily', 'calendar'] } })
    const completed = events[events.length - 1] as { event: string; payload: { trigger: string; results: unknown[]; failed: unknown[] } }
    expect(completed.event).toBe('sync/completed')
    expect(completed.payload.results).toHaveLength(2)
    expect(completed.payload.failed).toEqual([])
  })

  test('单组失败不中断整批；记 WARNING + 广播 sync/failed（失败可见，不静默）', async () => {
    const { deps, events, logCalls } = makeDeps({
      syncImpl: (ds) => {
        if (String(ds) === 'daily') throw new Error('上游取数失败（fake）')
        return { dataset: ds, rows: 1, at: 0 }
      },
    })
    await runSyncBatch(deps, 'close', ['daily', 'calendar'])
    // 成功组仍正常返回
    const completed = events[events.length - 1] as { event: string; payload: { results: Array<{ dataset: string }>; failed: Array<{ dataset: string; error: string }> } }
    expect(completed.payload.results.map((r) => r.dataset)).toEqual(['calendar'])
    // 失败组可见：sync/failed 事件 + WARNING log
    const failedEvt = events.find((e) => e.event === 'sync/failed')
    expect(failedEvt).toEqual({
      event: 'sync/failed',
      payload: { trigger: 'close', failed: [{ dataset: 'daily', error: '上游取数失败（fake）' }] },
    })
    expect(logCalls.some((l) => l.event === 'autopilot/failed' && l.data && (l.data as { dataset: string }).dataset === 'daily')).toBe(true)
  })
})

/* ─── 装配（启动触发 + 收盘幂等 + disposer 逆序清理）─── */

describe('attachAutopilot · 装配', () => {
  test('启动同步：ready 后触发一次，交易日同步全量配置组', async () => {
    const { deps, timers, syncCalls, runTimer } = makeDeps({ trading: true, beijingMinutes: 0 }) // 盘中，避免收盘 tick 干扰
    const detach = attachAutopilot(fakeCtx(), deps)
    // 启动定时器已排（ms=0）；触发它。
    const startupTimer = timers.find((t) => t.ms === 0)
    expect(startupTimer).toBeDefined()
    await runTimer(startupTimer!.fn)
    expect(syncCalls.length).toBe(AUTOPILOT_DEFAULT_CONFIG.startup.datasets.length)
    detach()
  })

  test('启动同步：非交易日只刷 calendar（不盲拉）', async () => {
    const { deps, timers, syncCalls, runTimer } = makeDeps({ trading: false })
    const detach = attachAutopilot(fakeCtx(), deps)
    const startupTimer = timers.find((t) => t.ms === 0)
    await runTimer(startupTimer!.fn)
    expect(syncCalls.map(String)).toEqual([...AUTOPILOT_OKEVENT_OFFDAY_DATASETS])
    detach()
  })

  test('收盘同步：达到收盘判定（交易日 15:00 后）触发一次；当日重复 tick 幂等', async () => {
    const { deps, timers, syncCalls, runTimer, writtenCloseDate, flush } = makeDeps({
      trading: true,
      beijingMinutes: AFTERNOON_CLOSE_MIN,
      today: '2025-01-06',
      lastCloseRunDate: null,
    })
    const detach = attachAutopilot(fakeCtx(), deps)
    await flush() // tickClose 异步排班收盘定时器
    // 收盘周期：第一个 tick（ms=checkIntervalMs）触发判定 → 同步 + 写幂等标记。
    const closeTimer = timers.find((t) => t.ms > 0)
    expect(closeTimer).toBeDefined()
    await runTimer(closeTimer!.fn)
    expect(syncCalls.length).toBe(AUTOPILOT_DEFAULT_CONFIG.close.datasets.length)
    expect(writtenCloseDate).toEqual(['2025-01-06'])

    // 同交易日再次 tick → 幂等，不重复同步（lastCloseRunDate === today）。
    await flush()
    const before = syncCalls.length
    const rearm = timers.slice().reverse().find((t) => t.ms > 0)
    await runTimer(rearm!.fn)
    expect(syncCalls.length).toBe(before) // 未重复
    detach()
  })

  test('收盘同步：非交易日（节假日收盘后）不触发', async () => {
    const { deps, timers, syncCalls, runTimer, flush } = makeDeps({
      trading: false,
      beijingMinutes: AFTERNOON_CLOSE_MIN,
      today: '2025-01-05',
      lastCloseRunDate: null,
    })
    const detach = attachAutopilot(fakeCtx(), deps)
    await flush()
    const closeTimer = timers.find((t) => t.ms > 0)
    await runTimer(closeTimer!.fn)
    expect(syncCalls.length).toBe(0) // 不盲拉
    detach()
  })

  test('配置非法（loud-fail）：停用、留痕，不崩进程、不触发同步', async () => {
    const { deps, timers, syncCalls, logCalls, runTimer } = makeDeps({ config: { enabled: 'oops' } })
    const detach = attachAutopilot(fakeCtx(), deps)
    const startupTimer = timers.find((t) => t.ms === 0)
    await runTimer(startupTimer!.fn)
    expect(syncCalls.length).toBe(0)
    expect(logCalls.some((l) => l.event === 'autopilot/config-error' && l.data && (l.data as { trigger: string }).trigger === 'startup')).toBe(true)
    detach()
  })

  test('disposer 逆序清理：detach 后不再保留/触发任何 tick（shutdown 不残留）', async () => {
    const { deps, timers } = makeDeps({ trading: true })
    const detach = attachAutopilot(fakeCtx(), deps)
    const before = timers.length
    expect(before).toBeGreaterThan(0)
    detach()
    // 全部定时器已清除；且不会再有新排队。
    expect(timers.length).toBe(0)
  })

  test('全局禁用（config.enabled=false）：两个触发源都不跑', async () => {
    const { deps, timers, syncCalls, runTimer } = makeDeps({ config: { enabled: false } })
    const detach = attachAutopilot(fakeCtx(), deps)
    for (const t of [...timers]) await runTimer(t.fn)
    expect(syncCalls.length).toBe(0)
    detach()
  })
})

/* ─── 真实 deps 构造（对齐真实 ctx + storage）─── */

describe('autopilotDepsFromCtx · 真实 ctx', () => {
  test('读取 storage 命名空间 autopilot / 键 config（未配置 → null，走默认）', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const corePlug = await import('@berkshire/core')
    const { Boot } = await import('@berkshire/boot')
    const { createFileStorageProvider } = await import('../src/storage-provider')
    const home = mkdtempSync(join(tmpdir(), 'bk-autopilot-ctx-'))
    const boot = new Boot()
    try {
      await boot.install(
        { id: 'core', name: '@berkshire/core' },
        (n) => ({ '@berkshire/core': corePlug })[n] as never,
      )
      boot.ctx.storage.register(createFileStorageProvider(home))
      const deps = autopilotDepsFromCtx(boot.ctx)
      expect(await deps.readConfig()).toBeNull() // 未配置 → null（走默认）
      expect(deps.cnToday()).toBe(boot.ctx.marketTime.cnToday())
      await deps.writeLastCloseRunDate('2025-01-06')
      expect(await deps.readLastCloseRunDate()).toBe('2025-01-06')
      // 幂等标记落 storage（真实文件，非内存）
      const raw = await boot.ctx.storage.get('autopilot' as StorageNamespaceId, 'lastCloseRunDate')
      expect(raw).toBe('2025-01-06')
    } finally {
      await boot.dispose()
      rmSync(home, { recursive: true, force: true })
    }
  })
})