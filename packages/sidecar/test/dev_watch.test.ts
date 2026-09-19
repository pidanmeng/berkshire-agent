/**
 * dev 态热更 watcher 的路径过滤单测（T3 dev，bun test）。只测纯函数 `isSidecarHalf`：
 * 只有喂进 sidecar 快照的「半身」才触发重装配；组件 `.tsx`（Vite Fast Refresh 负责）、
 * 测试/示例不触发。不碰真实文件系统监控。
 */
import { describe, expect, test } from "bun:test"
import { isSidecarHalf } from "../src/dev_watch"

describe("isSidecarHalf（dev 态插件热更的过滤边界）", () => {
  test("插件 sidecar 半身 src/index.ts → 重装配", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/src/index.ts")).toBe(true)
  })

  test("插件 webview 半身里的非组件源码：样式编译产物 styles.generated.ts（client/*.ts）→ 重装配", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/src/client/styles.generated.ts")).toBe(true)
  })

  test("样式作者源 *.module.css 不直配（改后经 compile:styles 重生成产物才驱动 reload）→ 不触发", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/src/client/fundFlow.module.css")).toBe(false)
  })

  test("core 编织定义 → 重装配", () => {
    expect(isSidecarHalf("C:/repo/packages/core/src/services/slots.ts")).toBe(true)
  })

  test("bundle patch（enable/disable 覆盖）→ 重装配", () => {
    expect(isSidecarHalf("C:/repo/packages/bundle/demo/cordis.patch.yml")).toBe(true)
  })

  test("组件 .tsx（归 Vite Fast Refresh，不重启 sidecar）→ 不触发", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/src/client/demoMoneyFlow.tsx")).toBe(false)
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/src/client/demoFundFlow.tsx")).toBe(false)
  })

  test("测试/示例文件 → 不触发", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/test/foo.test.ts")).toBe(false)
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/examples/smoke.ts")).toBe(false)
  })

  test("无关文件 → 不触发", () => {
    expect(isSidecarHalf("C:/repo/packages/plugins/demo/package.json")).toBe(false)
    expect(isSidecarHalf("C:/repo/packages/sidecar/src/protocol.ts")).toBe(false)
  })
})