/**
 * ClientModuleHost（T1 核心挂载器，能力块 A+C 的 webview 半身）。
 *
 * 无 UI（返回 null）的调度组件：拉取 sidecar `client/list` 快照 + 订阅
 * `sidecar://client/changed`，对每个注册——把 bundle 解析成本地模块（loader）、
 * 注入 scoped 样式、按 slot 名交给 T0 的 `slotRegistry`（进而由 `ExtensionSlot` 渲染）。
 * 断链/卸载时：样式与组件一并移除（disposer + 样式移除），宿主页不崩。
 *
 * 诚实边界：远程 `bk://` bundle、HMR、store 作用域仍目标态；本组件用本地模块引用证明链路。
 */
import { useEffect } from "react"
import { clientList, onClientChanged, type ClientModule } from "../lib/api"
import { injectModuleStyle, loadClientModule } from "./loader"
import {
  slotRegistry,
  type SlotComponent,
  FRONTEND_SLOT_NAMES,
  type FrontendSlotContextMap,
  type FrontendSlotName,
} from "@berkshire/ui-slots"

export default function ClientModuleHost() {
  useEffect(() => {
    let cancelled = false
    let detachEvent: (() => void) | undefined
    // 已挂载的 client 模块：id → 清理函数（卸载组件 + 移除 scoped 样式）。
    const mounted = new Map<string, () => void>()
    // 串行化 reconcile：同一时刻至多一个在跑，事件在 apply 期间到达时排队等下一个，杜绝竞态。
    let chain: Promise<void> = Promise.resolve()

    const apply = async () => {
      let list: ClientModule[]
      try {
        list = await clientList()
      } catch (e) {
        // bridge 断/超时：fail-closed，保留已挂载项，不崩页（宿主可继续交互）。
        console.warn("[ClientModuleHost] client/list 不可用:", e)
        return
      }

      const seen = new Set<string>()
      for (const m of list) seen.add(String(m.id))

      // 卸载已不在快照里的模块（逆序由 consumers 自己保证；这里逐条清理）。
      for (const [id, cleanup] of mounted) {
        if (!seen.has(id)) {
          cleanup()
          mounted.delete(id)
        }
      }

      // 挂载新出现的模块。
      for (const m of list) {
        const id = String(m.id)
        if (mounted.has(id)) continue

        const def = loadClientModule(m.bundle)
        if (!def) {
          console.warn(`[ClientModuleHost] 未找到本地模块 ${m.bundle}（远程 bk:// 为 v-next）`)
          continue
        }
        if (!FRONTEND_SLOT_NAMES.includes(m.slot as FrontendSlotName)) {
          console.warn(`[ClientModuleHost] 未知 slot '${m.slot}'，跳过（fail-closed）`)
          continue
        }

        let detachStyle = () => {}
        if (m.style) detachStyle = injectModuleStyle(id, m.style)

        let off: () => void = () => {}
        try {
          // m.slot 运行时先经 FRONTEND_SLOT_NAMES 校验；把 loader 擦除的组件类型
          // 按该槽位的 context 契约装回（动态槽位下 TS 无法静态推导，属声明的类型擦除边界）。
          off = slotRegistry.register(m.slot as FrontendSlotName, {
            id: `client:${id}`,
            component: def.component as unknown as SlotComponent<
              FrontendSlotContextMap[FrontendSlotName]
            >,
          })
        } catch (e) {
          detachStyle()
          console.warn(`[ClientModuleHost] 注册 ${id} 失败（fail-closed）:`, e)
          continue
        }
        mounted.set(id, () => {
          off()
          detachStyle()
        })
      }
    }

    // 串行化的 reconcile 入队；失败只告警，不让链断裂（后续事件仍能驱动下一轮）。
    const reconcile = () => {
      chain = chain.then(apply).catch((e) => {
        console.warn("[ClientModuleHost] reconcile 失败:", e)
      })
    }

    // 先订阅、后首拉——订阅建立后的事件不再有丢失窗口，首拉兜底拿全量初始快照。
    // 仅 `kind: 'clientModules'` 才触发重拉：`ctx.slots` 的占用声明（kind 'slots'）不驱动
    // `client/list`（它只投 `ctx.clientModules`），留给 T2 的菜单/路由语义。
    void onClientChanged((p) => {
      if (p.kind !== "clientModules") return
      reconcile()
    })
      .then((un) => {
        if (cancelled) {
          un()
          return
        }
        detachEvent = un
        reconcile()
      })
      .catch((e) => {
        // 订阅本身失败（bridge 断）：仍尝试首拉，之后无事件可依，按快照挂载一次。
        console.warn("[ClientModuleHost] onClientChanged 订阅失败:", e)
        reconcile()
      })

    return () => {
      cancelled = true
      detachEvent?.()
      for (const cleanup of mounted.values()) cleanup()
      mounted.clear()
    }
  }, [])

  // 纯调度者：真实渲染经 slotRegistry → ExtensionSlot（App 里的槽位演示点）完成。
  return null
}