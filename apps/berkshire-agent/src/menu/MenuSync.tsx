/**
 * MenuSync（T2 动态菜单同步器）：拉取 sidecar `menu/list` 快照 + 订阅 `sidecar://client/changed`，
 * 刷新 `menuStore`（导航 + 路由据此生成）。无 UI、可热装卸；bridge 断/超时 fail-closed 保留现有导航。
 */
import { useEffect } from "react"
import { menuList, onClientChanged } from "../lib/api"
import { menuStore } from "./menuStore"

export default function MenuSync() {
  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const items = await menuList()
        if (cancelled) return
        menuStore.replace(items.map((m) => ({ id: m.id, title: m.title, path: m.path })))
      } catch (e) {
        // bridge 断/超时：fail-closed，保留现有导航，不崩页。
        console.warn("[MenuSync] menu/list 不可用:", e)
      }
    }

    void refresh()
    let detach: (() => void) | undefined
    void onClientChanged(() => void refresh()).then((un) => {
      if (cancelled) un()
      else detach = un
    })

    return () => {
      cancelled = true
      detach?.()
    }
  }, [])

  return null
}