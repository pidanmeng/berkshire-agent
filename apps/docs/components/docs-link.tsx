import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

/** 与仓库 docs/** 对应的站内 slug 集合（单一事实来源的映射本身也在本站维护）。 */
const CORE = [
  'architecture',
  'capability-seams',
  'plugin-development',
  'config',
  'data-model',
  'secondary-development',
  'quick-reference',
];
const REF = [
  'cordis-methodology',
  'cordis-pattern-report',
  'tauri-duckdb-plugin-runtime',
  'tick-stock-panel-contracts',
];

/**
 * 把源码 `docs/**` 里的相对链接解析成站内路由（只做「组织/呈现」，不改源文档）。
 * 支持「带不带锚点」「带不带 .md/.mdx 后缀」「reference/、diagrams/ 前缀」。
 * 外部链接 / 页内 `#` 锚点 / 绝对路径 原样返回。
 */
export function resolveDocsHref(href: string): string {
  if (!href) return href;
  const h = href.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(h)) return href; // http(s):// 等
  if (h.startsWith('mailto:') || h.startsWith('tel:')) return href;
  if (h.startsWith('/') || h.startsWith('#')) return href; // 绝对路径 / 页内锚点

  let m = h.match(/^(?:docs\/)?reference\/([a-z0-9-]+)\.mdx?(#.*)?$/i);
  if (m) return `/docs/reference/${m[1].toLowerCase()}${m[2] ?? ''}`;

  m = h.match(/^(?:docs\/)?diagrams\/([a-z0-9-]+)(?:\.html)?(#.*)?$/i);
  if (m) return `/docs/diagrams/${m[1].toLowerCase()}${m[2] ?? ''}`;

  m = h.match(/^(?:docs\/)?([a-z0-9-]+)\.mdx?(#.*)?$/i);
  if (m) {
    const name = m[1].toLowerCase();
    if (CORE.includes(name)) return `/docs/${name}${m[2] ?? ''}`;
    if (REF.includes(name)) return `/docs/reference/${name}${m[2] ?? ''}`;
  }
  return href;
}

export interface DocsLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children?: ReactNode;
}

/** 用作 MDX 的 `a` 组件：内部文档相对链接解析为站内 `<Link>`，外部保留原样。 */
export function DocsLink({ href, children, ...props }: DocsLinkProps) {
  if (!href) return <a {...props}>{children}</a>;
  const isExternal = /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith('mailto:');
  const resolved = resolveDocsHref(href);

  if (!isExternal && resolved !== href) {
    return (
      <Link href={resolved} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      {...(isExternal ? { target: '_blank', rel: 'noreferrer' } : {})}
      {...props}
    >
      {children}
    </a>
  );
}