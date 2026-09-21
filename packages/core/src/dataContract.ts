/**
 * 跨 provider 共享的**纯数据契约工具**（无 cordis 依赖、无 I/O）。
 *
 * 这些是数据契约红线（docs/data-model.md §6）的落地实现点：比例/百分比口径、volume
 * 单位换算、窗口内 pre_close/change_pct 的**同源推导**（不做启发式、不伪造缺失值）。
 * 各数据源 provider（fuyao / csv …）统一从这里取，避免同一口径在不同插件里各写一份
 * 而漂移。
 */

/** 数值化：非有限值 → null（不伪造）。 */
export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** volume 股 → 手（floor）；null/非数值 → null。 */
export function volumeToHand(value: unknown): number | null {
  const n = toFloat(value)
  return n === null ? null : Math.floor(n / 100)
}

/**
 * 给一批日K行按 symbol 计算 pre_close/change_pct（**同源推导**：序列内前一交易日收盘；
 * 窗口首行无前收 → null，绝不填 0/启发式猜测）。调用方负责先把行按日期升序排好或交由
 * 本函数按 symbol 内排序。
 *
 * 鲁棒性：**无 symbol 行原样透传**（pre_close/change_pct 置空，不静默丢弃）；日期缺失或非
 * yyyy-mm-dd ISO 的行不参与链式推导（避免 `String(null)='null'` 排到最前导致错拿前收）。
 */
export function derivePreClose(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const bySymbol = new Map<string, Array<Record<string, unknown>>>()
  for (const r of rows) {
    const sym = String(r['symbol'] ?? '')
    if (!sym) {
      out.push({ ...r, pre_close: null, change_pct: null })
      continue
    }
    const list = bySymbol.get(sym) ?? []
    list.push(r)
    bySymbol.set(sym, list)
  }
  for (const list of bySymbol.values()) {
    // 仅「日期可排序」的行参与链式推导；其余原样透传（不伪造前收）。
    const valid = list.filter((r) => typeof r['date'] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r['date']))
    valid.sort((a, b) => String(a['date']).localeCompare(String(b['date'])))
    const validSet = new Set(valid)
    for (const row of list) {
      if (!validSet.has(row)) {
        out.push({ ...row, pre_close: null, change_pct: null })
        continue
      }
      const idx = valid.indexOf(row)
      const prev = idx > 0 ? toFloat(valid[idx - 1]!['close']) : null
      const close = toFloat(row['close'])
      out.push(
        Object.assign(row, {
          pre_close: prev,
          change_pct: prev !== null && prev !== 0 && close !== null ? (close - prev) / prev : null,
        }),
      )
    }
  }
  return out
}
