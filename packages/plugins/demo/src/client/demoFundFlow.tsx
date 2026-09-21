/**
 * demo 插件 webview 半身第 1 块（能力块 A+C）：`stock-preview.footer` 底部组件。
 *
 * 类名来自 **插件独立打包阶段编译产物** `./styles.generated.ts`（P3：lightningcss 哈希 CSS Modules）。
 * `.tsx` 只 import 哈希类名（构建期自动唯一），样式注入代码由 sidecar 经 `client/list` 交给
 * host `loader.ts` 以 `<style data-bk-module>` 注入。host 不参与哈希。
 *
 * S3b：视觉对齐 S1 设计语言（抬升面 + 边框分层 + 语义 info 边条），徽标经 `@berkshire/ui` Badge。
 *
 * 诚实标注：下面 `FooterContext` 是对 webview 宿主 `slots/types.ts` 的 `FrontendSlotContextMap`
 * `stock-preview.footer` **结构镜像**（跨包不 import 宿主，避免环形依赖；真正的共享类型层是 v2）。
 * 宿主在挂载时以显式 cast 对齐（见 `ClientModuleHost`），故结构一致即可。
 */
import type { ReactNode } from "react"
import { Badge } from "@berkshire/ui"
import { fundFlow } from "./styles.generated"

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
    <div className={fundFlow.classNames.fundFlow} role="status">
      <Badge kind="info" variant="soft">
        资金流向（demo）
      </Badge>
      <span>
        {c.name ?? c.symbol}（{c.symbol} · view={c.view}）
      </span>
      <code>@berkshire/plugin-demo</code>
    </div>
  )
}