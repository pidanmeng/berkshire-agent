/**
 * profile / bundle / patch 分层配置组合（v1 最小子集）。
 *
 * 目标态（docs/config.md §2、docs/reference/cordis-pattern-report.md §6）的算法是
 * `composeEntries = applyEntryPatches([], structuredClone(flat(layers)))`，其 patch
 * 语义：`insert` 追加行；裸 `{ id, config }` 按 id **整体替换**该行 config（不深合并）。
 * v1 实现同样的可判序算法（仍是纯函数、与挂载共用同一份结果），但只支持这两类动作；
 * `!!js` 惰性表达式、dump-config 打印与 isolate/group 留 v2。
 */
export interface EntryRow {
  /** 行 id：供上层 patch 按 id 定位并整体覆盖。 */
  id: string
  /** 所挂插件名（由 resolver 解析为插件对象）。 */
  name?: string
  config?: Record<string, unknown>
  disabled?: boolean
}

/** 一层补丁：行级覆盖 或 插入动作（`{ insert: [...] }`）。 */
export type PatchAction = EntryRow | { insert: EntryRow[] }

/** 单个 bundle / patch 的补丁列表（一层）。 */
export type PatchOverlay = PatchAction[]

/** 把「插件名 → 插件对象」的解析委托出去（挂载路径与 dump 共用）。 */
export type Resolver = (name: string) => unknown | Promise<unknown>

/** 对一个已存在的 entry 应用一行覆盖（按 id 定位；找不到则忽略并告警）。 */
export function applyRow(entry: EntryRow, overlay: EntryRow): boolean {
  if (overlay.id !== entry.id) return false
  if (overlay.config !== undefined) entry.config = overlay.config
  if (overlay.disabled !== undefined) entry.disabled = overlay.disabled
  if (overlay.name !== undefined) entry.name = overlay.name
  return true
}

/** 对根 entry 表依次应用所有层（expr 为按序展开后的层：每层是 overlay 列表）。 */
export function applyEntryPatches(
  root: EntryRow[],
  layers: PatchOverlay[],
  warn: (msg: string) => void = () => {},
): EntryRow[] {
  const result = root.map((row) => ({ ...row, config: row.config && { ...row.config } }))
  for (const overlay of layers) {
    for (const action of overlay) {
      if ('insert' in action) {
        result.push(...action.insert.map((row) => ({ ...row, config: row.config && { ...row.config } })))
        continue
      }
      const found = result.find((row) => row.id === action.id)
      if (!found) {
        warn(`patch targets unknown entry "${action.id}" (ignored)`)
        continue
      }
      applyRow(found, action)
    }
  }
  return result
}

/** 对「空根行表」按层序组合（挂载路径与你想要 dump 的最终树共用本算法）。 */
export function composeEntries(
  layers: PatchOverlay[],
  warn?: (msg: string) => void,
): EntryRow[] {
  return applyEntryPatches([], layers.map((layer) => layer), warn)
}