/**
 * sidecar 冒烟脚本：把 sidecar 当子进程拉起，逐行发请求、校验响应与事件推送。
 *
 * 覆盖 T1 验收：四方法 round-trip + 事件推送 + fail-closed 未知方法 + shutdown 退出码 0；
 * 并隐式校验「stdout 只承载协议」（若任何非 JSON 行出现（如 echo 泄漏）即失败）。
 *
 * 运行：`bun run packages/sidecar/examples/smoke.ts`（或 `bun run smoke --cwd packages/sidecar`）。
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve, join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { setBkHome } from '@berkshire/boot'

const ENTRY = resolve(import.meta.dir, '../src/index.ts')
// 冒烟从夹具 cordis.yml（core+notify+demo）装配，但持久化写到**临时** $BK_HOME，
// 避免 WP-2 storage 写入污染仓库 fixtures。真实用户 home 由宿主在 M3 提供初值。
const FIXTURE = resolve(import.meta.dir, '../test/fixtures/bk-home')
const HOME = mkdtempSync(join(tmpdir(), 'bk-sidecar-smoke-'))
writeFileSync(join(HOME, 'cordis.yml'), readFileSync(join(FIXTURE, 'cordis.yml'), 'utf8'))
setBkHome(HOME)

interface PushMsg {
  event: string
  payload: Record<string, unknown>
}
interface Reply {
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

function fail(msg: string): never {
  console.error(`✖ ${msg}`)
  process.exit(1)
}

function startSidecar() {
  const child: ChildProcess = spawn('bun', ['run', ENTRY], { stdio: ['pipe', 'pipe', 'pipe'] })
  child.stderr?.on('data', (d: Buffer) => process.stdout.write(`[sidecar·stderr] ${d.toString()}`))

  let seq = 0
  const pending = new Map<number, (r: Reply) => void>()
  const events: PushMsg[] = []
  const waiters: Array<(e: PushMsg) => boolean> = []

  createInterface({ input: child.stdout! }).on('line', (line: string) => {
    let msg: unknown
    try {
      msg = JSON.parse(line)
    } catch {
      fail(`stdout 出现非协议行（echo 泄漏?）: ${JSON.stringify(line)}`)
    }
    const obj = msg as Record<string, unknown>
    if ('event' in obj) {
      const push = obj as unknown as PushMsg
      events.push(push)
      for (const w of waiters) w(push)
      return
    }
    if (typeof obj.id === 'number') {
      const replyFn = pending.get(obj.id as number)
      if (replyFn) {
        pending.delete(obj.id as number)
        replyFn(obj as unknown as Reply)
      }
    }
  })

  function request(method: string, params: Record<string, unknown> = {}): Promise<Reply> {
    const id = ++seq
    child.stdin!.write(`${JSON.stringify({ id, method, params })}\n`)
    return new Promise((res) => pending.set(id, res))
  }
  function waitEvent(pred: (e: PushMsg) => boolean, timeoutMs = 5000): Promise<PushMsg> {
    const hit = events.find(pred)
    if (hit) return Promise.resolve(hit)
    return new Promise((res, rej) => {
      waiters.push((e) => {
        if (pred(e)) {
          res(e)
          return true
        }
        return false
      })
      setTimeout(() => rej(new Error('事件超时未收到')), timeoutMs)
    })
  }
  function exitCode(): Promise<number | null> {
    return new Promise((res) => child.on('exit', (code) => res(code)))
  }

  return { request, waitEvent, exitCode }
}

async function main(): Promise<void> {
  const started = Date.now()
  const s = startSidecar()

  const caps = await s.request('capabilities/list')
  if (caps.error) fail(`capabilities/list error: ${caps.error.message}`)
  const arr = caps.result as Array<{ id: string; label: string; usable: boolean }>
  const notifyCap = arr.find((c) => c.id === 'notify-console')
  if (!notifyCap || notifyCap.usable !== true) {
    fail(`capabilities/list 应含 usable:true 的 notify-console，got ${JSON.stringify(arr)}`)
  }
  console.log('✓ capabilities/list →', JSON.stringify(arr))

  const delivered = await s.request('notify/send', { message: 'smoke 测试通知', level: 'info' })
  if (delivered.error) fail(`notify/send error: ${delivered.error.message}`)
  const dl = delivered.result as string[]
  if (!dl.includes('notify-console')) fail(`notify/send 未投递到 notify-console: ${JSON.stringify(dl)}`)
  console.log('✓ notify/send →', JSON.stringify(dl))

  const pushed = await s.waitEvent(
    (e) => e.event === 'notify/request' && e.payload?.message === 'smoke 测试通知',
  )
  console.log('✓ 事件推送 notify/request →', JSON.stringify(pushed))

  const usable = await s.request('capabilities/usable', { id: 'notify-console' })
  if (usable.error || usable.result !== true) fail('capabilities/usable 应为 true')
  console.log('✓ capabilities/usable → true')

  const logs = await s.request('log/list')
  const logArr = logs.result as Array<{ event: string }>
  if (!logArr.some((e) => e.event === 'notify/request')) fail('log/list 未包含 notify/request 记录')
  console.log(`✓ log/list → ${logArr.length} 条（含 notify/request）`)

  const clients = await s.request('client/list')
  if (clients.error) fail(`client/list error: ${clients.error.message}`)
  const carr = clients.result as Array<{ id: string; slot: string; url: string; exportName?: string }>
  const byId = new Map(carr.map((c) => [c.id, c]))
  if (carr.length !== 7) fail(`T3 demo 插件应注册 7 个 client 模块，got ${JSON.stringify(carr)}`)
  const footer = byId.get('demo-fund-flow')
  if (!footer || footer.slot !== 'stock-preview.footer' || !footer.url || footer.exportName !== 'DemoFundFlow') {
    fail(`client/list 应含 demo-fund-flow → stock-preview.footer(url/exportName)，got ${JSON.stringify(carr)}`)
  }
  if (!byId.has('demo-watchlist-toolbar')) {
    fail(`client/list 应含 demo-watchlist-toolbar，got ${JSON.stringify(carr)}`)
  }
  const menu = byId.get('demo-money-flow')
  if (!menu || menu.slot !== 'analysis.menu' || menu.exportName !== 'DemoMoneyFlow') {
    fail(`client/list 应含 demo-money-flow → analysis.menu，got ${JSON.stringify(carr)}`)
  }
  const navExtra = byId.get('demo-nav-extra')
  if (!navExtra || navExtra.slot !== 'layout.navigation.extra') {
    fail(`client/list 应含 demo-nav-extra → layout.navigation.extra，got ${JSON.stringify(carr)}`)
  }
  const statusItem = byId.get('demo-status-item')
  if (!statusItem || statusItem.slot !== 'layout.statusbar.right') {
    fail(`client/list 应含 demo-status-item → layout.statusbar.right，got ${JSON.stringify(carr)}`)
  }
  const settingsCard = byId.get('demo-settings-card')
  if (!settingsCard || settingsCard.slot !== 'settings.cards') {
    fail(`client/list 应含 demo-settings-card → settings.cards，got ${JSON.stringify(carr)}`)
  }
  const settingsSection = byId.get('demo-settings-section')
  if (!settingsSection || settingsSection.slot !== 'settings.section') {
    fail(`client/list 应含 demo-settings-section → settings.section，got ${JSON.stringify(carr)}`)
  }
  console.log('✓ client/list →', JSON.stringify(carr))

  const routes = await s.request('routes/list')
  if (routes.error) fail(`routes/list error: ${routes.error.message}`)
  const rarr = routes.result as Array<{ id: string; title: string; path: string; slot: string }>
  const analysis = rarr.find((r) => r.id === 'demo-money-flow')
  if (
    !analysis ||
    analysis.title !== '资金流向（demo）' ||
    analysis.path !== '/analysis/money-flow' ||
    analysis.slot !== 'analysis.menu'
  ) {
    fail(`routes/list 应含 demo-money-flow → /analysis/money-flow（slot=analysis.menu），got ${JSON.stringify(rarr)}`)
  }
  console.log('✓ routes/list →', JSON.stringify(rarr))

  // storage 持久化（WP-2）：set → get 读回 + storage/changed 事件。
  const sset = await s.request('storage/set', { ns: 'demo', key: 'smoke', value: { t: 1 } })
  if (sset.error) fail(`storage/set error: ${sset.error.message}`)
  const sget = await s.request('storage/get', { ns: 'demo', key: 'smoke' })
  if (sget.error) fail(`storage/get error: ${sget.error.message}`)
  if (JSON.stringify(sget.result) !== JSON.stringify({ t: 1 })) fail(`storage/get 应读回 {t:1}，got ${JSON.stringify(sget.result)}`)
  await s.waitEvent((e) => e.event === 'storage/changed' && e.payload?.key === 'smoke')
  console.log('✓ storage/set+get+changed →', JSON.stringify(sget.result))

  const bogus = await s.request('no/such/method')
  if (!bogus.error || bogus.error.code !== -32601) fail(`未知方法应返回 -32601，got ${JSON.stringify(bogus)}`)
  console.log(`✓ 未知方法 fail-closed → -32601`)

  const sh = await s.request('shutdown')
  if (sh.error) fail(`shutdown error: ${sh.error.message}`)
  const code = await s.exitCode()
  if (code !== 0) fail(`shutdown 后退出码应为 0，got ${code}`)
  console.log('✓ shutdown → 退出码 0')

  console.log(`✔ 冒烟通过（${Date.now() - started}ms）`)
  rmSync(HOME, { recursive: true, force: true })
}

void main().catch((err) => fail(String(err)))