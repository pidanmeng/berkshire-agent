/**
 * dev 态插件构建 watcher（`bun run dev:plugins`，配合宿主 dev 使用）。
 *
 * 背景：宿主在 dev/build 时引用的是插件「打包后的产物」（exports → dist），因此改一个插件源码后，
 * 必须先把该插件包（及其依赖链）重新 build 出 `dist/`，Vite/sidecar 才能吃到新产物。
 *
 * 本脚本监听 `packages/<lib>/src` 与 `packages/plugins/<plugin>/src` 下的真实源码（排除 `dist` 与测试），
 * 变更（debounce 250ms）后仅重构建「属主包」，并把新产物路径打印到 stderr：
 *   - 侧 half（`src/index.ts`）变更 → sidecar 的 `dev_watch.ts`（BK_DEV_HOTRELOAD=1 时）本就监听
 *     `src/index.ts`，会推 `dev/reload-requested` → 宿主重启 sidecar 重装配；
 *   - webview half（`src/client` 下组件源码）变更 → 重构建包后 Vite dev server 从磁盘重读新
 *     `dist/client` 产物并热更新。
 *
 * 监听清单**由 `scripts/modules.ts` 的 `MODULES` 派生**（与 build/publish 同一事实源，不再各自维护
 * 硬编码数组——此前硬编码曾漏掉 `ui`/`data-manager` 等包，导致改它们的 CSS/源码不触发重建、HMR
 * 永远吃旧 dist）。新增可发布包只需改 `modules.ts`，本脚本自动跟随。
 *
 * 与 `bun run dev` 分进程运行：开一个终端跑 `dev:plugins`（构建 watcher），另一个跑 `bun run dev`
 * （Vite + 可选 tauri:dev）。本脚本不替代 sidecar 的 dev_watch——那是「通知宿主重装配」半身；
 * 本脚本补「把源码变更编译成 dist」这前半段。
 */
import { existsSync, watch, type FSWatcher } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { $ } from "bun";
// 包拓扑单一事实源（`dir` 即 `packages/` 相对路径，覆盖 lib 与插件；含 pluginChain=false 的 sidecar——
// 它的 `src/index.ts` 变更同样要重建，供 BK_DEV_HOTRELOAD 重装配路径消费）。
import { MODULES } from "./modules";

const REPO = resolve(import.meta.dir, "..");

/** 监听根（各自递归）：全部可发布包的 src 源码。 */
const PACKAGES: Array<{ name: string; rel: string; src: string }> = MODULES.map((m) => ({
  name: m.name,
  rel: m.dir,
  src: resolve(REPO, "packages", m.dir, "src"),
})).filter((p) => existsSync(p.src));

/** 把监听根下的文件路径归到属主包 rel；不是源码（dist/测试/示例/编辑器临时文件）→ null，避免 dist 写回与保存瞬间造成死循环/无谓重建。 */
function ownerOf(full: string): string | null {
  const norm = full.replace(/\\/g, "/");
  if (/\/dist\//.test(norm)) return null; // 构建产物写回，不触发
  if (/\.test\.[cm]?ts$/.test(norm)) return null;
  if (/\/examples\//.test(norm)) return null;
  // 编辑器/IDE 原子保存的临时文件（Windows 上尤其常见）不是源码：`X~RF*.TMP`（rename 临时）、
  // `*.tmp`、以及 `.X.<pid>.<uuid>.tmpdir/`（atomic-save 临时目录，如 DSH/WebStorm 保存瞬间）。
  // 不忽略会在每次保存时触发一串无意义重建。
  if (/\.tmp$/i.test(norm)) return null;
  if (/\.tmpdir/.test(norm)) return null;
  for (const p of PACKAGES) {
    const prefix = `${p.src.replace(/\\/g, "/")}/`;
    if (norm.startsWith(prefix)) return p.rel;
  }
  return null;
}

async function main(): Promise<void> {
  if (PACKAGES.length === 0) {
    console.error("[dev:plugins] no src trees found under packages/");
    process.exit(1);
  }

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, Promise<void>>();
  const watchers: FSWatcher[] = [];

  const rebuild = async (rel: string) => {
    // 串行化同包的多次构建：前一次未结束则排队等待，避免并行 tsc 写同一 dist。
    const prev = pending.get(rel);
    const run = (prev ?? Promise.resolve()).then(async () => {
      try {
        // `--cwd` 必须在 `run` 之后（形式 B）；`bun --cwd <pkg> run build` 只打印 usage 不构建。
        await $`bun run --cwd packages/${rel} build`;
        process.stderr.write(`[dev:plugins] ✔ rebuilt ${rel} (dist updated; host HMR should pick it up)\n`);
        console.log(`[dev:plugins] ✔ rebuilt ${rel}`);
      } catch (err) {
        console.error(
          `[dev:plugins] ✘ rebuild failed for ${rel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }).finally(() => pending.delete(rel));
    pending.set(rel, run);
    await run;
  };

  const schedule = (rel: string) => {
    const prev = timers.get(rel);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      timers.delete(rel);
      await rebuild(rel);
    }, 250);
    timers.set(rel, t);
  };

  for (const p of PACKAGES) {
    try {
      const w = watch(p.src, { recursive: true }, (_event, filename) => {
        if (typeof filename !== "string" || filename === "") return;
        const full = resolve(p.src, filename);
        const rel = ownerOf(full);
        if (rel) {
          process.stderr.write(
            `[dev:plugins] change → ${relative(REPO, full).split(sep).join("/")} (rebuilding ${rel})\n`,
          );
          schedule(rel);
        }
      });
      watchers.push(w);
    } catch (err) {
      console.error(
        `[dev:plugins] watch failed for ${p.src}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(`[dev:plugins] watching ${PACKAGES.length} package src trees (Ctrl-C to stop)`);

  // 常驻：保持进程存活（recursive watch 由 fs 句柄维持，这里显式挂一个 interval 防止被 GC）。
  const keepAlive = setInterval(() => {}, 1 << 30);
  const shutdown = async () => {
    clearInterval(keepAlive);
    for (const [, t] of timers) clearTimeout(t);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* dev-only */
      }
    }
    // 等待在途构建停止后再退出。
    await Promise.allSettled(pending.values());
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();