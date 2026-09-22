/**
 * S2 扩展缝 · `ctx.datasets.register` 的运行时行为测试（booted core）：
 * - register 可逆（disposer 撤销后 dataset/provider 一起消失）；
 * - 重复 id / 非法列名 / 物化不匹配 → 响亮失败且**不留半注册残留**；
 * - 参考扩展插件（datasource-example）装配后：自定义数据组声明可见、provider 可路由、
 *   fetch 可取数、卸载全撤销。
 *
 * 注：`@berkshire/core` 经 dist 解析（需先 `bun run build:packages` 让 core 重建到最新）；
 * 参考插件按**源路径**导入，避免依赖其构建产物。
 */
import { afterAll, describe, expect, test } from 'bun:test'
import * as corePlug from '@berkshire/core'
import { Boot, setBkHome } from '@berkshire/boot'
import type { Resolver } from '@berkshire/boot'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { datasetColumnSchema, type DatasetDeclaration, type DatasetId } from '@berkshire/core'
import * as examplePlugin from '../../plugins/datasource-example/src/index.ts'
import { createFileStorageProvider } from '../src/storage-provider'

const resolver: Resolver = (name) =>
  ({ '@berkshire/core': corePlug, '@berkshire/plugin-datasource-example': examplePlugin })[name]

async function mount(): Promise<Boot> {
  const boot = new Boot()
  await boot.install({ id: 'core', name: '@berkshire/core' }, resolver)
  return boot
}

const tempHomes: string[] = []
afterAll(() => {
  for (const home of tempHomes) rmSync(home, { recursive: true, force: true })
})

/** 对齐真实 sidecar 装配：附 storage provider（provider 路由 / fetch 需要读偏好 + 落 log）。 */
async function mountWithStorage(): Promise<Boot> {
  const boot = await mount()
  const home = mkdtempSync(join(tmpdir(), 'bk-ext-test-'))
  tempHomes.push(home)
  setBkHome(home)
  boot.ctx.storage.register(createFileStorageProvider(home))
  return boot
}

const EMBEDDED = (id: DatasetId, over: Partial<DatasetDeclaration> = {}): DatasetDeclaration => ({
  id,
  label: `样例 ${id}`,
  materialization: 'embedded',
  columns: ['date', 'close'],
  columnSchema: datasetColumnSchema(['date', 'close']),
  ...over,
})

describe('ctx.datasets.register（S2 扩展缝）', () => {
  test('合法声明 → 进入注册表；disposer 可逆（卸载后消失）', async () => {
    const boot = await mount()
    try {
      expect(boot.ctx.datasets.get('custom_demo' as DatasetId)).toBeUndefined()
      const off = boot.ctx.datasets.register(EMBEDDED('custom_demo' as DatasetId))
      expect(boot.ctx.datasets.get('custom_demo' as DatasetId)).toBeDefined()
      expect(boot.ctx.datasets.list().some((d) => String(d.id) === 'custom_demo')).toBe(true)
      off()
      expect(boot.ctx.datasets.get('custom_demo' as DatasetId)).toBeUndefined()
    } finally {
      await boot.dispose()
    }
  })

  test('重复 id → 响亮失败，且不留半注册残留', async () => {
    const boot = await mount()
    try {
      boot.ctx.datasets.register(EMBEDDED('dup' as DatasetId))
      expect(() => boot.ctx.datasets.register(EMBEDDED('dup' as DatasetId))).toThrow(/重复 dataset id/)
      // 注册表未被破坏：仍是 1 份，没有半注册残留。
      expect(boot.ctx.datasets.list().filter((d) => String(d.id) === 'dup')).toHaveLength(1)
    } finally {
      await boot.dispose()
    }
  })

  test('非法列名 → 响亮失败，且不留残留', async () => {
    const boot = await mount()
    try {
      expect(() =>
        boot.ctx.datasets.register(EMBEDDED('bad' as DatasetId, { columns: ['select', 'close'] })),
      ).toThrow(/保留字/)
      expect(boot.ctx.datasets.get('bad' as DatasetId)).toBeUndefined()
    } finally {
      await boot.dispose()
    }
  })

  test('parquet-view 缺分区 → staged 失败，不留残留', async () => {
    const boot = await mount()
    try {
      expect(() =>
        boot.ctx.datasets.register(
          EMBEDDED('pv' as DatasetId, { materialization: 'parquet-view' }),
        ),
      ).toThrow(/分区/)
      expect(boot.ctx.datasets.get('pv' as DatasetId)).toBeUndefined()
    } finally {
      await boot.dispose()
    }
  })
})

describe('参考扩展插件 datasource-example（S2 消费/证明面）', () => {
  test('装配后：数据组声明可见 + provider 可路由 + fetch 可取数', async () => {
    const boot = await mountWithStorage()
    await boot.install({ id: 'example', name: '@berkshire/plugin-datasource-example' }, resolver)
    try {
      const ids = boot.ctx.datasets.list().map((d) => String(d.id))
      expect(ids).toContain('sector_momentum')
      expect(ids).toContain('factor_pnl')
      // provider 可路由（门控：候选含 datasource-example）
      const candidates = await boot.ctx.dataSources.candidates('sector_momentum' as DatasetId)
      expect(candidates.map(String)).toContain('datasource-example')
      // fetch 可取数（第 N 行 seed）
      const rows = await boot.ctx.dataSources.fetch('sector_momentum' as DatasetId)
      expect(Array.isArray(rows)).toBe(true)
      expect((rows as Array<Record<string, unknown>>).length).toBe(4)
    } finally {
      await boot.dispose()
    }
  })

  test('卸载后：数据组声明 + provider 一起撤销（可逆）', async () => {
    const boot = await mountWithStorage()
    await boot.install({ id: 'example', name: '@berkshire/plugin-datasource-example' }, resolver)
    expect(boot.ctx.datasets.get('sector_momentum' as DatasetId)).toBeDefined()
    const candidatesBefore = await boot.ctx.dataSources.candidates('sector_momentum' as DatasetId)
    expect(candidatesBefore.map(String)).toContain('datasource-example')

    // 逆序卸载 example 插件 fiber（注册即效应 → 撤销其数据组/provider）。
    const mounted = boot.mounted.find((m) => m.id === 'example' && !m.skipped)!
    await mounted.fiber.dispose()
    expect(boot.ctx.datasets.get('sector_momentum' as DatasetId)).toBeUndefined()
    const candidatesAfter = await boot.ctx.dataSources.candidates('sector_momentum' as DatasetId)
    expect(candidatesAfter.map(String)).not.toContain('datasource-example')
    await boot.dispose()
  })
})