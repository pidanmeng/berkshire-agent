/**
 * `$BK_HOME` 持久化能力缝的 **文件 Provider**（WP-2，能力缝三角色之「提供方」）。
 *
 * 把结构化键值落盘到 `$BK_HOME/state/<ns>/<key>.json`：每个插件的命名空间基于其插件 id →
 * 一个目录。实现方承担落盘纪律（docs/capability-seams.md §4 + AGENTS 数据契约红线）：
 * - **命名空间/键校验**：只允许 `[A-Za-z0-9._-]+`，且显式拒绝 `.`/`..`（防目录穿越，fail-closed）。
 * - **原子改名写**：先写 `<key>.json.tmp` 再 `rename` 到 `<key>.json`，避免半写坏文件。
 * - **串行写**：provider 内所有写操作排一条 promise 链顺序执行，避免并发写交错坏盘。
 * - **坏文件 fail-closed**：JSON 解析失败/越权/写失败一律显式抛错，绝不吞、绝不全返回 undefined
 *   伪装成「键不存在」。`get` 仅在文件**确实缺失**（ENOENT）时返回 `undefined`。
 *
 * 诚实边界：这是 `$BK_HOME/state` 的**轻量 JSON 持久化**，明确不是 DuckDB（单写者/表仍目标态）。
 */
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { StorageNamespaceId, StorageProvider } from '@berkshire/core'

/** 持久化根目录名：`$BK_HOME/state/`。 */
export const STATE_DIR = 'state'

/** 命名空间/键允许的字符集（不含 `/`、`\`、空白 → 天然无目录分隔符）。 */
const NAME_RE = /^[A-Za-z0-9._-]+$/

/** 校验一个目录/文件名段：字符集 + 拒绝 `.`/`..`（目录穿越 fail-closed）。 */
function assertSafeName(what: string, name: string): void {
  if (name === '.' || name === '..' || !NAME_RE.test(name)) {
    throw new Error(`[storage] 非法${what} '${name}'（禁止路径段/穿越，fail-closed）`)
  }
}

function assertNamespace(ns: StorageNamespaceId): void {
  assertSafeName('命名空间', String(ns))
}

function assertKey(key: string): void {
  if (typeof key !== 'string' || key === '') {
    throw new Error('[storage] key 必须是非空字符串')
  }
  assertSafeName('键名', key)
}

function readJson(file: string): Promise<unknown> {
  return readFile(file, 'utf8').then((raw) => {
    // 坏文件（JSON 损坏）fail-closed：显式抛错，不吞成 undefined。
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new Error(`[storage] 坏文件 ${file}：JSON 解析失败（fail-closed）`)
    }
  })
}

/**
 * 构造一个基于 `$BK_HOME/state` 的文件 Provider。
 * @param bkHome `$BK_HOME` 绝对路径（provider 只在此之下读写，不越界）。
 */
export function createFileStorageProvider(bkHome: string): StorageProvider {
  const stateDir = join(bkHome, STATE_DIR)
  // 所有写操作排一条链，保证串行、不交错（原子写 + 串行写双保险）。
  let chain: Promise<void> = Promise.resolve()

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task)
    // 失败也释放链（错误由调用方处理），绝不卡死后续写。
    chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  return {
    id: 'storage-file',
    async get<T>(ns: StorageNamespaceId, key: string) {
      assertNamespace(ns)
      assertKey(key)
      const file = join(stateDir, String(ns), `${key}.json`)
      try {
        return (await readJson(file)) as T
      } catch (err) {
        // 文件确实缺失 → 键不存在，返回 undefined；其余（坏文件/IO）fail-closed 抛错。
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
          return undefined
        }
        throw err
      }
    },
    async set(ns, key, value) {
      assertNamespace(ns)
      assertKey(key)
      return enqueue(async () => {
        // 值必须可 JSON 序列化（`undefined`/`function`/`symbol` 会产出非法 JSON 文件的坏值）——
        // 不可序列化一律响亮失败，绝不在磁盘落一个日后 fail-closed 的坏文件。
        const serialized = JSON.stringify(value, null, 2)
        if (serialized === undefined) {
          throw new Error(`[storage] 值不可 JSON 序列化（ns=${String(ns)} key=${key}，fail-closed）`)
        }
        const file = join(stateDir, String(ns), `${key}.json`)
        await mkdir(dirname(file), { recursive: true })
        // 原子改名写：临时文件 + rename，避免半写坏文件（中途 crash 只留 .tmp，不留坏 .json）。
        const tmp = `${file}.tmp`
        await writeFile(tmp, `${serialized}\n`, 'utf8')
        await rename(tmp, file)
      })
    },
    async remove(ns, key) {
      assertNamespace(ns)
      assertKey(key)
      return enqueue(async () => {
        const file = join(stateDir, String(ns), `${key}.json`)
        try {
          await unlink(file)
        } catch (err) {
          // 缺失视为成功 no-op；其它 IO 错误 fail-closed。
          if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
            return
          }
          throw err
        }
      })
    },
    async list(ns) {
      assertNamespace(ns)
      let names: string[]
      try {
        names = await readdir(join(stateDir, String(ns)))
      } catch (err) {
        // 命名空间目录缺失 → 空列表（等价于「没写过任何键」，不算错误）。
        if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
          return []
        }
        throw err
      }
      // 只认 `<key>.json`；其余名字（如原子写遗留的 `.tmp` / 无关文件）一律忽略（fail-closed 部署）。
      return names
        .filter((n) => n.endsWith('.json') && !n.endsWith('.tmp'))
        .map((n) => n.slice(0, -'.json'.length))
        .sort()
    },
  }
}