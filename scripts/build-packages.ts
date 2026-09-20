/**
 * 全仓包构建（M0 自打包底座）：按依赖顺序为每个可发布包产出 `dist/`。
 * 顺序 = 依赖拓扑：core → boot → sidecar → theme → ui-slots → notify-console → demo → base-ui。
 * 运行报错即中止（任一包 build 失败，后续包无法正确解析其 dist）。
 */
import { $ } from "bun";

const pkgs = [
  "cordis",
  "core",
  "boot",
  "sidecar",
  "theme",
  "ui-slots",
  "plugins/notify-console",
  "plugins/demo",
  "plugins/base-ui",
];

for (const p of pkgs) {
  await $`bun --cwd packages/${p} run build`;
  console.log(`[build:packages] ✔ ${p}`);
}
console.log("[build:packages] all packages built to dist/");