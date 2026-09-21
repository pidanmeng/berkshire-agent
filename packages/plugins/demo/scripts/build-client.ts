/**
 * `@berkshire/plugin-demo/client` 生产构建（M0 基座 + M3 webview 半身动态拉取前置）。
 *
 * sidecar 半身由 tsc 产出（`dist/index.js`）；而 **client 半身**要被 Tauri webview 经 `bk://`
 * 运行时 `import()`，tsc 直接 emit 会留下裸 specifier 链（且无 JSX runtime 适配），故用
 * `bun build --target=browser --format=esm` 出**可运行 ESM**：共享 `react`/JSX runtime 走
 * `--external`（宿主 import-map 解析），styles.generated（哈希类名 + css 常量）被 bun 内联进
 * 单文件。：先跑 tsc 的 `build`（出 JS + .d.ts，含 client 的 index.d.ts），再由本脚本把
 * `dist/client/index.js` 覆盖为 bun 的可 browsersafe 入口。.d.ts 不受影响。
 *
 * `@berkshire/ui`/`@berkshire/ui-slots`/`@berkshire/theme` 同样走 `--external`（host import-map
 * 解析），故本插件 client 半身对 S2 组件的复用不在 bundle 内重复打包。
 */
import { $ } from "bun";
import { resolve } from "node:path";

const pkg = resolve(import.meta.dir, "..");
const entry = resolve(pkg, "src/client/index.tsx");
const outdir = resolve(pkg, "dist/client");

// JS（React/JSX runtime 走 external → 宿主 import-map 提供；组件/样式常量内联进单文件）。
await $`bun build ${entry} --outdir ${outdir} --target=browser --format=esm --external react --external react/jsx-runtime --external react/jsx-dev-runtime --external @berkshire/ui-slots --external @berkshire/ui --external @berkshire/theme`;