/**
 * Dialog —— `@berkshire/ui` 模态对话框复合家族（shadcn `Dialog` 迁移，自实现、零新依赖）。
 *
 * 对齐 shadcn 官方 `Dialog` 的复合家族命名与组合，但按 S1 决策的「自实现 portal+focus-trap、
 * 不引 Radix/base-ui」基调落地（复用于 `Sheet`/`Drawer` 的 `overlay.ts` hooks）：
 * - `Dialog`（根，受控 `open`/`onOpenChange`，作为 Context Provider 下发开合语义）；
 * - `DialogTrigger`（开：点击调 `onOpenChange(true)`）；
 * - `DialogPortal`（经 `react-dom` `createPortal` 渲染到 `document.body`）；
 * - `DialogOverlay`（遮罩：点击 `/` 关闭可选）；
 * - `DialogContent`（面板：焦点陷阱 + ESC + 遮罩关闭 + body 滚动锁 + 可选关闭按钮 + 入场动画；
 *   **本组件取代既有 `Modal`**，普通对话框直接用它）；
 * - `DialogClose`（关：点击调 `onOpenChange(false)`）；
 * - `DialogHeader` / `DialogFooter` / `DialogTitle` / `DialogDescription`（布局语义件）。
 *
 * 设计取舍（诚实标注）：
 * 1) `Modal` 被本家族取代并移除导出；`AlertDialog`（告警/确认语义）保持独立，不归入本家族。
 * 2) shadcn 官方的 `DialogTrigger`/`DialogClose` 用 `asChild`（`@base-ui/react` `render` 透传），
 *    本包无 `asChild` 原语 → `DialogTrigger`/`DialogClose` 渲染为原生 `<button>`（绝对定位关闭按钮
 *    由 `DialogContent` 内建，见下发）；若要自定义触发元素外观，消费方在 `children` 里自写带
 *    `onClick` 的手动按钮调回调，或由 `DialogContent` 关闭按钮承担。
 * 3) 标题/描述的可访问性：支持 `DialogContent` 的 `ariaLabel`；如需 `aria-labelledby`，消费方在
 *    标题元素自定义 `id` 并透传（本家族不做自动 id 关联，保持最小件）。
 *
 * 依赖纪律：只 import `react` + `react-dom`（`createPortal`）+ `clsx` + 包内 `overlay` hooks；
 * 不加动效库。样式全 `var(--bk-*)`，禁魔法色值。
 */
import { createContext, useContext, useRef } from "react"
import { createPortal } from "react-dom"
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react"
import { clsx } from "clsx"
import { useEscToClose, useFocusOnOpen, useFocusTrap, useScrollLock } from "./overlay"
import styles from "./Dialog.module.css"

interface DialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}
const DialogContext = createContext<DialogContextValue | null>(null)

function useDialogContext(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error("Dialog 子组件必须在 <Dialog> 内使用")
  return ctx
}

export interface DialogProps {
  /** 受控打开态。 */
  open: boolean
  /** 打开态变化回调（Trigger/Close/遮罩/ESC 触发）。 */
  onOpenChange: (open: boolean) => void
  children?: ReactNode
}

/** `Dialog` 根：持有开合语义，作为 Context 下发（Trigger/Overlay/Content/Close 共享）。 */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>
}

export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
}

/** `DialogTrigger`：点击打开对话框（原生 button 承载，`aria-haspopup="dialog"`）。 */
export function DialogTrigger({ children, onClick, className, ...rest }: DialogTriggerProps) {
  const { onOpenChange } = useDialogContext()
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={clsx(styles.trigger, className)}
      onClick={(e) => {
        onClick?.(e)
        onOpenChange(true)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode
}

/** `DialogClose`：点击关闭对话框（原生 button 承载）。 */
export function DialogClose({ children, onClick, className, ...rest }: DialogCloseProps) {
  const { onOpenChange } = useDialogContext()
  return (
    <button
      type="button"
      className={clsx(styles.close, className)}
      onClick={(e) => {
        onClick?.(e)
        onOpenChange(false)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface DialogPortalProps {
  /** 面板内容（通常为 `DialogContent`）。 */
  children?: ReactNode
}

/** `DialogPortal`：把内容经 `createPortal` 渲染到 `document.body`。 */
export function DialogPortal({ children }: DialogPortalProps) {
  const { open } = useDialogContext()
  if (!open) return null
  return createPortal(children, document.body)
}

export interface DialogOverlayProps extends HTMLAttributes<HTMLDivElement> {
  /** 点击遮罩关闭。默认 true。 */
  closeOnClick?: boolean
}

/** `DialogOverlay`：全屏遮罩；点击（`closeOnClick`）关闭。@berkshire/ui 内建模态遮罩。 */
export function DialogOverlay({ closeOnClick = true, className, onMouseDown, ...rest }: DialogOverlayProps) {
  const { onOpenChange } = useDialogContext()
  const handle = (e: MouseEvent<HTMLDivElement>) => {
    onMouseDown?.(e)
    if (closeOnClick && e.target === e.currentTarget) onOpenChange(false)
  }
  return <div aria-hidden className={clsx(styles.overlay, className)} onMouseDown={handle} {...rest} />
}

export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  /** 面板内容（通常含 `DialogHeader`/`DialogTitle`/表单/`DialogFooter`）。 */
  children?: ReactNode
  /** 无障碍命名（`aria-label`）。 */
  ariaLabel?: string
  /** 是否显示内建的右上「✕」关闭按钮。默认 true。 */
  showCloseButton?: boolean
  /** ESC 关闭。默认 true。 */
  closeOnEsc?: boolean
  /** 点击遮罩关闭。默认 true。 */
  closeOnBackdrop?: boolean
  /** 背景滚动锁定。默认 true。 */
  disableScroll?: boolean
}

/**
 * `DialogContent` 对话框面板（模态）：portal + 遮罩 + 面板，含焦点陷阱/ESC/遮罩关闭/滚动锁。
 * **取代既有 `Modal`**——普通对话框用它承载面板与关闭交互。
 */
export function DialogContent({
  children,
  ariaLabel,
  showCloseButton = true,
  closeOnEsc = true,
  closeOnBackdrop = true,
  disableScroll = true,
  className,
  ...rest
}: DialogContentProps) {
  const { open, onOpenChange } = useDialogContext()
  const panelRef = useRef<HTMLDivElement>(null)

  useFocusOnOpen(panelRef, open)
  useFocusTrap(panelRef, open)
  useEscToClose(open, closeOnEsc, () => onOpenChange(false))
  useScrollLock(open, disableScroll)

  if (!open) return null

  return createPortal(
    <div className={styles.overlayWrap}>
      <DialogOverlay closeOnClick={closeOnBackdrop} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={clsx(styles.panel, className)}
        {...rest}
      >
        {children}
        {showCloseButton && (
          <DialogClose aria-label="关闭" className={styles.closeButton}>
            ✕
          </DialogClose>
        )}
      </div>
    </div>,
    document.body,
  )
}

export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `DialogHeader`：头部（标题/描述竖排；`DialogContent` 内不使用 absolute 关闭按钮时需为它留白，本族默认标题无占位，由消费方自排）。 */
export function DialogHeader({ children, className, ...rest }: DialogHeaderProps) {
  return (
    <div className={clsx(styles.header, className)} {...rest}>
      {children}
    </div>
  )
}

export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

/** `DialogFooter`：底部动作区（右对齐）。 */
export function DialogFooter({ children, className, ...rest }: DialogFooterProps) {
  return (
    <div className={clsx(styles.footer, className)} {...rest}>
      {children}
    </div>
  )
}

export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode
}

/** `DialogTitle`：标题（`<h2>`，shadcn 语义）。 */
export function DialogTitle({ children, className, ...rest }: DialogTitleProps) {
  return (
    <h2 className={clsx(styles.title, className)} {...rest}>
      {children}
    </h2>
  )
}

export interface DialogDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode
}

/** `DialogDescription`：描述（`<p>`，shadcn 语义）。 */
export function DialogDescription({ children, className, ...rest }: DialogDescriptionProps) {
  return (
    <p className={clsx(styles.description, className)} {...rest}>
      {children}
    </p>
  )
}