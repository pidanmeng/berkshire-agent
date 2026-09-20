/**
 * `@berkshire/ui` 生产构建（与 `@berkshire/ui-slots` 同款底座）。
 *
 * 纯 tsc 会留下 `import "./*.module.css"`（宿主 Vite 无法解析，host build 必挂）。故：
 * 1) `bun build --target=browser` 把 React 原子组件与 CSS Modules 编译成可发布 ESM
 *    （哈希类名进 JS、css 规则进 `dist/index.css`）；`react` 走 `--external`（宿主注入），
 *    `clsx` 非 external（内联打进产物，自包含）。
 * 2) 在入口 JS 顶部补 `import "./index.css";`（bun 产出的 css 是独立 asset，需引用才有样式）。
 * 3) `tsc --emitDeclarationOnly` 出 `.d.ts`（`.module.css` 由 `src/css-modules.d.ts` ambient 声明解析）。
 *
 * 诚实：本包只产 ESM（`dist/index.js`）；不产 CJS/UMD。消费方（宿主/插件）走 React 19 并注入。
 */
import { $ } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = resolve(import.meta.dir, "..");
const entry = resolve(pkg, "src/index.ts");
const outdir = resolve(pkg, "dist");

// 1) JS + CSS（react 走 external → 宿主提供；clsx 内联 → 自包含；CSS Modules 内联）
await $`bun build ${entry} --outdir ${outdir} --target=browser --format=esm --external react --external react/jsx-runtime --external react/jsx-dev-runtime`;

// 2) 在入口顶部补 CSS import（幂等）
const jsPath = resolve(outdir, "index.js");
const js = readFileSync(jsPath, "utf8");
if (!js.startsWith(`import "./index.css";`)) {
  writeFileSync(jsPath, `import "./index.css";\n` + js);
}

// 3) 声明文件（不出重，只出类型）
await $`bunx tsc -p ${resolve(pkg, "tsconfig.build.json")} --emitDeclarationOnly`;