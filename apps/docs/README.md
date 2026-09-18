# Berkshire Agent 文档站（apps/docs）

Berkshire Agent（BK，全插件化 A 股投研桌面工作台）的**文档站**：团队与 AI 开发者统一入口。
用 **Next.js（App Router）+ Fumadocs** 搭建，可搜索、可导航、明暗主题齐全。

> **原则**：文档站只做「组织与呈现」，绝不重新改写设计内容。站内内容**不复制、不维护第二份**——
> 直接把内容源指向仓库 `docs/**`（单一事实来源），如实区分「已实现」与「目标态」。

## 快速开始

```bash
# 仓库根（推荐，已代理到 apps/docs）
bun install
bun run dev:docs     # 本地开发 -> http://localhost:3000
bun run build:docs   # 生产构建（验收：必须零报错）

# 或在 apps/docs 目录内直接
cd apps/docs
bun run dev
bun run build
bun run start
```

## 内容单一事实来源

`lib/source.ts` 里 `defineDocs({ dir: '../../docs' })` 直接挂载仓库 `docs/**`（核心 7 篇 +
`reference/*.md`），**不对它们做任何拷贝**：

- `.md` 文件以 Markdown（`format: 'md'`）编译：prose 里的裸 `<`/`{`/`<url>` 自动链接都按普通
  Markdown 处理，无需拆装；改动 `docs/**` 后重启 dev 即生效。
- `title` 缺省时由第一个 `# 一级标题` 自动补全（fumadocs-mdx 的 remarkPostprocess）。
- 文档间相对链接（`capability-seams.md`、`data-model.md#6-…`、`reference/xxx.md#…`、
  `diagrams/xxx.html`）由 `components/docs-link.tsx::resolveDocsHref` 在**渲染期**解析成站内路由
  （`/docs/…`），不改源文档。

侧边栏主序与分组不是写在 `docs/**` 里的，而是本站 `app/docs/layout.tsx` 在拿到页树后重排
（核心 7 篇 + `参考 Reference` 折叠 + 追加 `图 Diagrams` 分组）。这样 `docs/**` 保持纯文档。

## 如何新增一篇文档

1. 直接在 `docs/` 写 `*.md`（遵守 AGENTS.md 里「目标态 vs 已实现」诚实标注）。
2. 重启 `bun run dev` / 重新 `bun run build` 即出现（自动根据根目录分组）。
   - 若它是核心七篇之一 → 无需改动，按现有目录规则排序即可；
   - 若想调整侧边栏顺序/分组 → 改 `app/docs/layout.tsx`（或 `lib/shared.ts::sidebarOrder`）。
3. `bun run build:docs` 校验。

## 如何改 / 加图

- 四张 archify 独立交互 HTML 图**同样单一来源**：源在 `docs/diagrams/*.html`。
- 页面用 `<DiagramPanel>`（`components/diagram-panel.tsx`）以
  `<iframe src="/diagrams/<name>?embed=1&theme=…">` 内嵌；该 HTML 由
  `app/diagrams/[name]/route.ts` 直接读 `docs/diagrams/<name>.html` 返回，**不复制到 public**。
- **改图**：更新 `docs/diagrams/*.html`（或其 `*.candidate.json` 重新导出）即生效。
- **加图**：在 `lib/shared.ts::diagrams` 登记，并把新 `*.html` 放进 `docs/diagrams/`；
  图页自动出现在 `/docs/diagrams/<name>`。

### 图的嵌入方式与取舍

采用 **`<iframe src="/diagrams/<name>?embed=1&theme=…">`** 内嵌：

- **收益**：完整保留 archify 交互（明暗、trace），`?theme=` 跟随站点明暗，与站点主题隔离互不污染；
- **代价**：iframe 内无法做站内锚点跳转；因此每图保留「在新标签中打开原图」**直链**作为独立查看 /
  降级入口（即使 iframe 被宿主 CSP 限制也保证图真实可看，绝不为死链）。

## 目录结构

```
apps/docs/
├── app/
│   ├── layout.tsx               # 根布局：Provider（主题 + 搜索）
│   ├── (home)/page.tsx          # 首页：模块划分 + 「已实现 vs 目标」总览
│   ├── docs/layout.tsx          # DocsLayout：页树重排 + 追加「图 Diagrams」分组
│   ├── docs/[[...slug]]/page.tsx# 文档正文页（内容来自 ../../docs）
│   ├── docs/diagrams/[name]/    # 四张图的展示页（iframe 内嵌）
│   ├── diagrams/[name]/route.ts # 直接返回 docs/diagrams/*.html（单一来源）
│   ├── api/search/route.ts      # 本地搜索端点（fumadocs-core createFromSource）
│   ├── maintenance/page.tsx     # 本站维护指南（浏览器可读版 /maintenance）
│   └── icon.svg                 # 站点图标
├── components/
│   ├── provider.tsx             # RootProvider（主题 + 搜索）
│   ├── search.tsx               # SearchDialog
│   ├── docs-link.tsx            # 渲染期解析 docs 相对链接 -> 站内路由
│   ├── mdx.tsx                  # MDX 组件（注册 DiagramPanel / DocsLink）
│   └── diagram-panel.tsx        # 四图 iframe 内嵌组件（含直链兜底）
├── lib/
│   ├── source.ts                # defineDocs({ dir: '../../docs' }) —— 单一事实来源
│   ├── shared.ts                # appName / docsRoute / diagrams / sidebarOrder
│   └── layout.shared.tsx        # 导航配置
└── next.config.mjs              # 相对 diagram 链接的重写兜底
```

## 分区与导航

侧边栏（`app/docs/layout.tsx`）按真实 `docs/**` 组织：**架构 / 能力缝 / 插件开发 / 配置 /
数据模型 / 二次开发与状态 / 速查**（顶层 7 篇）＋ **参考 Reference**（4 篇折叠分组）＋
**图 Diagrams**（4 张）。搜索覆盖全部文档；明暗主题由 next-themes 提供。

## 验收对照

- `bun install && bun run build:docs`：零报错、全部页面静态预渲染。
- `bun run dev:docs`：`http://localhost:3000` 可访问，核心/参考/图/维护/搜索路由均 200。
- 四张图：`/docs/diagrams/<name>` 页内嵌 iframe 可看，且附「在新标签打开原图」直链（非死链）。