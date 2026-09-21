/**
 * data-manager 插件样式编译步骤（P3：插件独立打包阶段编译 CSS Modules）。
 *
 * 镜像 `@berkshire/plugin-demo/scripts/compile-styles.ts`：把 `src/client/<name>.module.css`
 * （作者源）用 **lightningcss** 编译成 `{ classNames, css }`，产出 `src/client/styles.generated.ts`
 * （应提交，勿手改）。`.tsx` webview 半身拿哈希类名、sidecar 半身拿注入 css，二者同源。
 *
 * 运行：`bun run --cwd packages/plugins/data-manager compile:styles`
 */
import { transform } from "lightningcss"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CLIENT = join(import.meta.dir, "..", "src", "client")
const MODULES = ["dataManager"] as const
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
  const classNames: Record<string, string> = {}
  for (const [local, v] of Object.entries(result.exports ?? {})) {
    classNames[local] = (v as { name: string }).name
  }
  if (Object.keys(classNames).length === 0) {
    throw new Error(
      `[compile-styles] ${filename} 未产出任何局部类名映射（纯 :global？），拒绝生成非哈希类名`,
    )
  }
  return { classNames, css: result.code.toString() }
}

function typesHeader(): string {
  return `/**
 * @generated 由 packages/plugins/data-manager/scripts/compile-styles.ts 生成（插件独立打包阶段，
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
