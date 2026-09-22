/**
 * `ctx.marketTime` —— 股票日历 + 市场时间服务（交易日 / 北京时区 `CN_TZ`，S3 定时任务的地基）。
 *
 * 提供：`CN_TZ`（Asia/Shanghai）纪元换算、`cnNow()`/`cnToday()`、**交易日判定**（周末直判 +
 * 节假日探针 + TTL 缓存，对齐 TSP `trading_day.py` 的降档语义）、**「是否交易时段 / 收盘时刻 /
 * 下一触发点」**判定（`nowIsTradingSession`/`isMarketClosed`/`nextClose`/`nextOpen`）。
 *
 * 能力缝三角色（docs/capability-seams.md §1）：
 * - **Definition**：本类（`super(ctx,'marketTime')`）+ `TradeDayProbe` 契约；
 * - **Provider**：`registerProbe()` 挂入的探针（v1：`@berkshire/plugin-datasource-fuyao` 注册的
 *   网络探针走 `tradingDays()`）；**内置降档兜底**（周末直判 + 周几近似）作为不依赖任何 provider
 *   的末端结论；
 * - **Consumer**：S3 定时任务（启动同步 + 收盘同步）、数据消费方、未来 `ctx.market`。
 *
 * **探针降档链**（所有结论**可自愈**，纯内存读、不落盘、不进主数据管道）：
 *   1. **周末直判**：周六/周日直接判非交易日，不触发任何探针（确定性、零网络）；
 *   2. **注册探针**：逐个尝试，第一个成功者胜；探针抛错/无法判定 → 降档到下一个；
 *   3. **周几近似兜底**：全部探针失败时，按“周一~周五即交易日”近似（holiday 无法识别），短 TTL；
 *
 * TTL 缓存（避免反复重探）：`Map<date,{verdict,expiresAt}>`。**休市结论短 TTL 定期复探**
 * （provider 判为节假日 → ~10min 再探，日历可能后续更新）、**未知近似结论短 TTL 防止反复重探**
 * （周几近似 → ~10min 后重试网络）、确凿交易日长 TTL（~6h）。
 *
 * 数据契约红线：A 股统一北京时间（`CN_TZ`），分钟 naive 墙钟；`cnDateYMD`/`beijingMinutesOfDay`
 * 全部由 epoch-ms 直接推导北京墙钟，不依赖宿主时区，禁止未经 +8h 的 UTC 入库/下发。
 *
 * 诚实边界：`calendar` 数据集（`trade_date/open/close/status`）的**持久化**归 `ctx.datasets` +
 * sidecar 同步编排（单写者）；本服务只做纯内存探测器，不读、不写 `calendar` 落库表，也不读
 * DuckDB。
 */
import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'

// ctx.marketTime —— 服务类型增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    marketTime: MarketTime
  }
}

/** 统一北京时区（A 股行情/交易日全局以 `CN_TZ` 为墙钟基准，docs/data-model.md §6）。 */
export const CN_TZ = 'Asia/Shanghai'

/** 北京相对 UTC 的偏移（毫秒）。 */
export const BEIJING_OFFSET_MS = 8 * 3_600_000

/* ─── 交易时段（A 股连续竞价，北京墙钟分钟；半天市见 `_HALF_DAY`）─── */
/** 上午开盘（09:30）。 */
export const MORNING_OPEN_MIN = 9 * 60 + 30
/** 上午收盘（11:30）。 */
export const MORNING_CLOSE_MIN = 11 * 60 + 30
/** 下午开盘（13:00）。 */
export const AFTERNOON_OPEN_MIN = 13 * 60
/** 下午收盘（15:00）。 */
export const AFTERNOON_CLOSE_MIN = 15 * 60

/** 探测判定来源（探针 vs 内置降档）。 */
export type TradeDaySource = 'provider' | 'weekend' | 'weekday-guess'

/** 一次交易日判定的结论。 */
export interface TradeDayVerdict {
  /** 该日是否交易日。 */
  trading: boolean
  /** 结论来源：`provider`（网络探针）/`weekend`（周末直判）/`weekday-guess`（周几近似兜底）。 */
  source: TradeDaySource
  /** 命中探针的 provider id（`source: 'provider'` 时有值）。 */
  providerId?: string
  /** 判定生成的时间戳（ms）。 */
  probedAt: number
}

/** provider 探针返回（可附加建议 TTL；未给则用默认）。 */
export interface TradeDayProbeResult {
  /** 该日是否交易日；**无法判定时抛错**（触发降档），不返回模棱两可值。 */
  trading: boolean
  /** 建议的缓存有效期（ms）；缺省按 trading 取默认（true→6h 长 TTL，false→10min 短 TTL）。 */
  ttlMs?: number
}

/**
 * `ctx.marketTime` 能力缝的 **Provider 契约**（三角色之「提供方」）。
 *
 * 只判定**非周末**（周末由服务内建直判，不打扰探针）。实现对**无法判定**（如请求日期不在
 * 其数据窗口内）应**抛错**，让服务降档到下一探针/内置兜底；对已判定的休市结论（节假日）应返回
 * 短 TTL，让服务定期复探。
 */
export interface TradeDayProbe {
  /** provider 稳定 id（注册/注销与去重）。 */
  id: string
  /** 判定某 `yyyy-mm-dd` 是否交易日；无法判定抛错。 */
  probe(iso: string): Promise<TradeDayProbeResult>
}

/* ─── 纯时间工具（无 I/O、无状态；epoch-ms ⇄ 北京墙钟）─── */

/** epoch-ms → 北京日期（`yyyy-mm-dd`），直接按 `CN_TZ` 推导、不依赖宿主时区。 */
export function cnDateYMD(ms: number): string {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
}

/** 北京日期（`yyyy-mm-dd`）→ 北京当日零点对应的 epoch-ms（= UTC 前一日 16:00）。 */
export function fromCnIso(iso: string): number {
  return Date.parse(iso) - BEIJING_OFFSET_MS
}

/** 北京日期加 N 天（返回 `yyyy-mm-dd`）。 */
export function cnDateAddDays(iso: string, days: number): string {
  return cnDateYMD(fromCnIso(iso) + days * 86_400_000)
}

/** epoch-ms → 北京当日 00:00 起经过的分钟数（北京 naive 墙钟 0..1439）。 */
export function beijingMinutesOfDay(ms: number): number {
  const d = new Date(ms + BEIJING_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/** epoch-ms → 北京日期 + 分钟 → epoch-ms（NN:NN 北京墙钟）。 */
export function msForCnDateTime(iso: string, minutesInDay: number): number {
  return fromCnIso(iso) + minutesInDay * 60_000
}

/** 某分钟是否落在 A 股连续竞价时段内。**半天市**（如节假日临收盘日）为仅上午 09:30–11:30，
 * 下午不交易（A 股半天市不延至 12:00）。 */
export function isInTradingSession(
  minutesInDay: number,
  halfDay = false,
): boolean {
  if (halfDay) {
    return minutesInDay >= MORNING_OPEN_MIN && minutesInDay < MORNING_CLOSE_MIN
  }
  return (
    (minutesInDay >= MORNING_OPEN_MIN && minutesInDay < MORNING_CLOSE_MIN) ||
    (minutesInDay >= AFTERNOON_OPEN_MIN && minutesInDay < AFTERNOON_CLOSE_MIN)
  )
}

/** 一周数（0=周日）→ 是否周末。按**日历 date 的 UTC 墙钟**判定（不依赖北京零点换算）；非法日期 → false。 */
export function isWeekend(iso: string): boolean {
  return [0, 6].includes(new Date(iso).getUTCDay())
}

/** 默认 TTL：确凿交易日长缓存，休市/近似结论短缓存（定期复探 / 防止反复重探）。 */
const TTL_TRADING_MS = 6 * 3_600_000
const TTL_SHORT_MS = 10 * 60_000

/**
 * `ctx.marketTime` —— 股票日历 + 市场时间服务的 **Service Definition**（core 脊）。
 */
export class MarketTime extends Service {
  /** 已注册探针（按注册顺序尝试）。 */
  private probes: TradeDayProbe[] = []
  /** 判定 TTL 缓存（内存读，不落盘）：date → { verdict, expiresAt }。 */
  private cache = new Map<string, { verdict: TradeDayVerdict; expiresAt: number }>()

  constructor(ctx: Context) {
    super(ctx, 'marketTime')
  }

  /** 现在（epoch-ms；TZ 无关的瞬间）。 */
  cnNow(): number {
    return Date.now()
  }

  /** 今天（北京 `yyyy-mm-dd`）。 */
  cnToday(): string {
    return cnDateYMD(Date.now())
  }

  /** `yyyy-mm-dd` 是否周末（确定性直判，不碰探针）。 */
  weekendOf(iso: string): boolean {
    return isWeekend(iso)
  }

  /** 注册一个探针；返回可撤销 disposer。重复 id **响亮失败**。 */
  registerProbe(probe: TradeDayProbe): () => void {
    return this.ctx.effect(() => {
      if (this.probes.some((p) => p.id === probe.id)) {
        throw new Error(`marketTime probe "${probe.id}" already registered`)
      }
      this.probes.push(probe)
      return () => {
        this.probes = this.probes.filter((p) => p.id !== probe.id)
      }
    })
  }

  /**
   * 判定某日是否交易日。**探针降档链**：周末直判 → 注册探针（含 TTL 缓存）→ 周几近似兜底。
   * 纯内存读，任何结论可自愈（短 TTL 定期复探/重试网络）。
   */
  async isTradingDay(iso: string): Promise<TradeDayVerdict> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error(`[marketTime] 非法日期 '${iso}'（需 yyyy-mm-dd，fail-closed）`)
    }
    // 1) 周末直判：确定性、零网络，不缓存（每周固定）。
    if (isWeekend(iso)) {
      return { trading: false, source: 'weekend', probedAt: Date.now() }
    }
    // 2) 命中有效 TTL 缓存 → 直接返回（避免反复重探）。
    const hit = this.cache.get(iso)
    if (hit && hit.expiresAt > Date.now()) return hit.verdict

    // 3) 逐个尝试注册探针：成功即缓存并返回；抛错 → 降档到下一个。
    for (const probe of this.probes) {
      try {
        const res = await probe.probe(iso)
        const ttlMs = res.ttlMs ?? (res.trading ? TTL_TRADING_MS : TTL_SHORT_MS)
        const verdict: TradeDayVerdict = {
          trading: res.trading,
          source: 'provider',
          providerId: probe.id,
          probedAt: Date.now(),
        }
        this.cacheDate(iso, verdict, ttlMs)
        return verdict
      } catch {
        // 探针无法判定/网络失败 → 降档（不在此吞错误，静默进入下一候选）。
      }
    }

    // 4) 周几近似兜底：全部探针不可用时，按“周一到周五即交易日”近似；短 TTL 防止反复重探。
    const guess: TradeDayVerdict = { trading: true, source: 'weekday-guess', probedAt: Date.now() }
    this.cacheDate(iso, guess, TTL_SHORT_MS)
    return guess
  }

  /** 现在（或给定 epoch-ms）是否落在某交易日的交易时段内。 */
  async nowIsTradingSession(now: number = Date.now()): Promise<boolean> {
    const verdict = await this.isTradingDay(cnDateYMD(now))
    if (!verdict.trading) return false
    return isInTradingSession(beijingMinutesOfDay(now))
  }

  /** 「现在是否收盘」＝ 不在交易时段内（非交易日或非交易钟点均视为盘后，供 S3 判断）。 */
  async isMarketClosed(now: number = Date.now()): Promise<boolean> {
    return !(await this.nowIsTradingSession(now))
  }

  /** 下一个收盘时刻（epoch-ms）：当天交易时段后的下一个收盘钟点，否则下一交易日的收盘。 */
  async nextClose(now: number = Date.now()): Promise<number> {
    const iso = cnDateYMD(now)
    const minutes = beijingMinutesOfDay(now)
    const verdict = await this.isTradingDay(iso)
    if (verdict.trading) {
      // 交易日：早于午盘收盘 → 下一收盘钟点 11:30；早于 15:00（含午休 11:30–13:00、午后盘中）
      // → 当天 15:00。修复：午休 `isInTradingSession` 为 false，但仍是当天，应回当天 15:00，
      // 而非落入「下一交易日」分支（否则依赖 nextClose 的调度会漏掉当天收盘同步）。
      if (minutes < MORNING_CLOSE_MIN) return msForCnDateTime(iso, MORNING_CLOSE_MIN)
      if (minutes < AFTERNOON_CLOSE_MIN) return msForCnDateTime(iso, AFTERNOON_CLOSE_MIN)
    }
    // 盘后/非交易日 → 下一交易日的收盘（15:00；半天市按日历 status，此处统一用 15:00 保守）。
    return msForCnDateTime(await this.nextTradingDayAfter(iso), AFTERNOON_CLOSE_MIN)
  }

  /** 下一个开盘时刻（epoch-ms）：当天给定时刻之后的下一个开盘钟点，否则下一交易日的开盘。 */
  async nextOpen(now: number = Date.now()): Promise<number> {
    const iso = cnDateYMD(now)
    const minutes = beijingMinutesOfDay(now)
    const verdict = await this.isTradingDay(iso)
    if (verdict.trading) {
      if (minutes < MORNING_OPEN_MIN) return msForCnDateTime(iso, MORNING_OPEN_MIN)
      if (minutes < AFTERNOON_OPEN_MIN) return msForCnDateTime(iso, AFTERNOON_OPEN_MIN)
    }
    return msForCnDateTime(await this.nextTradingDayAfter(iso), MORNING_OPEN_MIN)
  }

  /** 严格晚于 `iso` 的下一个交易日（`yyyy-mm-dd`）；30 天内找不到 → fail-closed 抛错。 */
  async nextTradingDayAfter(iso: string): Promise<string> {
    for (let i = 1; i <= 30; i++) {
      const candidate = cnDateAddDays(iso, i)
      if ((await this.isTradingDay(candidate)).trading) return candidate
    }
    throw new Error(`[marketTime] 30 天内未找到交易日（fail-closed）`)
  }

  /** 清空判定缓存（测试/手动刷新用；不影响探针）。 */
  clearCache(): void {
    this.cache.clear()
  }

  private cacheDate(iso: string, verdict: TradeDayVerdict, ttlMs: number): void {
    this.cache.set(iso, { verdict, expiresAt: Date.now() + Math.max(0, ttlMs) })
  }
}