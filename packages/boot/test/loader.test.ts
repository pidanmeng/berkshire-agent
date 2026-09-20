import { describe, expect, test } from 'bun:test'
import { builtins } from '../src/builtins'
import { importPlugin, unwrapExports } from '../src/loader'

/**
 * P1 内置动态装载解析器单测：三分支（npm 裸名 / 相对路径 / `cordis:` 内置）+ fail-closed。
 * - npm 裸名分支：用 workspace 真实包名（`@berkshire/plugin-notify-console`）验证可解析出
 *   `apply` 插件对象（bun 直接跑 TS，解析 src 入口）。
 * - 相对路径分支：用 `import(await import.meta.resolve(...))` 的路径风格 + baseUrl 定位，
 *   再对不存在的文件验证响亮失败。
 * - `cordis:` 分支：builtins 当前为空表，任何 key 均拒绝（不静默）。
 * - unwrapExports：对不含 default 的命名空间原样返回，对含 default 的对象取 default。
 */
describe('packages/boot · importPlugin 内置动态 resolver', () => {
  test('npm 裸名：解析 workspace 真实插件为含 apply 的插件对象', async () => {
    const mod = await importPlugin('@berkshire/plugin-notify-console')
    expect(mod).toBeDefined()
    expect(typeof (mod as { apply?: unknown }).apply).toBe('function')
    expect((mod as { name?: string }).name).toBe('notify-console')
  })

  test('相对路径 + baseUrl：解析到本地 TS 产物的默认插件对象', async () => {
    // 定位 boot 包的目标样例模块；baseUrl 指向 src 目录。
    const baseUrl = new URL('../src/', import.meta.url).href
    const mod = await importPlugin('./entries', { baseUrl })
    expect(mod).toBeDefined()
    expect(typeof (mod as { composeEntries?: unknown }).composeEntries).toBe('function')
  })

  test('cordis: 内置：空表对所有 key fail-closed（响亮失败，不静默）', async () => {
    expect(Object.keys(builtins)).toHaveLength(0)
    await expect(importPlugin('cordis:nope')).rejects.toThrow(/cordis: builtin/)
    await expect(importPlugin('cordis:revision')).rejects.toThrow(/cannot resolve cordis/)
  })

  test('相对路径指向不存在文件 → 响亮失败', async () => {
    await expect(
      importPlugin('./does-not-exist', { baseUrl: new URL('../src/', import.meta.url).href }),
    ).rejects.toThrow()
  })

  test('unwrapExports：无 default 命名空间原样返回；有 default 取 default', () => {
    const ns = { apply: function apply() {}, __esModule: true } // 无 default
    // 无 default 时返回原对象（插件对象本身就是命名空间）
    expect(unwrapExports<typeof ns>(ns)).toBe(ns)
    // 有 default 且 __esModule 时取 default
    const wrapped = { __esModule: true, default: { apply: 'dflt' } }
    expect(unwrapExports<{ apply: string }>(wrapped)).toEqual({ apply: 'dflt' })
  })

  test('importPlugin 解析出的命名空间可经 ctx.plugin 装配（Boot 缺省 resolver 全链路）', async () => {
    // 走 Boot.install 缺省 resolver，无需硬编码查表：npm 裸名解析到 notify-console。
    const { Boot } = await import('../src/index')
    const boot = new Boot()
    // 先装 core（npm 裸名经 importPlugin 解析），再装 notify-console。
    await boot.install({ id: 'core', name: '@berkshire/core' })
    await boot.install({ id: 'notify-console', name: '@berkshire/plugin-notify-console' })
    expect(boot.activeCount).toBe(2)
    expect(boot.ctx.notifier.available).toBe(true)
    await boot.dispose()
  })
})