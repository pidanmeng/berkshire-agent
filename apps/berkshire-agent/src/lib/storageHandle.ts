/**
 * 宿主侧持久化句柄实现（设置弹窗接入持久化管线的 webview 侧接线点）。
 *
 * 把 webview 薄客户端 `lib/api.ts` 的 storage* 命令 + `onStorageChanged` 事件，适配成
 * `@berkshire/ui-slots` 的 `StorageHandle` 契约，随 `root` 槽 context 注入壳（base-ui），
 * 再由壳经 `settings.section` 槽分发给各插件设置面板。统一走既有 $BK_HOME/state 管线
 * （Tauri command → Rust bridge → sidecar `ctx.storage` → `$BK_HOME/state/<ns>/<key>.json`）。
 */
import type {
  StorageChangedPayload,
  StorageHandle,
  StorageNamespaceId,
} from "@berkshire/ui-slots"
import {
  storageGet,
  storageRemove,
  storageSet,
  storageList,
  onStorageChanged,
} from "./api"

/**
 * 构造一个宿主 `StorageHandle`（单例化使用：`useMemo` 外包，避免每帧重建/重复订阅）。
 *
 * `subscribe` 返回同步退订函数：`onStorageChanged` 是异步 listen，故用 disposed 标记兜住
 * 「还未 ready 就先退订」的窗口（ready 后立即补退订），保证不泄漏。
 */
export function createStorageHandle(): StorageHandle {
  return {
    async get<T>(ns: StorageNamespaceId, key: string): Promise<T | null> {
      return storageGet<T>(ns, key)
    },
    set(ns: StorageNamespaceId, key: string, value: unknown): Promise<void> {
      return storageSet(ns, key, value)
    },
    remove(ns: StorageNamespaceId, key: string): Promise<void> {
      return storageRemove(ns, key)
    },
    list(ns: StorageNamespaceId): Promise<string[]> {
      return storageList(ns)
    },
    subscribe(cb: (payload: StorageChangedPayload) => void): () => void {
      let unlisten: (() => void) | undefined
      let disposed = false
      onStorageChanged(cb).then((u) => {
        unlisten = u
        if (disposed) u() // listen 就绪前已退订 → 立即补退订，避免泄漏
      })
      return () => {
        disposed = true
        unlisten?.()
      }
    },
  }
}