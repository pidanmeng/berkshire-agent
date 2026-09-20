/**
 * 全仓包构建（M0 自打包底座）：按依赖顺序为每个可发布包产出 `dist/`。
 * 顺序 = 依赖拓扑：core → boot → sidecar → theme → ui-slots → notify-console → demo → base-ui。
 * 运行报错即中止（任一包 build 失败，后续包无法正确解析其 dist）。
 *
 * 两个前置（缺一即「打包失败/不打包」）：
 * - 单包 `tsc -p tsconfig.build.json` 用 workspace 软链解析 `@berkshire/*` → 依赖包的 `dist/`
 *   （build tsconfig 不配 `paths`，刻意走 dist）。若 `node_modules/@berkshire/*` 缺链接
 *   （尤其 cordis/ui-slots/base-ui），先执行 `bun install` 重建，否则会报 TS2307 找不到模块。
 * - 必须用 `bun run --cwd <dir> <script>`（`--cwd` 在 `run` 之后）；`bun --cwd <dir> run build`
 *   只会打印 usage、**不执行**构建（此写法正是本脚本此前「成功却不打包」的根因）。
 *
 * 插件先于宿主：宿主 dev/build 引用的是插件「打包后的产物」（package.json `exports` → `dist`），
 * 所以在宿主开发或打包前必须先把全部（至少插件链）包构建出 `dist/`。根 `dev`/`build`/`tauri:dev`/
 * `bundle` 脚本已先跑本脚本。
 *
 * 用法：
 *   bun scripts/build-packages.ts          # 全量（含 sidecar）
 *   bun scripts/build-packages.ts plugins  # 仅插件链（cordis/core/boot/theme/ui-slots + 三个插件；不含 sidecar）
 */
import { $ } from "bun";
// 可发布包拓扑的**单一事实源**：`scripts/modules.ts`（name/dir/pluginChain）。顺序=依赖拓扑、
// 全量 vs 插件链都从这里取，避免与 publish-plugins 的清单各自维护而漂移（此前已发生过 cordis
// 目录改名 `cordis-vendor`，但发布脚本仍指向旧目录 `cordis` 的回归）。
import { ALL, PLUGIN_CHAIN } from "./modules";

const scope = process.argv[2] ?? "all";
const targets = scope === "plugins" ? PLUGIN_CHAIN : ALL;

for (const m of targets) {
  // 注意必须用 `bun run --cwd <dir> <script>`（`--cwd` 在 `run` 之后）；`bun --cwd <dir> run build`
  // 会被 bun 解析成打印 usage 帮助、且**不执行**构建（A_EXIT=0 但 dist 不产出）——那正是此前
  // build:packages 一直「成功却不打包」的根因。
  await $`bun run --cwd packages/${m.dir} build`;
  console.log(`[build:packages] ✔ ${m.dir}`);
}
console.log(`[build:packages] all packages built to dist/ (scope=${scope})`);