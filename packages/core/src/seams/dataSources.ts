import { Service } from '@berkshire/cordis'
import type { Context } from '@berkshire/cordis'
import type { DatasetId, DataSourceId, StorageNamespaceId } from '../brand'

// ctx.dataSources —— 能力缝三角色之「定义」的 Service Definition 增强 co-locate
declare module '@berkshire/cordis' {
  interface Context {
    dataSources: DataSources
  }
}

/** 一个 dataset 在某 provider 上的可用性（含不可用原因，fail-closed 展示面）。 */
export interface DatasetAvailability {
  available: boolean
  /** 不可用时的原因（缺 key/缺文件/未落地），页面据此展示。 */
  reason?: string
}

/**
 * `ctx.dataSources` 能力缝的 **Provider 契约**（三角色之「提供方」）。
 *
 * 每个 provider 声明自己能服务的**数据集子集**（按功能分类：realtime/daily/adj_factor/
 * financial/minute 各自独立路由），并实现 `fetch(dataset, args)` 取数。`probe` 用于
 * 「先探」校验凭据（如扶摇 API Key），返回 `{ ok, reason }`，**不落盘**。
 */
export interface DataSourceProvider {
  /** provider 稳定 id（跨边界品牌化）。 */
  id: DataSourceId
  /** 面向用户的标签（如 "fuyao"）。 */
  label: string
  /** 该 provider 能服务的数据集及其静态可用性声明。 */
  datasets: Partial<Record<DatasetId, DatasetAvailability>>
  /**
   * 动态可用性求值（可选）：返回某 dataset 的**当前**可用性（如扶摇按 API Key 是否已配置、
   * CSV 按文件是否落盘）。缺省回退 `datasets[dataset]`。每次 `candidates`/`resolve`/`list`
   * 都重新求值——用户配置 Key / 放好 CSV 后路由即时生效。
   */
  getAvailability?(dataset: DatasetId): Promise<DatasetAvailability>
  /** `probe` 用于「先探」校验凭据（如扶摇 API Key），返回 `{ ok, reason }`，**不落盘**（对齐
   * AGENTS.md 凭据红线：provider 运行期只从环境变量取值，`ctx.credentials` 仍目标态）。 */
  probe?(args: { apiKey?: string }): Promise<{ ok: boolean; reason?: string }>
  /** 拉取某数据集（已按偏好路由到本 provider）。返回归一化行/结构化数据；失败 fail-closed 抛错。 */
  fetch(dataset: DatasetId, args: Record<string, unknown>): Promise<unknown>
}

/** `data-sources/list` 快照里的一个 provider 项（含逐 dataset 可用性）。 */
export interface DataSourceSnapshot {
  id: DataSourceId
  label: string
  datasets: Record<string, DatasetAvailability>
}

/** 一个数据集的路由结果（页面「数据集路由」区消费）。 */
export interface DatasetRouteInfo {
  dataset: DatasetId
  label: string
  /** 当前实际路由到的 provider（`resolve` 结果；无候选时为 null）。 */
  provider: DataSourceId | null
  /** 能服务该数据集的候选源（可用性 true 的已注册 provider）。 */
  candidates: DataSourceId[]
  /** 全部候选（含不可用者 + 原因），页面据此展示可切换面。 */
  all: Array<{ provider: DataSourceId; label: string; available: boolean; reason?: string }>
}

/**
 * `ctx.dataSources` —— 数据源能力缝的 **Service Definition**（三角色之「定义」，
 * docs/capability-seams.md §3：行情/财务数据提供方统一接口）。
 *
 * - **Definition**：本类（`super(ctx, 'dataSources')`）+ `DataSourceProvider` 契约；
 * - **Provider**：注册方（v1：`@berkshire/plugin-datasource-fuyao`、`@berkshire/plugin-datasource-csv`），
 *   经 `register()` 挂入，返回可撤销 disposer；
 * - **Consumer**：同步编排（sidecar `sync.ts`）、数据管理页、未来的 `ctx.market`/backtest。
 *
 * **按功能分类路由**：每个数据集独立路由——`resolve(dataset)` 读偏好（storage ns
 * `data-sources` / key `preferences`，`Record<DatasetId, DataSourceId>`）→ 从候选源里
 * 选，无偏好回退声明 defaultSource、再无回退首个候选；**无可用候选时响亮失败**
 * （fail-closed，绝不静默返回「看似合理」的空数据）。偏好写入经 `setPreference`
 * （校验候选后落 storage，`storage/changed` 广播供页面刷新）。
 */
export class DataSources extends Service {
  private providers = new Map<DataSourceId, DataSourceProvider>()

  constructor(ctx: Context) {
    super(ctx, 'dataSources')
  }

  /** 注册一个 provider；返回可撤销 disposer。重复 id **响亮失败**。 */
  register(provider: DataSourceProvider): () => void {
    return this.ctx.effect(() => {
      if (this.providers.has(provider.id)) {
        throw new Error(`dataSources provider "${String(provider.id)}" already registered`)
      }
      this.providers.set(provider.id, provider)
      return () => {
        this.providers.delete(provider.id)
      }
    })
  }

  /** 求值某 provider 对某 dataset 的**当前**可用性（动态回调优先，静态声明兜底）。 */
  async availabilityOf(p: DataSourceProvider, dataset: DatasetId): Promise<DatasetAvailability> {
    if (p.getAvailability) {
      try {
        return await p.getAvailability(dataset)
      } catch (err) {
        return {
          available: false,
          reason: `可用性求值失败: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    }
    return p.datasets[dataset] ?? { available: false }
  }

  /** 当前全部 provider 的只读快照（含逐 dataset **当前**可用性）。 */
  async list(): Promise<DataSourceSnapshot[]> {
    const out: DataSourceSnapshot[] = []
    for (const p of this.providers.values()) {
      const datasets: Record<string, DatasetAvailability> = {}
      for (const d of Object.keys(p.datasets) as DatasetId[]) {
        datasets[String(d)] = await this.availabilityOf(p, d)
      }
      out.push({ id: p.id, label: p.label, datasets })
    }
    return out
  }

  /** 按 id 取 provider；未注册返回 undefined。 */
  get(id: DataSourceId): DataSourceProvider | undefined {
    return this.providers.get(id)
  }

  /** 能服务某数据集（**当前**可用性 true）的候选 provider id 列表。 */
  async candidates(dataset: DatasetId): Promise<DataSourceId[]> {
    const out: DataSourceId[] = []
    for (const p of this.providers.values()) {
      if ((await this.availabilityOf(p, dataset)).available) out.push(p.id)
    }
    return out
  }

  /** 某数据集的完整路由信息（候选/不可用源/当前解析结果），数据管理页消费。 */
  async routeInfo(dataset: DatasetId, label: string): Promise<DatasetRouteInfo> {
    const all: DatasetRouteInfo['all'] = []
    for (const p of this.providers.values()) {
      const a = await this.availabilityOf(p, dataset)
      all.push({ provider: p.id, label: p.label, available: a.available, reason: a.reason })
    }
    const candidates = all.filter((c) => c.available).map((c) => c.provider)
    // 当前实际路由（偏好 → defaultSource → 首候选）；无候选时 resolve fail-closed → null。
    let current: DataSourceId | null = null
    if (candidates.length > 0) {
      try {
        current = (await this.resolve(dataset)).id
      } catch {
        current = candidates[0] ?? null
      }
    }
    return { dataset, label, provider: current, candidates, all }
  }

  /** 实探一个 provider 的凭据（**只探不存**：本方法不落盘，调用方不应持久化明文 Key）。 */
  async probe(providerId: DataSourceId, apiKey?: string): Promise<{ ok: boolean; reason?: string }> {
    const p = this.providers.get(providerId)
    if (!p) return { ok: false, reason: `未注册的数据源 provider '${String(providerId)}'` }
    if (!p.probe) return { ok: false, reason: '该 provider 不支持凭据探测' }
    try {
      return await p.probe({ apiKey })
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) }
    }
  }

  /** 按偏好路由某数据集到具体 provider（fail-closed：无候选抛错）。 */
  async resolve(dataset: DatasetId): Promise<DataSourceProvider> {
    const candidates = await this.candidates(dataset)
    if (candidates.length === 0) {
      throw new Error(
        `dataSources: 数据集 '${String(dataset)}' 无可用候选源（fail-closed）`,
      )
    }
    const preferred = await this.readPreference()
    if (preferred) {
      const chosen = preferred[String(dataset)]
      const chosenProvider = chosen ? this.providers.get(chosen) : undefined
      if (chosenProvider && (await this.availabilityOf(chosenProvider, dataset)).available) {
        return chosenProvider
      }
    }
    // 无偏好 / 偏好失效 → 声明 defaultSource 优先，其次首个候选。
    const decl = this.ctx.datasets.get(dataset)
    const defaultProvider = decl?.defaultSource ? this.providers.get(decl.defaultSource.provider) : undefined
    if (defaultProvider && (await this.availabilityOf(defaultProvider, dataset)).available) {
      return defaultProvider
    }
    return this.providers.get(candidates[0]!)!
  }

  /** 按偏好路由 + 取数（Consumer 主入口）。 */
  async fetch(dataset: DatasetId, args: Record<string, unknown> = {}): Promise<unknown> {
    const provider = await this.resolve(dataset)
    return provider.fetch(dataset, args)
  }

  /** 读当前偏好（storage ns `data-sources` / key `preferences`）；storage 不可用视为无偏好。 */
  async readPreference(): Promise<Record<string, DataSourceId> | null> {
    try {
      const raw = await this.ctx.storage.get<Record<string, DataSourceId>>(PREF_NS, PREF_KEY)
      return raw ?? null
    } catch (err) {
      this.ctx.log.append('dataSources/preference-error', {
        message: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * 设置某数据集的路由偏好（校验目标 provider 确为该数据集候选，否则响亮失败）；
   * 成功后写 storage（广播 `storage/changed` 供页面刷新）。返回新偏好表。
   */
  async setPreference(dataset: DatasetId, providerId: DataSourceId): Promise<Record<string, DataSourceId>> {
    const candidates = await this.candidates(dataset)
    if (!candidates.includes(providerId)) {
      throw new Error(
        `dataSources: provider '${String(providerId)}' 不能服务数据集 '${String(dataset)}'（fail-closed）`,
      )
    }
    const prefs = (await this.readPreference()) ?? {}
    prefs[String(dataset)] = providerId
    await this.ctx.storage.set(PREF_NS, PREF_KEY, prefs)
    return prefs
  }
}

/** 偏好持久化命名空间/键（storage ns 校验见 sidecar storage-provider：`[A-Za-z0-9._-]+`）。 */
const PREF_NS = 'data-sources' as StorageNamespaceId
const PREF_KEY = 'preferences'
