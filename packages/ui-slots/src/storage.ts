/**
 * webview 侧持久化句柄契约 + 表单字段「一键 KV」hook（设置弹窗接入持久化管线，WP-7）。
 *
 * 背景：持久化管线在宿主侧已端到端跑通
 *   - `lib/api.ts` `storage_get/set/remove/list` + `onStorageChanged`（Tauri command → Rust → sidecar
 *     `ctx.storage` → `$BK_HOME/state/<ns>/<key>.json`，见 `packages/sidecar/src/storage-provider.ts`）。
 *   但 base-ui/demo 等 **webview 插件** 架构上禁止 import 宿主 `lib/api`（插件独立打包、只吃共享缝）。
 *   故这里把「稳定读取 + 逐个字段落 KV」抽象成共享契约与 hook，宿主实现 `StorageHandle` 后随
 *   `root`/`settings.section` 槽 context 注入，插件表单与宿主表单统一经它接持久化——
 *   **无论表单项来自哪个设置面板（壳自带 / 其它 provider 经 settings.section 贡献），每个字段一个 KV**。
 *
 * 诚实边界：
 * - `StorageHandle` 是 webview 本地域的共享缝契约（`StorageNamespaceId` 为 UI 侧 brand，镜像
 *   `@berkshire/core` 跨边界的同名 brand，结构等价、语义一致；v2 共享类型层债务，同 types.ts）。
 * - 无 handle 时 `usePersistedField` 退化为纯本地状态（不崩溃，加载初值即可用），便于壳未/暂未接线。
 * - 读写失败一律把错误冒出到字段的 `error`（fail-closed），绝不静默吞。
 */
import { useEffect, useRef, useState } from "react"

/** 跨边界/跨包品牌 id 基础（镜像 @berkshire/core 的 Branded，webview 本地域）。 */
export type Branded<T, S extends string> = T & { readonly __brand: S }

/** 存储命名空间 id（webview 本地域）：决定 `$BK_HOME/state/<ns>/` 目录。 */
export type StorageNamespaceId = Branded<string, "storage-namespace">

/** `storage/set` 或 `storage/remove` 成功后的变化载荷（宿主经 storage/changed 事件转发）。 */
export interface StorageChangedPayload {
  ns: StorageNamespaceId
  key: string
}

/**
 * 宿主实现的持久化句柄（接 `lib/api.ts` 的 storage* 函数）；经槽 context 注入壳/插件。
 *
 * 与 `@berkshire/core` 的 `StorageProvider` 同构（同一持久化管线），但面向 webview：
 * - `get` 在键缺失返回 `null`（sidecar 已归一化；core 侧为 `undefined`）；
 * - `subscribe` 订阅**任何**命名空间下的变化，返回同步退订函数（宿主经 `sidecar://storage/changed` 转发）。
 */
export interface StorageHandle {
  get<T = unknown>(ns: StorageNamespaceId, key: string): Promise<T | null>
  set(ns: StorageNamespaceId, key: string, value: unknown): Promise<void>
  remove(ns: StorageNamespaceId, key: string): Promise<void>
  list(ns: StorageNamespaceId): Promise<string[]>
  /** 订阅任意命名空间下 `set`/`remove` 后的变化；返回退订函数。 */
  subscribe(cb: (payload: StorageChangedPayload) => void): () => void
}

export interface PersistedFieldOptions<T> {
  /** 键缺失 / storage 不可用时的初值。 */
  defaultValue: T
  /**
   * 提交前校验/门控：返回 `{ ok:false, message }` 则**不持久化**（仅保留输入并置 `error`），
   * 用于可选 loud-fail 的字段（如模型 Key 引用名校验）。不传则总是持久化。
   */
  commit?: (next: T) => { ok: boolean; message?: string }
}

export interface PersistedField<T> {
  /** 当前值（首帧为初值，加载完成前亦可编辑）。 */
  value: T
  /** 更新本地值；`commit` 通过时写入 KV，否则仅保留输入并置 `error`。 */
  set: (next: T) => void
  /** 加载/校验/写入失败的提示（无则 `undefined`）。 */
  error?: string
  /** 是否仍在从持久化读取初值。 */
  loading: boolean
}

/**
 * 把**一个表单项对应到一个 KV**（`$BK_HOME/state/<ns>/<key>.json`）的 hook。
 *
 * - 首帧：从持久化加载初值（缺失用 `defaultValue`）；加载失败把错误冒到 `error`（fail-closed）。
 * - 写入：`set(next)` 更新本地值并（通过 `commit` 时）异步落盘；写失败冒到 `error`。
 * - 同步：订阅 `storage/changed`，外部/他处写入同一键时重读对齐（多面板/多窗口一致）。
 * - `storage` 为 `undefined`（壳未接线）→ 纯本地态，不改任何键。
 */
export function usePersistedField<T>(
  storage: StorageHandle | undefined,
  ns: StorageNamespaceId,
  key: string,
  opts: PersistedFieldOptions<T>,
): PersistedField<T> {
  const [value, setValue] = useState<T>(opts.defaultValue)
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(storage != null)
  // 用 ref 兜住最新 opts/key/ns，避免 effect 依赖抖动导致重复订阅/加载。
  const optsRef = useRef(opts)
  optsRef.current = opts
  const ref = useRef({ ns, key })
  ref.current = { ns, key }

  // 首帧：从持久化加载初值（键缺失保留默认；坏文件/越权 fail-closed 冒错）。
  useEffect(() => {
    if (!storage) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    storage
      .get<T>(ns, key)
      .then((v) => {
        if (!alive) return
        if (v != null) setValue(v)
        setError(undefined)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [storage, ns, key])

  // 订阅外部写入同键：重读对齐（幂等，避免多面板/重开弹窗漂移）。
  useEffect(() => {
    if (!storage) return
    return storage.subscribe((p) => {
      if (p.ns === ref.current.ns && p.key === ref.current.key) {
        storage
          .get<T>(ref.current.ns, ref.current.key)
          .then((v) => {
            if (v != null) setValue(v)
          })
          .catch(() => {
            /* 同步对账失败不阻断（初始加载已冒错，这里静默避免噪声） */
          })
      }
    })
  }, [storage, ns, key])

  const set = (next: T) => {
    // 先更新本地输入（用户所见即所输）；校验不过则仅保留输入、不落盘。
    setValue(next)
    const commit = optsRef.current.commit
    if (commit) {
      const r = commit(next)
      if (!r.ok) {
        setError(r.message)
        return
      }
    }
    setError(undefined)
    if (!storage) return
    storage.set(ref.current.ns, ref.current.key, next).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
    })
  }

  return { value, set, error, loading }
}