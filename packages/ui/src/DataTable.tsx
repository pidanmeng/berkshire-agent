/**
 * DataTable —— `@berkshire/ui` 数据表格组合容器（在既有 `Table` 之上加排序/筛选/分页/选择）。
 *
 * shadcn new-york 的「Data Table」作为独立容器组件实现（S1 决策），**不改既有 `Table` 的 API**：
 * 内部复用 `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` 做展示底子，
 * 复用 `Input`（可选全局面板筛选）与 `Pagination`（S2，分页切片）做交互；排序为自实现比较器，
 * 行选择与全选用既有 `Checkbox`。**零新增运行时依赖**（不放行 tanstack-table，见 S1 依赖政策）。
 *
 * 数据契约红线：本组件是**纯消费端容器**，不做任何数据来源/口径转换，也不臆造数值格式——
 * 它把调用方给好的 `columns`/`data` 行对象原样切片/排序/渲染。价格、比例、前复权等 A 股数值的
 * 格式化是调用方/数据层的职责（`cell` 渲染由调用方提供），组件不猜格式、不使用 bill/bear 语义色。
 *
 * 可访问性基础：可排序列头是 `<th aria-sort>` + 内嵌 `<button>`（键盘可达）；分页由 `Pagination`
 * 提供的 `<nav aria-label>` + `aria-current="page"` 承担；行/全选复选框有 `aria-label` 与 `label`。
 *
 * 诚实边界（**目标态**，未实现）：不提供远程/异步数据获取与加载骨架；不做虚拟化/大数据渲染优化
 * （数据量大的性能优化是 `packages/ui` 之外的事）；不做 CSV/导出、列拖动重排；不做列级多重筛选
 * （仅提供单一全局面板筛选 input）；全选框不支持 indeterminate 半选态（`Checkbox` 仅布尔 `checked`）。
 * 受控 props（`page`/`sortColumn`/`globalFilter`/`selectedRowKeys`）与非受控（`default*`）二选一，
 * 半受控混用会导致行为不可预期。
 */
import { clsx } from "clsx"
import { useEffect, useMemo, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { Checkbox } from "./Checkbox"
import { Input } from "./Input"
import { Pagination } from "./Pagination"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table"
import styles from "./DataTable.module.css"

export type DataTableSortDirection = "asc" | "desc"

/** 一列的描述。`cell` 提供渲染；`sortable` 参与排序；编号/搜索值可自定义。 */
export interface DataTableColumn<Row> {
  /** 列唯一键（排序/默认取值用）。 */
  key: string
  /** 列头文本/节点。 */
  header: ReactNode
  /** 单元格渲染；缺省回退到 `String(row[key]) ?? ""`（纯展示，不做值格式化）。 */
  cell?: (row: Row) => ReactNode
  /** 是否可排序（点击列头切换 asc/desc/无）。 */
  sortable?: boolean
  /** 自定义列比较器；缺省按基础类型 `string|number` 比较。 */
  sortFn?: (a: Row, b: Row) => number
  /** 单元格对齐。缺省继承 `Table` 的默认左对齐。 */
  align?: "left" | "center" | "right"
  /** 列宽（透传 `th`/`td` 的 `width`）。 */
  width?: string
  /** 面板筛选时的取值文本；缺省回退 `String(row[key])`。 */
  searchValue?: (row: Row) => string
  /** 透传到 `<th>`/`<td>` 的额外类名。 */
  className?: string
}

export interface DataTableProps<Row> {
  /** 列定义（排序/渲染/对齐/搜索）。 */
  columns: ReadonlyArray<DataTableColumn<Row>>
  /** 行数据（由调用方提供，组件只切片/排序/渲染，不做口径转换）。 */
  data: readonly Row[]
  /** 行唯一键。行选择/全选依赖它；缺省回退到行下标索引（排序后不稳定，建议行选择时提供）。 */
  rowKey?: (row: Row, index: number) => string

  /* ── 分页（可选；不传 `pageSize` 则不启用，一次渲染全部行） ───────────── */
  /** 每页行数。缺省不启用分页。 */
  pageSize?: number
  /** 受控：当前页（1 起始）。 */
  page?: number
  /** 非受控：初始页。缺省 1。 */
  defaultPage?: number
  /** 页码变更回调（受控时用）。`totalPages` 为切换时刻的总页数。 */
  onPageChange?: (page: number, totalPages: number) => void

  /* ── 排序（可选） ──────────────────────────────────────────────────── */
  /** 受控：当前排序列键（`null` 表示无排序）。 */
  sortColumn?: string | null
  /** 受控：当前排序方向。 */
  sortDirection?: DataTableSortDirection
  /** 非受控：初始排序列键。 */
  defaultSortColumn?: string | null
  /** 非受控：初始排序方向。缺省 `asc`。 */
  defaultSortDirection?: DataTableSortDirection
  /** 排序变更回调（受控时用）。点击可排序列头 asc→desc→无 循环。 */
  onSortChange?: (sort: { column: string | null; direction: DataTableSortDirection }) => void

  /* ── 面板筛选（可选；全局面板 input） ─────────────────────────────────── */
  /** 筛选框占位文案；提供即显示筛选 input（全局匹配列 `searchValue`/原始字段）。 */
  filterPlaceholder?: string
  /** 受控：当前筛选关键字。 */
  globalFilter?: string
  /** 非受控：初始筛选关键字。 */
  defaultGlobalFilter?: string
  /** 筛选变更回调。 */
  onGlobalFilterChange?: (value: string) => void

  /* ── 行选择（可选） ────────────────────────────────────────────────── */
  /** 是否启用行选择与全选（首列复选框）。 */
  selectionMode?: boolean
  /** 受控：已选行 key 集合。 */
  selectedRowKeys?: readonly string[]
  /** 非受控：初始已选行 key 集合。 */
  defaultSelectedRowKeys?: readonly string[]
  /** 选择变更回调。 */
  onSelectionChange?: (keys: readonly string[]) => void

  /* ── UI ───────────────────────────────────────────────────────────── */
  /** 空数据占位文案。缺省「无数据」。 */
  emptyText?: ReactNode
  /** 分页 `<nav>` 语义标签，透传 `Pagination`。 */
  paginationLabel?: string
  /** 透传到最外层容器（`flex column` 包装）。 */
  className?: string
  /** 透传到 `Table`（既有容器组件）。 */
  tableClassName?: string
  /** 行级额外类名。 */
  rowClassName?: (row: Row) => string | undefined
}

/** 读取原始字段值（仅取原始结构化值，不做格式化/口径转换）。 */
function rawValue<Row>(row: Row, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

/** 缺省列比较器：数字按数值，其余按字符串（不区分大小写）。 */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1
  }
  const sa = String(a ?? "").toLowerCase()
  const sb = String(b ?? "").toLowerCase()
  if (sa < sb) return -1
  if (sa > sb) return 1
  return 0
}

/** 排序方向指示（无依赖内联 SVG，`aria-hidden`，颜色走令牌）。激活列用单箭头；非激活列用中性「⇅」双箭头，避免误导为已排序。 */
function SortIndicator({ direction, active }: { direction: DataTableSortDirection; active: boolean }) {
  return (
    <span aria-hidden className={clsx(styles.sortIndicator, active && styles.sortActive)}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {active
          ? direction === "asc"
            ? <path d="m5 12 7-7 7 7" />
            : <path d="m19 12-7 7-7-7" />
          : (
            <>
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </>
          )}
      </svg>
    </span>
  )
}

export function DataTable<Row>({
  columns,
  data,
  rowKey,
  pageSize,
  page: pageProp,
  defaultPage = 1,
  onPageChange,
  sortColumn: sortColumnProp,
  sortDirection: sortDirectionProp,
  defaultSortColumn = null,
  defaultSortDirection = "asc",
  onSortChange,
  filterPlaceholder,
  globalFilter: globalFilterProp,
  defaultGlobalFilter = "",
  onGlobalFilterChange,
  selectionMode = false,
  selectedRowKeys,
  defaultSelectedRowKeys,
  onSelectionChange,
  emptyText = "无数据",
  paginationLabel,
  className,
  tableClassName,
  rowClassName,
}: DataTableProps<Row>) {
  // 非受控内部状态（受控 props 提供了就用受控值）。
  const [internalSortColumn, setInternalSortColumn] = useState<string | null>(defaultSortColumn)
  const [internalSortDirection, setInternalSortDirection] =
    useState<DataTableSortDirection>(defaultSortDirection)
  const [internalPage, setInternalPage] = useState<number>(defaultPage)
  const [internalFilter, setInternalFilter] = useState<string>(defaultGlobalFilter)
  const [internalSelected, setInternalSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedRowKeys ?? []),
  )

  const sortColumn = sortColumnProp !== undefined ? sortColumnProp : internalSortColumn
  const sortDirection = sortDirectionProp !== undefined ? sortDirectionProp : internalSortDirection
  const globalFilter = globalFilterProp !== undefined ? globalFilterProp : internalFilter
  const page = pageProp !== undefined ? pageProp : internalPage
  const selectedSet = useMemo(
    () => (selectedRowKeys !== undefined ? new Set(selectedRowKeys) : internalSelected),
    [selectedRowKeys, internalSelected],
  )

  const getRowKey = (row: Row, index: number) => (rowKey ? rowKey(row, index) : String(index))

  // 1) 面板筛选（全局匹配各列 searchValue/原始字段）。
  const filtered = useMemo(() => {
    const q = globalFilter.trim().toLowerCase()
    if (!q) return data
    return data.filter((row) =>
      columns.some((col) =>
        (col.searchValue ? col.searchValue(row) : String(rawValue(row, col.key) ?? "")).toLowerCase().includes(q),
      ),
    )
  }, [data, columns, globalFilter])

  // 2) 排序（自实现；可排序列头 asc/desc/无 三态）。
  const sorted = useMemo(() => {
    if (!sortColumn) return filtered
    const col = columns.find((c) => c.key === sortColumn)
    if (!col?.sortable) return filtered
    const dir = sortDirection === "desc" ? -1 : 1
    const copy = filtered.slice()
    copy.sort((a, b) => {
      const cmp = col.sortFn ? col.sortFn(a, b) : compareValues(rawValue(a, col.key), rawValue(b, col.key))
      return cmp * dir
    })
    return copy
  }, [columns, filtered, sortColumn, sortDirection])

  // 3) 分页切片（复用既有 Table 渲染 + Pagination 交互）。
  const totalPages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const currentPage = Math.min(Math.max(page, 1), totalPages)

  // 筛选/数据收缩使当前页越界时，把非受控页码回写到钳位值，避免「渲染已钳位但内部仍越界、下次交互跳回」。
  useEffect(() => {
    if (pageProp !== undefined || !pageSize) return
    const clamped = Math.min(Math.max(page, 1), totalPages)
    if (clamped !== page) setInternalPage(clamped)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只需在 totalPages（触发的收缩源）变化时校正；page 已并入 currentPage 渲染钳位
  }, [totalPages])
  const pageRows = useMemo(() => {
    if (!pageSize) return sorted.map((row, index) => ({ row, key: getRowKey(row, index) }))
    const start = (currentPage - 1) * pageSize
    return sorted.slice(start, start + pageSize).map((row, index) => ({ row, key: getRowKey(row, start + index) }))
  }, [sorted, pageSize, currentPage, rowKey]) // eslint-disable-line react-hooks/exhaustive-deps -- getRowKey 是轻 closure

  function toggleSort(key: string) {
    let nextColumn: string | null
    let nextDirection: DataTableSortDirection
    if (sortColumn === key) {
      if (sortDirection === "asc") {
        nextColumn = key
        nextDirection = "desc"
      } else {
        nextColumn = null
        nextDirection = "asc" // desc → 无
      }
    } else {
      nextColumn = key
      nextDirection = "asc"
    }
    if (sortColumnProp !== undefined) {
      onSortChange?.({ column: nextColumn, direction: nextDirection })
    } else {
      setInternalSortColumn(nextColumn)
      setInternalSortDirection(nextDirection)
    }
  }

  function handlePageChange(p: number) {
    const next = Math.min(Math.max(p, 1), totalPages)
    if (pageProp !== undefined) onPageChange?.(next, totalPages)
    else setInternalPage(next)
  }

  function handleFilterChange(value: string) {
    if (globalFilterProp !== undefined) onGlobalFilterChange?.(value)
    else setInternalFilter(value)
  }

  function applySelection(next: Set<string>) {
    const keys = [...next]
    if (selectedRowKeys !== undefined) onSelectionChange?.(keys)
    else setInternalSelected(next)
  }

  function toggleRow(key: string) {
    const next = new Set(selectedSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    applySelection(next)
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((p) => selectedSet.has(p.key))
  const anyPageSelected = pageRows.some((p) => selectedSet.has(p.key))

  function toggleAllPage() {
    const next = new Set(selectedSet)
    for (const p of pageRows) {
      if (allPageSelected) next.delete(p.key)
      else next.add(p.key)
    }
    applySelection(next)
  }

  const colCount = columns.length + (selectionMode ? 1 : 0)
  const alignStyle = (align?: DataTableColumn<Row>["align"]): CSSProperties | undefined =>
    align ? { textAlign: align } : undefined

  return (
    <div className={clsx(styles.root, className)}>
      {filterPlaceholder !== undefined && (
        <div className={styles.toolbar}>
          <Input
            value={globalFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            placeholder={filterPlaceholder}
            aria-label="筛选"
            className={styles.filterInput}
          />
        </div>
      )}

      <Table className={tableClassName}>
        <TableHeader>
          <TableRow>
            {selectionMode && (
              <TableHead style={{ width: "2rem" }}>
                <Checkbox
                  checked={allPageSelected}
                  onChange={toggleAllPage}
                  aria-label={anyPageSelected ? "取消全选" : "全选当前页"}
                  label=""
                />
              </TableHead>
            )}
            {columns.map((col) => {
              const active = sortColumn === col.key
              const ariaSort = active
                ? sortDirection === "asc"
                  ? ("ascending" as const)
                  : ("descending" as const)
                : undefined
              return (
                <TableHead
                  key={col.key}
                  style={{ textAlign: col.align, width: col.width }}
                  className={col.className}
                  aria-sort={ariaSort}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => toggleSort(col.key)}
                      aria-label={`${typeof col.header === "string" ? col.header : col.key} 排序`}
                    >
                      <span>{col.header}</span>
                      <SortIndicator direction={sortDirection} active={active} />
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.length === 0 ? (
            <tr className={styles.emptyRow}>
              <td colSpan={colCount} className={styles.emptyCell}>
                {emptyText}
              </td>
            </tr>
          ) : (
            pageRows.map(({ row, key }) => (
              <TableRow key={key} className={rowClassName?.(row)}>
                {selectionMode && (
                  <TableCell>
                    <Checkbox checked={selectedSet.has(key)} onChange={() => toggleRow(key)} aria-label="选择行" label="" />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    style={alignStyle(col.align)}
                    className={col.className}
                  >
                    {col.cell ? col.cell(row) : String(rawValue(row, col.key) ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {pageSize && totalPages > 1 && (
        <div className={styles.pagination}>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            ariaLabel={paginationLabel}
          />
        </div>
      )}
    </div>
  )
}