/**
 * TitleBar —— 自绘 Windows 标题栏（WP-5，base-ui 壳插件）。
 *
 * 在 `tauri.conf.json` 把 `decorations` 置 `false`（去除原生标题栏）后，由本组件提供窗口标题栏：
 * 品牌区 + 可拖拽区 + 窗口控制按钮（最小化/最大化·还原/关闭）。壳组件**不依赖宿主 `lib/api`**，
 * 窗口控制动作与最大态由宿主作为 `TitleBarController` **prop 注入**（与 routes/bridgeOnline 同款装配）。
 *
 * 拖拽用 Tauri 2 的 `data-tauri-drag-region` 属性（置于**可拖拽区**，窗口控制按钮在区域内**之外**，
 * 保证按钮可点击）。`deep` 值让整块拖拽区（品牌 + 标题）任意子元素都可拖动。
 *
 * 依赖：拖拽走 Tauri 内置拖拽脚本，会调用核心 `plugin:window|start_dragging` —— 该命令受 ACL
 * 管控，须在 `capabilities/default.json` 加 `core:window:allow-start-dragging`（否则能点按钮却拖不动）；
 * 双击最大化走 Tauri 内置的 `internal_toggle_maximize`（`core:default` 已含），故本组件**不再自行
 * 绑定 `onDoubleClick`**，避免与内置处理重复触发（最大化后立刻还原）。
 *
 * 诚实标注：**聚焦 Windows**；macOS/Linux 下 `decorations:false` 同样生效、同样渲染本标题栏，
 * 属尽力降级（macOS 原生红绿灯 Overlay 叠加不在本 WP 范围）。样式全部 `var(--bk-*)`，禁魔法色值。
 */
import type { ReactNode } from "react"
import type { TitleBarController } from "@berkshire/ui-slots"
import styles from "./TitleBar.module.css"

/** 仅图标（SVG，`currentColor` 跟随令牌色；window 控制惯例用线描图标）。 */
const MINIMIZE_ICON = (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M0 5h10" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const MAXIMIZE_ICON = (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const RESTORE_ICON = (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <rect x="1" y="2.5" width="6.5" height="6.5" fill="var(--bk-color-bg-elevated)" stroke="currentColor" strokeWidth="1" />
    <path d="M2.5 2.5V1h6.5v6.5h-1.5" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)
const CLOSE_ICON = (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M0 0l10 10M10 0L0 10" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export function TitleBar({ controller }: { controller: TitleBarController }): ReactNode {
  const { title, onMinimize, onToggleMaximize, onClose, isMaximized } = controller
  return (
    <header className={styles.titleBar}>
      {/* 可拖拽区（品牌 + 标题）：Tauri `data-tauri-drag-region="deep"` 令整个子树可拖动；
          双击最大化由 Tauri 内置处理（见文件头注释），此处不再自行绑定。 */}
      <div className={styles.dragArea} data-tauri-drag-region="deep">
        <span className={styles.brandMark} aria-hidden="true" />
        <span className={styles.titleText}>{title}</span>
      </div>

      {/* 窗口控制按钮（可点击，不随拖拽区拖动）。 */}
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="最小化"
          title="最小化"
          onClick={onMinimize}
          tabIndex={0}
        >
          {MINIMIZE_ICON}
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label={isMaximized ? "还原" : "最大化"}
          title={isMaximized ? "还原" : "最大化"}
          onClick={onToggleMaximize}
          tabIndex={0}
        >
          {isMaximized ? RESTORE_ICON : MAXIMIZE_ICON}
        </button>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
          tabIndex={0}
        >
          {CLOSE_ICON}
        </button>
      </div>
    </header>
  )
}
