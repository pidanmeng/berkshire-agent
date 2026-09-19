/**
 * client 模块加载器单测（T1，bun test）。覆盖：bundle 名 → 本地模块解析、未知 bundle 返回
 * undefined（fail-closed）。不碰 DOM（只测纯函数）。scoped 样式注入路径（`injectModuleStyle`
 * 建 `<style data-bk-module>`）由 `ClientModuleHost` 端到端面覆盖。
 */
import { describe, expect, test } from "bun:test"
import { loadClientModule } from "./loader"

describe("loadClientModule（client/list 快照 → 本地模块）", () => {
  test("已知 bundle → 返回本地模块定义", () => {
    const footer = loadClientModule("client/demo-fund-flow.js")
    expect(footer).toBeDefined()
    expect(footer?.bundle).toBe("client/demo-fund-flow.js")
    expect(typeof footer?.component).toBe("function")

    const toolbar = loadClientModule("client/demo-watchlist-toolbar.js")
    expect(toolbar?.bundle).toBe("client/demo-watchlist-toolbar.js")
    expect(typeof toolbar?.component).toBe("function")

    const menu = loadClientModule("client/demo-money-flow.js")
    expect(menu?.bundle).toBe("client/demo-money-flow.js")
    expect(typeof menu?.component).toBe("function")
  })

  test("未知 bundle → undefined（调用方 fail-closed 降级）", () => {
    expect(loadClientModule("client/not-registered.js")).toBeUndefined()
    expect(loadClientModule("")).toBeUndefined()
  })
})