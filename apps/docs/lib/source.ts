import { loader } from 'fumadocs-core/source';
import { docsRoute } from './shared';
import { defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

/**
 * 页面 schema：`title` 缺省时由第一个 `# 一级标题` 自动补全（fumadocs-mdx 的
 * remarkPostprocess）。源码 `docs/**` 没有 frontmatter，故把 title 设为可选以便校验通过。
 */
const pageSchemaWithAutoTitle = pageSchema.extend({
  title: z.string().optional(),
});

/**
 * 单一事实来源：直接把内容源指向仓库 `docs/**`（相对本包为 `../../docs`）。
 * - `.md` 文件以 Markdown（`format: 'md'`）编译：prose 里的裸 `<` / `{` / `<url>` 自动链接
 *   都按普通 Markdown 处理，无需复制/转义；文档间相对链接（`capability-seams.md` 等）由
 *   `components/docs-link.tsx` 在渲染期解析成站内路由。
 * - 这里不做任何拷贝，改动 docs/** 后重启 dev 即生效。
 */
const docs = defineDocs({
  dir: '../../docs',
  docs: {
    schema: pageSchemaWithAutoTitle,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
});