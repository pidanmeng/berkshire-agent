# 插件开发指南

> Berkshire Agent（BK）的**一切部件都是插件**。本文教你把新行为落成可热装卸的 Cordis 插件。读完先看 [capability-seams.md](capability-seams.md)（服务都是 `ctx.*`）与 [secondary-development.md](secondary-development.md)（约束红线），再用本文的分步教程。

## 0. 插件骨架（三形态）

**函数插件**（最常见）：

```ts
import { z } from 'zod'
import type { Context } from '@berkshire/cordis'

export const name = 'my-fuyao-mirror'
export const inject = ['dataSources', 'database']
export const Config: z.ZodType<MyConfig> = z.object({
  apiKeyEnv: z.string().default('FUYAO_API_KEY'),
  pollSeconds: z.number().min(5).default(30),
})
export function apply(ctx: Context, config: MyConfig) {
  // 一切注册都是 effect；必须返回 disposer
  return () => { /* 逆序撤销：移除监听的清理，插拔 provider 回滚 ... */ }
}
```

**类 Service 插件**（想暴露 `ctx.<key>` 服务）：

```ts
import { Service, type Context } from '@berkshire/cordis'
export class MySeam extends Service {
  constructor(ctx: Context) { super(ctx, 'mySeam') }
  async doThing(x: string): Promise<number> { ... }
  // 注册 provider 时返回可撤销 disposer：this.ctx.effect(() => handler)
}
```

**对象插件**：`export default { name, inject, Config, apply }`（适合配置文件/模块登记）。

**三条铁律**：① `inject` 声明依赖，由运行时按需满足（响应式，服务缺失时停在 `PENDING`）；② 每个注册走 `ctx.effect()` 并返回 disposer；③ `Config` 用 standard-schema（zod），无效配置在加载时响亮失败。

---

## 1. 加一个数据源

目标：让 `fuyao`（同花顺 REST）成为一个可通过配置装载的数据源。Data Source Provider 实现 `ctx.dataSources` seam 的接口，并声明自己提供哪些 `datasets`。

1. 建包 `packages/datasource/datasource-fuyao/`，写 provider：

```ts
import { Inject } from '@berkshire/cordis'
export const inject = ['database']          // 需要落库时注入
export const Config = z.object({ apiKeyEnv: z.string().default('FUYAO_API_KEY'), ... })

export function apply(ctx: Context, config: Config) {
  const provider: DataSourceProvider = {
    name: 'fuyao',
    capabilities: { daily: true, adj_factor: true, realtime: true, financial: true, minute: true },
    async getDaily(symbols, range, assetType) { ...normalize to DAILY_COLUMNS... },
    async getAdjFactors(...) { ... },
    async getMinute(...) { ... },
    async getRealtime(...) { ... },
    // assetType ∈ 'stock' | 'index' | 'etf'
  }
  // 注册进 seam；返回的 disposer 会在卸载时把 provider 从 seam 移除
  return ctx.dataSources.register(provider)
}
```

2. 在 bundle 的 `cordis.patch.yml` 里装载它（可选 api key）。详见 [config.md](config.md)。

3. `check`/可用性：注册 provider 前先探测（如可用才 `register`），或经 `ctx.capabilities` 把未就绪源标记为 `pending`。缺能力时 fail-closed。

> 归一化 schema 关键（继承 TSP [schemas.py](reference/tick-stock-panel-contracts.md#2-data-provider-contract)）：`DAILY_COLUMNS`、`ADJ_FACTOR_COLUMNS`、`INSTRUMENT_COLUMNS`、`MINUTE_COLUMNS`。**输出归一化**使存储/指标/回测对数据源无感知。

---

## 2. 加一个指标

目标：注册一个可被选股/图表调用的新指标 `vwap_20`。指标是**纯函数**：输入窄表 + 依赖闭包，输出派生列；**只存基点，指标现算**（继承 TSP [pipeline.py](reference/tick-stock-panel-contracts.md#4-indicator-pipeline)）。

```ts
export const inject = ['indicators']
export function apply(ctx: Context) {
  // 声明依赖：cnt(收盘)/vol(量)/依赖的指标；compute 为纯函数
  return ctx.indicators.register({
    id: 'vwap_20',
    label: '20日均量价',
    needed: (need) => need.add('close').add('volume').add('ma20'),
    compute: (df, ctxFn) => df.withColumn('vwap_20', col('amount').cast('double') / col('volume')),
    persist: false,            // 派生列不落盘，现算
  })
}
```

- 真正的实现用 Rust/JS 计算内核均可，只要以规范化 DataFrame/表形状进出。
- `needed` 依赖闭包（`_INDICATOR_DEPS`）保证只算真正用到的列（继承 TSP `needed: set[str]` 裁剪）。

---

## 3. 加一个分析菜单页

目标：加一个「资金流向」分析页，有后端逻辑 + 前端页面。

1. **后端逻辑**：注册 `ctx.analysis` 的菜单项 + 数据计算。菜单由 `ctx.slots` 的 `analysis.menu` 声明，前端动态生成路由（继承 TSP [ext-pages](reference/tick-stock-panel-contracts.md#5-backend-extension-mechanism) 的动态分析菜单）。

```ts
export const inject = ['analysis', 'slots', 'database']
export function apply(ctx: Context) {
  ctx.slots.register('analysis.menu', {
    id: 'money-flow',
    order: 30,
    title: '资金流向',
    route: { path: '/analysis/money-flow', staticOnly: true },
  })
  return ctx.analysis.registerHandler('money-flow', async (p: { symbol: SymbolId; range?: string }) => {
    const rows = await ctx.database.query(
      'SELECT * FROM money_flow WHERE symbol = ? AND date >= ?',
      [p.symbol, p.range ?? '30d'],
    )
    return rows
  })
}
```

2. **前端页面**：若需要富 UI，走 client 插件图（见下节）；若数据可表格化，直接在 slot 组件里读 `ctx.database`（经 rspc）渲染。

---

## 4. 加一个 UI slot

目标：在个股面板底部增加一个「龙虎榜」区块。

1. **sidecar 侧**：为 `ctx.clientModules` 注册一个前端 bundle + 声明占用的 slot：

```ts
export const inject = ['clientModules', 'slots']
export function apply(ctx: Context) {
  ctx.slots.register('stock-preview.footer', {
    id: 'lhb-strip', order: 20, context: { view: 'daily' },
  })
  return ctx.clientModules.register({
    id: 'lhb-strip',
    slot: 'stock-preview.footer',
    bundle: 'client/lhb-strip.js',      // 经 bk:// 协议提供给 webview
    hmr: import.meta.env.DEV,
  })
}
```

2. **webview 侧**：`ExtensionSlot` 把每个注册包在 `ExtensionBoundary`（继承 TSP [ExtensionBoundary](reference/tick-stock-panel-contracts.md#6-frontend-extension-slots)）。组件从 slot 上下文取 symbol 等 props：

```tsx
export const LhbStrip = ({ context }: SlotProps<'stock-preview.footer'>) => {
  const data = useQuery(['lhb', context.symbol], () => api.rpc.lhb.bySymbol(context.symbol))
  return <section className="mt-2">…龙虎榜…</section>
}
```

> 铁律：坏插件绝不能拖垮宿主页面——所有 slot 渲染都在 `ExtensionBoundary` 内，失败降级为 null/横幅 + 控制台日志。

---

## 5. 加一个 AI 适配器

目标：接入一个 OpenAI 兼容接口（DeepSeek/通义/Ollama）作为 `ctx.ai` 的 provider。

```ts
export const inject = ['ai', 'credentials']
export const Config = z.object({
  baseUrl: z.string().url().default('https://api.openai.com/v1'),
  model: z.string().default('gpt-4o'),
  apiKeyEnv: z.string().default('OPENAI_API_KEY'),
})
export function apply(ctx: Context, config: Config) {
  const adapter: LLMAdapter = {
    id: 'openai-compat',
    supportsImage: true,
    async stream(messages, opts) {
      // 返回 AsyncIterable<StreamChunk>；实现 ctx.ai 的 stream 契约
    },
  }
  // 注册返回 disposer；撤销时移除适配器
  return ctx.ai.registerProvider(adapter)
}
```

- 需要 key 时经 `ctx.credentials`（配置只存引用，provider 持有值），避免明文落盘。
- 若想在请求前做策略（拦截/路由/重试），用 `ai/pre-request` waterfall 事件，而**不要**改适配器内部（可替换能力缝纪律）。

---

## 交付清单（写每个插件都过一遍）

- [ ] `inject` 声明依赖（服务缺失时明确失败或停在 PENDING，不静默默认缺省）。
- [ ] `Config` 用 standard-schema，fail loud，路径型配置在 `resolve` 阶段解析（不在 `run()` 藏隐式默认）。
- [ ] 每个注册走 `ctx.effect()` 并返回 disposer；清理顺序重要时放同一 effect。
- [ ] 跨边界 id 用品牌类型（`AssetId`/`DatasetId`/`CapabilityId`/`SymbolId`），绝不裸 `string`。
- [ ] 若暴露给前端：声明 slot（`ctx.slots`）+ client bundle（`ctx.clientModules`）。
- [ ] 若换掉某个能力：按“能力缝三角色（定义/提供/消费）”完整设计。
- [ ] 数据契约红线（复权/PIT/百分比/时区/交易日）见 [data-model.md](data-model.md#数据契约红线)。