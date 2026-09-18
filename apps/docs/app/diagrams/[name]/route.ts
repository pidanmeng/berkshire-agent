import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ALLOWED = ['architecture', 'dataflow', 'lifecycle', 'sequence'];

/**
 * 直接以仓库 `/docs/diagrams/<name>.html`（单一事实来源）作为 iframe / 直链的内容，
 * 不复制到 public，避免维护两份。
 *
 * GET /diagrams/<name>?embed=1&theme=dark  -> 返回该类 HTML（query 由 archify 脚本读取）。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!ALLOWED.includes(name)) return new Response('Not found', { status: 404 });

  // Next 以 apps/docs 为 cwd 运行；仓库 docs 位于 ../../docs
  const repoDocs = path.resolve(process.cwd(), '../..', 'docs');
  const file = path.join(repoDocs, 'diagrams', `${name}.html`);
  try {
    const html = await readFile(file, 'utf8');
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}