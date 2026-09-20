/**
 * `$BK_HOME` 持久化能力缝（WP-2）测试：文件 Provider 单测 + `ctx.storage` 能力缝（Definition）
 * + 协议方法 `storage/get|set|remove|list` round-trip。覆盖：命名空间/键校验防越权、原子改名
 * 写不遗留 `.tmp`、坏文件 fail-closed、缺失返回 undefined、无 provider fail-closed、`storage/changed`
 * 事件、注册即效应（disposer 可逆）与重复注册响亮失败。
 *
 * 运行：`bun test packages/sidecar/test/storage.test.ts`（或 `bun run --cwd packages/sidecar test`）。
 */
import { describe, expect, test, afterEach } from 'bun:test'
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as core from '@berkshire/core'
import type { StorageNamespaceId } from '@berkshire/core'
import { Boot } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { createFileStorageProvider, STATE_DIR } from '../src/storage-provider'
import { ESC, handleLine } from '../src/protocol'

const resolver: Resolver = (name) => ({ '@berkshire/core': core })[name]

/** 每个用例独立临时 `$BK_HOME`，避免用例间持久化串扰。 */
const homes: string[] = []
async function tmpHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bk-storage-test-'))
  homes.push(dir)
  return dir
}
afterEach(async () => {
  for (const h of homes.splice(0)) await rm(h, { recursive: true, force: true })
})

/** 挂载 core + 注册文件 Provider（可自行指定 home，缺省临时目录）。 */
async function mountWithProvider(bkHome = ''): Promise<{ boot: Boot; home: string }> {
  const home = bkHome || (await tmpHome())
  const boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  boot.ctx.storage.register(createFileStorageProvider(home))
  return { boot, home }
}

const NS = 'demo' as StorageNamespaceId

describe('createFileStorageProvider · 文件 Provider 单测', () => {
  test('get/set/list/remove round-trip（JSON 值原样保留、落盘在 $BK_HOME/state/<ns>/）', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    expect(p.id).toBe('storage-file')

    expect(await p.get(NS, 'a')).toBeUndefined()
    expect(await p.list(NS)).toEqual([])

    await p.set(NS, 'a', { x: 1, nested: [true, 's', null] })
    await p.set(NS, 'b', 'hello')
    expect(await p.get<{ x: number; nested: (string | boolean | null)[] }>(NS, 'a')).toEqual({ x: 1, nested: [true, 's', null] })
    expect(await p.get<string>(NS, 'b')).toBe('hello')
    expect(await p.list(NS)).toEqual(['a', 'b'])

    await p.remove(NS, 'a')
    expect(await p.get(NS, 'a')).toBeUndefined()
    expect(await p.list(NS)).toEqual(['b'])
  })

  test('原子改名写：成功后目录里无 `.tmp` 遗留', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    await p.set(NS, 'k', { v: 1 })
    await p.set(NS, 'k', { v: 2 }) // 覆盖写
    const names = await readdir(join(home, STATE_DIR, String(NS)))
    expect(names).toContain('k.json')
    expect(names).not.toContain('k.json.tmp')
  })

  test('命名空间越权/非法（..、含 /、空）→ fail-closed 拒绝', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    for (const bad of ['..', '.', '', '../evil', 'a/b', 'a\\b']) {
      await expect(p.set(bad as StorageNamespaceId, 'k', 1)).rejects.toThrow(/非法|键名|非空/)
    }
    // 空命名空间
    await expect(p.get('' as StorageNamespaceId, 'k')).rejects.toThrow()
  })

  test('键非法（..、含 /、空串）→ fail-closed 拒绝', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    for (const bad of ['..', '.', '', 'a/b', '../x']) {
      await expect(p.set(NS, bad, 1)).rejects.toThrow()
    }
  })

  test('不可 JSON 序列化的值（undefined/function）→ set fail-closed 拒绝，不落盘坏文件', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    await expect(p.set(NS, 'und', undefined)).rejects.toThrow(/不可 JSON 序列化/)
    await expect(p.set(NS, 'fn', () => 1)).rejects.toThrow(/不可 JSON 序列化/)
    // 拒绝后既不写入文件，也不产生 `.json`/`.tmp`（无坏值残留）。
    await expect(readdir(join(home, STATE_DIR, String(NS)))).rejects.toThrow() // 目录不存在（原本就空）
  })

  test('坏文件（JSON 损坏）→ get fail-closed 抛错，不伪装成 undefined', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    const dir = join(home, STATE_DIR, String(NS))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'corrupt.json'), '{ not valid json !!!', 'utf8')
    await expect(p.get(NS, 'corrupt')).rejects.toThrow(/JSON 解析失败|坏文件/)
  })

  test('缺失目录 → list 返回 []（等价于没写过，不算错误）', async () => {
    const home = await tmpHome()
    const p = createFileStorageProvider(home)
    expect(await p.list('nope' as StorageNamespaceId)).toEqual([])
  })
})

describe('ctx.storage 能力缝（Definition）· 三角色', () => {
  test('register provider → available；get/set/remove/list 委托 provider', async () => {
    const { boot } = await mountWithProvider()
    expect(boot.ctx.storage.available).toBe(true)
    await boot.ctx.storage.set(NS, 'k', 42)
    await boot.ctx.storage.set(NS, 'k2', { ok: true })
    expect(await boot.ctx.storage.get<number>(NS, 'k')).toBe(42)
    expect(await boot.ctx.storage.list(NS)).toEqual(['k', 'k2'])
    await boot.ctx.storage.remove(NS, 'k')
    expect(await boot.ctx.storage.get(NS, 'k')).toBeUndefined()
    await boot.dispose()
  })

  test('storage/changed 事件在 set/remove 成功后广播（@mode emit），read 不广播', async () => {
    const { boot } = await mountWithProvider()
    const changed: Array<{ ns: string; key: string }> = []
    const off = boot.ctx.on('storage/changed', (p) => changed.push({ ns: String(p.ns), key: p.key }))
    await boot.ctx.storage.set(NS, 'k', 1)
    expect(changed).toEqual([{ ns: 'demo', key: 'k' }])
    await boot.ctx.storage.get(NS, 'k') // read 不广播
    expect(changed).toHaveLength(1)
    await boot.ctx.storage.remove(NS, 'k')
    expect(changed).toHaveLength(2)
    off()
    await boot.dispose()
  })

  test('无 provider → fail-closed 抛错（绝不静默降级为内存态）', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    expect(boot.ctx.storage.available).toBe(false)
    await expect(boot.ctx.storage.get(NS, 'k')).rejects.toThrow(/no provider/)
    await expect(boot.ctx.storage.set(NS, 'k', 1)).rejects.toThrow(/no provider/)
    await boot.dispose()
  })

  test('重复注册 provider → 响亮失败；disposer 可逆（摘除后回到无 provider）', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    const home = await tmpHome()
    const off = boot.ctx.storage.register(createFileStorageProvider(home))
    expect(() => boot.ctx.storage.register(createFileStorageProvider(home))).toThrow(/already registered/)
    await boot.ctx.storage.set(NS, 'k', 1)
    off() // disposer 摘除 → 回到无 provider
    expect(boot.ctx.storage.available).toBe(false)
    await expect(boot.ctx.storage.get(NS, 'k')).rejects.toThrow(/no provider/)
    await boot.dispose()
  })
})

describe('协议层 · storage/get|set|remove|list（handleLine）', () => {
  test('set → event → get 读回 / list / remove，缺失返回 null', async () => {
    const { boot } = await mountWithProvider()
    const setRes = await handleLine('{"id":1,"method":"storage/set","params":{"ns":"demo","key":"k","value":{"n":5}}}', { ctx: boot.ctx })
    expect(JSON.parse(setRes.lines[0]!)).toEqual({ id: 1, result: null })

    const getRes = await handleLine('{"id":2,"method":"storage/get","params":{"ns":"demo","key":"k"}}', { ctx: boot.ctx })
    expect(JSON.parse(getRes.lines[0]!)).toEqual({ id: 2, result: { n: 5 } })

    const listRes = await handleLine('{"id":3,"method":"storage/list","params":{"ns":"demo"}}', { ctx: boot.ctx })
    expect(JSON.parse(listRes.lines[0]!)).toEqual({ id: 3, result: ['k'] })

    const missing = await handleLine('{"id":4,"method":"storage/get","params":{"ns":"demo","key":"nope"}}', { ctx: boot.ctx })
    expect(JSON.parse(missing.lines[0]!)).toEqual({ id: 4, result: null })

    const rmRes = await handleLine('{"id":5,"method":"storage/remove","params":{"ns":"demo","key":"k"}}', { ctx: boot.ctx })
    expect(JSON.parse(rmRes.lines[0]!)).toEqual({ id: 5, result: null })
    const empty = await handleLine('{"id":6,"method":"storage/list","params":{"ns":"demo"}}', { ctx: boot.ctx })
    expect(JSON.parse(empty.lines[0]!)).toEqual({ id: 6, result: [] })
    await boot.dispose()
  })

  test('参数校验：缺 ns / 缺 key → PARAMS(-32602)', async () => {
    const { boot } = await mountWithProvider()
    for (const bad of [
      '{"id":1,"method":"storage/get","params":{}}',
      '{"id":2,"method":"storage/get","params":{"ns":"demo"}}',
      '{"id":3,"method":"storage/set","params":{"ns":"demo"}}',
      '{"id":4,"method":"storage/set","params":{"ns":"demo","key":"k"}}',
      '{"id":5,"method":"storage/list","params":{}}',
      '{"id":6,"method":"storage/remove","params":{"ns":"demo"}}',
    ]) {
      const res = await handleLine(bad, { ctx: boot.ctx })
      expect((JSON.parse(res.lines[0]!) as { error: { code: number } }).error.code).toBe(ESC.PARAMS)
    }
    await boot.dispose()
  })

  test('目录越权命名空间 `..` → 文件 Provider 拒绝 → APP(-32000) fail-closed', async () => {
    const { boot } = await mountWithProvider()
    const res = await handleLine('{"id":1,"method":"storage/set","params":{"ns":"..","key":"k","value":1}}', { ctx: boot.ctx })
    const msg = JSON.parse(res.lines[0]!) as { error: { code: number; message: string } }
    expect(msg.error.code).toBe(ESC.APP)
    expect(msg.error.message).toMatch(/非法|穿越|fail-closed/)
    await boot.dispose()
  })

  test('无 provider → storage/set → APP(-32000) fail-closed（不吞）', async () => {
    const boot = new Boot()
    await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
    const res = await handleLine('{"id":1,"method":"storage/set","params":{"ns":"demo","key":"k","value":1}}', { ctx: boot.ctx })
    const msg = JSON.parse(res.lines[0]!) as { error: { code: number; message: string } }
    expect(msg.error.code).toBe(ESC.APP)
    expect(msg.error.message).toMatch(/no provider/)
    await boot.dispose()
  })

  test('持久化跨实例（重启语义）：同 home 新 provider 读回上次写值', async () => {
    const home = await tmpHome()
    const { boot: first } = await mountWithProvider(home)
    await handleLine('{"id":1,"method":"storage/set","params":{"ns":"demo","key":"persist","value":"v1"}}', { ctx: first.ctx })
    await first.dispose()

    // 模拟重启：同一 home 新建 Boot + provider → 磁盘值仍在。
    const { boot: second } = await mountWithProvider(home)
    const res = await handleLine('{"id":2,"method":"storage/get","params":{"ns":"demo","key":"persist"}}', { ctx: second.ctx })
    expect(JSON.parse(res.lines[0]!)).toEqual({ id: 2, result: 'v1' })
    await second.dispose()
  })
})