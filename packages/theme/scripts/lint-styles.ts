/**
 * 样式魔法色值 lint（`@berkshire/theme` 的配套治理工具）。
 *
 * 扫描介入 webview 的样式源，举报**裸色值**（`#hex` / `rgb(…)` / `rgba(…)` / `hsl(…)` /
 * `hsla(…)` / `oklch(…)` / `oklab(…)` / `hwb(…)`）——凡是**不在取值层令牌注册表
 * `STATIC_TOKENS` 内定义**的色值一律判为魔法值，应改用 `var(--bk-*)`（别名层）引用。
 * 规则出自 `.agents/features/bk-style-governance.prompt.md`
 * §3.1 / §5（令牌优先、禁魔法值、强制 `var()`）。
 *
 * 对齐 dsh 两层令牌：**取值只在 static 层**——故只有 `STATIC_TOKENS` 的 light/dark 是「允许的
 * 魔法值出处」；别名层（`THEME_TOKENS`）引用只见 `var(--bk-*)`，不产生裸值。
 *
 * 诚实边界：本 lint 只查**色值**（可自动判定的魔法值）；间距/圆角/字号档位对齐是评审层面的事，
 * 结构布局长度（max-width、border-width 等）不在机器可判范围内，不误报。
 * 主题对照页 `ThemePalettePage.tsx` 用 `THEME_TOKENS` 渲染色板，是令牌的展示面，不在此列。
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { STATIC_TOKENS } from "../src/tokens"

const ROOT = join(import.meta.dir, "..", "..", "..")

/** 取值层令牌里已声明的字面色值（亮/暗）——允许出现的「魔法值」。 */
const ALLOWED_VALUES = new Set<string>()
for (const t of STATIC_TOKENS) {
  ALLOWED_VALUES.add(t.light)
  ALLOWED_VALUES.add(t.dark)
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const FUNC_COLOR_RE = /\b(?:rgb|rgba|hsl|hsla|oklch|oklab|hwb)\([^)]*\)/g

interface Finding {
  file: string
  line: number
  value: string
}

function walkFiles(dir: string, ext: string[]): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".out" || entry === "dist") continue
    const abs = join(dir, entry)
    if (!statSync(abs).isDirectory()) {
      if (ext.some((e) => abs.endsWith(e))) found.push(abs)
    } else {
      found.push(...walkFiles(abs, ext))
    }
  }
  return found
}

/** 去掉 data-uri（base64 可能误含 `#` 或颜色片段）。 */
function stripDataUris(src: string): string {
  return src.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, "")
}

function lintFile(abs: string): Finding[] {
  const stripped = stripDataUris(readFileSync(abs, "utf8"))
  const findings: Finding[] = []
  const lines = stripped.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const check = (re: RegExp) => {
      for (const m of line.matchAll(re)) {
        const value = m[0]!
        if (!ALLOWED_VALUES.has(value)) findings.push({ file: abs, line: i + 1, value })
      }
    }
    check(HEX_RE)
    check(FUNC_COLOR_RE)
  }
  return findings
}

function main(): number {
  const cssFiles = walkFiles(join(ROOT, "apps", "berkshire-agent", "src"), [".css", ".module.css"])
  const clientTsFiles = walkFiles(join(ROOT, "packages", "plugins"), [".ts"])
  // 插件侧 `.module.css`（P3：插件独立打包 CSS Modules）也在扫描面内——同样只许 var(--bk-*)。
  const pluginCssFiles = walkFiles(join(ROOT, "packages", "plugins"), [".module.css"])
  const targets = [...cssFiles, ...clientTsFiles, ...pluginCssFiles]

  let allFindings: Finding[] = []
  for (const f of targets) allFindings = allFindings.concat(lintFile(f))

  if (cssFiles.length === 0 && clientTsFiles.length === 0) {
    console.error(
      `样式 lint：扫描范围为空？ROOT=${ROOT}（CSS=${cssFiles.length}，client TS=${clientTsFiles.length}）`,
    )
    return 2
  }

  if (allFindings.length === 0) {
    console.log("样式 lint：通过 —— 未发现令牌注册表之外的魔法色值。")
    return 0
  }

  console.error(`样式 lint：发现 ${allFindings.length} 处魔法色值（应改用 var(--bk-*) 令牌）：\n`)
  for (const g of allFindings) {
    console.error(`  ${relative(ROOT, g.file)}:${g.line}  ${g.value}`)
  }
  console.error(
    `\n令牌注册表：${relative(ROOT, join(ROOT, "packages", "theme", "src", "tokens.ts"))}（禁另造离散值）`,
  )
  return 1
}

process.exit(main())