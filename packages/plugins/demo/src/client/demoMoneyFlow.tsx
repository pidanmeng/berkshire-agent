/**
 * demo 插件 webview 半身第 3 块（能力块 B + A + C）：`analysis.menu` 资金流向页内容。
 *
 * 类名来自插件独立打包阶段编译产物 `./styles.generated.ts`（P3：lightningcss 哈希 CSS Modules）。
 * 表格为**静态占位数据，显式标注 demo，不冒充真实行情**（数据契约红线精神：见到即知道是假的）。
 * 页面内容归插件、挂点归中枢——本组件是插件声明的资金流向页的内容。
 *
 * S3b：视觉对齐 S1，表格复用 `@berkshire/ui` Table，样式只写 var(--bk-*)。
 */
import type { ReactNode } from "react"
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@berkshire/ui"
import { moneyFlow } from "./styles.generated"

/** demo 静态占位数据（仅供演示页面结构，非真实行情，勿用于任何决策）。 */
const PLACEHOLDER_ROWS = [
  { name: "示例个股 A", delta: "+1.2 亿", note: "占位" },
  { name: "示例个股 B", delta: "-0.8 亿", note: "占位" },
  { name: "示例个股 C", delta: "+0.4 亿", note: "占位" },
]

export const DemoMoneyFlow = (_: { context: unknown }): ReactNode => (
  <div className={moneyFlow.classNames.moneyFlow}>
    <div className={moneyFlow.classNames.head}>
      <h2 className={moneyFlow.classNames.title}>资金流向（demo）</h2>
      <Badge kind="warning" variant="soft">
        静态占位
      </Badge>
    </div>
    <p className={moneyFlow.classNames.hint}>
      下表为静态占位数据（demo），非真实行情，仅供 demo 插件验证「页面 + 组件 + scoped 样式」一体落地。
    </p>
    <div className={moneyFlow.classNames.tableWrap}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>标的</TableHead>
            <TableHead>资金净流入</TableHead>
            <TableHead>标注</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PLACEHOLDER_ROWS.map((r) => (
            <TableRow key={r.name}>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.delta}</TableCell>
              <TableCell>{r.note}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
)