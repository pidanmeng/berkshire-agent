'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export interface DiagramPanelProps {
  /** 图名，对应 docs/diagrams/<name>.html（经 /diagrams/<name> 路由返回） */
  name: string;
  /** 展示标题 */
  title: string;
  /** 简介文案 */
  description?: string;
  /** iframe 高度（px 或任意 CSS length） */
  height?: string;
  /** 四图所用 archify HTML 是否为独立文件 */
  standalone?: boolean;
}

/**
 * 内嵌 archify 生成的独立交互 HTML 图。
 *
 * 嵌入方式（取舍）：采用 <iframe src="/diagrams/<name>.html?embed=1">，
 * 因为 archify 输出是自带 JS/主题/工具栏的独立 HTML，直接 iframe 可以完整保留
 * 交互与明暗自适应，且与站点主题互不干扰；缺点是 iframe 内无法直接做站点内
 * 的锚点跳转，因此额外提供「在新标签中打开原图」直链作为独立查看入口。
 * 若 iframe 被宿主 CSP 等限制，直链仍保证图真实可看（不为死链）。
 */
export function DiagramPanel({
  name,
  title,
  description,
  height = '560px',
  standalone = true,
}: DiagramPanelProps) {
  // 让 iframe 跟随站点主题（archify 支持 ?theme=light|dark）
  const { resolvedTheme } = useTheme();
  const [theme, setTheme] = useState<string | undefined>(undefined);
  useEffect(() => {
    setTheme(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [resolvedTheme]);

  const src = `/diagrams/${name}?embed=1${theme ? `&theme=${theme}` : ''}`;

  return (
    <figure className="my-6 not-prose flex flex-col gap-3">
      {description ? (
        <figcaption className="text-sm text-fd-muted-foreground">{description}</figcaption>
      ) : null}
      <div
        className="overflow-hidden rounded-lg border border-fd-border bg-fd-background"
        style={{ height }}
      >
        <iframe
          src={src}
          title={title}
          className="h-full w-full border-0"
          loading="lazy"
          allowFullScreen
        />
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a
          className="font-medium text-fd-primary underline underline-offset-4"
          href={`/diagrams/${name}`}
          target="_blank"
          rel="noreferrer"
        >
          在新标签中打开原图 ↗
        </a>
        {standalone ? (
          <span className="text-fd-muted-foreground">
            独立 HTML 交互图（archify），内嵌于 iframe；原文件：docs/diagrams/{name}.html
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}