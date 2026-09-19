/**
 * client 模块加载器单测（T1，bun test）。覆盖：bundle 名 → 本地模块解析、未知 bundle 返回
 * undefined（fail-closed）、scoped 样式标签的 HTML 形态。不碰 DOM（只测纯函数）。
 */
import { describe, expect, test } from "bun:test"
import { loadClientModule, moduleStyleTag } from "./loader"

describe("loadClientModule（client/list 快照 → 本地模块）", () => {
  test("已知 bundle → 返回本地模块定义", () => {
    const def = loadClientModule("client/demo-minimal.js")
    expect(def).toBeDefined()
    expect(def?.bundle).toBe("client/demo-minimal.js")
    expect(typeof def?.component).toBe("function")
  })

  test("未知 bundle → undefined（调用方 fail-closed 降级）", () => {
    expect(loadClientModule("client/not-registered.js")).toBeUndefined()
    expect(loadClientModule("")).toBeUndefined()
  })
})

describe("moduleStyleTag（能力块 C：scoped 样式标签）", () => {
  test("生成带 data-bk-module={id} 的 style 标签", () => {
    const html = moduleStyleTag("demo-minimal", ".bk-demo-minimal{color:red}")
    expect(html).toBe('<style data-bk-module="demo-minimal">.bk-demo-minimal{color:red}</style>')
  })
})