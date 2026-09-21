import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCsvProvider } from '../src/provider'
import type { DatasetId } from '@berkshire/core'

const DAILY = 'daily' as DatasetId
const REALTIME = 'realtime' as DatasetId

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bk-csv-'))
  return dir
}

function makeProvider(dir: string) {
  return createCsvProvider({ dataDir: () => dir, log: () => undefined })
}

describe('csv provider 可用性（按文件动态）', () => {
  test('无文件 → daily/realtime unavailable + 原因；放好文件 → available', async () => {
    const dir = tempDir()
    try {
      const p = makeProvider(dir)
      expect((await p.getAvailability!(DAILY)).available).toBe(false)
      expect((await p.getAvailability!(REALTIME)).available).toBe(false)

      writeFileSync(join(dir, 'daily.csv'), 'symbol,date,open,high,low,close,volume,amount\n')
      expect((await p.getAvailability!(DAILY)).available).toBe(true)
      expect((await p.getAvailability!(REALTIME)).available).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('csv provider fetch', () => {
  test('daily.csv 解析 + 数值列转 number + 窗口内 pre_close/change_pct 推导', async () => {
    const dir = tempDir()
    try {
      writeFileSync(
        join(dir, 'daily.csv'),
        [
          'symbol,date,open,high,low,close,volume,amount',
          '600000.SH,2026-01-05,10.0,10.6,9.9,10.5,1234,2100000',
          '600000.SH,2026-01-06,10.5,11.5,10.2,11,2345,3300000',
        ].join('\n'),
      )
      const p = makeProvider(dir)
      const rows = (await p.fetch(DAILY, {})) as Array<Record<string, unknown>>
      expect(rows).toHaveLength(2)
      expect(rows[0]!['close']).toBe(10.5)
      expect(rows[0]!['volume']).toBe(1234)
      expect(rows[0]!['pre_close']).toBe(null)
      expect(rows[1]!['pre_close']).toBe(10.5)
      expect(rows[1]!['change_pct']).toBeCloseTo(0.5 / 10.5, 10)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('坏行（缺必需列/数值坏）→ 跳过并留痕，不伪造', async () => {
    const dir = tempDir()
    try {
      const skipped: Array<unknown> = []
      writeFileSync(
        join(dir, 'daily.csv'),
        [
          'symbol,date,open,high,low,close,volume,amount',
          '600000.SH,2026-01-05,10,10.6,9.9,10.5,1234,2100000',
          ',,10,10,10,10,10,10', // 缺 symbol/date → 跳过
          '600001.SZ,2026-01-05,10,10,10,abc,10,10', // close 数值坏 → 跳过
        ].join('\n'),
      )
      const p = createCsvProvider({ dataDir: () => dir, log: (e, d) => { if (e === 'datasource-csv/skip') skipped.push(d) } })
      const rows = (await p.fetch(DAILY, {})) as Array<Record<string, unknown>>
      expect(rows).toHaveLength(1)
      expect(rows[0]!['symbol']).toBe('600000.SH')
      expect(skipped.length).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
