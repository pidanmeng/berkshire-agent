/**
 * Table —— `@berkshire/ui` 数据表格（shadcn new-york 结构参照）。
 *
 * 组合子组件：`Table`（容器+table）+ `TableHeader`(thead)`/`TableBody`(tbody)`/`TableRow`(tr)`/
 * `TableHead`(th)`/`TableCell`(td)。行分隔用 `border` 透明叠层、行 hover 用 `hover` 叠层。
 * 用原生 `<table>` 语义保证可访问性；横向溢出由 `Table` 外层容器接管（overflow-x）。
 */
import { clsx } from "clsx"
import type { HTMLAttributes, ReactNode } from "react"
import styles from "./Table.module.css"

/** Table 容器：外层可横向滚动 + 内层 `<table>`。 */
export interface TableProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
  className?: string
}
export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode
  className?: string
}
export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode
  className?: string
}
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children?: ReactNode
  className?: string
}
export interface TableHeadProps extends HTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode
  className?: string
}
export interface TableCellProps extends HTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode
  className?: string
}

/** 表格容器：外层横向滚动，内层 `<table>`。 */
export function Table({ children, className, ...rest }: TableProps) {
  return (
    <div className={clsx(styles.container, className)} {...rest}>
      <table className={styles.table}>{children}</table>
    </div>
  )
}

/** `<thead>` 表头分组。 */
export function TableHeader({ children, className, ...rest }: TableHeaderProps) {
  return (
    <thead className={clsx(styles.header, className)} {...rest}>
      {children}
    </thead>
  )
}

/** `<tbody>` 表体分组。 */
export function TableBody({ children, className, ...rest }: TableBodyProps) {
  return (
    <tbody className={clsx(styles.body, className)} {...rest}>
      {children}
    </tbody>
  )
}

/** `<tr>` 行（hover 高亮）。 */
export function TableRow({ children, className, ...rest }: TableRowProps) {
  return (
    <tr className={clsx(styles.row, className)} {...rest}>
      {children}
    </tr>
  )
}

/** `<th>` 表头单元格（弱化前景、左对齐）。 */
export function TableHead({ children, className, ...rest }: TableHeadProps) {
  return (
    <th scope="col" className={clsx(styles.head, className)} {...rest}>
      {children}
    </th>
  )
}

/** `<td>` 内容单元格。 */
export function TableCell({ children, className, ...rest }: TableCellProps) {
  return (
    <td className={clsx(styles.cell, className)} {...rest}>
      {children}
    </td>
  )
}