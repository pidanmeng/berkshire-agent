/**
 * 内置动态装载解析器（docs/npm-plugin-packaging-and-loading.md §5.2，P1）。
 *
 * 目标态（对齐 DSH `loader/config/tree.ts`）：把 `cordis.patch.yml` / `cordis.yml` 里的
 * `name` 解析成「可 `ctx.plugin()` 的插件对象」，**无需任何硬编码查表**。三条分支：
 *
 * - `cordis:<key>` → 内置 bundle（`builtins`，当前最小：空表，天然 fail-closed）。
 * - 相对/根/盘符路径（`.`/`../`、`/abs`、`C:\…`、`file:`）→ `import(new URL(specifier, baseUrl))`。
 * - 其它（npm 裸名，含 `@scope/name`）→ `import(specifier)`。
 *
 * 无一分支命中或不含可装载导出 → **响亮失败**（fail-closed），不静默降级。
 *
 * 诚实边界：`import('npm 名')` 只对「import 所在模块节点可解析链」成立；对**下载到
 * `$BK_HOME` 的插件**，调用方应把 `baseUrl` 指向其绝对目录，或直接传绝对/`file:` 路径，
 * 由本文件统一走相对-路径分支 import 具体 dist 文件（跨盘可解析）。这就是硬性验收
 * 「npm 包与本地插件一条装载路径」的解析层实现。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { builtins } from './builtins'

export interface ImportPluginOptions {
  /** 相对路径/`file:` 解析的基准：目录的绝对路径或 file URL（不写斜杠也可）。 */
  baseUrl?: string
  /**
   * 下载插件的目录（`$BK_HOME/node_modules`）。npm 裸名若存在于此 → 解析其 dist 入口并绝对
   * import；否则回退 `import(name)`（如 workspace/registry 包）。这使「下载包」与「本地/裸名」
   * 走同一条装载路径（硬性验收 2）。
   */
  nodeModulesDir?: string
}

/** 把动态 import 的模块对象归形为插件对象：有 `default` 取 default，否则返回命名空间本身。 */
export function unwrapExports<T = unknown>(mod: unknown): T {
  if (mod && typeof mod === 'object' && '__esModule' in mod && 'default' in mod) {
    return (mod as { __esModule?: boolean; default?: T }).default as T
  }
  return mod as T
}

function toBaseUrl(baseUrl: string): string {
  // 已是 URL（`file:`/`http(s)://`）→ 补齐目录形态的尾斜杠。
  if (baseUrl.includes('://')) return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  // 本地目录绝对路径（可能无尾斜杠）→ 转成带尾斜杠的 file URL，new URL(rel, base) 才能正确定位。
  const dirPath = baseUrl.endsWith('\\') || baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return pathToFileURL(dirPath).href
}

/** 判断 specifier 是否为「相对/根/盘符/file:」这类可按路径 import 的分支。 */
function isPathSpecifier(specifier: string): boolean {
  if (specifier.startsWith('.')) return true // ./ 与 ../
  if (specifier.startsWith('/')) return true // POSIX 根路径
  if (/^[A-Za-z]:[\\/]/.test(specifier)) return true // Windows 盘符路径
  if (specifier.startsWith('file:')) return true
  return false
}

function pkgJsonOf(pkgDir: string): Record<string, unknown> | null {
  const f = join(pkgDir, 'package.json')
  if (!existsSync(f)) return null
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * 解析下载到 `nodeModulesDir` 下某 npm 包的**具体 dist 入口**文件 URL。
 * 规则：可发布的包 `exports`/`main` 指 dist，故在这里取：
 * `exports['.']?.default ?? main ?? 'index.js'`，落盘文件必须存在，否则返回 null（交给 import() 兜底）。
 * 返回绝对 file URL 字符串，供 `import()` 跨盘解析（裸名在 sidecar 源码链上解析不到 `$BK_HOME`）。
 */
export function resolveDownloadedPackage(nodeModulesDir: string, name: string): string | null {
  const pkgDir = resolve(nodeModulesDir, name)
  if (!existsSync(pkgDir)) return null
  const pkg = pkgJsonOf(pkgDir)
  if (!pkg) return null
  const exports = pkg.exports as Record<string, unknown> | undefined
  const entry = (typeof exports?.['.'] === 'object'
    ? (exports['.'] as Record<string, unknown>)?.['default']
    : exports?.['.']) as string | undefined
  const rel = entry ?? (typeof pkg.main === 'string' ? pkg.main : 'index.js')
  const entryFile = resolve(pkgDir, rel.startsWith('./') ? rel : `./${rel}`)
  if (!existsSync(entryFile)) return null
  return pathToFileURL(entryFile).href
}

/**
 * 把 `name` 动态解析为插件对象（缺省 Resolver 实现）。
 * @param specifier 配置行里的插件名：`cordis:<key>` / 相对|绝对路径 / npm 裸名。
 * @param options   baseUrl 供相对路径 import 定位基准；nodeModulesDir 供下载包解析入口。
 */
export async function importPlugin<T = unknown>(
  specifier: string,
  options: ImportPluginOptions = {},
): Promise<T> {
  let mod: unknown

  if (specifier.startsWith('cordis:')) {
    const key = specifier.slice('cordis:'.length)
    mod = builtins[key]
    if (mod === undefined) {
      throw new Error(`cannot resolve cordis: builtin "${key}" (specifier "${specifier}")`)
    }
  } else if (isPathSpecifier(specifier)) {
    const baseUrl = toBaseUrl(options.baseUrl ?? import.meta.url)
    mod = await import(new URL(specifier, baseUrl).href)
  } else {
    const downloaded = options.nodeModulesDir
      ? resolveDownloadedPackage(options.nodeModulesDir, specifier)
      : null
    mod = downloaded ? await import(downloaded) : await import(specifier)
  }

  const plugin = unwrapExports<T>(mod)
  if (plugin === undefined || plugin === null) {
    throw new Error(`specifier "${specifier}" resolved to no export (fail-closed)`)
  }
  return plugin
}