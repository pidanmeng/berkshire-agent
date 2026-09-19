/**
 * 令牌注册表 —— 样式层的**单一事实源**（`@berkshire/theme`，第一优先、零破坏落地）。
 *
 * - **无 `@berkshire/core` 依赖**：纯令牌 + 类型 + CSS 变量名，故 webview 可安全 import；
 * - 中枢 `App.css` 与插件 `styles.ts` **都从这里取**，`:root`/`[data-theme]` 上只写 `var(…)` 的赋值；
 * - 每个令牌带亮/暗两套值、所属维度组与可读标签，供主题对照页渲染成色板。
 *
 * 令牌 id 一律用**连字符**（如 `color-bg`）：CSS 自定义属性名必须是合法 `<dashed-ident>`，`.` 非法。
 *
 * 硬规则（见 `.agents/features/bk-style-governance.prompt.md`）：
 * 令牌优先（禁魔法值）；维度对齐（间距/圆角/字号落档位）；单一事实源（import 不抄）。
 */
export const BK_TOKEN_PREFIX = "--bk-"

/** 令牌所属维度组。 */
export type TokenGroup = "color" | "spacing" | "radius" | "font" | "shadow"

/** 单一令牌：结构 + 亮/暗两套值 + 归属组 + 可读标签。 */
export interface ThemeToken {
  /** 令牌 id（不含前缀），如 `color-bg`。 */
  id: string
  /** 所属维度组（对照页按组分栏）。 */
  group: TokenGroup
  /** 亮色值（默认配色）。 */
  light: string
  /** 暗色值。 */
  dark: string
  /** 可读标签（主题对照页展示）。 */
  label: string
  /** 可选说明。 */
  description?: string
}

/** 全部令牌（单一事实源）。按组编排，禁止在 `App.css`/插件 `styles.ts` 里另造离散值。 */
export const THEME_TOKENS = [
  // ── color ──────────────────────────────────────────────────────────────
  { id: "color-bg", group: "color", light: "#f6f6f6", dark: "#2f2f2f", label: "页面背景" },
  { id: "color-bg-elevated", group: "color", light: "#ffffff", dark: "#1e1e1e", label: "抬升面（卡片/输入）" },
  { id: "color-bg-muted", group: "color", light: "rgba(128,128,128,0.08)", dark: "rgba(200,200,200,0.08)", label: "弱化底（顶栏/斑马）" },
  { id: "color-fg", group: "color", light: "#0f0f0f", dark: "#f6f6f6", label: "前景（正文）" },
  { id: "color-fg-muted", group: "color", light: "#555555", dark: "#b3b3b3", label: "弱化前景（次要）" },
  { id: "color-fg-subtle", group: "color", light: "#888888", dark: "#9a9a9a", label: "更弱前景（hint）" },
  { id: "color-border", group: "color", light: "rgba(128,128,128,0.3)", dark: "rgba(200,200,200,0.3)", label: "边框" },
  { id: "color-border-strong", group: "color", light: "rgba(128,128,128,0.4)", dark: "rgba(200,200,200,0.4)", label: "强化边框" },
  { id: "color-primary", group: "color", light: "#646cff", dark: "#8b93ff", label: "主色（链接/强调）" },
  { id: "color-primary-hover", group: "color", light: "#535bf2", dark: "#24c8db", label: "主色 hover" },
  { id: "color-primary-soft", group: "color", light: "rgba(100,108,255,0.12)", dark: "rgba(139,147,255,0.14)", label: "主色弱化底" },
  { id: "color-focus", group: "color", light: "#396cd8", dark: "#4aa3f5", label: "焦点边框" },
  { id: "color-pressed-bg", group: "color", light: "#e8e8e8", dark: "rgba(15,15,15,0.69)", label: "按下底" },
  { id: "color-info", group: "color", light: "#2e86de", dark: "#4aa3f5", label: "信息（蓝）" },
  { id: "color-info-soft", group: "color", light: "rgba(46,134,222,0.08)", dark: "rgba(74,163,245,0.10)", label: "信息弱化底" },
  { id: "color-success", group: "color", light: "#27ae60", dark: "#3ccf7e", label: "成功（绿）" },
  { id: "color-success-soft", group: "color", light: "rgba(39,174,96,0.08)", dark: "rgba(60,207,126,0.10)", label: "成功弱化底" },
  { id: "color-warning", group: "color", light: "#b7950b", dark: "#d4a017", label: "警告（金）" },
  { id: "color-warning-soft", group: "color", light: "rgba(183,149,11,0.10)", dark: "rgba(212,160,23,0.12)", label: "警告弱化底" },
  { id: "color-danger", group: "color", light: "#c0392b", dark: "#e74c3c", label: "危险（红）" },
  { id: "color-danger-soft", group: "color", light: "rgba(192,57,43,0.12)", dark: "rgba(231,76,60,0.14)", label: "危险弱化底" },
  { id: "color-neutral", group: "color", light: "#7d8a92", dark: "#8fa3ad", label: "中性（灰青）" },
  { id: "color-neutral-soft", group: "color", light: "rgba(125,138,146,0.10)", dark: "rgba(143,163,173,0.12)", label: "中性弱化底" },
  { id: "color-brand-vite", group: "color", light: "#747bff", dark: "#747bff", label: "品牌 Vite（logo 辉光）" },
  { id: "color-brand-react", group: "color", light: "#61dafb", dark: "#61dafb", label: "品牌 React（logo 辉光）" },
  { id: "color-brand-tauri", group: "color", light: "#24c8db", dark: "#24c8db", label: "品牌 Tauri（logo 辉光）" },

  // ── spacing ─────────────────────────────────────────────────────────────
  { id: "space-1", group: "spacing", light: "0.25rem", dark: "0.25rem", label: "间距 1" },
  { id: "space-2", group: "spacing", light: "0.5rem", dark: "0.5rem", label: "间距 2" },
  { id: "space-3", group: "spacing", light: "0.75rem", dark: "0.75rem", label: "间距 3" },
  { id: "space-4", group: "spacing", light: "1rem", dark: "1rem", label: "间距 4" },
  { id: "space-5", group: "spacing", light: "1.5rem", dark: "1.5rem", label: "间距 5" },
  { id: "space-6", group: "spacing", light: "2rem", dark: "2rem", label: "间距 6" },

  // ── radius ──────────────────────────────────────────────────────────────
  { id: "radius-sm", group: "radius", light: "4px", dark: "4px", label: "圆角 小" },
  { id: "radius-md", group: "radius", light: "6px", dark: "6px", label: "圆角 中" },
  { id: "radius-lg", group: "radius", light: "8px", dark: "8px", label: "圆角 大" },
  { id: "radius-xl", group: "radius", light: "14px", dark: "14px", label: "圆角 特大" },
  { id: "radius-pill", group: "radius", light: "999px", dark: "999px", label: "圆角 胶囊" },

  // ── font ────────────────────────────────────────────────────────────────
  { id: "font-sans", group: "font", light: "Inter, Avenir, Helvetica, Arial, sans-serif", dark: "Inter, Avenir, Helvetica, Arial, sans-serif", label: "正文字体" },
  { id: "font-size-sm", group: "font", light: "0.85em", dark: "0.85em", label: "字号 小" },
  { id: "font-size-md", group: "font", light: "0.9em", dark: "0.9em", label: "字号 中" },
  { id: "font-size-base", group: "font", light: "1em", dark: "1em", label: "字号 基准" },

  // ── shadow ──────────────────────────────────────────────────────────────
  { id: "shadow-sm", group: "shadow", light: "0 2px 2px rgba(0,0,0,0.2)", dark: "0 2px 2px rgba(0,0,0,0.5)", label: "阴影 小" },
] as const satisfies readonly ThemeToken[]

/** 令牌 id 联合（类型安全：`cssVar`/`Palette` 只接受已注册令牌）。 */
export type ThemeTokenId = (typeof THEME_TOKENS)[number]["id"]

/** 色板：`ThemeTokenId → 某套值`（亮或暗）。 */
export type Palette = Record<ThemeTokenId, string>

/** 亮色板（默认）。 */
export const LIGHT_PALETTE: Palette = Object.fromEntries(
  THEME_TOKENS.map((t) => [t.id, t.light]) as Array<[ThemeTokenId, string]>,
) as Palette

/** 暗色板。 */
export const DARK_PALETTE: Palette = Object.fromEntries(
  THEME_TOKENS.map((t) => [t.id, t.dark]) as Array<[ThemeTokenId, string]>,
) as Palette

/** 令牌在 CSS 中的**变量名**（含前缀），供 `App.css`/插件 `styles.ts` 引用。 */
export function bkVarName(id: ThemeTokenId): string {
  return `${BK_TOKEN_PREFIX}${id}`
}

/** 令牌的 `var(…)` 引用形式；**含 `var()` 包裹**，用于注入 CSS 值。 */
export function bkVar(id: ThemeTokenId): string {
  return `var(${BK_TOKEN_PREFIX}${id})`
}