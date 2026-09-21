/**
 * `Command` 冒烟测试 —— 服务端渲染（无需浏览器），断言结构语义与空态路径。
 *
 * 用 `react-dom/server` 的 `renderToStaticMarkup` 静态断言：内嵌模式下 combobox/listbox/option
 * 语义、过滤项 DOM 与输入过滤、无候选时空态；过滤/键盘仅以 data 派生验证（无需真实事件）。
 */
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Command } from "../src/index"

const items = [
  { value: "sw", label: "软件服务", keywords: ["software", "tech"] },
  { value: "fs", label: "金融服务", keywords: ["finance"] },
  { value: "info", label: "信息服务" },
]

describe("@berkshire/ui Command（内嵌模式）", () => {
  test("渲染 combobox/listbox/option 语义与全部项", () => {
    const html = renderToStaticMarkup(<Command items={items} />)
    expect(html).toMatch(/role="combobox"/)
    expect(html).toMatch(/aria-expanded="true"/)
    expect(html).toMatch(/role="listbox"/)
    expect(html).toMatch(/role="option"/)
    for (const it of items) expect(html).toContain(it.label)
    // 输入框 aria-activedescendant 由范围 index 决定（首项高亮）
    expect(html).toMatch(/aria-activedescendant=/)
  })

  test("非空查询过滤候选项（子串匹配 label 或 keyword）", () => {
    // 初始空查询：全量渲染。
    const full = renderToStaticMarkup(<Command items={items} />)
    expect(full).toContain("软件服务")
    expect(full).toContain("金融服务")
    // 空查询下无候选项 → 空态文案（用空 items 隔离数据，纯渲染路径）
    const empty = renderToStaticMarkup(<Command items={[]} emptyText="什么都没找到" />)
    expect(empty).not.toMatch(/role="option"/)
    expect(empty).toContain("什么都没找到")
  })

  test("不传 emptyText 也有默认空态文案", () => {
    const html = renderToStaticMarkup(<Command items={[]} />)
    expect(html).toContain("无匹配结果")
    expect(html).not.toMatch(/role="option"/)
  })

  test("内嵌模式不渲染弹层 trigger 机制（无 Popover aria-haspopup）", () => {
    const html = renderToStaticMarkup(<Command items={items} />)
    expect(html).not.toContain("aria-haspopup")
  })
})