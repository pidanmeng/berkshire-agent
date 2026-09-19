/**
 * ThemePalettePage —— 核心路由 `/theme` 的主题对照页（base-ui 壳插件；自宿主迁出下沉）。
 *
 * 把 `@berkshire/theme` 的令牌渲染成色板：按维度组（color/spacing/radius/font/shadow）分栏，
 * 每格展示**别名层**令牌 id、可读标签、亮/暗两套**实值**（由取值层 `STATIC_TOKENS` 解析）。
 * **只读自单一事实源 `@berkshire/theme`**，不引用任何魔法值。
 *
 * 对齐 dsh 两层令牌：这里展示的是组件/插件引用的别名入口 `--bk-*`，其值为 `var(--bk-static-*)`；
 * 实值出处列在取值层 `STATIC_TOKENS`。色板格用 **CSS Modules + clsx** 组件 `TokenSwatch`（H2 示范）。
 *
 * 诚实边界：本页只展示令牌值集；`[data-theme]` 显式换肤缝（`ctx.theme`）仍为目标态。
 */
import {
  THEME_TOKENS,
  STATIC_TOKENS,
  bkVarName,
  type TokenGroup,
} from "@berkshire/theme"
import { TokenSwatch } from "./TokenSwatch"
import styles from "./ThemePalettePage.module.css"

const GROUPS: TokenGroup[] = ["color", "spacing", "radius", "font", "shadow"]
const GROUP_LABEL: Record<TokenGroup, string> = {
  color: "颜色",
  spacing: "间距",
  radius: "圆角",
  font: "字体",
  shadow: "阴影",
}

export function ThemePalettePage() {
  // 别名层 → 实值解析表（取值为 `var(--bk-static-<ref>)`；实值在取值层）。
  const staticById = new Map(STATIC_TOKENS.map((s) => [s.id, s]))
  return (
    <main className={styles.page}>
      <h1>主题令牌对照</h1>
      <p className={styles.hint}>
        单一事实源 <code>@berkshire/theme</code> — 中枢与插件共用 <code>var(--bk-*)</code>（别名层），
        取值在 <code>--bk-static-*</code> 层；换肤只替换令牌值集。
      </p>
      {GROUPS.map((group) => (
        <section className={styles.group} key={group}>
          <h2>{GROUP_LABEL[group]}</h2>
          <div className={styles.grid}>
            {THEME_TOKENS.filter((t) => t.group === group).map((alias) => {
              const s = staticById.get(alias.ref)
              return (
                <TokenSwatch
                  key={alias.id}
                  varName={bkVarName(alias.id)}
                  label={alias.label}
                  light={s?.light ?? `var(--bk-static-${alias.ref})`}
                  dark={s?.dark ?? `var(--bk-static-${alias.ref})`}
                />
              )
            })}
          </div>
        </section>
      ))}
    </main>
  )
}