/**
 * demo 插件 webview 半身第 1 块（能力块 A+C）：`stock-preview.footer` 底部组件。
 *
 * 类的 `.bk-demo-fund-flow` 与同包 `./styles.ts`（scoped 样式单一来源）的类名一致——该样式经
 * sidecar `client/list` → webview `loader.ts` 的 `<style data-bk-module>` 注入并被作用域隔离。
 *
 * 诚实标注：下面 `FooterContext` 是对 webview 宿主 `slots/types.ts` 的 `FrontendSlotContextMap`
 * `stock-preview.footer` **结构镜像**（跨包不 import 宿主，避免环形依赖；真正的共享类型层是 v2）。
 * 宿主在挂载时以显式 cast 对齐（见 `ClientModuleHost`），故结构一致即可。
 */
import type { ReactNode } from "react"

/** 言行 `stock-preview.footer` 槽位上下文的插件侧结构（字段取值用 `unknown` 容忍可选/运行时差异）。 */
interface FooterContext {
  symbol?: string
  name?: string
  view?: string
}

/** 接受任意 object 上下文，运行期按 footer 契约取值；返回 type 用 ReactNode（React 由宿主提供）。 */
export const DemoFundFlow = ({ context }: { context: unknown }): ReactNode => {
  const c = context as FooterContext
  return (
    <div className="bk-demo-fund-flow">
      <strong>资金流向（demo）已挂载</strong> — {c.name ?? c.symbol}（{c.symbol} · view={c.view}）。
      由 <code>@berkshire/plugin-demo</code> 注册，样式 scoped、可整体卸载。
    </div>
  )
}