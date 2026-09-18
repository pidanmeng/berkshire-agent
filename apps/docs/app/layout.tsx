import { Provider } from '@/components/provider';
import { appName } from '@/lib/shared';
import type { Metadata } from 'next';
import './global.css';

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s · ${appName}`,
  },
  description:
    'Berkshire Agent（BK）—— 全插件化 A 股投研桌面工作台的架构文档：架构 / 能力缝 / 插件开发 / 配置 / 数据模型 / 二次开发与状态 / 速查。',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen bg-fd-background text-fd-foreground font-sans antialiased">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}