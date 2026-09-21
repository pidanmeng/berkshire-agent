/**
 * `Breadcrumb` 冒烟测试 —— 服务端渲染（无需浏览器），断言结构语义与 items/maxItems 折叠路径。
 *
 * 用 `react-dom/server` 的 `renderToStaticMarkup` 静态断言：nav/ol/li 层级、分隔符 aria-hidden、
 * 当前页 aria-current="page"、以及 maxItems 折叠时省略「…」参与渲染。
 */
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../src/index"

describe("@berkshire/ui Breadcrumb", () => {
  test("数组形态渲染 nav/ol/li、父级链接与末项当前页", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb
        items={[
          { label: "主页", href: "/" },
          { label: "分析", href: "/analysis" },
          { label: "资金流向" },
        ]}
      />,
    )
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toMatch(/<ol/)
    expect(html).toContain("主页")
    expect(html).toContain("href=\"/\"")
    expect(html).toContain("资金流向")
    // 末项为当前页
    expect(html).toMatch(/aria-current="page"/)
  })

  test("组合形态：BreadcrumbList/Item/Link/Page/Separator 语义与当前页", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">主页</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage href="/analysis/flow">资金流向</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toMatch(/<ol/)
    expect(html).toMatch(/<li/)
    expect(html).toContain("主页")
    expect(html).toContain("资金流向")
    expect(html).toMatch(/aria-current="page"/)
    // 分隔符为装饰：aria-hidden
    expect(html).toMatch(/aria-hidden/)
  })

  test("BreadcrumbSeparator 默认输出 › 且 decorative", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>一</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>二</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    expect(html).toContain("›")
    expect(html).toMatch(/role="presentation"/)
    expect(html).toMatch(/aria-hidden/)
  })

  test("手动折叠项 BreadcrumbEllipsis 渲染 … 且无 aria-current", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>首页</BreadcrumbItem>
          <BreadcrumbEllipsis />
          <BreadcrumbItem>末页</BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    expect(html).toContain("…")
    expect(html).not.toContain("aria-current")
  })

  test("items + maxItems 折叠：中间项被省略按钮替代，末项仍当前页", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb
        maxItems={3}
        items={[
          { label: "A", href: "/a" },
          { label: "B", href: "/b" },
          { label: "C", href: "/c" },
          { label: "D", href: "/d" },
          { label: "E" },
        ]}
      />,
    )
    // 折叠展示 first + “…” + last，隐藏中间 B/C/D
    expect(html).toContain("A")
    expect(html).toContain("…")
    expect(html).toContain("E")
    // 中间项被省略替代（按其中间项 href 缺席断言，避免与 “Breadcrumb” 标签字母误撞）
    expect(html).not.toContain('"/b"')
    expect(html).not.toContain('"/c"')
    expect(html).not.toContain('"/d"')
    // 末项当前页仍成立
    expect(html).toMatch(/aria-current="page"/)
    // 省略是可展开按钮
    expect(html).toMatch(
      /<button[^>]*aria-label="展开全部导航路径"[^>]*>\s*…\s*<\/button>/,
    )
  })

  test("items 未超阈值不折叠，全部渲染", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb
        maxItems={5}
        items={[
          { label: "A", href: "/a" },
          { label: "B", href: "/b" },
          { label: "C" },
        ]}
      />,
    )
    expect(html).toContain("A")
    expect(html).toContain("B")
    expect(html).toContain("C")
    expect(html).not.toContain("展开全部导航路径")
  })

  test("无 href 的父项渲染为纯文本，不被当作链接", () => {
    const html = renderToStaticMarkup(
      <Breadcrumb
        items={[
          { label: "A" },
          { label: "B", href: "/b" },
          { label: "C" },
        ]}
      />,
    )
    // 末项无 href → 当前页 span（aria-current）；首项无 href → 纯文本 crumb
    expect(html).toMatch(/aria-current="page"/)
    expect(html.match(/href=/g)?.length ?? 0).toBe(1)
  })
})