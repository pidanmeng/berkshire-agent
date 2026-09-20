/**
 * 令牌注册表 —— 样式层的**单一事实源**（`@berkshire/theme`，第一优先、零破坏落地）。
 *
 * 对齐 dsh 的 **static → alias 两层令牌**（不多不少两层）：
 * - **取值层 `--bk-static-*`**（`STATIC_TOKENS`）：唯一写**实值**的地方（色板/阴影等具体取值）；
 * - **别名层 `--bk-*`**（`THEME_TOKENS`）：组件/插件**只引用**别名层，值为 `var(--bk-static-*)` 引用。
 *
 * 硬规则（见 `.agents/features/bk-style-governance.prompt.md`）：
 * 令牌优先（禁魔法值）；维度对齐（间距/圆角/字号落档位）；单一事实源（import 不抄）；
 * **取值只在 static 层、引用走别名层**——`App.css` 与插件样式一律写 `var(--bk-*)`。
 *
 * 透明制（边框/交互态）：新增 `border`/`hover`/`active` 叠层 token 用 `rgba(…)` 叠加任意背景，
 * 不新造实色灰；暗色只在 static 层的暗值里改（单表覆盖），组件零主题选择器。
 *
 * 去 token 化（对齐 dsh）：间距沿用 4 的倍数、圆角语义档位、字号成对行高；spacing/radius/font
 * 仍以别名层暴露以兼容现状宿主，正式「组件写 4 倍数/行高、弃用这些令牌」标 v-next（见决策记录）。
 *
 * - **无 `@berkshire/core` 依赖**：纯令牌 + 类型 + CSS 变量名，故 webview 可安全 import。
 *
 * 令牌 id 一律用**连字符**（如 `color-bg`）：CSS 自定义属性名必须是合法 `<dashed-ident>`，`.` 非法。
 */
export const BK_ALIAS_PREFIX = "--bk-"
/** 取值层前缀 `--bk-static-`（一种取值、一个前缀）。 */
export const BK_STATIC_PREFIX = "--bk-static-"

/** 令牌所属维度组。 */
export type TokenGroup = "color" | "spacing" | "radius" | "font" | "shadow"

/** 取值层令牌（`--bk-static-*`）：唯一写实值的地方。亮/暗两套值 + 归属组 + 标签。 */
export interface StaticToken {
  /** 令牌 id（不含前缀），如 `color-bg` → `--bk-static-color-bg`。 */
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

/**
 * 取值层注册表（单一事实源，**唯一写实值的地方**）。按组编排，禁止在 `App.css`/插件样式里另造离散值。
 * 交互/边框用透明度叠层（`rgba(…)`）叠加任意背景，暗色值只在这里。
 */
export const STATIC_TOKENS = [
  // ── color ──────────────────────────────────────────────────────────────
  { id: "color-bg", group: "color", light: "#FAFAFA", dark: "#0A0A0B", label: "页面背景" },
  { id: "color-bg-elevated", group: "color", light: "#FFFFFF", dark: "#18181B", label: "抬升面（卡片/输入）" },
  { id: "color-bg-muted", group: "color", light: "#F4F4F5", dark: "#212126", label: "次级面（hover 底/副面板）" },
  { id: "color-fg", group: "color", light: "#18181B", dark: "#FAFAFA", label: "前景（正文）" },
  { id: "color-fg-muted", group: "color", light: "#52525B", dark: "#C4C4CB", label: "弱化前景（次要）" },
  { id: "color-fg-subtle", group: "color", light: "#A1A1AA", dark: "#8E8E96", label: "更弱前景（hint）" },
  { id: "color-fg-invert", group: "color", light: "#FFFFFF", dark: "#FFFFFF", label: "前景反转（实底/强调上文字）" },
  { id: "color-primary", group: "color", light: "#3B82F6", dark: "#3B82F6", label: "主色（链接/强调）" },
  { id: "color-primary-hover", group: "color", light: "#2563eb", dark: "#60a5fa", label: "主色 hover" },
  { id: "color-primary-soft", group: "color", light: "rgba(59,130,246,0.12)", dark: "rgba(59,130,246,0.16)", label: "主色弱化底" },
  { id: "color-focus", group: "color", light: "#3B82F6", dark: "#60a5fa", label: "焦点边框" },
  { id: "color-info", group: "color", light: "#3B82F6", dark: "#60a5fa", label: "信息（蓝）" },
  { id: "color-info-soft", group: "color", light: "rgba(59,130,246,0.08)", dark: "rgba(96,165,250,0.10)", label: "信息弱化底" },
  { id: "color-success", group: "color", light: "#16A34A", dark: "#22C55E", label: "成功（绿）" },
  { id: "color-success-soft", group: "color", light: "rgba(22,163,74,0.08)", dark: "rgba(34,197,94,0.10)", label: "成功弱化底" },
  { id: "color-warning", group: "color", light: "#F79009", dark: "#F79009", label: "警告（琥珀）" },
  { id: "color-warning-soft", group: "color", light: "rgba(247,144,9,0.10)", dark: "rgba(247,144,9,0.14)", label: "警告弱化底" },
  { id: "color-danger", group: "color", light: "#F04438", dark: "#F04438", label: "危险（红）" },
  { id: "color-danger-soft", group: "color", light: "rgba(240,68,56,0.12)", dark: "rgba(240,68,56,0.14)", label: "危险弱化底" },
  { id: "color-neutral", group: "color", light: "#71717A", dark: "#A1A1AA", label: "中性（锌灰）" },
  { id: "color-neutral-soft", group: "color", light: "rgba(113,113,122,0.10)", dark: "rgba(161,161,170,0.12)", label: "中性弱化底" },
  { id: "color-brand-vite", group: "color", light: "#747bff", dark: "#747bff", label: "品牌 Vite（logo 辉光）" },
  { id: "color-brand-react", group: "color", light: "#61dafb", dark: "#61dafb", label: "品牌 React（logo 辉光）" },
  { id: "color-brand-tauri", group: "color", light: "#24c8db", dark: "#24c8db", label: "品牌 Tauri（logo 辉光）" },

  // ── 强调/价格语义（design.md §2.1：accent 仅交互/高亮；bull/bear 仅价格/涨跌）──
  { id: "color-accent", group: "color", light: "#3B82F6", dark: "#3B82F6", label: "强调色（交互/高亮，电光蓝）" },
  { id: "color-accent-hover", group: "color", light: "#2563eb", dark: "#60a5fa", label: "强调色 hover" },
  { id: "color-accent-soft", group: "color", light: "rgba(59,130,246,0.12)", dark: "rgba(59,130,246,0.16)", label: "强调色弱化底" },
  { id: "color-accent-focus", group: "color", light: "rgba(59,130,246,0.35)", dark: "rgba(96,165,250,0.40)", label: "强调色焦点环" },
  { id: "color-bull", group: "color", light: "#F04438", dark: "#F04438", label: "红涨（价格/涨跌语义）" },
  { id: "color-bull-soft", group: "color", light: "rgba(240,68,56,0.12)", dark: "rgba(240,68,56,0.16)", label: "红涨弱化底" },
  { id: "color-bear", group: "color", light: "#12B76A", dark: "#12B76A", label: "绿跌（价格/涨跌语义）" },
  { id: "color-bear-soft", group: "color", light: "rgba(18,183,106,0.10)", dark: "rgba(18,183,106,0.14)", label: "绿跌弱化底" },

  // ── 边框/交互态（透明度叠层，叠加任意背景成立；不新造实色灰）──────────
  { id: "border", group: "color", light: "rgba(24,24,27,0.12)", dark: "rgba(250,250,250,0.16)", label: "边框/分隔（透明度叠层）" },
  { id: "border-strong", group: "color", light: "rgba(24,24,27,0.18)", dark: "rgba(250,250,250,0.24)", label: "强化边框（透明度叠层）" },
  { id: "hover", group: "color", light: "rgba(24,24,27,0.06)", dark: "rgba(250,250,250,0.10)", label: "悬停叠层" },
  { id: "active", group: "color", light: "rgba(24,24,27,0.10)", dark: "rgba(250,250,250,0.16)", label: "按下叠层" },
  { id: "scrim", group: "color", light: "rgba(0,0,0,0.50)", dark: "rgba(0,0,0,0.60)", label: "模态遮罩（backdrop）" },

  // ── spacing（间距 4 的倍数：0.25/0.5/0.75/1/1.5/2rem）────────────────────
  { id: "space-1", group: "spacing", light: "0.25rem", dark: "0.25rem", label: "间距 1 (4px)" },
  { id: "space-2", group: "spacing", light: "0.5rem", dark: "0.5rem", label: "间距 2 (8px)" },
  { id: "space-3", group: "spacing", light: "0.75rem", dark: "0.75rem", label: "间距 3 (12px)" },
  { id: "space-4", group: "spacing", light: "1rem", dark: "1rem", label: "间距 4 (16px)" },
  { id: "space-5", group: "spacing", light: "1.5rem", dark: "1.5rem", label: "间距 5 (24px)" },
  { id: "space-6", group: "spacing", light: "2rem", dark: "2rem", label: "间距 6 (32px)" },

  // ── radius（语义档位）──────────────────────────────────────────────────
  { id: "radius-sm", group: "radius", light: "4px", dark: "4px", label: "圆角 小" },
  { id: "radius-md", group: "radius", light: "6px", dark: "6px", label: "圆角 中" },
  { id: "radius-lg", group: "radius", light: "8px", dark: "8px", label: "圆角 大" },
  { id: "radius-xl", group: "radius", light: "14px", dark: "14px", label: "圆角 特大" },
  { id: "radius-pill", group: "radius", light: "999px", dark: "999px", label: "圆角 胶囊" },
  { id: "radius-dialog", group: "radius", light: "12px", dark: "12px", label: "圆角 弹窗面板" },

  // ── font（字号语义档位 + 成对行高；主字体 token）────────────────────────
  { id: "font-sans", group: "font", light: "Inter, 'HarmonyOS Sans SC', 'PingFang SC', system-ui, sans-serif", dark: "Inter, 'HarmonyOS Sans SC', 'PingFang SC', system-ui, sans-serif", label: "正文字体" },
  { id: "font-mono", group: "font", light: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", dark: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", label: "等宽数字/代码字体" },
  { id: "font-size-sm", group: "font", light: "0.85em", dark: "0.85em", label: "字号 小" },
  { id: "font-size-md", group: "font", light: "0.9em", dark: "0.9em", label: "字号 中" },
  { id: "font-size-base", group: "font", light: "1em", dark: "1em", label: "字号 基准" },

  // ── shadow ──────────────────────────────────────────────────────────────
  { id: "shadow-sm", group: "shadow", light: "0 2px 2px rgba(0,0,0,0.2)", dark: "0 2px 2px rgba(0,0,0,0.5)", label: "阴影 小" },
] as const satisfies readonly StaticToken[]

/** 别名层令牌（`--bk-*`）：组件/插件引用入口。`ref` 指向取值层的 static id。 */
export interface AliasToken {
  /** 别名 id（不含前缀），如 `color-bg` → `--bk-color-bg`。 */
  id: string
  /** 取值层 static id（`--bk-static-<ref>`），别名取 `var(--bk-static-<ref>)`。 */
  ref: string
  /** 所属维度组（对照页按组分栏）。 */
  group: TokenGroup
  /** 可读标签（主题对照页展示）。 */
  label: string
  /** 可选说明。 */
  description?: string
}

/**
 * 别名层注册表：组件/插件唯一引用入口（`--bk-*`）。每个别名取 `var(--bk-static-<ref>)`，
 * **取值只在 static 层**、别名层不写实值。
 */
export const THEME_TOKENS = [
  // ── color ──────────────────────────────────────────────────────────────
  { id: "color-bg", ref: "color-bg", group: "color", label: "页面背景" },
  { id: "color-bg-elevated", ref: "color-bg-elevated", group: "color", label: "抬升面（卡片/输入）" },
  { id: "color-bg-muted", ref: "color-bg-muted", group: "color", label: "次级面（hover 底/副面板）" },
  { id: "color-fg", ref: "color-fg", group: "color", label: "前景（正文）" },
  { id: "color-fg-muted", ref: "color-fg-muted", group: "color", label: "弱化前景（次要）" },
  { id: "color-fg-subtle", ref: "color-fg-subtle", group: "color", label: "更弱前景（hint）" },
  { id: "color-fg-invert", ref: "color-fg-invert", group: "color", label: "前景反转（实底/强调上文字）" },
  { id: "color-primary", ref: "color-primary", group: "color", label: "主色（链接/强调）" },
  { id: "color-primary-hover", ref: "color-primary-hover", group: "color", label: "主色 hover" },
  { id: "color-primary-soft", ref: "color-primary-soft", group: "color", label: "主色弱化底" },
  { id: "color-focus", ref: "color-focus", group: "color", label: "焦点边框" },
  { id: "color-info", ref: "color-info", group: "color", label: "信息（蓝）" },
  { id: "color-info-soft", ref: "color-info-soft", group: "color", label: "信息弱化底" },
  { id: "color-success", ref: "color-success", group: "color", label: "成功（绿）" },
  { id: "color-success-soft", ref: "color-success-soft", group: "color", label: "成功弱化底" },
  { id: "color-warning", ref: "color-warning", group: "color", label: "警告（琥珀）" },
  { id: "color-warning-soft", ref: "color-warning-soft", group: "color", label: "警告弱化底" },
  { id: "color-danger", ref: "color-danger", group: "color", label: "危险（红）" },
  { id: "color-danger-soft", ref: "color-danger-soft", group: "color", label: "危险弱化底" },
  { id: "color-neutral", ref: "color-neutral", group: "color", label: "中性（锌灰）" },
  { id: "color-neutral-soft", ref: "color-neutral-soft", group: "color", label: "中性弱化底" },
  { id: "color-brand-vite", ref: "color-brand-vite", group: "color", label: "品牌 Vite（logo 辉光）" },
  { id: "color-brand-react", ref: "color-brand-react", group: "color", label: "品牌 React（logo 辉光）" },
  { id: "color-brand-tauri", ref: "color-brand-tauri", group: "color", label: "品牌 Tauri（logo 辉光）" },
  { id: "color-accent", ref: "color-accent", group: "color", label: "强调色（交互/高亮）" },
  { id: "color-accent-hover", ref: "color-accent-hover", group: "color", label: "强调色 hover" },
  { id: "color-accent-soft", ref: "color-accent-soft", group: "color", label: "强调色弱化底" },
  { id: "color-accent-focus", ref: "color-accent-focus", group: "color", label: "强调色焦点环" },
  { id: "color-bull", ref: "color-bull", group: "color", label: "红涨（价格/涨跌语义）" },
  { id: "color-bull-soft", ref: "color-bull-soft", group: "color", label: "红涨弱化底" },
  { id: "color-bear", ref: "color-bear", group: "color", label: "绿跌（价格/涨跌语义）" },
  { id: "color-bear-soft", ref: "color-bear-soft", group: "color", label: "绿跌弱化底" },

  // ── 边框/交互态透明度叠层 ───────────────────────────────────────────────
  { id: "border", ref: "border", group: "color", label: "边框/分隔（透明度叠层）" },
  { id: "border-strong", ref: "border-strong", group: "color", label: "强化边框（透明度叠层）" },
  { id: "hover", ref: "hover", group: "color", label: "悬停叠层" },
  { id: "active", ref: "active", group: "color", label: "按下叠层" },
  { id: "scrim", ref: "scrim", group: "color", label: "模态遮罩（backdrop）" },

  // ── spacing / radius / font / shadow（语义档位，兼容现状宿主）───────────
  { id: "space-1", ref: "space-1", group: "spacing", label: "间距 1" },
  { id: "space-2", ref: "space-2", group: "spacing", label: "间距 2" },
  { id: "space-3", ref: "space-3", group: "spacing", label: "间距 3" },
  { id: "space-4", ref: "space-4", group: "spacing", label: "间距 4" },
  { id: "space-5", ref: "space-5", group: "spacing", label: "间距 5" },
  { id: "space-6", ref: "space-6", group: "spacing", label: "间距 6" },
  { id: "radius-sm", ref: "radius-sm", group: "radius", label: "圆角 小" },
  { id: "radius-md", ref: "radius-md", group: "radius", label: "圆角 中" },
  { id: "radius-lg", ref: "radius-lg", group: "radius", label: "圆角 大" },
  { id: "radius-xl", ref: "radius-xl", group: "radius", label: "圆角 特大" },
  { id: "radius-pill", ref: "radius-pill", group: "radius", label: "圆角 胶囊" },
  { id: "radius-dialog", ref: "radius-dialog", group: "radius", label: "圆角 弹窗面板" },
  { id: "font-sans", ref: "font-sans", group: "font", label: "正文字体" },
  { id: "font-mono", ref: "font-mono", group: "font", label: "等宽数字/代码字体" },
  { id: "font-size-sm", ref: "font-size-sm", group: "font", label: "字号 小" },
  { id: "font-size-md", ref: "font-size-md", group: "font", label: "字号 中" },
  { id: "font-size-base", ref: "font-size-base", group: "font", label: "字号 基准" },
  { id: "shadow-sm", ref: "shadow-sm", group: "shadow", label: "阴影 小" },
] as const satisfies readonly AliasToken[]

/** 别名层令牌 id 联合（类型安全：`cssVar`/组件引用只接受已注册别名）。 */
export type ThemeTokenId = (typeof THEME_TOKENS)[number]["id"]

/** 取值层令牌 id 联合。 */
export type StaticTokenId = (typeof STATIC_TOKENS)[number]["id"]

/** 色板：`ThemeTokenId → 某套解析后实值`（亮或暗；供对照页/测试读取，非 CSS 引用）。 */
export type Palette = Record<ThemeTokenId, string>

/** 亮色板（默认，别名 id → 解析后实值）：供对照页/测试读取实值（非 CSS 引用）。 */
export const LIGHT_PALETTE = Object.fromEntries(
  THEME_TOKENS.map((a) => {
    const s = STATIC_TOKENS.find((t) => t.id === a.ref)
    return [a.id, s?.light ?? `${BK_ALIAS_PREFIX}${a.id}`]
  }),
) as Record<ThemeTokenId, string>

/** 暗色板。 */
export const DARK_PALETTE = Object.fromEntries(
  THEME_TOKENS.map((a) => {
    const s = STATIC_TOKENS.find((t) => t.id === a.ref)
    return [a.id, s?.dark ?? `${BK_ALIAS_PREFIX}${a.id}`]
  }),
) as Record<ThemeTokenId, string>

/** 别名层令牌在 CSS 中的**变量名**（含前缀 `--bk-`），供 `App.css`/插件样式引用。 */
export function bkVarName(id: ThemeTokenId): string {
  return `${BK_ALIAS_PREFIX}${id}`
}

/** 别名层的 `var(…)` 引用形式。组件/插件一律用这个（别名层入口）。 */
export function bkVar(id: ThemeTokenId): string {
  return `var(${BK_ALIAS_PREFIX}${id})`
}

/** 取值层令牌在 CSS 中的**变量名**（含前缀 `--bk-static-`）。 */
export function bkStaticVarName(id: StaticTokenId): string {
  return `${BK_STATIC_PREFIX}${id}`
}

/** 取值层的 `var(…)` 引用形式。 */
export function bkStaticVar(id: StaticTokenId): string {
  return `var(${BK_STATIC_PREFIX}${id})`
}