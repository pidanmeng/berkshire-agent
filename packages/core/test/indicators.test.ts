import { describe, expect, test } from 'bun:test'
import {
  annualVolatility,
  atr,
  boll,
  computeIndicators,
  ema,
  kdj,
  macd,
  momentum,
  rsiSeries,
  sma,
} from '../src/indicators'

/**
 * 技术指标纯函数回归（docs/data-model.md §1.3 派生现算）：
 * MA/EMA/MACD/RSI 对构造数据断言口径，boll/kdj/atr/动量/波动率 sanity + 窗口不足 null（不伪造）。
 */

describe('MA/EMA 基础', () => {
  test('sma：首 period-1 个 null，随后为窗口均值', () => {
    const out = sma([1, 2, 3, 4, 5], 3)
    expect(out.slice(0, 2)).toEqual([null, null])
    expect(out[2]).toBeCloseTo(2)
    expect(out[3]).toBeCloseTo(3)
    expect(out[4]).toBeCloseTo(4)
  })
  test('ema：首样本播种，随后指数平滑（2/(period+1)）', () => {
    const out = ema([10, 12, 11], 3) // m=0.5
    expect(out[0]).toBeCloseTo(10)
    expect(out[1]).toBeCloseTo(11) // 12*0.5 + 10*0.5
    expect(out[2]).toBeCloseTo(11) // 11*0.5 + 11*0.5
  })
})

describe('RSI（Wilder，构造数据）', () => {
  test('连续上涨 → RSI=100；连续下跌 → RSI≈0；样本不足 → null', () => {
    const up = rsiSeries([1, 2, 3, 4, 5, 6], 3)
    expect(up.slice(0, 3)).toEqual([null, null, null]) // 需 period+1=4 个样本
    expect(up[3]).toBe(100) // 全涨
    expect(up[4]).toBe(100)
    const down = rsiSeries([6, 5, 4, 3, 2, 1], 3)
    expect(down[3]).toBeCloseTo(0)
  })
  test('涨跌各半 → RSI 收敛到 50（中立横盘不伪造）', () => {
    // period=2 → 播种窗口 diffs = +1,-1（gain=loss）→ RSI=50。
    const out = rsiSeries([10, 11, 10, 11, 10, 11], 2)
    expect(out[2]).toBe(50)
  })
})

describe('MACD（构造数据）', () => {
  test('dif=emaFast-emaSlow、dea=ema(dif)、hist=dif-dea；早期 dea null 前 hist null', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // fast=2, slow=4 → ema 立即有值（首样本播种）；dif 前段 = close - emaSlow。
    const { dif, dea, hist } = macd(closes, 2, 4, 2)
    // dif[0] = ema2[0]-ema4[0] = 1-1 = 0
    expect(dif[0]).toBeCloseTo(0)
    // ema2 比 ema4 反应快 → dif 应随上涨为正。
    expect((dif[3] as number)).toBeGreaterThan(0)
    expect(dea[0]).toBeCloseTo(0) // dea 播种于第一个非 null dif
    expect(hist[0]).toBeCloseTo(0)
    // 全程都是有限值（上涨序列无窗口不足）。
    for (const v of [...dif, ...dea, ...hist]) expect(typeof v).toBe('number')
  })
})

describe('BOLL / KDJ / ATR / 动量 / 波动率', () => {
  test('boll：mid=MA，upper/lower=mid±2×总体 std；窗口不足 null', () => {
    const closes = [10, 11, 12, 13, 14]
    const { upper, mid, lower } = boll(closes, 3, 2)
    expect(mid[0]).toBeNull()
    expect(mid[1]).toBeNull()
    expect(mid[2]).toBeCloseTo(11)
    // 11±2*std([10,11,12]); std=sqrt(2/3)
    const sd = Math.sqrt(2 / 3)
    expect(upper[2]).toBeCloseTo(11 + 2 * sd)
    expect(lower[2]).toBeCloseTo(11 - 2 * sd)
  })
  test('kdj：K/D/J 有限且 J=3K-2D；前 n-1 个 null', () => {
    // 单调上涨 → RSV 始终 100（close=high）
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const highs = [...closes]
    const lows = closes.map((c) => c - 1)
    const { k, d, j } = kdj(highs, lows, closes, 3, 3, 3)
    expect(k[0]).toBeNull()
    expect(k[1]).toBeNull()
    // RSV=100 → K=(100 + (k-1)*K_prev)/k = (100+2*50)/3 ≈ 66.7；D=(K+2*50)/3 ≈ 55.6。
    const k3 = k[2]! as number
    const d3 = d[2]! as number
    expect(k3).toBeCloseTo(200 / 3)
    expect(d3).toBeCloseTo((200 / 3 + 100) / 3)
    expect(j[2]).toBeCloseTo(3 * k3 - 2 * d3)
  })
  test('atr：单调上涨无缺口 → 有限值；窗口不足 null', () => {
    const highs = [11, 12, 13, 14, 15]
    const lows = [9, 10, 11, 12, 13]
    const closes = [10, 11, 12, 13, 14]
    const out = atr(highs, lows, closes, 3)
    expect(out[0]).toBeNull() // 需 period 根播种 → out[period-1]=out[2] 才首个值
    expect(out[1]).toBeNull()
    expect(typeof out[2]).toBe('number')
  })
  test('动量：period 期收益率；样本不足 null', () => {
    const out = momentum([10, 11, 12], 2)
    expect(out[0]).toBeNull()
    expect(out[1]).toBeNull()
    expect(out[2]).toBeCloseTo(0.2) // 12/10-1
  })
  test('年化波动率：样本不足 → null；有量才出（非 null 或有限）', () => {
    const out = annualVolatility([10, 10.5, 11, 11.5, 12, 12.5, 13], 3)
    for (let i = 0; i < 3; i++) expect(out[i]).toBeNull()
    expect(out[out.length - 1]).toBeGreaterThan(0)
  })
  test('年化波动率：稀疏窗口（含缺项）→ null，不拿跨缺口拼出的收益率伪装满窗', () => {
    // 末窗口 [12.5, 13, null] 含缺项 → null（对齐 sma/boll 满窗纪律，不伪造）。
    const out = annualVolatility([10, 10.5, 11, 12, 12.5, 13, null], 3)
    expect(out[out.length - 1]).toBeNull()
  })
})

describe('computeIndicators（组装全套派生列）', () => {
  const rows = Array.from({ length: 20 }, (_, i) => {
    const close = 10 + i
    return {
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + i,
    }
  })

  test('缺省返回全量列，date 对齐，窗口不足列 null', () => {
    const out = computeIndicators(rows)
    expect(out).toHaveLength(20)
    expect(out[0]).toMatchObject({ date: '2024-01-01', ma5: null, macd_hist: expect.any(Number) as unknown })
    expect(out[4]!.ma5).toBeCloseTo((10 + 11 + 12 + 13 + 14) / 5)
    expect(out[0]!.momentum_5d).toBeNull()
  })

  test('needed 裁剪：仅 date + 请求列，未请求省略', () => {
    const out = computeIndicators(rows, ['rsi_14', 'ma10'])
    expect(Object.keys(out[19]!).sort()).toEqual(['date', 'ma10', 'rsi_14'].sort())
  })

  test('上升序列 RSI_14 高、MA5 到窗口后对齐均值（口径 sanity）', () => {
    const out = computeIndicators(rows)
    expect((out[19]!.rsi_14 as number)).toBeGreaterThan(50)
    expect(out[9]!.ma10).toBeCloseTo((10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19) / 10)
  })
})