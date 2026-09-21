/**
 * sidecar 进程级端到端测试（T4）：
 * - spawn 真实 `bun run src/index.ts` 后，四方法 round-trip；
 * - sidecar 内部事件经 {event,payload} 推送到 stdout（本用例覆盖 notify/request）；
 * - shutdown 后逆序销毁顺序（notify-console -> core）写入 stderr、exit code 0。
 *
 * 与 protocol.test.ts（进程内纯函数）互补，覆盖「字节级进出真实子进程」的整条链路。
 * 运行：`bun test packages/sidecar/test`（需仓库根装好依赖、bun 在 PATH）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve, join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, test, beforeAll, afterAll } from 'bun:test'

const ENTRY = resolve(import.meta.dir, '../src/index.ts')
// 装配由夹具 `$BK_HOME/cordis.yml`（core + notify-console + demo）驱动，但持久化写到**临时** home，
// 避免 storage 写入污染仓库 fixtures（KP2 持久化 demo 落 `$BK_HOME/state/`）。
// 用 setBkHome 写成环境变量，spawn 时被子进程继承（BK_HOME 是临时夹具路径，非真实用户 home）。
import { setBkHome } from '@berkshire/boot'
const FIXTURE_BK_HOME = resolve(import.meta.dir, 'fixtures/bk-home')

let TEMP_HOME: string
beforeAll(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), 'bk-sidecar-test-'))
  writeFileSync(
    join(TEMP_HOME, 'cordis.yml'),
    readFileSync(join(FIXTURE_BK_HOME, 'cordis.yml'), 'utf8'),
  )
  setBkHome(TEMP_HOME)
})
afterAll(() => {
  if (TEMP_HOME) rmSync(TEMP_HOME, { recursive: true, force: true })
})

interface Push {
  event: string
  payload: Record<string, unknown>
}
type Reply = { id: number; result?: unknown; error?: { code: number; message: string } }

interface Client {
  request(method: string, params?: Record<string, unknown>): Promise<Reply>
  waitEvent(pred: (e: Push) => boolean, timeoutMs?: number): Promise<Push>
  waitExit(): Promise<number | null>
  stderrLines(): string[]
}

/** 拉起 sidecar 并附一个最小的 ndjson RPC 客户端 + stderr 收集器。 */
function startSidecar(): Client & { stop(): void } {
  const child: ChildProcess = spawn('bun', ['run', ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] })
  const stderr: string[] = []
  child.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()))

  let seq = 0
  const pending = new Map<number, (r: Reply) => void>()
  const events: Push[] = []
  const waiters: Array<(e: Push) => void> = []

  createInterface({ input: child.stdout! }).on('line', (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: unknown
    try {
      msg = JSON.parse(trimmed)
    } catch {
      // 非 ndjson 的 stdout（诊断/杂讯）不当作 RPC 帧，避免未捕获异常崩掉测试进程。
      return
    }
    if (msg && typeof msg === 'object' && 'event' in (msg as Record<string, unknown>)) {
      const push = msg as Push
      events.push(push)
      for (const w of [...waiters]) w(push)
      return
    }
    const record = msg as { id?: unknown }
    if (typeof record?.id === 'number') {
      const fn = pending.get(record.id)
      if (fn) {
        pending.delete(record.id)
        fn(record as unknown as Reply)
      }
    }
  })

  return {
    request(method, params = {}) {
      const id = ++seq
      child.stdin!.write(`${JSON.stringify({ id, method, params })}\n`)
      return new Promise((res) => pending.set(id, res))
    },
    waitEvent(pred, timeoutMs = 5000) {
      const hit = events.find(pred)
      if (hit) return Promise.resolve(hit)
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error('事件超时未收到')), timeoutMs)
        const waiter = (e: Push) => {
          if (pred(e)) {
            const i = waiters.indexOf(waiter)
            if (i >= 0) waiters.splice(i, 1)
            clearTimeout(timer)
            res(e)
          }
        }
        waiters.push(waiter)
      })
    },
    waitExit() {
      // 用 child 'close' 而非 'exit'：close 在 stdio 均已关闭后触发，
      // 保证断言前置重 stderr 的末帧也已送达，避免 data-vs-exit 竞争。
      return new Promise((res) => child.on('close', (code) => res(code)))
    },
    stderrLines() {
      return stderr
    },
    stop() {
      child.kill()
    },
  }
}

describe('sidecar 进程端到端', () => {
  test('四方法 round-trip + 事件推送 + shutdown 逆序销毁顺序 + 退出码 0', async () => {
    const s = startSidecar()
    try {
      const caps = await s.request('capabilities/list')
      expect(caps.error).toBeUndefined()
      const arr = caps.result as Array<{ id: string; usable: boolean }>
      expect(arr.some((c) => c.id === 'notify-console' && c.usable === true)).toBe(true)

      const delivered = await s.request('notify/send', { message: 'roundtrip', level: 'info' })
      expect((delivered.result as string[]).includes('notify-console')).toBe(true)

      // 事件推送：sidecar 内部 notify/request → stdout {event,payload}
      const pushed = await s.waitEvent((e) => e.event === 'notify/request' && e.payload?.message === 'roundtrip')
      expect(pushed.event).toBe('notify/request')

      const usable = await s.request('capabilities/usable', { id: 'notify-console' })
      expect(usable.result).toBe(true)

      const logs = await s.request('log/list')
      expect((logs.result as Array<{ event: string }>).some((e) => e.event === 'notify/request')).toBe(true)
      // demo 插件（Consumer)挂载时经 ctx.storage 写一条 lastBootAt 并在 log 留痕（WP-2）。
      expect((logs.result as Array<{ event: string }>).some((e) => e.event === 'demo/storage')).toBe(true)

      // storage 持久化（WP-2）：set → get 读回 + storage/changed 事件推送。
      const stSet = await s.request('storage/set', { ns: 'demo', key: 'kv', value: { a: 1, b: 'x' } })
      expect(stSet.error).toBeUndefined()
      const stGet = await s.request('storage/get', { ns: 'demo', key: 'kv' })
      expect(stGet.error).toBeUndefined()
      expect(stGet.result).toEqual({ a: 1, b: 'x' })
      await s.waitEvent((e) => e.event === 'storage/changed' && e.payload?.key === 'kv')
      const stList = await s.request('storage/list', { ns: 'demo' })
      expect((stList.result as string[]).includes('kv')).toBe(true)

      // 数据基座常驻（S1 升权）：即使用户 cordis.yml 不声明数据插件，数据平台也始终可用——
      // data-sources/list 列出 fuyao/csv provider、client/list 含 data-manager 数据管理页。
      const ds = await s.request('data-sources/list')
      expect(ds.error).toBeUndefined()
      const dsResult = ds.result as { providers: Array<{ id: string }> }
      const providers = dsResult.providers.map((p) => p.id)
      expect(providers).toContain('fuyao')
      expect(providers).toContain('csv')
      const cmods = await s.request('client/list')
      expect((cmods.result as Array<{ id: string }>).some((m) => m.id === 'data-manager')).toBe(true)

      const unknown = await s.request('no/such/method')
      expect(unknown.error?.code).toBe(-32601)

      // shutdown → 退出码 0
      const sh = await s.request('shutdown')
      expect(sh.error).toBeUndefined()
      expect(await s.waitExit()).toBe(0)

      // 逆序销毁顺序写入 stderr（waitExit 等待 close，末帧已送达）。
      // S1 升权后装配顺序 = core → [数据基座 fuyao/csv/data-manager] → notify-console → demo，
      // 后装先卸故顺序为 demo -> notify-console -> data-manager -> csv -> fuyao -> core。
      expect(s.stderrLines().join('')).toContain(
        'dispose order = demo -> notify-console -> data-manager -> datasource-csv -> datasource-fuyao -> core',
      )
    } finally {
      s.stop()
    }
  }, 15000)

  test('storage 跨重启持久化：写值 → shutdown → 重启同 home → 读回（DoD）', async () => {
    const s1 = startSidecar()
    try {
      const st = await s1.request('storage/set', { ns: 'demo', key: 'persist', value: { kept: true } })
      expect(st.error).toBeUndefined()
      await s1.request('shutdown')
      expect(await s1.waitExit()).toBe(0)
    } finally {
      s1.stop()
    }

    // 重启：新 sidecar 用同一 $BK_HOME → 磁盘值仍在（$BK_HOME/state/<ns>/<key>.json）。
    const s2 = startSidecar()
    try {
      const got = await s2.request('storage/get', { ns: 'demo', key: 'persist' })
      expect(got.error).toBeUndefined()
      expect(got.result).toEqual({ kept: true })
      await s2.request('shutdown')
      expect(await s2.waitExit()).toBe(0)
    } finally {
      s2.stop()
    }
  }, 30000)
})
