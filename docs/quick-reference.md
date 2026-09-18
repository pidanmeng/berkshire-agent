# “新行为放哪”速查表

> 目标态参考（照抄 dsh 的 “Where new behavior goes”）。新增一种能力 = 设计**能力缝三角色**（Service Definition / Provider / Consumer），并选对事件领域与派发模式。**这才是大多数修改中的第一个决定。**

## 1. 目标 → 机制/扩展点

| 目标 | 机制（扩展点） |
| --- | --- |
| 加一个数据源 | 实现 `ctx.dataSources` 接口并 `register(provider)`（声明 `datasets`）→ 可被 `ctx.capabilities` 门控 |
| 加一个指标/信号 | 在 `ctx.indicators` 注册纯函数（`needed` 依赖闭包），窄表基点现算 |
| 加一条同步管道/job | 注册到 `ctx.scheduler`（数据源/盘后/分钟同步 + `ctx.datasets` generation 发布）|
| 给某能力换 provider | 按 seam 三角色替换 `ctx.dataSources`/`ctx.ai`/`ctx.notifier`/`ctx.indicators` 的 provider（一次替换迁移整产品）|
| 加一个选股/回测策略 | 注册到 `ctx.screener` / `ctx.strategy` / `ctx.backtest`（文件或注册表加载）|
| 加一个人工/定时复盘 | `ctx.ai` provider + `ctx.scheduler` + `ctx.notifier` |
| 加一个交互式分析菜单页 | `ctx.slots.register('analysis.menu', …)` + `ctx.analysis` handler + client 页 |
| 加一个 UI 区块/按钮 | 声明 slot（`stock-preview.footer`/`watchlist.toolbar`/`detail.tabs`…）+ 可选 client bundle |
| 加一个图表渲染器 | 注册 `ctx.chart` provider（ECharts 默认，K 线可换 lightweight-charts）|
| 加一个 AI 适配器 | 实现 `ctx.ai` adapter 并 `registerProvider`；key 走 `ctx.credentials` |
| 加一个通知渠道 | 实现 `ctx.notifier` provider（tray/wecom/telegram/webhook）|
| 拦截一次请求/同步/回测 | 用 `datasource/pre-fetch`/`ai/pre-request`/`backtest/pre-run` waterfall；`analysis/run` serial 可中止 |
| 新增基于模型/前端的输入 | 必须配套登记一个耐久数据事件（“可见 ⟺ 已记录”）|
| 给某 workspace/Agent 不同能力集 | 用 `ctx.extend(scopeKey)` / `isolate`（见 [config.md §6](config.md#6-分组与隔离)）|
| 后台长任务（矿工/大数据回测） | `ctx.jobs` + spawn 隔离 worker |
| 只改配置不写码 | profile/bundle/patch 或 `--patch` overlay（见 [config.md](config.md)）|

## 2. 事件领域 × 派发模式速查

| 事件域 | 例子 | 推荐模式 |
| --- | --- | --- |
| 耐久数据事件 | `market/kline-updated`、`market/quote-updated`、`market/calendar-changed` | `emit`（持久事实，跨重载）|
| 在途工作事件 | `sync/*`、`analysis/*`、`backtest/*`、`screen/*` | `emit`/`serial`（观察/中止）|
| 能力策略事件 | `datasource/pre-fetch`、`ai/pre-request`、`notify/*` | `waterfall`（必须 `next()`）/`parallel` |

## 3. cordis 方法与服务的“该用哪个”

| 想表达 | 用 |
| --- | --- |
| 直接能力调用 | 服务方法（`ctx.database.query`、`ctx.dataSources.getDaily`）|
| 观察/包装在途工作 | 事件（emit/waterfall）|
| 声明我依赖什么 | `inject` / `ctx.inject([...], cb)` |
| 声明我提供什么（服务） | `ctx.provide(key, value)` 或 `class X extends Service` |
| 注册副作用并保证可逆 | `ctx.effect(...)` + 返回 disposer |
| 读某服务此刻是否可用 | `Service.check` / `ctx.get(key, strict)` |
| 是不是 seam | 三角色都齐了吗？只有接口定义不算缝 |

## 4. 5 分钟发现自己加法的落点

1. 动的是**数据**（拉/存/派）→ `ctx.dataSources` + `ctx.datasets` + `ctx.scheduler`。
2. 动的是**逻辑**（算/选/回测）→ `ctx.indicators` / `ctx.screener` / `ctx.strategy` / `ctx.backtest`。
3. 动的是**界面**（区块/页/图）→ `ctx.slots` / `ctx.clientModules` / `ctx.chart`。
4. 动的是**外部能力**（AI/通知/数据源品牌）→ 对应 seam provider。
5. 只是**换个默认/参数** → profile/bundle/patch，不写码。

> 完整插件写法见 [plugin-development.md](plugin-development.md)；约束红线见 [secondary-development.md](secondary-development.md)；服务目录见 [capability-seams.md](capability-seams.md)。