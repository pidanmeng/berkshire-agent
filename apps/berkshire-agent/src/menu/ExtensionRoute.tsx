/**
 * ExtensionRoute（T2 动态菜单页容器）：`analysis.menu` 菜单项对应的页面宿主。
 *
 * 每个动态路由指向本组件；内容最终落到 `analysis.menu` 槽位渲染器（`ExtensionSlot`），
 * 整体包 `ExtensionBoundary`——坏插件降级、绝不崩宿主页。页面内容仍归插件，挂点归中枢。
 *
 * 已知限制（诚实登记，T2 最小件）：本组件不按 `menu.id` 筛选内容，而是渲染 `analysis.menu`
 * 槽的**全部**注册件（`ExtensionSlot` 槽并集语义）。当前只有一个 `demo-analysis` 项所以正常；
 * 一旦有第二个 `analysis.menu` 项，两个页面都会互相显示彼此的内容，且菜单项 id 与内容模块 id
 * 只靠命名约定对应、无强制。此限制在 v-next 前不修复，先登记在此。
 */
import { ExtensionBoundary } from "../lib/ExtensionBoundary"
import ExtensionSlot from "../slots/ExtensionSlot"

export default function ExtensionRoute({ title }: { title: string }) {
  return (
    <section className="extension-page">
      <h2>{title}</h2>
      <ExtensionBoundary>
        <div className="analysis-page-content">
          <ExtensionSlot name="analysis.menu" context={{}} />
        </div>
      </ExtensionBoundary>
    </section>
  )
}