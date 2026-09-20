/**
 * 从 `$BK_HOME/cordis.yml` 读取插件装配入口（用户拍板：加载只由 Cordis.yml 驱动）。
 *
 * 顶层 `cordis.yml` 是**插件条目列表**（每行 `{ id, name, config?, disabled? }`），比 repo 内
 * bundle 的 `PatchOverlay`（insert/覆盖动作）更直接——这是用户自己的"装哪些插件"清单。
 *
 * 纪律（fail-closed）：
 * - 文件缺失 → 响亮报错（不静默降级、不内置默认清单）。
 * - 非数组 / 行缺 id / 非 disabled 行缺 name / config 非对象 → 对应行号响亮报错。
 * - `!!js` 惰性表达式属 v2（与 config.md 一致），本轮 Cordis.yml 只接受字面量。
 */
import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { cordisYmlPath } from './bk-home'
import type { EntryRow } from './entries'

interface RawRow {
  id?: unknown
  name?: unknown
  config?: unknown
  disabled?: unknown
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizeRow(raw: unknown, index: number, path: string): EntryRow {
  if (!isRecord(raw)) {
    throw new Error(`cordis.yml[${index}] 必须是插件条目对象（got ${Array.isArray(raw) ? 'array' : typeof raw}），文件：${path}`)
  }
  const row = raw as RawRow
  if (typeof row.id !== 'string' || row.id.length === 0) {
    throw new Error(`cordis.yml[${index}] 缺 id），文件：${path}`)
  }
  const disabled = row.disabled === true
  if (!disabled && (typeof row.name !== 'string' || row.name.length === 0)) {
    throw new Error(`cordis.yml[${index}]（id="${row.id}"）非 disabled 行缺 name，文件：${path}`)
  }
  if (row.config !== undefined && !isRecord(row.config)) {
    throw new Error(`cordis.yml[${index}]（id="${row.id}"）config 必须是对象，文件：${path}`)
  }
  return {
    id: row.id,
    ...(disabled ? { disabled: true } : { name: row.name as string }),
    ...(row.config !== undefined ? { config: row.config as Record<string, unknown> } : {}),
  }
}

/** 读取并校验 `$BK_HOME/cordis.yml`，返回可被 Boot 直接装配的条目。 */
export function readCordisYml(bkHome: string): EntryRow[] {
  const path = cordisYmlPath(bkHome)
  if (!existsSync(path)) {
    throw new Error(
      `cordis.yml not found at ${path} (fail-closed)。请把要装载的插件声明成 $BK_HOME/cordis.yml：` +
        `- id: my-plugin\n   name: '@scope/my-plugin'`,
    )
  }
  let parsed: unknown
  try {
    parsed = parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`cordis.yml parse failed at ${path}: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`cordis.yml 顶层必须是插件条目列表（got ${parsed === null ? 'null' : typeof parsed}），文件：${path}`)
  }
  return parsed.map((raw, i) => normalizeRow(raw, i, path))
}