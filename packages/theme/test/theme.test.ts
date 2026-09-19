/**
 * `@berkshire/theme` 令牌层单元测试：两层令牌（static 取值层 + alias 别名层）/ 色板 / var 引用 /
 * CSS 赋值出口。守护「单一事实源」：每个别名必须指向存在的取值；别名层引用只见 `var(--bk-*)`。
 */
import { describe, expect, test } from "bun:test"
import {
  BK_ALIAS_PREFIX,
  BK_STATIC_PREFIX,
  DARK_PALETTE,
  LIGHT_PALETTE,
  STATIC_TOKENS,
  THEME_TOKENS,
  bkVar,
  bkStaticVar,
  bkVarName,
  paletteToAssignments,
  themeRootCss,
  type Palette,
} from "../src/index"
// P3：demo 插件样式已迁 CSS Modules——取插件独立打包阶段编译产物（styles.generated.ts）的注入 css。
// 同一份也供 .tsx 拿哈希类名；这里验证注入 css 只引用 var(--bk-*)、不含魔法色值。
// 注：此 import 跨包（theme↔demo）为有意取舍——theme 承担"样式单一事实源"的守卫者角色，
// 若 demo 编译产物缺失/未来独立打包，theme 测试会红以提示同步（勿静默绕过）。
import { fundFlow, moneyFlow, watchlistToolbar } from "../../plugins/demo/src/client/styles.generated"

describe("两层令牌（static → alias）", () => {
  test("取值层（static）与别名层（alias）均非空，id 合法 <dashed-ident>", () => {
    expect(STATIC_TOKENS.length).toBeGreaterThan(0)
    expect(THEME_TOKENS.length).toBeGreaterThan(0)
    for (const t of STATIC_TOKENS) {
      expect(t.id).toMatch(/^[a-z0-9-]+$/)
      expect(t.label.length).toBeGreaterThan(0)
    }
    for (const a of THEME_TOKENS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/)
      expect(a.label.length).toBeGreaterThan(0)
    }
  })

  test("每个别名 ref 都指向存在的取值层令牌（单一事实源不破）", () => {
    const staticIds = new Set(STATIC_TOKENS.map((t) => t.id))
    for (const a of THEME_TOKENS) {
      expect(staticIds.has(a.ref), `alias '${a.id}' ref '${a.ref}' 无对应 static`).toBe(true)
    }
  })

  test("亮/暗色板恰好覆盖全部别名，值至少成对齐全", () => {
    const ids = new Set(THEME_TOKENS.map((a) => a.id))
    expect(Object.keys(LIGHT_PALETTE).length).toBe(THEME_TOKENS.length)
    expect(Object.keys(DARK_PALETTE).length).toBe(THEME_TOKENS.length)
    for (const id of ids) {
      expect(typeof LIGHT_PALETTE[id as keyof typeof LIGHT_PALETTE]).toBe("string")
      expect(typeof DARK_PALETTE[id as keyof typeof DARK_PALETTE]).toBe("string")
    }
  })

  test("透明度叠层令牌存在（border/border-strong/hover/active，R1）", () => {
    const ids = new Set<string>(THEME_TOKENS.map((a) => a.id))
    for (const id of ["border", "border-strong", "hover", "active"]) {
      expect(ids.has(id), `缺透明度叠层令牌 ${id}`).toBe(true)
    }
    const border = STATIC_TOKENS.find((t) => t.id === "border")
    expect(border?.light).toMatch(/rgba?\(/)
  })

  test("组齐全：color/spacing/radius/font/shadow 各至少一个", () => {
    const groups = new Set(THEME_TOKENS.map((a) => a.group))
    for (const g of ["color", "spacing", "radius", "font", "shadow"] as const) {
      expect(groups.has(g)).toBe(true)
    }
  })
})

describe("var 助手", () => {
  test("bkVarName / bkVar 生成别名层前缀正确的自定义属性", () => {
    expect(bkVarName("color-primary")).toBe("--bk-color-primary")
    expect(bkVar("color-primary")).toBe("var(--bk-color-primary)")
    expect(BK_ALIAS_PREFIX).toBe("--bk-")
  })

  test("bkStaticVar / 前缀为取值层 --bk-static-", () => {
    expect(BK_STATIC_PREFIX).toBe("--bk-static-")
    expect(bkStaticVar("color-bg")).toBe("var(--bk-static-color-bg)")
  })
})

describe("CSS 出口（两层）", () => {
  test("paletteToAssignments 把整份色板转成带别名前缀的赋值串", () => {
    const light: Palette = { "color-primary": "#646cff" } as Palette
    const out = paletteToAssignments(light)
    expect(out).toContain("--bk-color-primary")
    expect(out).toContain("#646cff")
  })

  test("themeRootCss 先写取值层实值、再写别名层 var 引用；暗色单表覆盖取值层", () => {
    const css = themeRootCss()
    expect(css).toContain(":root")
    expect(css).toContain("prefers-color-scheme: dark")
    expect(css).toContain('[data-theme="dark"]')
    // 取值层：`--bk-static-color-bg: #f6f6f6;`（实值唯一出处）
    expect(css).toMatch(/--bk-static-color-bg:\s*#f6f6f6;/)
    expect(css).toMatch(/--bk-static-color-bg:\s*#2f2f2f;/)
    // 别名层：`--bk-color-bg: var(--bk-static-color-bg);`（引用，不写实值）
    expect(css).toMatch(/--bk-color-bg:\s*var\(--bk-static-color-bg\);/)
    // 别名层（非 static）任何一处都不含裸 hex（引用只见 var(--bk-static-*)）
    expect(css).not.toMatch(/--bk-(?!static-)[a-z0-9-]+:\s*#/)
  })
})

describe("跨包引用：demo 样式（CSS Modules 编译产物）必须引用 var() 而非抄值", () => {
  test("styles.generated.ts 注入 css 里不再出现取值层之外的魔法色值", () => {
    const joined = [fundFlow.css, watchlistToolbar.css, moneyFlow.css].join("\n")
    // 允许出现在取值层（STATIC_TOKENS）里的值（themeCss 注入的基底），其余一律是 var(--bk-*)。
    const allowed = new Set([...Object.values(LIGHT_PALETTE), ...Object.values(DARK_PALETTE)])
    for (const m of joined.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsl[a]?\([^)]*\)/g)) {
      expect(allowed.has(m[0]!), `魔法色值 ${m[0]!}`).toBe(true)
    }
  })

  test("CSS Modules 允许 var(--bk-*) 引用（断言之）：注入 css 含 var(--bk-color-*)", () => {
    const joined = [fundFlow.css, watchlistToolbar.css, moneyFlow.css].join("\n")
    expect(joined).toContain("var(--bk-color-")
  })

  test("哈希类名自动唯一（消人肉前缀）：类名含 lightningcss hash，且非 `.bk-demo-`", () => {
    const classes = [
      ...Object.values(fundFlow.classNames),
      ...Object.values(watchlistToolbar.classNames),
      ...Object.values(moneyFlow.classNames),
    ]
    expect(classes.length).toBeGreaterThanOrEqual(3)
    for (const c of classes) {
      expect(c.startsWith("bk-demo-"), `不应再有人肉前缀 .bk-demo-（实际 ${c}）`).toBe(false)
      expect(c.length).toBeGreaterThanOrEqual(8)
    }
  })
})