/**
 * demo 插件 webview 半身第 3 块（能力块 B + A + C）：`analysis.menu` 资金流向页内容。
 *
 * 类的 `.bk-demo-money-flow` 与同包 `./styles.ts` 的类名一致。表格为**静态占位数据，
 * 显式标注 demo，不冒充真实行情**（数据契约红线精神：见到即知道是假的）。
 * 页面内容归插件、挂点归中枢——本组件是插件声明的资金流向页的内容。
 */
import type { ReactNode } from "react"

/** demo 静态占位数据（仅供演示页面结构，非真实行情，勿用于任何决策）。 */
const PLACEHOLDER_ROWS = [
  { name: "示例个股 A", delta: "+1.2 亿", note: "占位" },
  { name: "示例个股 B", delta: "-0.8 亿", note: "占位" },
  { name: "示例个股 C", delta: "+0.4 亿", note: "占位" },
]

export const DemoMoneyFlow = (_: { context: unknown }): ReactNode => (
  <div className="bk-demo-money-flow">
    <strong>资金流向（demo）</strong> —— 下表为静态占位数据（demo），
    非真实行情，仅供 demo 插件验证「页面 + 组件 + scoped 样式」一体落地。
    <table>
      <thead>
        <tr>
          <th>标的</th>
          <th>资金净流入</th>
          <th>标注</th>
        </tr>
      </thead>
      <tbody>
        {PLACEHOLDER_ROWS.map((r) => (
          <tr key={r.name}>
            <td>{r.name}</td>
            <td>{r.delta}</td>
            <td>{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)