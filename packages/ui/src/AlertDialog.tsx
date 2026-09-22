/**
 * AlertDialog —— `@berkshire/ui` 确认/告警式模态对话框（shadcn new-york 结构参照）。
 *
 * 与既有 `Dialog` 的关系（对齐 S1 决策 `.agents/notes/implemented/architecture/2026-09-21-shadcn-import-decision.md`
 * 与 `…-dialog-replaces-modal-and-sidebar-completion.md`）：普通模态用 `Dialog` 家族；本件是
 * 「模态 + 告警语义 + 动作区」的独立组合，**不改、不别名 `Dialog`**。
 * 复用 `Dialog` 同款自实现 focus-trap / 遮罩 / body scroll lock 思路（`overlay.ts` hooks）但就地独立书写，
 * 不侵入既有组件源码。
 *
 * 可访问性（对齐 shadcn AlertDialog）：
 * - `role="alertdialog"` + `aria-modal`；
 * - 标题区 `aria-labelledby`、描述区 `aria-describedby` 由内部 `useId` 生成 id 关联；
 * - 焦点陷阱：打开聚焦面板，Tab/Shift+Tab 圈定框内，关闭还原先前聚焦元素；
 * - 确认按钮可 `confirmDisabled` 或 `confirmLoading`（配 `@berkshire/ui` 现成 `Button` 的 loading spinner）；
 * - ESC/遮罩关闭可用 `dismissable` 关——告警通常强制确认，默认关闭（`false`）。
 *
 * 关闭语义（受控 `open` + `onOpenChange`）：取消按钮、以及 `dismissable` 时 ESC/遮罩点击都会调用
 * `onOpenChange(false)`（行程决定的取消即关闭）；确认按钮只触发 `onConfirm`，**不自动关闭**——
 * 消费方在 `onConfirm` 内自行决定（通常 async 完成后 `onOpenChange(false)`）。
 *
 * 诚实边界：不做连续多告警队列、不做 `command`/`title` 外复杂头部插槽；
 * 标题/描述为纯文本/轻节点，动作区固定「取消 + 确认」两键（key 可按需以 `onCancel`/`onConfirm` 控制表现）。
 */
import { clsx } from "clsx"
import { useEffect, useId, useRef } from "react"
import type { MouseEvent, ReactNode } from "react"
import { Button } from "./Button"
import styles from "./AlertDialog.module.css"

export interface AlertDialogProps {
  /** 受控打开态。为 true 时渲染遮罩+面板。 */
  open: boolean
  /** 打开态变化回调（取消 / `dismissable` 时 ESC、遮罩点击触发 `false`）。 */
  onOpenChange: (open: boolean) => void
  /** 告警标题（关联 `aria-labelledby`）。 */
  title: ReactNode
  /** 可选告警描述（关联 `aria-describedby`）。 */
  description?: ReactNode
  /** 面板内标题/描述之外的可选附加内容区。 */
  children?: ReactNode
  /** 取消键文案。传 `null` 隐藏取消键。默认「取消」。 */
  cancelLabel?: ReactNode | null
  /** 确认键文案。默认「确认」。 */
  confirmLabel?: ReactNode
  /** 取消键点击回调（回调后自动关闭，即 `onOpenChange(false)`）。 */
  onCancel?: () => void
  /** 确认键点击回调（不自动关闭，由消费方决定何时 `onOpenChange(false)`）。 */
  onConfirm?: () => void
  /** 是否可被 ESC / 遮罩点击关闭。告警常强制确认，默认 **false**。 */
  dismissable?: boolean
  /** 确认键禁用态（如前置条件未满足）。 */
  confirmDisabled?: boolean
  /** 确认键加载态：禁用并显示 spinner（配 `Button` 内置加载指示器）。 */
  confirmLoading?: boolean
  /** 确认键是否 danger 视觉。默认 true（确认破坏性操作）。 */
  danger?: boolean
  /** 背景滚动锁定。默认 true。 */
  disableScroll?: boolean
  /** 附加 className（透传到面板容器）。 */
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  cancelLabel = "取消",
  confirmLabel = "确认",
  onCancel,
  onConfirm,
  dismissable = false,
  confirmDisabled = false,
  confirmLoading = false,
  danger = true,
  disableScroll = true,
  className,
}: AlertDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  // 打开时记录先前聚焦元素、聚焦面板；关闭/卸载时还原（注册即效应 + disposer）。
  useEffect(() => {
    if (!open) return
    prevFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel) panel.focus()
    return () => prevFocusRef.current?.focus?.()
  }, [open])

  // 键盘：ESC（`dismissable` 时关闭）+ Tab 焦点陷阱圈定在面板内。
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dismissable) onOpenChange(false)
        return
      }
      if (e.key !== "Tab") return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, dismissable, onOpenChange])

  // 背景滚动锁定（注册即效应 + disposer，卸载还原）。
  useEffect(() => {
    if (!open || !disableScroll) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open, disableScroll])

  if (!open) return null

  const handleCancelClick = () => {
    onCancel?.()
    onOpenChange(false)
  }

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (dismissable && e.target === e.currentTarget) onOpenChange(false)
  }

  return (
    <div className={styles.overlay} onMouseDown={handleBackdrop}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={clsx(styles.panel, className)}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {description != null && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
        </div>
        {children != null && <div className={styles.content}>{children}</div>}
        <div className={styles.actions}>
          {cancelLabel !== null && (
            <Button variant="ghost" onClick={handleCancelClick}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={confirmDisabled}
            loading={confirmLoading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}