/**
 * `@berkshire/base-ui/client` 生产构建（M0 自打包底座）。
 *
 * webview 半身含 React/JSX + CSS Modules，tsc 直接 emit 会留下不可解析的 `.module.css` import，
 * 故用 bun build 出可发布 ESM（哈希类名进入 JS、css 规则进 `dist/client/index.css`），再：
 * 1. 在入口 JS 顶部补 `import "./index.css"`，让消费方（Vite host / bundler）注入样式——否则
 *    bun 产出的 `index.css` 是独立 asset、无人引用，壳样式会丢。
 * 2. 用 tsc `--emitDeclarationOnly` 出 `.d.ts`（`.module.css` 的运行时不做类型校验，靠
 *    `src/client/css-modules.d.ts` 的 ambient 声明解析）。
 */
import { $ } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = resolve(import.meta.dir, "..");
const entry = resolve(pkg, "src/client/index.tsx");
const outdir = resolve(pkg, "dist/client");

// 1) JS + CSS（React / 路由 / utils / 共享包走 external → peer，宿主注入）。
await $`bun build ${entry} --outdir ${outdir} --target=browser --format=esm --external react --external react-router-dom --external clsx --external @berkshire/theme --external @berkshire/ui-slots --external @berkshire/ui`;

// 2) 在入口顶部补 CSS import（幂等）。
const jsPath = resolve(outdir, "index.js");
const js = readFileSync(jsPath, "utf8");
if (!js.startsWith(`import "./index.css";`)) {
  writeFileSync(jsPath, `import "./index.css";\n` + js);
}

// 3) 声明文件。
await $`bunx tsc -p ${resolve(pkg, "tsconfig.build.json")} --emitDeclarationOnly`;