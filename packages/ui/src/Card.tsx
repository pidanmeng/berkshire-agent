/**
 * Card —— `@berkshire/ui` 卡片容器（shadcn new-york 结构参照）。
 *
 * 组合子组件：`Card` + `CardHeader`/`CardTitle`/`CardDescription` + `CardContent` + `CardFooter`。
 * 抬升面 + 边框 + 大圆角 + 细阴影。全部 `var(--bk-*)`，禁魔法色值；暗色由 static 层单表覆盖。
 * 不做 portal/焦点陷阱（纯展示容器，可访问性靠正确语义元素）。
 */
import { clsx } from "clsx"
import type { HTMLAttributes } from "react"
import styles from "./Card.module.css"

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}
export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  className?: string
}
export interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  className?: string
}
export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}
export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
}

/** 卡片容器（外边距由父布局决定，不内嵌）。 */
export function Card({ className, ...rest }: CardProps) {
  return <div className={clsx(styles.card, className)} {...rest} />
}

/** 卡片头部：标题 + 描述的纵向堆叠区。 */
export function CardHeader({ className, ...rest }: CardHeaderProps) {
  return <div className={clsx(styles.header, className)} {...rest} />
}

/** 卡片标题（语义 `h3`，属主由层级决定可覆写）。 */
export function CardTitle({ className, ...rest }: CardTitleProps) {
  return <h3 className={clsx(styles.title, className)} {...rest} />
}

/** 卡片标题下方的说明文案（弱化前景）。 */
export function CardDescription({ className, ...rest }: CardDescriptionProps) {
  return <p className={clsx(styles.description, className)} {...rest} />
}

/** 卡片主体内容区。 */
export function CardContent({ className, ...rest }: CardContentProps) {
  return <div className={clsx(styles.content, className)} {...rest} />
}

/** 卡片底部操作区（按钮等）。 */
export function CardFooter({ className, ...rest }: CardFooterProps) {
  return <div className={clsx(styles.footer, className)} {...rest} />
}