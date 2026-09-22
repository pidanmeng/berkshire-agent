import { describe, expect, test } from 'bun:test'
import { Context } from '@berkshire/cordis'
import {
  AFTERNOON_CLOSE_MIN,
  AFTERNOON_OPEN_MIN,
  BEIJING_OFFSET_MS,
  MORNING_CLOSE_MIN,
  MORNING_OPEN_MIN,
  MarketTime,
  beijingMinutesOfDay,
  cnDateAddDays,
  cnDateYMD,
  fromCnIso,
  isInTradingSession,
  isWeekend,
  msForCnDateTime,
  type TradeDayProbe,
  type TradeDayProbeResult,
} from '../src/services/marketTime'

/** 构造一个带 mock 探针的 marketTime 服务（ctx 生命周期由调用方 dispose）。 */
function makeService(probes: TradeDayProbe[] = []) {
  const ctx = new Context()
  const svc = new MarketTime(ctx)
  const detach = probes.map((p) => svc.registerProbe(p))
  return { ctx, svc, detach: () => detach.forEach((d) => d()) }
}

/** 探针工厂：返回可直接判定的 mock（可计数、可抛错）。 */
function probeOf(
  id: string,
  decide: (iso: string) => TradeDayProbeResult | never,
): { probe: TradeDayProbe; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    probe: {
      id,
      async probe(iso: string) {
        calls.push(iso)
        return decide(iso)
      },
    },
  }
}

/**
 * `ctx.marketTime` —— 股票日历 + 市场时间服务（CN_TZ/交易日/交易时段/下一触发点）契约测试：
 * CN_TZ 纪元换算、周末直判、探针降档链 + TTL 缓存、半天市、收盘/下一触发点、自愈。
 */
describe('CN_TZ 纪元换算（纯工具）', () => {
  test('cnDateYMD：UTC 零点即北京 08:00，跨午夜正确归入当日', () => {
    // UTC 2026-01-05 16:00 = 北京 2026-01-06 00:00
    const beijingMidnight = Date.UTC(2026, 0, 5, 16, 0, 0)
    expect(cnDateYMD(beijingMidnight)).toBe('2026-01-06')
    expect(cnDateYMD(beijingMidnight - 1)).toBe('2026-01-05')
    // 北京当日中午 12:00
    expect(cnDateYMD(beijingMidnight + 12 * 3_600_000)).toBe('2026-01-06')
  })

  test('fromCnIso：北京日期 → 北京零点 epoch-ms（= UTC 前一日 16:00）', () => {
    expect(fromCnIso('2026-01-06')).toBe(Date.UTC(2026, 0, 5, 16, 0, 0))
    expect(fromCnIso('2026-01-06') - fromCnIso('2026-01-05')).toBe(86_400_000)
  })

  test('beijingMinutesOfDay / msForCnDateTime / cnDateAddDays 自洽', () => {
    const t = msForCnDateTime('2026-01-06', 9 * 60 + 30) // 北京 09:30
    expect(cnDateYMD(t)).toBe('2026-01-06')
    expect(beijingMinutesOfDay(t)).toBe(9 * 60 + 30)
    expect(msForCnDateTime('2026-01-06', beijingMinutesOfDay(t))).toBe(t)
    expect(cnDateAddDays('2026-01-06', 1)).toBe('2026-01-07')
    expect(cnDateAddDays('2026-01-06', -1)).toBe('2026-01-05')
    // 与 +8h 偏移一致（UTC 墙钟加偏移即北京墙钟）
    expect(beijingMinutesOfDay(Date.UTC(2026, 0, 5, 1, 30))).toBe(9 * 60 + 30)
    expect(BEIJING_OFFSET_MS).toBe(8 * 3_600_000)
  })
})

describe('交易时段判定（A 股连续竞价 + 半天市）', () => {
  test('正常时段：09:30–11:30 与 13:00–15:00 开市，其余闭市', () => {
    expect(isInTradingSession(MORNING_OPEN_MIN)).toBe(true)
    expect(isInTradingSession(MORNING_CLOSE_MIN - 1)).toBe(true)
    expect(isInTradingSession(MORNING_CLOSE_MIN)).toBe(false) // 11:30 整收盘
    expect(isInTradingSession(12 * 60 + 30)).toBe(false)
    expect(isInTradingSession(AFTERNOON_OPEN_MIN)).toBe(true)
    expect(isInTradingSession(AFTERNOON_CLOSE_MIN - 1)).toBe(true)
    expect(isInTradingSession(AFTERNOON_CLOSE_MIN)).toBe(false) // 15:00 整收盘
    expect(isInTradingSession(3 * 60)).toBe(false)
    expect(isInTradingSession(20 * 60)).toBe(false)
  })

  test('半天市：仅上午 09:30–11:30 交易，下午不交易（A 股半天市不延至 12:00）', () => {
    expect(isInTradingSession(11 * 60, true)).toBe(true)
    expect(isInTradingSession(11 * 60 + 29, true)).toBe(true)
    expect(isInTradingSession(MORNING_CLOSE_MIN, true)).toBe(false)
    expect(isInTradingSession(12 * 60 + 30, true)).toBe(false)
    expect(isInTradingSession(AFTERNOON_OPEN_MIN, true)).toBe(false)
    expect(isInTradingSession(8 * 60, true)).toBe(false)
  })

  test('isWeekend：周六/周日是周末，周一–周五不是', () => {
    // 2026-01-03 周六、2026-01-04 周日
    expect(isWeekend('2026-01-03')).toBe(true)
    expect(isWeekend('2026-01-04')).toBe(true)
    expect(isWeekend('2026-01-05')).toBe(false)
    expect(isWeekend('2026-01-09')).toBe(false)
  })
})

describe('交易日判定：周末直判 + 探针降档链 + TTL 缓存', () => {
  test('周末直判：不触发任何探针', async () => {
    const { svc, detach } = makeService([])
    try {
      const v = await svc.isTradingDay('2026-01-03')
      expect(v.trading).toBe(false)
      expect(v.source).toBe('weekend')
      expect(v.probedAt).toBeTypeOf('number')
    } finally {
      detach()
    }
  })

  test('工作日 + 探针成功 → provider 结论（source=provider，providerId 命中）', async () => {
    const { svc, detach } = makeService([
      probeOf('fuyao', () => ({ trading: true })).probe,
    ])
    try {
      const v = await svc.isTradingDay('2026-01-05')
      expect(v.trading).toBe(true)
      expect(v.source).toBe('provider')
      expect(v.providerId).toBe('fuyao')
    } finally {
      detach()
    }
  })

  test('探针判休市（节假日）→ 短 TTL 定期复探：缓存期内不重复探，过期后重探', async () => {
    const { svc, detach } = makeService([
      probeOf('fuyao', () => ({ trading: false, ttlMs: 0 })).probe, // ttl=0 → 立即过期
    ])
    try {
      const first = await svc.isTradingDay('2026-01-05')
      expect(first.trading).toBe(false)
      expect(first.source).toBe('provider')
      // ttl=0：每次重新探（模拟「休市结论定期复探」）
      expect((await svc.isTradingDay('2026-01-05')).probedAt).toBeGreaterThanOrEqual(first.probedAt)
    } finally {
      detach()
    }
  })

  test('TTL 缓存：确凿交易日长 TTL，缓存期内探针只被调一次', async () => {
    const p = probeOf('fuyao', () => ({ trading: true }))
    const { svc, detach } = makeService([p.probe])
    try {
      await svc.isTradingDay('2026-01-05')
      await svc.isTradingDay('2026-01-05')
      await svc.isTradingDay('2026-01-05')
      expect(p.calls).toEqual(['2026-01-05'])
      // 不同日期单独探
      await svc.isTradingDay('2026-01-06')
      expect(p.calls).toEqual(['2026-01-05', '2026-01-06'])
    } finally {
      detach()
    }
  })

  test('探针全部失败 → 周几近似兜底（source=weekday-guess），短 TTL 后自愈', async () => {
    const failing = probeOf('fuyao', () => {
      throw new Error('network down')
    }).probe
    const { svc, detach } = makeService([failing])
    try {
      const guess = await svc.isTradingDay('2026-01-05')
      expect(guess.trading).toBe(true) // 周一到周五近似交易日
      expect(guess.source).toBe('weekday-guess')
      // 自愈：清缓存后换用可用探针 → provider 结论
      const ok = probeOf('csv', () => ({ trading: false })).probe
      svc.registerProbe(ok)
      svc.clearCache()
      const healed = await svc.isTradingDay('2026-01-05')
      expect(healed.source).toBe('provider')
      expect(healed.providerId).toBe('csv')
      expect(healed.trading).toBe(false)
    } finally {
      detach()
    }
  })

  test('探针 A 抛错 → 降档探针 B 生效；周末不被探针打扰', async () => {
    const a = probeOf('a', () => {
      throw new Error('boom')
    }).probe
    const b = probeOf('b', () => ({ trading: false, ttlMs: 0 })).probe
    const { svc, detach } = makeService([a, b])
    try {
      const v = await svc.isTradingDay('2026-01-05')
      expect(v.source).toBe('provider')
      expect(v.providerId).toBe('b')
      const weekend = await svc.isTradingDay('2026-01-03')
      expect(weekend.source).toBe('weekend')
      expect(weekend.trading).toBe(false)
    } finally {
      detach()
    }
  })

  test('非法日期 fail-closed 抛错', async () => {
    const { svc, detach } = makeService([])
    try {
      await expect(svc.isTradingDay('2026/01/05')).rejects.toThrow(/yyyy-mm-dd/)
    } finally {
      detach()
    }
  })
})

describe('「是否交易时段 / 收盘 / 下一触发点」', () => {
  test('nowIsTradingSession：交易日交易时段内为 true，午休/盘后/周末为 false', async () => {
    const { svc, detach } = makeService([])
    try {
      // 2026-01-05（周一）北京 10:00 → 交易中
      const t10 = msForCnDateTime('2026-01-05', 10 * 60)
      expect(await svc.nowIsTradingSession(t10)).toBe(true)
      // 12:00 午休 → 非交易时段
      expect(await svc.nowIsTradingSession(msForCnDateTime('2026-01-05', 12 * 60))).toBe(false)
      // 周六 10:00 → 非交易日
      expect(await svc.nowIsTradingSession(msForCnDateTime('2026-01-03', 10 * 60))).toBe(false)
    } finally {
      detach()
    }
  })

  test('isMarketClosed：非交易日/非交易钟点均视为盘后', async () => {
    const { svc, detach } = makeService([])
    try {
      expect(await svc.isMarketClosed(msForCnDateTime('2026-01-03', 10 * 60))).toBe(true) // 周六
      expect(await svc.isMarketClosed(msForCnDateTime('2026-01-05', 12 * 60))).toBe(true) // 午休
      expect(await svc.isMarketClosed(msForCnDateTime('2026-01-05', 10 * 60))).toBe(false) // 盘中
    } finally {
      detach()
    }
  })

  test('nextClose：盘中 → 当天午盘/收盘；盘后 → 下一交易日收盘', async () => {
    const { svc, detach } = makeService([])
    try {
      // 周一 10:00 → 当天 11:30
      expect(await svc.nextClose(msForCnDateTime('2026-01-05', 10 * 60))).toBe(
        msForCnDateTime('2026-01-05', MORNING_CLOSE_MIN),
      )
      // 周一 14:00 → 当天 15:00
      expect(await svc.nextClose(msForCnDateTime('2026-01-05', 14 * 60))).toBe(
        msForCnDateTime('2026-01-05', AFTERNOON_CLOSE_MIN),
      )
      // 周五 16:00 → 下周一收盘（跳过周末）
      expect(await svc.nextClose(msForCnDateTime('2026-01-09', 16 * 60))).toBe(
        msForCnDateTime('2026-01-12', AFTERNOON_CLOSE_MIN),
      )
      // 周六 → 下周一收盘
      expect(await svc.nextClose(msForCnDateTime('2026-01-03', 10 * 60))).toBe(
        msForCnDateTime('2026-01-05', AFTERNOON_CLOSE_MIN),
      )
      // 午休（12:00，非交易时段但仍是当天）→ 当天 15:00，不得排到次日
      expect(await svc.nextClose(msForCnDateTime('2026-01-05', 12 * 60))).toBe(
        msForCnDateTime('2026-01-05', AFTERNOON_CLOSE_MIN),
      )
      // 午盘收盘前一刻（11:29）→ 当天 11:30
      expect(await svc.nextClose(msForCnDateTime('2026-01-05', MORNING_CLOSE_MIN - 1))).toBe(
        msForCnDateTime('2026-01-05', MORNING_CLOSE_MIN),
      )
    } finally {
      detach()
    }
  })

  test('nextOpen：盘前 → 当天 09:30；盘中/午休 → 下午 13:00；盘后 → 下一交易日 09:30', async () => {
    const { svc, detach } = makeService([])
    try {
      expect(await svc.nextOpen(msForCnDateTime('2026-01-05', 8 * 60))).toBe(
        msForCnDateTime('2026-01-05', MORNING_OPEN_MIN),
      )
      expect(await svc.nextOpen(msForCnDateTime('2026-01-05', 10 * 60))).toBe(
        msForCnDateTime('2026-01-05', AFTERNOON_OPEN_MIN),
      )
      expect(await svc.nextOpen(msForCnDateTime('2026-01-05', 12 * 60))).toBe(
        msForCnDateTime('2026-01-05', AFTERNOON_OPEN_MIN),
      )
      // 周五 16:00 → 下周一 09:30
      expect(await svc.nextOpen(msForCnDateTime('2026-01-09', 16 * 60))).toBe(
        msForCnDateTime('2026-01-12', MORNING_OPEN_MIN),
      )
    } finally {
      detach()
    }
  })

  test('探针把 1-5 判为休市 → nextClose 跳到下一个 provider 判定的交易日', async () => {
    // 2026-01-05（周一）判休市（元旦补休），1-06（周二）为交易日
    const { svc, detach } = makeService([
      probeOf('fuyao', (iso) => {
        if (iso === '2026-01-05') return { trading: false, ttlMs: 0 }
        return { trading: true }
      }).probe,
    ])
    try {
      expect(await svc.nextClose(msForCnDateTime('2026-01-05', 10 * 60))).toBe(
        msForCnDateTime('2026-01-06', AFTERNOON_CLOSE_MIN),
      )
    } finally {
      detach()
    }
  })
})
