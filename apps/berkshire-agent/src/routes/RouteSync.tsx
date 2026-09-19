/**
 * RouteSync（动态路由同步器，路由契约化）：拉取 sidecar `routes/list` 快照 + 订阅
 * `sidecar://client/changed`，刷新 `routesStore`（导航 + 路由据此生成）。无 UI、可热装卸；
 * bridge 断/超时 fail-closed 保留现有导航。
 */
import { useEffect } from "react"
import { onClientChanged, routesList } from "../lib/api"
import { routesStore } from "./routesStore"

export default function RouteSync() {
  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const items = await routesList()
        if (cancelled) return
        routesStore.replace(
          items.map((r) => ({ id: r.id, title: r.title, path: r.path, slot: r.slot })),
        )
      } catch (e) {
        // bridge 断/超时：fail-closed，保留现有导航，不崩页。
        console.warn("[RouteSync] routes/list 不可用:", e)
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