/**
 * dev 态插件热更 watcher（`BK_DEV_HOTRELOAD=1` 时启用，仅 dev）。
 *
 * 监听 sidecar 半身所依赖的源码：core 编织、插件 sidecar 半身（`src/index.ts`）、样式单一来源
 * （`src/client/*.ts`，如 `styles.ts`）、bundle patch（`cordis.patch.yml`）。变化时回调通知宿主，
 * 由宿主重启 sidecar 以加载新声明/样式，并推 `client/changed` 让 webview 重拉快照。
 *
 * 诚实边界：**组件 `.tsx` 不在此列**——那是 webview 的 Vite Fast Refresh 负责（静态 import 插件包
 * 源码，本就实时）；本 watcher 只解决「样式字符串 / 路由/槽位/注册声明」这类随 sidecar 快照走的
 * 半身。生产（无 `BK_DEV_HOTRELOAD`）不附加 watcher，行为不变。
 */
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { resolve } from 'node:path'

export type ReloadNotifier = (changedPath: string) => void

/**
 * 判定一条变更路径是否属于“sidecar 半身”（需重启 sidecar 重装配）。排除组件 `.tsx`、
 * 测试、示例——它们不喂进 sidecar 快照。
 */
export function isSidecarHalf(file: string): boolean {
  const n = file.replace(/\\/g, '/')
  if (/\.test\.[cm]?ts$/.test(n)) return false
  if (/\/(examples|test)\//.test(n)) return false

  // bundle patch（base/demo/demo-off 的 enable/disable 覆盖）。
  if (/\/packages\/bundle\/.+?\/cordis\.patch\.yml$/.test(n)) return true
  // core 编织（Definitions/事件/校验）。
  if (/\/packages\/core\/src\/.+\.ts$/.test(n)) return true
  // 插件 sidecar 半身：注册声明本身（src/index.ts）。
  if (/\/packages\/plugins\/[^/]+\/src\/index\.ts$/.test(n)) return true
  // 插件 webview 半身里非组件源码（样式单一来源如 styles.ts）；.tsx 归 Vite Fast Refresh。
  if (/\/packages\/plugins\/[^/]+\/src\/client\/.+\.ts$/.test(n)) return true

  return false
}

/** watched 根目录（各自递归监听）。 */
function watchRoots(repoRoot: string): string[] {
  return [
    resolve(repoRoot, 'packages/core/src'),
    resolve(repoRoot, 'packages/plugins'),
    resolve(repoRoot, 'packages/bundle'),
  ].filter((p) => existsSync(p))
}

/**
 * 附加 dev watcher；返回可撤销 disposer（shutdown 时调用）。变更经 debounce 后仅触发一次。
 */
export function attachDevWatcher(repoRoot: string, onChange: ReloadNotifier): () => void {
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const schedule = (full: string) => {
    const prev = timers.get(full)
    if (prev) clearTimeout(prev)
    const t = setTimeout(() => {
      timers.delete(full)
      onChange(full)
    }, 250)
    timers.set(full, t)
  }

  for (const root of watchRoots(repoRoot)) {
    try {
      const w = watch(root, { recursive: true }, (_event, filename) => {
        if (typeof filename !== 'string' || filename === '') return
        const full = resolve(root, filename)
        if (isSidecarHalf(full)) schedule(full)
      })
      watchers.push(w)
    } catch (err) {
      // dev-only：监听失败不致命，仅记录（例如平台不支持 recursive 时降级为空操作）。
      process.stderr.write(
        `[sidecar][dev] watch failed for ${root}: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }

  return () => {
    for (const [, t] of timers) clearTimeout(t)
    timers.clear()
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        /* dev-only：忽略关闭异常 */
      }
    }
  }
}