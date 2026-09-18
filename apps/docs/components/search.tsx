'use client';

import SearchDialogDefault from 'fumadocs-ui/components/dialog/search-default';
import type { SharedProps } from 'fumadocs-ui/components/dialog/search';

/**
 * 站点搜索对话框。走 /api/search（fumadocs-core createFromSource）本地索引，
 * 内容即直接挂载的仓库 docs/**（含 reference；四张图说明页为站点自有路由，不入索引）。
 */
export default function Search(props: SharedProps) {
  return <SearchDialogDefault {...props} />;
}