# UI 设计语言（S1 定稿 · 冻结档位清单）

> 本文档是 Berkshire Agent（BK）界面改造的**设计语言单一事实源**，把「shadcn/ui new-york」的视觉规范
> 映射到既有两层令牌体系（`@berkshire/theme`），并给出 **S2/S3 各包只能引用这些 `var(--bk-*)` 档位**的冻结清单。
> 除非新增档位需回提本包（S1）评审，否则 S2/S3 不得引用清单外的别名。

- **已实现／可运行**：`@berkshire/theme`（`packages/theme/src/tokens.ts`）是已落地的两层令牌包，
  本次新增/收敛的档位（阴影多档、字阶 lg/xl、行高 leading 档、间距 7/8、圆角 xs）均已写入取值层并导出别名，
  主题对照页 `/theme` 自动收录展示。
- **目标态**：`ctx.theme` 显式换肤缝、正式「组件写 4 倍数/行高、弃用 space/radius/font-size 令牌」仍为目标态，
  本包与本文档不做、不装作已落地（见 [AGENTS.md](../../../AGENTS.md)）。

## 它做什么

给界面改造一份「唯一允许的视觉档位表」：色板、间距、圆角、阴影、字阶各自的档位与语义，
以及「暗色单表」约束。S2（`@berkshire/ui` 复刻 shadcn）与 S3（壳/插件重样式）据此重样式，
全部通过 `var(--bk-*)`（别名层）引用；取值只在 `--bk-static-*`（取值层）。

文档读者：S2/S3 的组件/壳/插件开发者。输出标准：改界面时**只**在下面清单内选档位，**禁魔法色值**。

## 真相来源

- 令牌现状（唯一实值出处）：[packages/theme/src/tokens.ts](../packages/theme/src/tokens.ts)
  （`STATIC_TOKENS` 取值层 ≈ 60 个、`THEME_TOKENS` 别名层、`LIGHT/DARK_PALETTE`、`bkVar`）。
- CSS 出口：`packages/theme/src/css.ts` 的 `themeRootCss()`（`:root` 写取值层亮值 + 别名层引用；
  `prefers-color-scheme: dark` 与 `[data-theme="dark"]` 各只覆盖取值层暗值——**暗色单表**）。
- 样式治理门禁：[packages/theme/scripts/lint-styles.ts](../packages/theme/scripts/lint-styles.ts)（禁魔法色值）。
- 主题对照页：`packages/plugins/base-ui/src/client/ThemePalettePage.tsx`（读 `LIGHT/DARK_PALETTE` 按组分栏）。
- shadcn 参照：仅**视觉参照** new-york 的 oklch 色阶/4px 间距/圆角/阴影/字阶，**不引入其 Tailwind 实现**
  （路径 B：只复刻 shadcn 视觉与组件结构，不改样式基线；与根 [AGENTS.md](../../AGENTS.md) 的「零 Tailwind/CVA/tailwind-merge」契约一致）。

## 设计原则

1. **两层令牌，取值只在 static 层**：组件/插件写 `var(--bk-*)`（别名层引用），实值唯一出自 `--bk-static-*`。
   别名层不写实值。
2. **禁魔法色值**：色板一律从清单取，不新造 `#hex`/`rgb()`/`oklch()` 离散值；交互/边框用透明叠层令牌
   （`border`/`border-strong`/`hover`/`active`/`scrim`）叠加任意背景。
3. **暗色单表**：暗色只在取值层的 `dark` 值里改，组件**零主题选择器**；换肤即整体替换 `themeRootCss()`。
4. **语义词优先**：`color-*` 按角色命名（primary/danger/accent…），`bullet/bear` 仅价格涨跌、`accent` 仅交互高亮。
5. **档位收敛**：间距 4 的倍数、圆角语义档、阴影多档、字阶成对行高；不再新增无「使用方」的孤档。

## 冻结档位清单（S2/S3 唯一可引用）

下表所有 `--bk-*` 别名均已注册；实值见 `tokens.ts`。S2/S3 引用清单外别名一律不通过。

### color（色板，映射 shadcn new-york 角色，色值保持既有 hex/rgba 记法）

| `--bk-*` 别名 | shadcn 角色 | 语义（亮/暗实值见 tokens.ts） |
| --- | --- | --- |
| `color-bg` | background | 页面背景 |
| `color-bg-elevated` | card / popover | 抬升面（卡片/输入） |
| `color-bg-muted` | muted / secondary | 次级面（hover 底/副面板） |
| `color-fg` | foreground | 前景（正文） |
| `color-fg-muted` | muted-foreground | 弱化前景（次要） |
| `color-fg-subtle` | — | 更弱前景（hint） |
| `color-fg-invert` | — | 前景反转（实底/强调上文字） |
| `color-primary` / `-hover` / `-soft` | primary | 主色（链接/强调）+ 悬停 + 弱化底 |
| `color-focus` | ring | 焦点边框 |
| `color-info` / `-soft` | — | 信息（蓝）+ 弱化底 |
| `color-success` / `-soft` | success | 成功（绿）+ 弱化底 |
| `color-warning` / `-soft` | warning | 警告（琥珀）+ 弱化底 |
| `color-danger` / `-soft` | destructive | 危险（红）+ 弱化底 |
| `color-neutral` / `-soft` | secondary | 中性（锌灰）+ 弱化底 |
| `color-brand-{vite,react,tauri}` | — | 品牌 logo 辉光 |
| `color-accent` / `-hover` / `-soft` / `-focus` | accent | 强调色（交互/高亮）族 |
| `color-bull` / `-soft` | — | 红涨（价格/涨跌语义）+ 弱化底 |
| `color-bear` / `-soft` | — | 绿跌（价格/涨跌语义）+ 弱化底 |
| `border` / `border-strong` | border / input | 边框/分隔（透明叠层） |
| `hover` / `active` | — | 悬停/按下叠层（透明） |
| `scrim` | — | 模态遮罩（backdrop） |

> 对齐口径：shadcn 的 oklch **阶**（背景→前景、主色→悬停、语义色）只作结构参照，
> 本表以既有 hex/rgba 语义别名承接同一「角色」，不引入 oklch 记法、不改既有 token 语义。

### spacing（间距，4 的倍数）

| 别名 | 值 |
| --- | --- |
| `space-1` … `space-8` | 0.25rem(4px) / 0.5(8) / 0.75(12) / 1(16) / 1.5(24) / 2(32) / 2.5(40) / 3(48) |

### radius（圆角，语义档）

| 别名 | 值 | 用途示意 |
| --- | --- | --- |
| `radius-xs` | 2px | 细小标签/内嵌元素 |
| `radius-sm` | 4px | 小控件钉角 |
| `radius-md` | 6px | 中圆角 |
| `radius-lg` | 8px | 卡片/面板 |
| `radius-xl` | 14px | 特大块 |
| `radius-dialog` | 12px | 弹窗面板 |
| `radius-pill` | 999px | 胶囊/徽章 |

### font（字阶成对行高）

| 别名 | 值 |
| --- | --- |
| `font-sans` / `font-mono` | 正文字体 / 等宽字体 |
| `font-size-xs` / `sm` / `md` / `base` / `lg` / `xl` | 0.75 / 0.85 / 0.9 / 1 / 1.125 / 1.25 em |
| `leading-none` / `tight` / `snug` / `normal` / `relaxed` / `loose` | 1 / 1.25 / 1.375 / 1.5 / 1.625 / 2 |

> 成对约定：正文 `base` 配 `leading-normal`（1.5）；标题 `lg`/`xl` 配 `leading-tight`/`leading-snug`；
> 密集数字/表格配 `leading-none`/`tight`。行高为无单位倍数（相对字号）。

### shadow（阴影，多档）

| 别名 | 值（亮/暗见 tokens.ts） |
| --- | --- |
| `shadow-xs` / `shadow-sm` / `shadow-md` / `shadow-lg` / `shadow-xl` | 分层 rgba 阴影，亮度随档级增强 |

> `shadow-sm` 取值保持既有兼容（`0 2px 2px rgba(0,0,0,0.2)`），不因档位扩展而改变既有消费者视觉。

## 扩展新档位的流程

S2/S3 若需清单外档位：**不得在各自包内造离散值**，回提本包——先在 `tokens.ts` 取值层加 static + 别名
（标 `light`/`dark` 两套，取值只在 static 层），更新本清单，再跑 `bun run lint:styles` + `bun run typecheck` +
`bun run build:packages` 复验绿。

## 验证

- `bun run lint:styles` — 禁魔法色值门禁（取值层外的色值一律报红）。
- `bun run typecheck` (`tsc -p packages/tsconfig.json --noEmit`) — 令牌 id 类型安全。
- `bun run build:packages` — 全量构建到 dist。
- `cd apps/berkshire-agent && bun run build` — 宿主前端构建，确认令牌改动不破坏消费方。
- `git diff --check` — 无尾随空白/白斑。
- 可选：`bun run dev:plugins`（watcher）+ `cd apps/berkshire-agent && bun run dev`，目测 `/theme` 对照页
  （新档位自动按组收录，无需改页）。