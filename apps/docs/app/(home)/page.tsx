import Link from 'next/link';
import {
  Blocks,
  Cable,
  ChartLine,
  Database,
  GitBranch,
  Network,
  Puzzle,
  ShieldAlert,
  ListFilter,
  Settings2,
  Library,
  Compass,
} from 'lucide-react';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { diagrams } from '@/lib/shared';

const coreDocs = [
  {
    href: '/docs/architecture',
    title: '架构 Architecture',
    desc: '运行时三进程拓扑、模块地图、数据流、事件域、存储分层、扩展模型、生命周期、现状→目标文件索引。',
    icon: <Network className="size-4" />,
  },
  {
    href: '/docs/capability-seams',
    title: '能力缝 Capability Seams',
    desc: 'ctx.* 核心脊柱 vs 可替换能力缝的三角色模型（Service Definition / Provider / Consumer）目录。',
    icon: <Cable className="size-4" />,
  },
  {
    href: '/docs/plugin-development',
    title: '插件开发 Plugin Development',
    desc: '5 个上手教程：加数据源 / 加指标 / 加分析页 / 加 UI slot / 加 AI 适配器；三形态插件骨架。',
    icon: <Puzzle className="size-4" />,
  },
  {
    href: '/docs/config',
    title: '配置 Config',
    desc: 'profile / bundle / patch 组合配置层、层叠顺序、内置模板、用户零代码覆盖与 dump-config。',
    icon: <Settings2 className="size-4" />,
  },
  {
    href: '/docs/data-model',
    title: '数据模型 Data Model',
    desc: 'DuckDB 目标 schema、dataset 注册表、缓存分层与失效链、数据契约红线（复权/PIT/时区/fail-closed）。',
    icon: <Database className="size-4" />,
  },
  {
    href: '/docs/secondary-development',
    title: '二次开发与状态 Secondary Dev',
    desc: 'L1/L2/L3 分级、Cordis 方法论硬规则、前端扩展契约、验证矩阵，以及「已有 vs 目标」诚实标注。',
    icon: <GitBranch className="size-4" />,
  },
  {
    href: '/docs/quick-reference',
    title: '速查 Quick Reference',
    desc: '“新行为放哪”速查表：目标 → 机制 / 扩展点，事件域 × 派发模式，5 分钟定位落点。',
    icon: <ListFilter className="size-4" />,
  },
];

const referenceDocs = [
  { href: '/docs/reference/cordis-methodology', title: 'Cordis 方法论', desc: 'Cordis 设计原则（九条）。' },
  { href: '/docs/reference/cordis-pattern-report', title: 'Cordis 模式审计', desc: 'dsh 对 Cordis 落地模式的审计。' },
  { href: '/docs/reference/tauri-duckdb-plugin-runtime', title: 'Tauri/DuckDB 运行时选型', desc: 'Rust 宿主 + sidecar 三进程选型研究。' },
  { href: '/docs/reference/tick-stock-panel-contracts', title: 'Tick Stock Panel 契约', desc: '投研领域模型与数据契约（继承来源）。' },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <div className="border-b border-fd-border bg-fd-secondary/30">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-6 py-14 md:py-20">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Berkshire Agent 文档站
          </h1>
          <p className="max-w-2xl text-fd-muted-foreground">
            全插件化 A 股投研桌面工作台（BK）的统一文档入口。本文档站只做「组织与呈现」，
            内容全部来自仓库 <code className="rounded bg-fd-muted px-1.5 py-0.5 text-sm">docs/**</code>{' '}
            真实源文档（单一事实来源），并如实区分「已实现」与「目标态」。
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs/architecture"
              className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground hover:opacity-90"
            >
              <Compass className="size-4" />
              从架构文档开始
            </Link>
            <Link
              href="/maintenance"
              className="inline-flex items-center gap-2 rounded-lg border border-fd-border px-4 py-2 text-sm font-medium hover:bg-fd-muted"
            >
              如何维护本站
            </Link>
          </div>
        </div>
      </div>

      {/* 已实现 vs 目标态 */}
      <section className="mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">
        <h2 className="mb-2 text-xl font-semibold">先读：已实现 vs 目标态（诚实标注）</h2>
        <p className="mb-4 text-sm text-fd-muted-foreground">
          本站的 <code className="rounded bg-fd-muted px-1.5 py-0.5">docs/**</code> 描述的是设计契约（目标态），
          不等于当前已实现代码。以{' '}
          <Link className="font-medium text-fd-primary underline" href="/docs/secondary-development#6-已有-vs-目标诚实标注">
            二次开发与状态 §6
          </Link>{' '}
          为准。当前真实状态：
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-fd-border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Blocks className="size-4 text-fd-primary" /> 已有（已实现）
            </div>
            <p className="text-sm text-fd-muted-foreground">
              <code className="rounded bg-fd-muted px-1 py-0.5">apps/berkshire-agent</code>{' '}
              的 <strong>Tauri 2 + React 19 + Vite 骨架</strong>（窗口、webview、greet）。
            </p>
          </div>
          <div className="rounded-lg border border-fd-border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="size-4 text-fd-destructive" /> 目标态（未实现）
            </div>
            <p className="text-sm text-fd-muted-foreground">
              <code className="rounded bg-fd-muted px-1 py-0.5">packages/</code>、Cordis sidecar、DuckDB
              写者、rspc 桥、<code className="rounded bg-fd-muted px-1 py-0.5">bk://</code> 协议、全部{' '}
              <code className="rounded bg-fd-muted px-1 py-0.5">ctx.*</code> 能力缝、{' '}
              <code className="rounded bg-fd-muted px-1 py-0.5">@berkshire/cordis</code>——均处于文档计划阶段，
              <strong> 不得 import / 调用</strong>。
            </p>
          </div>
        </div>
      </section>

      {/* 核心分区 */}
      <section className="mx-auto w-full max-w-[1100px] px-6 pb-4">
        <h2 className="mb-4 text-xl font-semibold">按主题浏览</h2>
        <Cards className="grid-cols-1 md:grid-cols-2">
          {coreDocs.map((c) => (
            <Card key={c.href} href={c.href} title={c.title} description={c.desc} icon={c.icon} />
          ))}
        </Cards>
      </section>

      {/* 图 */}
      <section className="mx-auto w-full max-w-[1100px] px-6 py-8">
        <h2 className="mb-1 text-xl font-semibold">交互式图表</h2>
        <p className="mb-4 text-sm text-fd-muted-foreground">
          四张 archify 生成的独立交互 HTML 图（架构 / 数据流 / 生命周期 / 时序），内嵌于 iframe 并附直链。
        </p>
        <Cards className="grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          {diagrams.map((d) => (
            <Card
              key={d.name}
              href={`/docs/diagrams/${d.name}`}
              title={d.title.split('·')[0]}
              description={d.description}
              icon={<ChartLine className="size-4" />}
            />
          ))}
        </Cards>
      </section>

      {/* 参考 */}
      <section className="mx-auto w-full max-w-[1100px] px-6 pb-10">
        <h2 className="mb-4 text-xl font-semibold">参考 Reference</h2>
        <Cards className="grid-cols-1 md:grid-cols-2">
          {referenceDocs.map((r) => (
            <Card key={r.href} href={r.href} title={r.title} description={r.desc} icon={<Library className="size-4" />} />
          ))}
        </Cards>
      </section>
    </main>
  );
}