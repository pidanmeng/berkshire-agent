/**
 * `DatePicker` 冒烟测试 —— 服务端渲染（无需浏览器/DOM）。
 *
 * `DatePicker` 复用 `Popover`：SSR 下 `document.body` 不存在 → 面板（portal）不渲染，
 * 只留下触发器 anchor。故此处静态断言触发器的日期展示、占位与展开态（aria），
 * 日历格网/键盘交互属运行期行为，不在本文档抽样。
 */
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DatePicker } from "../src/index"

const aDate = new Date(2026, 8, 21) // 2026-09-21（本地时区）

describe("@berkshire/ui DatePicker", () => {
  test("无值渲染占位文案与展开触发语义", () => {
    const html = renderToStaticMarkup(<DatePicker placeholder="请选择日期" />)
    expect(html).toContain("请选择日期")
    expect(html).toMatch(/aria-haspopup="dialog"/)
  })

  test("渲染选中日期（zh-CN 简短格式）", () => {
    const html = renderToStaticMarkup(<DatePicker value={aDate} />)
    // zh-CN 简式日期；Intl 输出形如 2026/09/21（跨运行时可能存在分隔差异，用宽松断言含三段数字）。
    expect(html).toContain("2026")
    expect(html).toContain("09")
    expect(html).toContain("21")
  })

  test("受控展开时 aria-expanded=true，SSR 下面板不落 DOM", () => {
    const html = renderToStaticMarkup(<DatePicker value={aDate} open />)
    expect(html).toMatch(/aria-expanded="true"/)
    expect(html).not.toMatch(/role="grid"/) // portal 未挂载 → 日历格网不渲染
    expect(html).not.toMatch(/上个月/)
  })
})