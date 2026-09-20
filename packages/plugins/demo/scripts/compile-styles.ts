/**
 * demo 插件样式编译步骤（P3：插件独立打包阶段编译 CSS Modules）。
 *
 * 把 `src/client/<name>.module.css`（作者源）用 **lightningcss** 编译成
 * `{ classNames: { 局部名 → 哈希类名 }, css: 注入代码 }`，产出 `src/client/styles.generated.ts`。
 *
 * 目的：
 * - **消掉 `.bk-demo-*` 人肉前缀**：类名由构建期 hash 自动唯一，作用域仍由 sidecar `data-bk-module`
 *   归属保证；
 * - **host 只注入、不参与哈希**：`.tsx` 组件与 sidecar 侧都 import 这份**已编译**模块——组件拿哈希
 *   类名、sidecar 拿注入 css，二者同源，host 拿到注入代码只塞 `<style data-bk-module>`。
 * - 这是对齐 dsh `tsdown.client.ts` 里 lightningcss CSS Modules 用法的 BK 落地；正式的独立
 *   `bk://` 远程 bundle 打包仍 v-next（本步骤先落地最小件）。
 *
 * 运行：`bun run --cwd packages/plugins/demo compile:styles`
 * 产物：`src/client/styles.generated.ts`（应提交，勿手改——由本脚本生成）。
 */
import { transform } from "lightningcss"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CLIENT = join(import.meta.dir, "..", "src", "client")
const MODULES = ["fundFlow", "watchlistToolbar", "moneyFlow", "navExtra", "statusItem", "settingsCard"] as const
const OUT = join(CLIENT, "styles.generated.ts")

interface CompiledModuleStyle {
  classNames: Record<string, string>
  css: string
}

function compile(name: string): CompiledModuleStyle {
  const filename = `${name}.module.css`
  const code = readFileSync(join(CLIENT, filename), "utf8")
  const result = transform({
    filename,
    code: Buffer.from(code),
    cssModules: true,
    minify: true,
  })
  // lightningcss exports：局部类名 → { name: 哈希名, ... }，展平为 局部名 → 哈希名。
  const classNames: Record<string, string> = {}
  for (const [local, v] of Object.entries(result.exports ?? {})) {
    classNames[local] = (v as { name: string }).name
  }
  // 正常 .module.css 必有局部类名映射；若为空（如纯 :global 无处可哈希）则**响亮失败**（fail-closed），
  // 宁可报错也不产出非唯一类名绕过作用域保证（见能力缝 fail-closed 纪律）。
  if (Object.keys(classNames).length === 0) {
    throw new Error(
      `[compile-styles] ${filename} 未产出任何局部类名映射（纯 :global？），拒绝生成非哈希类名`,
    )
  }
  return { classNames, css: result.code.toString() }
}

function typesHeader(): string {
  return `/**
 * @generated 由 packages/plugins/demo/scripts/compile-styles.ts 生成（插件独立打包阶段，
 * lightningcss 编译 .module.css → 哈希类名 + 注入代码）。**请勿手改。**
 *
 * 供给侧约定：\`.tsx\` webview 半身 import 本文件的 classNames 拿到哈希类名；
 * sidecar 侧 import 本文件的 css 作为注入代码经 \`client/list\` 交给 host。
 * host（loader.ts）只把 css 塞进 \\\`<style data-bk-module>\\\`，不参与哈希。
 */
`
}

function main(): void {
  const blocks = MODULES.map(
    (name) =>
      `export const ${name}: CompiledModuleStyle = ${JSON.stringify(compile(name), null, 2)}`,
  ).join("\n\n")
  const src =
    typesHeader() +
    `export interface CompiledModuleStyle { classNames: Record<string, string>; css: string }\n\n` +
    blocks +
    `\n`
  writeFileSync(OUT, src)
  process.stderr.write(`[compile-styles] wrote ${OUT}\n`)
}

main()