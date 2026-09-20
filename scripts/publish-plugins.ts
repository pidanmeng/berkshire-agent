/**
 * 发布 `@berkshire/*` 到 npm（CI：`.github/workflows/release.yml` 的 `publish-plugins` job）。
 *
 * 规则：
 * - 按依赖拓扑「lib 在前、插件在后」逐个 `npm publish`，保证已发布 lib 可被后续插件依赖解析。
 * - npm 不接受 `workspace:*` 依赖范围：发布前把每个包 `package.json` 里的 `workspace:*`
 *   （dependencies / peerDependencies / devDependencies / optionalDependencies）临时改写成
 *   兄弟包**当前 version** 的 `^range`，发布完成后**还原原文件**（fail-safe，异常也还原）。
 * - 幂等：`npm view <name>@<version>` 命中的版本视为已发布、跳过（重跑不报错）。
 * - fail-closed：包未构建（缺 `dist/`）或改写遇未知 workspace 依赖即响亮失败。
 *
 * 需要的环境：
 * - `NODE_AUTH_TOKEN`（npm token，CI 由 setup-node + secrets 注入）；缺失时 `npm publish` 自然失败。
 * - 登录 registry（CI 用 `registry-url: https://registry.npmjs.org`）。
 * 可选：`PUBLISH_ACCESS`（默认 `public`；@berkshire scope 未在 org 层面开只读时需显式 public）。
 */
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// 发布顺序 = 依赖拓扑、name→packages 目录都来自 `scripts/modules.ts`（单一事实源），本脚本不再
// 自备一份清单，避免与 build-packages 漂移（此前已发生过 cordis 目录改名 `cordis-vendor` 但这里
// 仍指向旧目录 `cordis`、导致 publish 预检 ENOENT 的回归）。
import { MODULES } from "./modules";

const REPO = resolve(import.meta.dir, "..");

/** 发布顺序 = `MODULES` 定义顺序（lib 在前、插件在后）。 */
const ORDER: readonly string[] = MODULES.map((m) => m.name);

/** name → packages 下相对目录（derive 自 `MODULES`）。 */
const DIRS: Record<string, string> = Object.fromEntries(MODULES.map((m) => [m.name, m.dir]));

const DEP_FIELDS = [
  "dependencies",
  "peerDependencies",
  "devDependencies",
  "optionalDependencies",
] as const;

async function alreadyPublished(name: string, version: string): Promise<boolean> {
  try {
    const out = await $`npm view ${name}@${version} version`.quiet();
    return out.stdout.toString().trim().length > 0;
  } catch {
    return false; // 404 等 → 未发布
  }
}

/** 把 `workspace:*` 改写成 `^<version>`；返回是否有改动。未知 workspace 依赖 → 响亮失败。 */
function rewriteWorkspaceDeps(
  pkg: Record<string, unknown>,
  versionOf: (name: string) => string,
): { changed: boolean } {
  let changed = false;
  for (const field of DEP_FIELDS) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (!deps || typeof deps !== "object") continue;
    for (const key of Object.keys(deps)) {
      const raw = deps[key];
      if (typeof raw === "string" && raw.startsWith("workspace:")) {
        const version = versionOf(key);
        if (!version) {
          throw new Error(
            `[publish] "${key}" 是 unknown workspace 依赖（不在发布清单内），无法改写为版本。`,
          );
        }
        deps[key] = `^${version}`;
        changed = true;
      }
    }
  }
  return { changed };
}

async function main(): Promise<void> {
  const access = process.env.PUBLISH_ACCESS ?? "public";

  // 1) 预检：读出版本 + 校验 dist 已构建（发布前必须先 build:packages）。
  const versions: Record<string, string> = {};
  for (const name of ORDER) {
    const dir = resolve(REPO, "packages", DIRS[name]);
    const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as {
      version: string;
    };
    versions[name] = pkg.version;
    if (!existsSync(resolve(dir, "dist"))) {
      throw new Error(`[publish] ${name} 缺 dist/ —— 发布前先跑 \`bun run build:packages\``);
    }
  }

  // 2) 逐个：改写 → 发布 → 还原。
  for (const name of ORDER) {
    const dir = resolve(REPO, "packages", DIRS[name]);
    const pkgFile = resolve(dir, "package.json");
    const before = readFileSync(pkgFile, "utf8");
    const pkg = JSON.parse(before) as Record<string, unknown>;
    const { changed } = rewriteWorkspaceDeps(pkg, (dep) => versions[dep] ?? "");
    if (changed) writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

    try {
      if (await alreadyPublished(name, versions[name])) {
        console.log(`[publish] ⏭ ${name}@${versions[name]} 已发布，跳过`);
        continue;
      }
      await $`npm publish ${dir} --access ${access} --no-git-checks`.cwd(REPO);
      console.log(`[publish] ✔ ${name}@${versions[name]}`);
    } finally {
      // 无论成败都还原原始 package.json，保证本地工作区不被发布改写污染。
      writeFileSync(pkgFile, before);
    }
  }
  console.log("[publish] all @berkshire/* packages published");
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});