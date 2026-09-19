/**
 * `@berkshire/theme` 令牌层单元测试：注册表 / 色板 / var 引用 / CSS 赋值出口。
 * 守护「单一事实源」：色板必须恰好覆盖注册表全部令牌；每个令牌 id 能生成合法 `--bk-*` 变量名。
 */
import { describe, expect, test } from "bun:test"
import {
  BK_TOKEN_PREFIX,
  DARK_PALETTE,
  LIGHT_PALETTE,
  THEME_TOKENS,
  bkVar,
  bkVarName,
  paletteToAssignments,
  themeRootCss,
  type Palette,
} from "../src/index"
import { fundFlowStyle, watchlistToolbarStyle, moneyFlowStyle } from "../../plugins/demo/src/client/styles"

describe("tokens", () => {
  test("注册表非空，且 id 不含非法字符（CSS 自定义属性须 <dashed-ident>）", () => {
    expect(THEME_TOKENS.length).toBeGreaterThan(0)
    for (const t of THEME_TOKENS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/)
      expect(t.label.length).toBeGreaterThan(0)
    }
  })

  test("亮/暗色板恰好覆盖全部令牌，值不同或至少成对齐全", () => {
    const ids = new Set(THEME_TOKENS.map((t) => t.id))
    expect(Object.keys(LIGHT_PALETTE).length).toBe(THEME_TOKENS.length)
    expect(Object.keys(DARK_PALETTE).length).toBe(THEME_TOKENS.length)
    for (const id of ids) {
      expect(typeof LIGHT_PALETTE[id as keyof typeof LIGHT_PALETTE]).toBe("string")
      expect(typeof DARK_PALETTE[id as keyof typeof DARK_PALETTE]).toBe("string")
    }
  })

  test("组齐全：color/spacing/radius/font/shadow 各至少一个", () => {
    const groups = new Set(THEME_TOKENS.map((t) => t.group))
    for (const g of ["color", "spacing", "radius", "font", "shadow"] as const) {
      expect(groups.has(g)).toBe(true)
    }
  })
})

describe("var 助手", () => {
  test("bkVarName / bkVar 生成前缀正确的自定义属性", () => {
    expect(bkVarName("color-primary")).toBe("--bk-color-primary")
    expect(bkVar("color-primary")).toBe("var(--bk-color-primary)")
    expect(BK_TOKEN_PREFIX).toBe("--bk-")
  })
})

describe("CSS 出口", () => {
  test("paletteToAssignments 把整份色板转成带前缀的赋值串", () => {
    const light: Palette = { "color-primary": "#646cff" } as Palette
    const out = paletteToAssignments(light)
    expect(out).toContain("--bk-color-primary")
    expect(out).toContain("#646cff")
  })

  test("themeRootCss 含 :root（亮）、prefers-color-scheme dark、[data-theme=dark] 三块，且都写 var 赋值", () => {
    const css = themeRootCss()
    expect(css).toContain(":root")
    expect(css).toContain("prefers-color-scheme: dark")
    expect(css).toContain('[data-theme="dark"]')
    // 每个块都应包含至少一条 `--bk-*: value;` 赋值（单一事实源落地）
    expect(css).toMatch(/--bk-color-bg:\s*#f6f6f6;/)
    expect(css).toMatch(/--bk-color-bg:\s*#2f2f2f;/)
  })
})

describe("跨包引用：demo 样式必须引用 var() 而非抄值", () => {
  test("styles.ts 里不再出现令牌注册表之外的魔法色值", () => {
    const joined = [fundFlowStyle, watchlistToolbarStyle, moneyFlowStyle].join("\n")
    // 允许出现在注册表里的值（themeCss 注入的基底），其余一律是 var(--bk-*)。
    const allowed = new Set([...Object.values(LIGHT_PALETTE), ...Object.values(DARK_PALETTE)])
    for (const m of joined.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsl[a]?\([^)]*\)/g)) {
      expect(allowed.has(m[0]!)).toBe(true)
    }
  })
})