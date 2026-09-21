import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { defaultBkHome, setBkHome, cordisYmlPath, nodeModulesDir, BK_HOME_ENV } from '../src/bk-home'
import { readCordisYml } from '../src/entries-file'
import { importPlugin, resolveDownloadedPackage } from '../src/loader'

/**
 * M2：BK_HOME 配置 home + $BK_HOME/cordis.yml 装配入口 + 下载 npm 包动态解析。
 * - bk-home 解析：环境变量覆盖优先、路径落在 `$BK_HOME/cordis.yml` / `$BK_HOME/node_modules`。
 * - readCordisYml：缺文件 / 非数组 / 行缺 name / config 非法 → fail-closed 响亮失败。
 * - 下载包：`resolveDownloadedPackage` 从 `$HK_HOME/node_modules/<name>` 取 exports/main 的
 *   dist 入口；`importPlugin(nodeModulesDir)` 用一条路径解析下载包（与 npm 裸名一视同仁）。
 *
 * 诚实标注（fixture 位置）：伪下载包放在 `fixtures/downloaded/`（**不在 `node_modules/` 目录内**，
 * 否则会被 `bun install` 当作安装产物清掉——node_modules 属 bun 托管，目录内 fixture 不落库）。
 */
const FIX_BK_HOME = resolve(import.meta.dir, 'fixtures/bk-home')
const FIX_NM = resolve(import.meta.dir, 'fixtures/downloaded')

describe('bk-home · 配置 home 解析', () => {
  test('环境变量 BK_HOME 优先；cordis.yml / node_modules 都落在其下', () => {
    setBkHome(FIX_BK_HOME)
    expect(defaultBkHome()).toBe(FIX_BK_HOME)
    expect(cordisYmlPath()).toBe(resolve(FIX_BK_HOME, 'cordis.yml'))
    expect(nodeModulesDir()).toBe(resolve(FIX_BK_HOME, 'node_modules'))
  })

  test('返回值是非空绝对路径（无 env 时走平台默认分支）', () => {
    const prev = process.env[BK_HOME_ENV]
    try {
      delete process.env[BK_HOME_ENV]
      const home = defaultBkHome()
      expect(typeof home).toBe('string')
      expect(home.length).toBeGreaterThan(0)
    } finally {
      if (prev !== undefined) process.env[BK_HOME_ENV] = prev
    }
  })
})

describe('cordis.yml · 装配入口读取', () => {
  test('读出合法行（含 name / config），行序保留', () => {
    const rows = readCordisYml(FIX_BK_HOME)
    expect(rows.map((r) => r.id)).toEqual(['core', 'faked'])
    expect(rows[0]!.name).toBe('@berkshire/core')
  })

  test('缺文件 → 响亮失败（不静默、不内置默认清单）', () => {
    expect(() => readCordisYml(resolve(import.meta.dir, 'fixtures/empty-home'))).toThrow(/cordis\.yml not found/)
  })

  test('非数组 / 行缺 id / 行缺 name → 对应行号响亮失败', () => {
    // 用临时目录逐场景写坏配置文件（避免污染共享 fixture）
    const bad = resolve(import.meta.dir, 'fixtures/bad')
    mkdirSync(bad, { recursive: true })
    writeFileSync(resolve(bad, 'cordis.yml'), `{ not: "an array" }`)
    expect(() => readCordisYml(bad)).toThrow(/列表/)
    writeFileSync(resolve(bad, 'cordis.yml'), `- config: {}\n`)
    expect(() => readCordisYml(bad)).toThrow(/缺 id/)
    writeFileSync(resolve(bad, 'cordis.yml'), `- id: a\n`)
    expect(() => readCordisYml(bad)).toThrow(/缺 name/)
  })
})

describe('下载 npm 包 · 一条解析路径', () => {
  test('resolveDownloadedPackage 从 package.json exports/main 取 dist 入口 file URL', () => {
    const url = resolveDownloadedPackage(FIX_NM, '@fake/plugin')
    expect(url).toBeTruthy()
    expect(url).toContain('/dist/index.js')
    // 不存在的包 → null（交给 import() 兜底 / fail-closed）
    expect(resolveDownloadedPackage(FIX_NM, '@nope/x')).toBeNull()
  })

  test('importPlugin(nodeModulesDir) 用下载包入口解析出插件对象（非 import 裸名）', async () => {
    const mod = await importPlugin('@fake/plugin', { nodeModulesDir: FIX_NM })
    expect((mod as { name?: string }).name).toBe('fake')
    expect(typeof (mod as { apply?: unknown }).apply).toBe('function')
  })

  test('下载包与 workspace 裸名走同一 importPlugin 入口（nodeModulesDir 缺目录不报错）', async () => {
    // nodeModulesDir 指向不存在的目录 → 回退 import(name)（workspace 包仍能解析）。
    const mod = await importPlugin('@berkshire/plugin-notify-console', {
      nodeModulesDir: resolve(import.meta.dir, 'fixtures/empty-home/node_modules'),
    })
    expect((mod as { name?: string }).name).toBe('notify-console')
  })
})