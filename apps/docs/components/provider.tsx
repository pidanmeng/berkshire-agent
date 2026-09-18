'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import { type ReactNode } from 'react';
import Search from '@/components/search';

/**
 * 根 Provider：主题（明暗）+ 全程搜索对话框（Ctrl/Cmd+K）。
 * 对应 Fumadocs 官方脚手架的布局约定。
 */
export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog: Search }}>{children}</RootProvider>
  );
}