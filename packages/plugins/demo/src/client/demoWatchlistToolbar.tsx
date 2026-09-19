/**
 * demo 插件 webview 半身第 2 块（能力块 A+C）：`watchlist.toolbar` 工具栏组件。
 *
 * 类的 `.bk-demo-watchlist-toolbar` 与同包 `./styles.ts` 的类名一致（scoped 样式单一来源）。
 * `ToolbarContext` 是对宿主 `slots/types.ts` `watchlist.toolbar` 上下文的**结构镜像**（v2 共享类型层）。
 */
import type { ReactNode } from "react"

/** 言行 `watchlist.toolbar` 槽位上下文的插件侧结构。 */
interface ToolbarContext {
  symbols?: string[]
  viewMode?: string
  refresh?: () => void
}

export const DemoWatchlistToolbar = ({ context }: { context: unknown }): ReactNode => {
  const c = context as ToolbarContext
  return (
    <span className="bk-demo-watchlist-toolbar">
      self 看板（demo）：{c.symbols?.length ?? 0} 只 · 视图 {c.viewMode}
      <button
        type="button"
        onClick={() => c.refresh?.()}
        style={{ marginLeft: "0.4rem", border: "none", background: "none", cursor: "pointer" }}
        title="demo 刷新（占位）"
      >
        ⟳
      </button>
    </span>
  )
}