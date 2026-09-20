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
 * 与 `bun run dev` 分进程运行：开一个终端跑 `dev:plugins`（构建 watcher），另一个跑 `bun run dev`
 * （Vite + 可选 tauri:dev）。本脚本不替代 sidecar 的 dev_watch——那是「通知宿主重装配」半身；
 * 本脚本补「把源码变更编译成 dist」这前半段。
 */
import { existsSync, watch, type FSWatcher } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { $ } from "bun";

const REPO = resolve(import.meta.dir, "..");

/** 监听根（各自递归）：lib 源码 + 插件源码。 */
const PACKAGES: Array<{ name: string; rel: string; src: string }> = [
  ...["cordis-vendor", "core", "boot", "sidecar", "theme", "ui-slots"].map((n) => ({
    name: n,
    rel: n,
    src: resolve(REPO, "packages", n, "src"),
  })),
  ...["notify-console", "demo", "base-ui"].map((n) => ({
    name: n,
    rel: `plugins/${n}`,
    src: resolve(REPO, "packages", "plugins", n, "src"),
  })),
].filter((p) => existsSync(p.src));

/** 把监听根下的文件路径归到属主包 rel；不是源码（dist/测试/示例）→ null，避免 dist 写回造成死循环。 */
function ownerOf(full: string): string | null {
  const norm = full.replace(/\\/g, "/");
  if (/\/dist\//.test(norm)) return null; // 构建产物写回，不触发
  if (/\.test\.[cm]?ts$/.test(norm)) return null;
  if (/\/examples\//.test(norm)) return null;
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