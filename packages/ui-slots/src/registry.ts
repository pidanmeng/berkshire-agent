/**
 * slot 注册表（T0 最小落点，能力块 A 的地基；T1 补上反应式订阅）。
 *
 * 宿主/插件预挖固定槽位（见 types.ts 的 `FrontendSlotContextMap`），插件往槽里挂 React 组件。
 * 本模块负责：运行时校验（id 格式 / 重复 id / API 版本 / 未知槽位）、按 `order` 排序、
 * 返回「可逆 disposer」，并让 `ExtensionSlot` 按槽位取快照渲染。
 *
 * T1：本表还提供 `subscribe` / `getSnapshot`（useSyncExternalStore 用的反应式契约），
 * 使 sidecar 快照经宿主 `ClientModuleHost` 注册进来的组件能被 `ExtensionSlot` 实时重渲染
 * （注册/卸除即 bump + 通知，卸载后样式与组件一并移除）。
 *
 * 诚实标注：本包是**共享 UI 缝引擎**（对齐 dsh `@dsh-client-ui-slots` 的 `SlotCore`），
 * 从宿主 `apps/berkshire-agent/src/slots/registry.ts` 迁出；注册表只存 webview 内直连注册的
 * 本地组件，sidecar 侧 `ctx.slots`/`ctx.clientModules`（packages/core）经 `client/list` 快照 +
 * 宿主 `ClientModuleHost` 汇入本表。远程 `bk://` bundle、HMR、store 仍目标态。
 */
import type { ComponentType } from "react"
import {
  FRONTEND_SLOT_NAMES,
  type FrontendSlotContextMap,
  type FrontendSlotName,
} from "./types"

/** 当前约定的 slot API 版本（跨边界演进时的版本栅栏；现唯一值 1）。 */
export const SLOT_API_VERSION = 1

/**
 * 注册时的 id 格式校验：`owner:name` 命名空间式，小写字母/数字 + 连字符，冒号作分隔，
 * owner 在后接 1..4 段。防止「凭格式猜类型」与路径注入类误用。
 */
const REG_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:-[a-z0-9]+)*){1,4}$/

/**
 * 槽的承接语义（对齐 dsh `SlotCore` 的 `SlotKind='single'|'list'`）：
 * - `single`：全场**仅一份**，如根 `root` 槽的壳帧——重复注册 fail-closed 拒绝；
 * - `list`：同一槽可挂多个组件（默认，导航/状态项/设置卡片等）。
 */
export type SlotKind = "single" | "list"

/** 各槽承接语义表（缺省 `list`）。现仅 `root` 为 `single`（壳帧唯一）。 */
export const SLOT_KINDS: Readonly<Partial<Record<FrontendSlotName, SlotKind>>> = {
  root: "single",
}

/** 取某槽的承接语义（缺省 `list`）。 */
function slotKind(name: FrontendSlotName): SlotKind {
  return SLOT_KINDS[name] ?? "list"
}

/** slot 组件的 props 约定：宿主/插件把该槽位的上下文/actions 以 `context` 属性注入。 */
export type SlotComponent<C extends object> = ComponentType<{ context: C }>

/** 一次 slot 注册的声明。 */
export interface SlotRegistration<C extends object> {
  /** 插件稳定 id（`owner:name` 命名空间式，同一槽内须唯一）。 */
  id: string
  /** 渲染组件，接收该槽位的 `context`。 */
  component: SlotComponent<C>
  /** 排序权重，缺省 100；同值按注册先后稳定。 */
  order?: number
  /** 声明使用的 slot API 版本，须等于 {@link SLOT_API_VERSION}。 */
  apiVersion?: number
}

/** 注册表内部一条已校验的注册（类型擦除后统一存放，渲染时按槽位取值）。 */
type StoredSlotRegistration = SlotRegistration<object> & { order: number }

/**
 * 前端 slot 注册表（共享中枢，不实现业务 UI）。新增/修改/删除都经这里，返回 disposer，
 * 调用方可热卸不泄漏（注册即效应）；带反应式订阅供 `ExtensionSlot` 实时重渲染。
 */
export class SlotRegistry {
  private slots = new Map<FrontendSlotName, StoredSlotRegistration[]>()
  private snapshotCache = new Map<FrontendSlotName, readonly StoredSlotRegistration[]>()
  private listeners = new Set<() => void>()

  /**
   * 订阅注册表变化；返回退订函数。配合 {@link getSnapshot} 供 `useSyncExternalStore` 使用。
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 某槽位注册表的稳定快照（仅在该槽注册/卸除后替换引用，满足 store 契约）。 */
  getSnapshot<K extends FrontendSlotName>(name: K): readonly StoredSlotRegistration[] {
    let snap = this.snapshotCache.get(name)
    if (!snap) {
      snap = []
      this.snapshotCache.set(name, snap) // 稳定化空快照，避免每次返回新数组
    }
    return snap
  }

  private bump(name: FrontendSlotName): void {
    const list = this.slots.get(name)
    this.snapshotCache.set(name, list ? [...list].sort((a, b) => a.order - b.order) : [])
    for (const l of this.listeners) l()
  }

  /**
   * 校验并写入一条注册；不合法输入一律抛错（fail-closed），成功返回可逆 disposer。
   *
   * 泛型把 slot 名与其上下文绑死：对该槽的注册，`component` 的 `context` 类型即
   * `FrontendSlotContextMap[K]`。
   */
  register<K extends FrontendSlotName>(
    name: K,
    reg: SlotRegistration<FrontendSlotContextMap[K]>,
  ): () => void {
    this.assertSlotName(name)
    this.assertRegistration(reg)

    // single 语义（如根 root 槽的壳帧）：全场仅一份，重复注册 fail-closed 拒绝。
    const existingEntries = this.slots.get(name) ?? []
    if (slotKind(name) === "single" && existingEntries.length > 0) {
      throw new Error(`[slots] slot '${name}' 是 single 语义（全场唯一，如壳帧），已有注册，拒绝重复`)
    }

    const apiVersion = reg.apiVersion ?? SLOT_API_VERSION
    if (apiVersion !== SLOT_API_VERSION) {
      throw new Error(
        `[slots] 扩展 '${reg.id}' 请求 slot API v${apiVersion}，当前仅支持 v${SLOT_API_VERSION}`,
      )
    }

    const stored: StoredSlotRegistration = {
      ...reg,
      order: reg.order ?? 100,
    } as unknown as StoredSlotRegistration

    const list = this.slots.get(name)
    if (list?.some((r) => r.id === reg.id)) {
      throw new Error(`[slots] 重复 id '${reg.id}' 注册到 slot '${name}'`)
    }
    if (list) {
      list.push(stored)
    } else {
      this.slots.set(name, [stored])
    }
    this.bump(name)

    return () => {
      const current = this.slots.get(name)
      if (!current) return
      const idx = current.indexOf(stored)
      if (idx >= 0) current.splice(idx, 1)
      this.bump(name)
    }
  }

  private assertSlotName(name: string): asserts name is FrontendSlotName {
    if (!FRONTEND_SLOT_NAMES.includes(name as FrontendSlotName)) {
      throw new Error(
        `[slots] 未知 slot '${name}'，可用：${FRONTEND_SLOT_NAMES.join(", ")}（挂点归中枢，插件只挂内容）`,
      )
    }
  }

  /**
   * 校验时使用的「擦除版」声明：只关心校验需要的字段，避免被 `SlotComponent<C>` 在
   * 泛型下的逆变不兼容卡住（class 组件与 `ComponentType` 联合在 contravariance 下不
   * 好做拆包）。运行时校验只取原始字段形状，不依赖具体上下文类型。
   */
  private assertRegistration(reg: ErasedSlotReg): void {
    if (typeof reg !== "object" || reg === null) {
      throw new Error("[slots] 注册声明必须是一个对象")
    }
    if (typeof reg.id !== "string" || !REG_ID_RE.test(reg.id)) {
      throw new Error(
        `[slots] 非法 id '${String(reg.id)}'：须为 'owner:name' 命名空间式（小写字母/数字 + 连字符）`,
      )
    }
    if (typeof reg.component !== "function") {
      throw new Error(`[slots] 扩展 '${reg.id}' 缺 component 渲染组件`)
    }
    if (reg.order !== undefined && (typeof reg.order !== "number" || Number.isNaN(reg.order))) {
      throw new Error(`[slots] 扩展 '${reg.id}' 的 order 必须是数字`)
    }
  }
}

/** 校验用的擦除版注册声明（字段按各自原始类型取值，组件先放宽到 unknown）。 */
type ErasedSlotReg = {
  id?: unknown
  order?: unknown
  apiVersion?: unknown
  component?: unknown
}

/** 全局唯一 slot 注册表（共享中枢单例，供 `ExtensionSlot` 与各注册方共享）。 */
export const slotRegistry = new SlotRegistry()