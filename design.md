# BK 前端设计风格指南（design.md）

> **诚实标注（遵循仓库纪律）**：本文档描述的是 **BK 的前端设计语言（目标态/设计契约）**，**不是「当前已实现」的清单**。
>
> **已落地的载体**：样式令牌层 `--bk-*`（**取值层 `--bk-static-*` + 别名层 `--bk-*`**，单一事实源在 [`packages/theme`](packages/theme)，含 `accent`/`bull`/`bear`/`radius-dialog`/`font-mono`/`scrim`/`color-fg-invert` 等语义令牌）；React 原子组件库起步 [`packages/ui`](packages/ui)（`@berkshire/ui`：Button/Input/Select/Dropdown/Dialog/Toast/ToastRegion/Notification/Badge/Tooltip/EmptyState，全部 CSS Modules + `var(--bk-*)`）；应用壳 [`packages/plugins/base-ui/src/client/`](packages/plugins/base-ui/src/client/)；宿主前端 [`apps/berkshire-agent/src/`](apps/berkshire-agent/src/)。
>
> **仍为目标态/未落地（本文只作契约，不得当作已存在而 `import` / 直接引用路径）**：图表系统（ECharts / lightweight-charts）、查询与状态数据层（TanStack Query / SSE / `fmt*` / `cn()` 工具集）、诸多命名组件（`PageHeader`/`StockPanel`/`StockInfoBar`/`Logo`/`Chart*` 等）尚不存在。落地任一能力后，须同步更新下方「已落地」标注与本仓库 docs 诚实锚点（`architecture.md §11` / `secondary-development.md §6/§8`）。
>
> 新增/修改前端界面时应遵循本设计语言，保持整体视觉一致。令牌名一律用 `--bk-*`（见 `packages/theme`），**禁魔法色值**（由 `bun run lint:styles` 门禁）。

## 1. 设计语言概览

BK 前端采用**暗色优先**的专业交易终端风格，走**近黑基底 + 锌灰中性分层 + 电光蓝强调 + 红涨绿跌语义色**的克制层级：

- **近黑基底**：暗色默认主题，基底接近纯黑（`--bk-color-bg` = `#0A0A0B`），卡片/面板抬升一级到深灰（`#18181B`）；亮色可切换（令牌层 `LIGHT_PALETTE`/`DARK_PALETTE`，见 [`packages/theme`](packages/theme)；宿主经 `installThemedRoot()` 注入 `<style data-bk-theme>`）。
- **中性分层用锌灰**：前景文字自 `#FAFAFA` 递减（muted / subtle）到 `#8E8E96`，层级靠**明度梯度 + 边框**区分，不使用阴影表达层次。
- 强调色为**电光蓝**（`--bk-color-accent`，`#3B82F6`），仅用于交互与数据高亮；**不用于价格**。
- A 股语义色**红涨绿跌**（`--bk-color-bull`/`--bk-color-bear`），**仅用于价格/K线相关元素，不用于 UI 状态**（如成功/失败——成功用 `--bk-color-success`、失败用 `--bk-color-danger`、琥珀警告用 `--bk-color-warning`）。
- 价格与数字一律**等宽字体（`--bk-font-mono`）+ tabular-nums**，保证列对齐。
- 暗色为主时**用边框（`--bk-border`/`--bk-border-strong`）区分层次**，不使用阴影；亮色模式同理。
- 品牌色（`#8B5CF6` 系列）仅用于 Logo/brand 区域，不影响功能语义色。

## 2. 设计令牌（Design Tokens）

令牌**单一事实源**在 [`packages/theme/src/tokens.ts`](packages/theme/src/tokens.ts)：取值层 `STATIC_TOKENS`（`--bk-static-*`）只在这里写实值，别名层 `THEME_TOKENS`（`--bk-*`）供组件/插件唯一引用，别名 `ref` 到 static id，**别名层不写实值**。取样式用工具 `bkVar`/`bkVarName`/`bkStaticVar`/`themeRootCss()`。

### 2.1 色板（映射到真实 `--bk-*` 令牌）

| 语义 | `--bk-*` 令牌 | 暗色值 | 亮色值 | 用途 |
| --- | --- | --- | --- | --- |
| 页面背景 | `--bk-color-bg` | `#0A0A0B` | `#FAFAFA` | 页面背景（近黑） |
| 卡片/面板 | `--bk-color-bg-elevated` | `#18181B` | `#FFFFFF` | 卡片/输入抬升面 |
| hover/次级面 | `--bk-color-bg-muted` | `#212126` | `#F4F4F5` | hover 底/顶栏/副面板 |
| 主文字 | `--bk-color-fg` | `#FAFAFA` | `#18181B` | 前景（正文） |
| 次级文字 | `--bk-color-fg-muted` | `#C4C4CB` | `#52525B` | 次级（子标题/导航非激活） |
| 辅助提示 | `--bk-color-fg-subtle` | `#8E8E96` | `#A1A1AA` | hint |
| 强调 | `--bk-color-accent`（+`-hover`/`-soft`/`-focus`） | `#3B82F6` | `#3B82F6` | 交互/高亮（不用于价格） |
| 红涨 | `--bk-color-bull`（+`-soft`） | `#F04438` | `#F04438` | 价格/涨跌 |
| 绿跌 | `--bk-color-bear`（+`-soft`） | `#12B76A` | `#12B76A` | 价格/涨跌 |
| 成功/危险/警告 | `--bk-color-success`（`#22C55E`/`#16A34A`）·`-danger`（`#F04438`）·`-warning`（`#F79009`） | — | — | UI 状态（不用 bull/bear） |
| 边框 | `--bk-border`/`--bk-border-strong` | 透明度叠层 | 透明度叠层 | 边框/分隔 |
| 遮罩 | `--bk-scrim` | 透明度叠层 | 透明度叠层 | 模态 backdrop |

> 状态/语义对应：**成功/失败/警告用 `success`/`danger`/`warning`；`bull`/`bear` 只表达价格涨跌方向**，两者不得混用。模块交互态（hover/active/focus）一律走 `--bk-hover`/`--bk-active`/`--bk-color-accent-focus` 透明度叠层。

### 2.2 字体

| 用途 | `--bk-*` 令牌（含字体栈） |
| --- | --- |
| 正文 | `--bk-font-sans`（Inter → HarmonyOS Sans SC → PingFang SC → system-ui → sans-serif） |
| 数字/代码 | `--bk-font-mono`（JetBrains Mono → IBM Plex Mono → ui-monospace → monospace） |

**规则**：价格、涨跌幅、成交量、指标数值一律用 `--bk-font-mono` + `tabular-nums`。

### 2.3 圆角

| 用途 | `--bk-*` 令牌 | 值 |
| --- | --- | --- |
| 卡片 | `--bk-radius-lg` | 8px |
| 按钮 | `--bk-radius-md` | 6px |
| 输入框 | `--bk-radius-sm` | 4px |
| 弹窗面板 | `--bk-radius-dialog` | 12px |

### 2.4 动效

- 过渡：按钮/链接 hover 标配 150ms 的 color/background 过渡。
- 缓动：`cubic-bezier(0.16, 1, 0.3, 1)`（Linear/Vercel 同款）。
- 复杂动画库与 CSS 进出场（如 toast）**仍为目标态**，落地时复用 `@berkshire/ui` 的 Toast/Dialog 原语，不自建动画系统。

### 2.5 全局滚动条

细滚动条（8px），暗色 thumb 用边框色、hover 时变 `--bk-color-accent`；样式属设计契约，落地后统一在令牌根样式/全局样式实现，不散落在组件内。

## 3. 主题系统

- 状态存 `localStorage('bk-theme')`，默认 `dark`；宿主 `installThemedRoot()` 在渲染前注入 `<style data-bk-theme>`，避免闪烁（FOUC）。
- **UI token 自动跟随主题；图表画布不吃 CSS 变量**，统一走调色板工具取色（**图表系统为目标态**，落地时须如此，禁止在画布内硬编码颜色）。
- 令牌双主题值在 `LIGHT_PALETTE`/`DARK_PALETTE`（`packages/theme`）；对照页 `ThemePalettePage`（核心路由 `/theme`）由 `@berkshire/base-ui` 半身承载。

## 4. 数据格式化约定（目标态工具集）

统一使用格式化工具（落地于共享包后）、**不自行拼字符串**。接口形状建议（目标态，未实现）：

| 函数 | 输出示例 | 说明 |
| --- | --- | --- |
| `fmtPrice(v)` | `12.34` | 价格，缺值 `—` |
| `fmtPct(v)` | `+3.25%` | 涨跌幅（输入为小数制，内部 `*100`） |
| `fmtVolume(v)` | `1.23亿` | 成交量（亿/万自动） |
| `fmtBigNum(v)` | `1.23万亿` | 大数（万亿/亿/万自动） |
| `fmtDate(s)` | `2026-09-08` | 日期 |

价格颜色语义：用 `--bk-color-bull`（涨）/`--bk-color-bear`（跌）/`--bk-color-fg-subtle`（0 或缺失）。**禁止**硬编码 `v > 0 ? 'red' : 'green'`。

## 5. 组件库约定

**已落地**：`@berkshire/ui`（`packages/ui`）提供 Button/Input/Select/Dropdown/Dialog/Toast/ToastRegion/Notification/Badge/Tooltip/EmptyState——全部 CSS Modules + `var(--bk-*)`、基础可访问性内置（Dialog 复合家族含焦点陷阱/ESC/restore 与遮罩，Dropdown 含 `aria-haspopup`/外部点击关闭），T0 可 SSR 冒烟。验收：`bun run --cwd packages/ui build && test`。

**目标态（设计契约，未实现）**：下述命名组件（PageHeader/StockPanel/StockInfoBar/Logo/Chart*）与「Dialog 复用」等约定，落地时优先复用 `@berkshire/ui` 组件，**不要自建平行组件库/弹窗**。弹窗复用 `Dialog` 家族，空态用 `EmptyState`（图示 + 引导，而非一句「暂无数据」）。

### 5.1 图标

图标库（统一图标方案）为**目标态**；落地时统一依赖一个图标源，规范尺寸（导航/侧栏小图标、空态大图标），品牌 Logo 用 `currentColor` 继承父级颜色。

## 6. 图表系统（目标态）

- 候选：ECharts（复杂图表）+ lightweight-charts（蜡烛图）。**尚未落地**。
- 落地契约：图表画布不吃 CSS 变量，所有图表组件通过主题调色板工具取色；主题切换时重建或 `applyOptions` 刷新。**新增图表必须走调色板工具，禁止硬编码画布颜色**（序列色如 bull/bear/accent 除外，双主题一致）。

## 7. 页面与布局结构

- 路由：宿主 `apps/berkshire-agent/src` 用 `react-router-dom` `HashRouter`，核心路由 `/`、`/theme` + 插件自声明动态路由（`src/routes/*`，路由契约化）；**设置是弹窗（WP-6），不是路由页**。
- 外壳：`@berkshire/ui-slots` 共享 `root` 槽挂 `@berkshire/base-ui` 壳帧（**grid 三区域骨架**：可扩展侧边栏 + 右顶栏 + 内容区；状态栏 + 设置弹窗 + 布局挂点；复用 `@berkshire/ui` Button/Badge/Dialog）。设置弹窗（WP-6）左分组〔通用/模型/插件设置〕右表单：通用/模型表单骨架用 `@berkshire/ui` Input/Select，模型 Key 字段只存 env 引用名（不落明文）；「插件设置」分组承接 `settings.section` 设置 Seam（插件贡献设置表单面板，每槽包 `ExtensionBoundary`），分组 id/label/order 契约 `DEFAULT_SETTINGS_GROUPS` 在 `@berkshire/base-ui` `settingsGroups.ts`。
- 页面结构惯例：标题栏 → 内容区（卡片/表格/图表）。
- 内核 k线/行情列表等深色图表区遵循 §1 的近黑基底与边框分层；虚拟滚动表格、列自定义等仍是**目标态**。

## 8. 状态与数据层约定（目标态）

- 唯一 API 客户端封装在宿主 `apps/berkshire-agent/src/lib/api.ts`（薄客户端包装 Tauri command + 订阅 `sidecar://*` 事件，外包超时 fail-closed）。
- 查询键集中管理、TanStack Query、全局 SSE、`cn()` 样式合并均**为目标态工具集**（TanStack/SSE/`cn()` 尚无消费者）。
- 新建页面/组件必须复用上述基建，**禁止自建第二套请求/查询/样式工具**。（当下宿主侧无请求层时，走 `api.ts` 薄客户端。）后端数据经 `ctx.database` 单写者 + 桥，禁止绕过。

## 9. 新增/修改界面时的检查清单

1. **色值**：只用 `--bk-*` 令牌（见 `packages/theme`），不写死 hex（品牌色与局部价格色除外）。门禁 `bun run lint:styles`。
2. **数字**：价格/涨跌/成交量用 `--bk-font-mono` + `tabular-nums`，格式化走共享工具。
3. **语义色**：`bull`/`bear` 只用于价格涨跌；UI 状态用 `success`/`danger`/`warning`/`accent`。
4. **主题**：画布类颜色走调色板工具；纯 DOM 用 CSS variable token 自动跟随。
5. **弹窗**：复用 `@berkshire/ui` 的 `Dialog`，不手写遮罩/焦点逻辑。
6. **空/加载态**：用 `EmptyState`（图示 + 引导）；加载态预留高度避免布局抖动。
7. **数据层**：走宿主 `api.ts` 薄客户端 + 单写者桥，不新建平行工具。
8. **扩展接入**：新功能若属二次开发，遵循 [secondary-development.md](docs/secondary-development.md) 的插槽/注册规范（`slots`/`clientModules`/布局挂点），UI 风格保持一致。

## 10. 相关文件索引

| 主题 | 位置 |
| --- | --- |
| 样式令牌层（`--bk-*`，静态+别名） | [`packages/theme`](packages/theme)（`src/tokens.ts`；魔法色值 lint `scripts/lint-styles.ts`） |
| 原子组件库 | [`packages/ui`](packages/ui)（`@berkshire/ui`，`src/*.tsx` + `*.module.css`；`scripts/build-client.ts` 产出 ESM + css） |
| 共享 UI 缝引擎 | [`packages/ui-slots`](packages/ui-slots)（`SlotRegistry`/`ExtensionSlot`/`ExtensionBoundary`） |
| 应用壳 webview 半身 | [`packages/plugins/base-ui/src/client/`](packages/plugins/base-ui/src/client/)（`AppShell`/`Sidebar`/`StatusBar`/`SettingsDialog`（WP-6 设置弹窗）+ `installThemedRoot`） |
| 前端宿主 | [`apps/berkshire-agent/src/`](apps/berkshire-agent/src/)（`main.tsx`/`App.tsx`/`lib/api.ts`/`routes/*`/`client/*`/`onboarding/*`） |
| 图标/图表/查询层 | 目标态（见 §5.1/§6/§8，落地后登记此处） |

> 维护约定：本文档是**设计契约**，随前端设计与已落地能力演变同步更新；凡声称「已落地」的条目必须有 `packages/*` 或 `apps/berkshire-agent/src/` 下的真实文件佐证，落地后同步更新 `architecture.md §11` 锚点。