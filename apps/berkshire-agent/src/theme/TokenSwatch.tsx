/**
 * TokenSwatch —— host 组件 **CSS Modules + clsx** 示范（H2）。
 *
 * 对齐 `@berkshire/theme` 令牌治理：
 * - 颜色/圆角/间距一律 `var(--bk-*)`（别名层）引用，禁魔法值；
 * - 类名经 `.module.css` 构建期哈希自动唯一；
 * - 状态类（hover/selected）由 `clsx` 条件挂载；组件透传 `className`；
 * - 禁 `composes`；`:global` 仅穿透第三方/跨包，不定义新全局类。
 */
import { clsx } from "clsx"
import type { CSSProperties, ReactNode } from "react"
import styles from "./TokenSwatch.module.css"

interface TokenSwatchProps {
  varName: string
  label: string
  light: string
  dark: string
  /** 可选附加 className（透传）。 */
  className?: string
  /** 可选选中态（状态类由 clsx 挂载）。 */
  selected?: boolean
}

/**
 * 状态类由 CSS 变量桥承载主题值、由 clsx 挂载状态：JS 不拼样式对象、不写主题分支。
 * 渐变/端点等按主题变的值走 `--bk-*` 变量，规则留 CSS。
 */
export function TokenSwatch({
  varName,
  label,
  light,
  dark,
  className,
  selected = false,
}: TokenSwatchProps): ReactNode {
  const blockStyle = {
    "--swatch-light": light,
    "--swatch-dark": dark,
  } as CSSProperties
  return (
    <div
      className={clsx(styles.swatch, className, selected && styles.swatchSelected)}
      title={`${varName}：亮 ${light} / 暗 ${dark}`}
    >
      <div className={styles.swatchBlock} style={blockStyle}>
        <span className={styles.swatchStripe} data-tone="light" />
        <span className={styles.swatchStripe} data-tone="dark" />
      </div>
      <div className={styles.swatchMeta}>
        <code className={styles.swatchVar}>{varName}</code>
        <span className={styles.swatchLabel}>{label}</span>
        <span className={styles.swatchValues}>
          <code>{light}</code>
          <code>{dark}</code>
        </span>
      </div>
    </div>
  )
}