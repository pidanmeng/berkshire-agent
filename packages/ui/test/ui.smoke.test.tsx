/**
 * `@berkshire/ui` 冒烟测试 —— 服务端渲染原子组件（无需浏览器/DOM）。
 *
 * 用 `react-dom/server` 的 `renderToStaticMarkup` 静态断言：组件能独立渲染、props 生效。
 * 只测无交互副作用的可 SRR 组件；Modal/Toast/Dropdown 依赖 hooks 运行期行为，不在侧抽样。
 */
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Divider,
  EmptyState,
  Input,
  Notification,
  Popover,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
} from "../src/index"

describe("@berkshire/ui 冒烟", () => {
  test("Button 渲染 label 与 loading spinner", () => {
    const html = renderToStaticMarkup(<Button>买入</Button>)
    expect(html).toContain("买入")
    expect(html).not.toContain("spinner")
    const loading = renderToStaticMarkup(<Button loading>提交</Button>)
    expect(loading).toContain('aria-busy="true"')
  })

  test("Input 关联 label（htmlFor/id）", () => {
    const html = renderToStaticMarkup(<Input label="股票代码" defaultValue="600000" />)
    expect(html).toContain("股票代码")
    expect(html).toContain("600000")
  })

  test("Badge 渲染上下文（bull/bear 语义类经 CSS Modules 注入，bun test 不映射类名，故仅断言渲染无措）", () => {
    expect(renderToStaticMarkup(<Badge kind="bull">+3.2%</Badge>)).toContain("+3.2%")
    expect(renderToStaticMarkup(<Badge kind="bear">-1.1%</Badge>)).toContain("-1.1%")
  })

  test("Notification 渲染 kind 与正文", () => {
    const html = renderToStaticMarkup(<Notification kind="error" title="失败">无法拉取行情</Notification>)
    expect(html).toContain("失败")
    expect(html).toContain("无法拉取行情")
  })

  test("Select 渲染 options", () => {
    const html = renderToStaticMarkup(
      <Select label="时间周期" options={[{ value: "1d", label: "日线" }, { value: "1w", label: "周线" }]} />,
    )
    expect(html).toContain("日线")
    expect(html).toContain("周线")
  })

  test("EmptyState 渲染标题与描述", () => {
    const html = renderToStaticMarkup(<EmptyState title="暂无自选" description="添加股票以开始" />)
    expect(html).toContain("暂无自选")
    expect(html).toContain("添加股票以开始")
  })

  test("Tooltip 关联 aria-describedby", () => {
    expect(renderToStaticMarkup(<Tooltip tip="说明">?</Tooltip>)).toContain("aria-describedby")
  })

  test("Badge 默认 soft 变体 + 可切 outline/solid（API 兼容）", () => {
    expect(renderToStaticMarkup(<Badge kind="success">通过</Badge>)).toContain("通过")
    expect(renderToStaticMarkup(<Badge kind="danger" variant="solid">错误</Badge>)).toContain("错误")
    expect(renderToStaticMarkup(<Badge kind="info" variant="outline">信息</Badge>)).toContain("信息")
  })

  test("Card 组合渲染 header/title/description/content", () => {
    const html = renderToStaticMarkup(
      <Card>
        <CardHeader>
          <CardTitle>自选股</CardTitle>
          <CardDescription>一组关注的标的</CardDescription>
        </CardHeader>
        <CardContent>600000</CardContent>
      </Card>,
    )
    expect(html).toContain("自选股")
    expect(html).toContain("一组关注的标的")
    expect(html).toContain("600000")
    expect(html).toContain("<h3")
  })

  test("Table 组合渲染表头与单元格", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>代码</TableHead>
            <TableHead>名称</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>600000</TableCell>
            <TableCell>浦发银行</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(html).toContain("代码")
    expect(html).toContain("浦发银行")
    expect(html).toContain("<thead")
    expect(html).toContain("<tbody")
    expect(html).toMatch(/<th[^>]*scope="col"/)
  })

  test("Tabs 默认激活项渲染对应面板", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">概览</TabsTrigger>
          <TabsTrigger value="b">明细</TabsTrigger>
        </TabsList>
        <TabsContent value="a">概览内容</TabsContent>
        <TabsContent value="b">明细内容</TabsContent>
      </Tabs>,
    )
    expect(html).toContain("概览")
    expect(html).toContain("概览内容")
    expect(html).not.toContain("明细内容") // 非激活面板不渲染
    expect(html).toMatch(/role="tablist"/)
    expect(html).toMatch(/role="tabpanel"/)
  })

  test("Switch 渲染 role=switch 与 aria-checked", () => {
    const html = renderToStaticMarkup(<Switch checked label="自动刷新" />)
    expect(html).toMatch(/role="switch"/)
    expect(html).toMatch(/aria-checked="true"/)
    expect(html).toContain("自动刷新")
  })

  test("Checkbox 渲染原生 input + 可选 label", () => {
    const html = renderToStaticMarkup(<Checkbox defaultChecked label="记住我" />)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("记住我")
  })

  test("Popover 渲染 anchor（aria-expanded）且在 SSR（无 portal）下不吐面板内容", () => {
    const html = renderToStaticMarkup(
      <Popover trigger={<span>打开</span>} defaultOpen>
        <div data-panel>面板内容</div>
      </Popover>,
    )
    // trigger 按契约应为非交互内容；SSR 下 document.body 不存在 → portalTarget 为 null → 面板不渲染；
    // anchor 保留 aria-expanded。
    expect(html).toContain("打开")
    expect(html).toMatch(/aria-haspopup="dialog"/)
    expect(html).toMatch(/aria-expanded="true"/)
    expect(html).not.toContain("面板内容")
  })

  test("Popover 关闭态 anchor aria-expanded=false", () => {
    const html = renderToStaticMarkup(
      <Popover trigger={<span>打开</span>}>
        <div>面板内容</div>
      </Popover>,
    )
    expect(html).toMatch(/aria-expanded="false"/)
    expect(html).not.toContain("面板内容")
  })

  test("Divider 渲染 role=separator 与朝向", () => {
    const html = renderToStaticMarkup(<Divider orientation="horizontal" />)
    expect(html).toMatch(/role="separator"/)
    expect(html).toMatch(/aria-orientation="horizontal"/)
  })
})