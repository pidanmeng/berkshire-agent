/**
 * T1 最小 demo client 模块组件（能力块 A）：读取 `stock-preview.footer` 槽位上下文渲染。
 *
 * 类名 `.bk-demo-minimal` 与 sidecar 注册的 scoped 样式类名一致——该样式由
 * `ClientModuleHost` 经 `<style data-bk-module>` 注入并被作用域隔离，不污染宿主。
 *
 * 诚实边界：这是 T1「手写测试 bundle」的 webview 半身，T3 会以正式 demo 插件替换。
 */
import type { SlotComponent } from "../slots/registry"
import type { FrontendSlotContextMap } from "../slots/types"

type FooterContext = FrontendSlotContextMap["stock-preview.footer"]

/** 接受任意 object 上下文，运行期按 footer 契约取值；类型擦除见 registry 的 SlotComponent。 */
export const DemoMinimal: SlotComponent<object> = ({ context }) => {
  const c = context as FooterContext
  return (
    <div className="bk-demo-minimal">
      <strong>T1 client 模块已挂载</strong> — {c.name ?? c.symbol}（{c.symbol} · view={c.view}）。
      样式经 <code>data-bk-module</code> 作用域隔离，不污染宿主与其它插件。
    </div>
  )
}