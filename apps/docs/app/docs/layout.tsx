import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { diagrams, sidebarOrder } from '@/lib/shared';
import type { Folder, Node, Root } from 'fumadocs-core/page-tree';

/** 从树节点里提取顶层 slug（页面项取 url 末段；分组项取 $ref.folder 末段）。 */
function slugOf(node: unknown): string {
  const n = node as { url?: string; $ref?: { folder?: string } };
  if (n?.url) return n.url.split('/').filter(Boolean).pop() ?? '';
  const ref = n?.$ref?.folder;
  if (ref) return ref.split(/[\\/]/).filter(Boolean).pop() ?? '';
  return '';
}

/**
 * 顶层节点浅拷贝。`source.getPageTree()` 返回的是加载器缓存的**树单例**（跨请求共享），
 * 任何原地修改（改名、重排、追加分组）都会污染该单例，导致组件被多次调用时侧边栏不断叠加
 * ——表现为每刷新一次就多出一个「图 Diagrams」。因此这里先拷贝一层再改，绝不动源树。
 */
function cloneTopLevelNodes(nodes: readonly Node[]): Node[] {
  return nodes.map((n) => ({ ...n }));
}

/**
 * 内容直接从 `../../docs` 挂载（见 lib/source.ts）。侧边栏主序与展示名由本站维护：
 * - 把顶层页面按 sidebarOrder 排好序、把 reference 折叠分组改成「参考 Reference」；
 * - 丢掉 `docs/diagrams/` 目录自动生成的空「Diagrams」分组（那只是一堆 archify 的
 *   `.html`/`.json` 产物，没有可读页面）；
 * - 追加「图 Diagrams」分组（四张图是本站自己的展示路由，不在 docs/** 内，故在此并入树）。
 * 全程只操作一份拷贝，不污染 `getPageTree()` 缓存的树单例。
 */
export default function Layout({ children }: LayoutProps<'/docs'>) {
  const root = source.getPageTree() as Root;
  const order = new Map(sidebarOrder.map((s, i) => [s.slug, i]));
  const orderOf = (n: unknown) => order.get(slugOf(n));

  // 在拷贝上操作，绝不动 `source.getPageTree()` 共享的树对象
  const childNodes = cloneTopLevelNodes(root.children);
  childNodes.sort((a, b) => {
    const ia = orderOf(a);
    const ib = orderOf(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return 0;
  });

  const kept: Node[] = [];
  for (const c of childNodes) {
    // 丢弃 docs/diagrams/ 目录的空分组，图内容由下方「图 Diagrams」分组接管
    if (c.type === 'folder' && slugOf(c) === 'diagrams') continue;

    // 把 reference 分组重命名为「参考 Reference」（作用于拷贝，不影响单例）
    if (c.type === 'folder' && slugOf(c) === 'reference') {
      const f = c as Folder;
      f.name = '参考 Reference';
      f.collapsible = true;
      f.defaultOpen = false;
    }
    kept.push(c);
  }

  // 追加「图 Diagrams」分组（每次调用新建一份，不会在拷贝上叠加）
  const diagramFolder: Folder = {
    type: 'folder',
    name: '图 Diagrams',
    collapsible: true,
    defaultOpen: true,
    children: diagrams.map((d) => ({
      type: 'page',
      name: d.title.split('·')[0],
      url: `/docs/diagrams/${d.name}`,
    })),
  };
  kept.push(diagramFolder);

  // 全新根对象，绝不复写 `getPageTree()` 的缓存单例
  const tree: Root = { ...root, children: kept };

  return (
    <DocsLayout tree={tree} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}