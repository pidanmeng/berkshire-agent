import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    // 源码 docs/** 里 `diagrams/lifecycle.html` 这类相对链接，会解析到
    // `/docs/<页>/diagrams/xxx.html`，统一重写到图页面 `/docs/diagrams/<name>`。
    return [
      { source: '/docs/:slug(.*)/diagrams/:name.html', destination: '/docs/diagrams/:name' },
    ];
  },
};

export default withMDX(config);
