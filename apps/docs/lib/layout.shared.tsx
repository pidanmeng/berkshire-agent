import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName } from './shared';

/**
 * 首页 / /docs 两块布局共享的导航配置。
 * 仓库暂无配置远程 Git（.git/config 无 remote），故不提供 githubUrl，避免死链。
 */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    links: [
      { text: '首页', url: '/' },
      { text: '架构文档', url: '/docs/architecture' },
    ],
  };
}