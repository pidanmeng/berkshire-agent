import Link from 'next/link';
import { BookOpen, GitBranch, RefreshCw } from 'lucide-react';

const cmd = 'font-mono text-[13px] rounded bg-fd-muted px-1.5 py-0.5';

export default function MaintenancePage() {
  return (
    <main className="mx-auto w-full max-w-[820px] flex-1 px-6 py-12">
      <h1 className="text-2xl font-bold">维护指南</h1>
      <p className="mt-2 text-fd-muted-foreground">
        本站是 monorepo 的 <span className={cmd}>apps/docs</span> 应用，用 Next.js（App Router）+ Fumadocs
        搭建。原则：站点内容以仓库 <span className={cmd}>docs/**</span> 为
        <span className="font-semibold">单一事实来源</span>——不复制、不维护第二份文档，只做组织与呈现。
      </p>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <GitBranch className="size-4" /> 单一事实来源（如何挂载）
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>
            <span className="font-semibold">正文</span>：<span className={cmd}>lib/source.ts</span> 用{' '}
            <span className="font-mono">defineDocs(&#123; dir: &#39;../../docs&#39; &#125;)</span> 直接挂载仓库{' '}
            <span className={cmd}>docs/**</span>，不对它们做任何拷贝。
          </li>
          <li>
            <span className="font-semibold">标题</span>：源文件没有 frontmatter，由{'\u00A0'}
            <span className="font-mono">title</span> 从第一个「# 一级标题」自动补全。
          </li>
          <li>
            <span className="font-semibold">链接</span>：相对链接（<span className="font-mono">capability-seams.md</span>、
            <span className="font-mono">data-model.md#6-…</span>、<span className="font-mono">reference/xxx.md#…</span>、
            <span className="font-mono">diagrams/xxx.html</span>）在渲染期由{' '}
            <span className={cmd}>components/docs-link.tsx</span> 解析成站内路由，不改源文档。
          </li>
          <li>
            <span className="font-semibold">图</span>：四张 <span className={cmd}>docs/diagrams/*.html</span> 同样不做拷贝，
            由 <span className={cmd}>app/diagrams/[name]/route.ts</span> 直接读源文件返回（iframe 内嵌）。
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <RefreshCw className="size-4" /> 更新内容（docs 改动 → 站内即生效）
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>照常编辑 <span className={cmd}>docs/**</span> 的真实源文档（含 reference；图见下节）。</li>
          <li>无需任何同步命令——直接 <span className={cmd}>bun run dev</span>（热更新）或 <span className={cmd}>bun run build</span> 校验。</li>
        </ol>
        <div className="mt-4 rounded-lg border border-fd-border p-4 text-sm">
          <p className="font-semibold">如何新增一篇文档</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>在 <span className={cmd}>docs/</span> 写好 <span className="font-mono">*.md</span>（遵循仓库「目标态 vs 已实现」诚实标注）。</li>
            <li>重启 <span className={cmd}>dev</span> 或重新 <span className={cmd}>build</span>，自动出现。</li>
            <li>
              若需调整侧边栏顺序/分组：改 <span className={cmd}>app/docs/layout.tsx</span>（或{' '}
              <span className={cmd}>lib/shared.ts::sidebarOrder</span>），核心 7 篇之外的同级文件按现有目录规则排序即可。
            </li>
          </ol>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="size-4" /> 如何改图 / 加图
        </h2>
        <p className="mt-2 text-sm text-fd-muted-foreground">
          四张图由 archify 生成在 <span className={cmd}>docs/diagrams/*.html</span>（自包含交互 SVG，明暗主题）；
          站点 <span className="font-semibold">不做拷贝</span>，由路由直接读源文件。
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <span className="font-semibold">改现有图</span>：更新 <span className={cmd}>docs/diagrams/*.html</span>（archify 的
            <span className="font-mono"> *.candidate.json</span> 是源，重新导出 html），直接生效。
          </li>
          <li>
            <span className="font-semibold">加新图</span>：把新 <span className="font-mono">*.html</span> 放进{' '}
            <span className={cmd}>docs/diagrams/</span>，并在 <span className={cmd}>lib/shared.ts</span> 的{' '}
            <span className="font-mono">diagrams</span> 数组登记；
            图页自动出现在 <span className="font-mono">/docs/diagrams/&lt;name&gt;</span> 与侧边栏「图 Diagrams」。
          </li>
        </ol>
        <p className="mt-3 text-sm text-fd-muted-foreground">
          嵌入方式取舍：采用 <span className="font-mono">&lt;iframe src=&#34;/diagrams/x?embed=1&amp;theme=…&#34;&gt;</span>{' '}
          完整保留 archify 交互（明暗跟随站点）；同时页面保留「在新标签中打开原图」直链作为降级/独立查看，避免死链。
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">一键命令</h2>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-fd-border bg-fd-muted/40 p-4 text-sm">
          <code>{`# 仓库根（推荐）
bun install          # 安装依赖（bun workspaces: apps/*）
bun run dev:docs     # 本地开发： http://localhost:3000
bun run build:docs   # 生产构建（验收：必须零报错）

# apps/docs 目录内
bun run dev          # 等同 dev:docs
bun run build        # 等同 build:docs
bun run start        # 预览生产构建`}</code>
        </pre>
        <p className="mt-3 text-sm">
          全部说明与取舍详见 <Link className="text-fd-primary underline" href="/docs/architecture">架构文档</Link>{' '}
          与 <span className="font-mono">apps/docs/README.md</span>。
        </p>
      </section>
    </main>
  );
}