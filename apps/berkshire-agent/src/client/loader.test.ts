/**
 * client 模块加载器单测（M3，bun test）。覆盖：
 * - `importClientModule(url, exportName)`：运行时 `import(url)` + 取具名导出（真实文件夹具）；
 *   缺导出 → fail-closed 抛错；
 * - `buildSharedImportMap`（纯函数）：共享裸名 → URL 的映射组装（空映射合法）。
 *   `injectSharedImportMap`（DOM 副作用）由 ClientModuleHost 端到端面覆盖。
 */
import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { importClientModule, injectModuleStyle, normalizeClientUrl, type ClientComponent } from "./loader"
import { buildSharedImportMap, SHARED_IMPORTS } from "../lib/sharedImportMap"

describe("importClientModule（运行时 import + 具名导出）", () => {
  test("导入真实模块并取具名导出；缺省 default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bk-loader-"))
    const file = join(dir, "mod.ts")
    writeFileSync(
      file,
      `export const Demo = (_: { context: unknown }) => "component-ok";\nexport default "default-export";`,
    )
    const url = pathToFileURL(file).href
    try {
      const named = await importClientModule<ClientComponent>(url, "Demo")
      expect(typeof named).toBe("function")
      const byDefault = await importClientModule<string>(url)
      expect(byDefault).toBe("default-export")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("缺具名导出 → 响亮抛错（fail-closed）", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bk-loader-bad-"))
    const file = join(dir, "mod.ts")
    writeFileSync(file, `export const Only = 1;`)
    const url = pathToFileURL(file).href
    try {
      await expect(importClientModule<unknown>(url, "Missing")).rejects.toThrow(/无具名导出/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe("normalizeClientUrl（dev workspace file:// → Vite /@fs）", () => {
  const win = globalThis as { window?: unknown }
  const prevWindow = win.window

  test("bk:// / http(s):// 原样透传", () => {
    expect(normalizeClientUrl("bk:///node_modules/a/dist/client/index.js")).toBe(
      "bk:///node_modules/a/dist/client/index.js",
    )
    expect(normalizeClientUrl("https://cdn.example/x.js")).toBe("https://cdn.example/x.js")
    expect(normalizeClientUrl("http://127.0.0.1:1420/x.js")).toBe("http://127.0.0.1:1420/x.js")
  })

  test("浏览器（window 存在，Vite dev webview）下 file:// → /@fs 绝对路径", () => {
    win.window = {}
    try {
      expect(
        normalizeClientUrl("file:///C:/Code/berkshire-agent/packages/plugins/demo/src/client/index.tsx"),
      ).toBe("/@fs/C:/Code/berkshire-agent/packages/plugins/demo/src/client/index.tsx")
    } finally {
      win.window = prevWindow
    }
  })

  test("非浏览器（Node/bun test，无 window）下 file:// 原样直接 import", () => {
    win.window = prevWindow // 保持测试环境的无 window 态
    expect(normalizeClientUrl("file:///C:/tmp/mod.ts")).toBe("file:///C:/tmp/mod.ts")
  })
})

describe("injectModuleStyle（scoped 样式注入）", () => {
  test("写入 <style data-bk-module> 到 head；disposer 移除它", () => {
    interface FakeStyleEl {
      attrs: Record<string, string>
      textContent: string
      setAttribute: (k: string, v: string) => void
      remove: () => void
    }
    const created: FakeStyleEl[] = []
    const removed: unknown[] = []
    const fakeDoc = {
      createElement: () => {
        const el: FakeStyleEl = {
          attrs: {},
          textContent: "",
          setAttribute(k, v) {
            el.attrs[k] = v
          },
          remove() {
            removed.push(el)
          },
        }
        created.push(el)
        return el
      },
      head: { appendChild: () => {} },
    }
    const prev = (globalThis as unknown as { document?: unknown }).document
    ;(globalThis as unknown as { document?: unknown }).document = fakeDoc
    try {
      const off = injectModuleStyle("m1", ".x{}") // 真正调用，不再包成永不执行的闭包
      expect(created).toHaveLength(1)
      expect(created[0]!.attrs["data-bk-module"]).toBe("m1")
      expect(created[0]!.textContent).toBe(".x{}")
      expect(removed).toHaveLength(0)
      off()
      expect(removed).toHaveLength(1) // disposer 移除刚注入的 style
    } finally {
      ;(globalThis as unknown as { document?: unknown }).document = prev
    }
  })
})

describe("buildSharedImportMap（共享依赖 import-map 表）", () => {
  test("空映射合法；填入项只包含 SHARED_IMPORTS 内裸名", () => {
    expect(buildSharedImportMap()).toEqual({ imports: {} })
    const map = buildSharedImportMap({ react: "/assets/react.js" })
    expect(map.imports["react"]).toBe("/assets/react.js")
    expect(Object.keys(map.imports).every((k) => (SHARED_IMPORTS as readonly string[]).includes(k))).toBe(true)
  })
})