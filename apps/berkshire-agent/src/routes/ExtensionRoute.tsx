/**
 * ExtensionRoute（动态页容器，路由契约化）：插件自声明的一条路由对应的页面宿主。
 *
 * 每条路由由插件声明（`route` 挂在某 slot 的占用声明上），本组件按其 `slot` 渲染该槽位
 * （`ExtensionSlot`），整体包 `ExtensionBoundary`——坏插件降级、绝不崩宿主页。页面内容仍归插件，
 * 挂点/路由宿主归中枢。slot 名来自 sidecar（跨边界字符串），宿主在渲染前按已知槽位 `FRONTEND_SLOT_NAMES`
 * 校验，未知/非法 slot 一律 fail-closed 不渲染（路由宿主不隐式信任下游字符串）。
 *
 * 已知限制（诚实登记，本轮最小件）：本组件渲染的是 `slot` 槽的**全部**注册件（`ExtensionSlot`
 * 槽并集语义），不按 `route.id` 筛选。当前每条路由的 slot 各自只挂一个注册件所以正常；一旦同一个
 * slot 被多个带 `route` 的声明复用（多页面共用一个槽），各页会互相显示彼此的内容，且声明 id 与
 * 内容模块 id 只靠命名约定对应、无强制。此限制在 v-next 前不修复，先登记在此。
 */
import { ExtensionBoundary, ExtensionSlot, FRONTEND_SLOT_NAMES } from "@berkshire/ui-slots"
import styles from "./ExtensionRoute.module.css"

export default function ExtensionRoute({ title, slot }: { title: string; slot: string }) {
  // 路由宿主 fail-closed：sidecar 给的 slot 必须在已知槽位内，否则不渲染。
  if (!(FRONTEND_SLOT_NAMES as readonly string[]).includes(slot)) {
    console.warn(`[ExtensionRoute] 未知 slot '${slot}'，路由 '${title}' 不渲染`)
    return null
  }
  return (
    <section className={styles.page}>
      <h2>{title}</h2>
      <ExtensionBoundary>
        <div className={styles.content}>
          <ExtensionSlot name={slot as never} context={{} as never} />
        </div>
      </ExtensionBoundary>
    </section>
  )
}