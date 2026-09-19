/**
 * 主题对照页（中枢，核心路由 `/theme`）。
 *
 * 把 `@berkshire/theme` 的令牌渲染成色板：按维度组（color/spacing/radius/font/shadow）分栏，
 * 每格展示令牌 id、可读标签、亮/暗两套值。**只读自单一事实源 `THEME_TOKENS`**，不引用任何魔法值。
 *
 * 诚实边界：本页只展示令牌值集；`[data-theme]` 显式换肤缝（`ctx.theme`）仍为目标态。
 */
import {
  THEME_TOKENS,
  bkVarName,
  type ThemeTokenId,
  type TokenGroup,
} from "@berkshire/theme"

const GROUPS: TokenGroup[] = ["color", "spacing", "radius", "font", "shadow"]
const GROUP_LABEL: Record<TokenGroup, string> = {
  color: "颜色",
  spacing: "间距",
  radius: "圆角",
  font: "字体",
  shadow: "阴影",
}

function TokenSwatch({ id, label, light, dark, group }: {
  id: ThemeTokenId
  label: string
  light: string
  dark: string
  group: TokenGroup
}) {
  const varName = bkVarName(id)
  return (
    <div className="bk-theme-swatch" data-group={group}>
      <div className="bk-theme-swatch-block">
        <div className="bk-theme-swatch-stripe" style={{ background: light }} title={`亮 ${light}`} />
        <div className="bk-theme-swatch-stripe" style={{ background: dark }} title={`暗 ${dark}`} />
      </div>
      <div className="bk-theme-swatch-meta">
        <code className="bk-theme-swatch-var">{varName}</code>
        <span className="bk-theme-swatch-label">{label}</span>
        <span className="bk-theme-swatch-values">
          <code>{light}</code>
          <code>{dark}</code>
        </span>
      </div>
    </div>
  )
}

export function ThemePalettePage() {
  const activeTokens = THEME_TOKENS
  return (
    <main className="container theme-page">
      <h1>主题令牌对照</h1>
      <p className="hint">
        单一事实源 <code>@berkshire/theme</code> — 中枢与插件共用 <code>var(--bk-*)</code>，换肤只替换令牌值集。
      </p>
      {GROUPS.map((group) => (
        <section className="theme-group" key={group}>
          <h2>{GROUP_LABEL[group]}</h2>
          <div className="theme-grid">
            {activeTokens
              .filter((t) => t.group === group)
              .map((t) => (
                <TokenSwatch
                  key={t.id}
                  id={t.id}
                  label={t.label}
                  light={t.light}
                  dark={t.dark}
                  group={t.group}
                />
              ))}
          </div>
        </section>
      ))}
    </main>
  )
}