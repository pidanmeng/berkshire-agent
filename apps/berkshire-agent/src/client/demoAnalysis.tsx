/**
 * T2 最小 demo 分析页模块（能力块 B）：渲染在 `analysis.menu` slot（ExtensionRoute 页面内）。
 *
 * 类名 `.bk-demo-analysis` 与 sidecar 注册的 scoped 样式类名一致——该样式经
 * `<style data-bk-module>` 注入并被作用域隔离。占位文本显式标注「非真实行情」。
 */
import type { SlotComponent } from "../slots/registry"

export const DemoAnalysis: SlotComponent<object> = () => (
  <div className="bk-demo-analysis">
    <strong>T2 分析页已挂载</strong> —— 这是 <code>analysis.menu</code> 动态菜单注入的分析页面内容
    （占位文本，非真实行情）。
  </div>
)