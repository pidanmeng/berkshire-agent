/**
 * slot 注册表单测（T0，bun test）——随共享缝引擎迁至 `@berkshire/ui-slots`。
 *
 * 只测 `SlotRegistry` 的纯逻辑：校验（id 格式 / 重复 id / API 版本 / 未知槽位）、
 * 按 order 排序、disposer 可逆删除、快照不受后续突变影响。用全新实例，避免污染全局
 * `slotRegistry` 单例。哑组件不实际渲染任何 UI。
 */
import { describe, expect, test } from "bun:test"
import { SLOT_API_VERSION, SlotRegistry, type SlotComponent } from "../src/registry"

/** 哑组件：接受任意 object 上下文，便于各槽通用；仅作注册表测试，不渲染。 */
const Dummy: SlotComponent<object> = () => null

describe("SlotRegistry（前端 slot 注册表，T0）", () => {
  test("按 order ?? 100 排序（同值稳定）", () => {
    const reg = new SlotRegistry()
    const dX = reg.register("stock-preview.footer", { id: "x:footer", order: 30, component: Dummy })
    const dY = reg.register("stock-preview.footer", { id: "y:footer", component: Dummy }) // order 缺省 → 100
    const dZ = reg.register("stock-preview.footer", { id: "z:footer", order: 10, component: Dummy })

    expect(reg.getSnapshot("stock-preview.footer").map((r) => r.id)).toEqual(["z:footer", "x:footer", "y:footer"])

    dX()
    dY()
    dZ()
  })

  test("重复 id 在同槽内响亮拒绝", () => {
    const reg = new SlotRegistry()
    const d = reg.register("stock-preview.footer", { id: "a:footer", component: Dummy })
    expect(() => reg.register("stock-preview.footer", { id: "a:footer", component: Dummy })).toThrow(
      /重复 id/,
    )
    d()
  })

  test("不同槽位可同名 id（作用域是槽位）", () => {
    const reg = new SlotRegistry()
    const d1 = reg.register("stock-preview.footer", { id: "a:footer", component: Dummy })
    const d2 = reg.register("watchlist.toolbar", { id: "a:footer", component: Dummy })
    expect(reg.getSnapshot("stock-preview.footer")).toHaveLength(1)
    expect(reg.getSnapshot("watchlist.toolbar")).toHaveLength(1)
    d1()
    d2()
  })

  test("非法 id 格式拒绝（fail-closed）", () => {
    const reg = new SlotRegistry()
    expect(() => reg.register("stock-preview.footer", { id: "Bad Id!", component: Dummy })).toThrow(
      /非法 id/,
    )
    expect(() => reg.register("stock-preview.footer", { id: "no-colon", component: Dummy })).toThrow(
      /非法 id/,
    )
  })

  test("API 版本不匹配拒绝（fail-closed）；显式声明当前版本可通过", () => {
    const reg = new SlotRegistry()
    expect(() =>
      reg.register("stock-preview.footer", { id: "a:footer", component: Dummy, apiVersion: 999 }),
    ).toThrow(/API v999/)
    const d = reg.register("stock-preview.footer", {
      id: "a:footer",
      component: Dummy,
      apiVersion: SLOT_API_VERSION,
    })
    d()
  })

  test("未知 slot 拒绝（fail-closed）", () => {
    const reg = new SlotRegistry()
    // 运行时非法槽位名，类型上强制走 `as never`。
    expect(() => reg.register("not-a-slot" as never, { id: "a:footer", component: Dummy })).toThrow(
      /未知 slot/,
    )
  })

  test("应用壳布局槽可注册（侧边栏/状态栏/设置页挂点）", () => {
    const reg = new SlotRegistry()
    const dNav = reg.register("layout.navigation.extra", { id: "demo:nav", component: Dummy })
    const dFooter = reg.register("layout.sidebar.footer", { id: "demo:footer", component: Dummy })
    const dStatus = reg.register("layout.statusbar.right", { id: "demo:status", component: Dummy })
    const dCard = reg.register("settings.cards", { id: "demo:card", component: Dummy })
    expect(reg.getSnapshot("layout.navigation.extra")).toHaveLength(1)
    expect(reg.getSnapshot("layout.sidebar.footer")).toHaveLength(1)
    expect(reg.getSnapshot("layout.statusbar.right")).toHaveLength(1)
    expect(reg.getSnapshot("settings.cards")).toHaveLength(1)
    dNav()
    dFooter()
    dStatus()
    dCard()
  })

  test("disposer 可逆删除；getSnapshot 快照不受后续突变影响", () => {
    const reg = new SlotRegistry()
    const dA = reg.register("stock-preview.footer", { id: "a:footer", component: Dummy })
    const dB = reg.register("stock-preview.footer", { id: "b:footer", component: Dummy })
    expect(reg.getSnapshot("stock-preview.footer")).toHaveLength(2)

    const snapshot = reg.getSnapshot("stock-preview.footer")
    dA()
    expect(reg.getSnapshot("stock-preview.footer").map((r) => r.id)).toEqual(["b:footer"])
    expect(snapshot).toHaveLength(2) // 快照是拷贝，不因内部删除而回退

    dB()
    expect(reg.getSnapshot("stock-preview.footer")).toHaveLength(0)
  })

  test("root 槽是 single 语义：首个注册可通过，重复注册响亮拒绝", () => {
    const reg = new SlotRegistry()
    // root 槽上下文含 routes/bridgeOnline；哑组件不真正渲染。
    const dShell = reg.register("root", {
      id: "base-ui:shell",
      component: Dummy,
    })
    expect(reg.getSnapshot("root")).toHaveLength(1)

    // 壳帧唯一：再注册第二个立即 fail-closed。
    expect(() =>
      reg.register("root", { id: "other:frame", component: Dummy }),
    ).toThrow(/single 语义/)

    dShell()
    // 卸除后恢复可注册态（下一个壳帧可接管）。
    const dAgain = reg.register("root", { id: "base-ui:shell", component: Dummy })
    expect(reg.getSnapshot("root")).toHaveLength(1)
    dAgain()
  })

  test("root 槽（single）与普通 list 槽互不影响承接语义", () => {
    const reg = new SlotRegistry()
    const dRoot = reg.register("root", { id: "base-ui:shell", component: Dummy })
    // list 槽允许多个注册（不受 single 约束）。
    const dA = reg.register("settings.cards", { id: "a:card", component: Dummy })
    const dB = reg.register("settings.cards", { id: "b:card", component: Dummy })
    expect(reg.getSnapshot("root")).toHaveLength(1)
    expect(reg.getSnapshot("settings.cards")).toHaveLength(2)
    dRoot()
    dA()
    dB()
  })
})