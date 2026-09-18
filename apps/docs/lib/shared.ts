/** 站点级常量。内容单一事实来源 = 仓库 `docs/**`（不经拷贝直接挂载，见 lib/source.ts）。 */

export const appName = 'Berkshire Agent 文档站';

/** docs 内容挂载的基础路由（配合 docs/** 目录结构）。 */
export const docsRoute = '/docs';

/**
 * 图的嵌入方式（见 README「图表」一节）：
 * - 内容与 iframe 都直接读仓库 `docs/diagrams/*.html`（经 /app/diagrams/[name].html 路由返回），
 *   不复制、不维护第二份；
 * - 每个图以 <iframe src="…?embed=1&theme=…"> 内嵌，并附「在新标签中打开原图」直链兜底。
 */
export const diagrams = [
  {
    name: 'architecture',
    title: '架构图 · 运行时拓扑 / 模块地图',
    description: '进程 A/B/C 拓扑、三进程归属原则（无特权核心）。',
    source: 'docs/diagrams/architecture.html',
  },
  {
    name: 'dataflow',
    title: '数据流 · 端到端主路径',
    description: '数据源 provider → 同步 → DuckDB 单写者 → 事件扇出 → 前端。',
    source: 'docs/diagrams/dataflow.html',
  },
  {
    name: 'lifecycle',
    title: '生命周期 · Cordis Fiber + 可逆效应',
    description: '插件 Fiber 状态机 PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED。',
    source: 'docs/diagrams/lifecycle.html',
  },
  {
    name: 'sequence',
    title: '时序 · 配置层加载 / 运行机制',
    description: 'profile / bundle / patch 组合与 dump-config 等价命令的运行机制。',
    source: 'docs/diagrams/sequence.html',
  },
] as const;

export type DiagramName = (typeof diagrams)[number]['name'];

/** 侧边栏顶层顺序（slug → 展示名）。尊重 docs/** 真实文件，仅在本站侧边栏做主序。 */
export const sidebarOrder: { slug: string; label: string }[] = [
  { slug: 'architecture', label: '架构 Architecture' },
  { slug: 'capability-seams', label: '能力缝 Capability Seams' },
  { slug: 'plugin-development', label: '插件开发 Plugin Development' },
  { slug: 'config', label: '配置 Config' },
  { slug: 'data-model', label: '数据模型 Data Model' },
  { slug: 'secondary-development', label: '二次开发与状态 Secondary Dev' },
  { slug: 'quick-reference', label: '速查 Quick Reference' },
];