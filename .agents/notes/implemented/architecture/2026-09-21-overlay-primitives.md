# Agent Note: 复杂弹层原语——自实现 portal + 定位（方案 1），以 Popover 为代表落地

Status: implemented

## 问题

S2 落地 `@berkshire/ui` 时明确把「复杂弹层/定位（Combobox / Popover / Drawer / Dialog focus-trap + portal、Tooltip 定位）」悬置为「目标态/待决策」，解读为「先不丑」可延后。随组件库扩散，这些复杂交互是 S2 里少数被显式标注为目标态的缺口，需产出决策记录并至少落地一个高频复杂组件，让「目标态」标注能诚实转实现。

此前的现状（S2 $11 `packages/ui`）：`Dropdown` 是**同容器绝对定位**（无 portal，受 `overflow`/`transform`/`clip` 上下文影响、`z-index` 不稳）；`Modal` 已做自有 focus-trap；`Tooltip` 是纯 CSS 显隐。三者都不满足「高复用复杂弹层」的全部诉求（portal 脱离裁剪上下文 + 定位 + 键盘可访问）。

候选方案有三个：
1. 自实现 portal / focus-trap / 定位（零新依赖，保治理纯 CSS Modules）；
2. 用 `@radix-ui/*` 原语做底层、外壳仍 `var(--bk-*)`（保可访问性，加 Radix 依赖但不引 Tailwind/CVA/tailwind-merge）；
3. 维持现轻实现（不接受成本）。

## 决策

**选方案 1：自实现 portal + 定位，不引 Radix。** 以 `Popover`（portal 定位的上下文弹出面板）为第一个复杂弹层代表件落地于 [packages/ui/src/Popover.tsx](../../../packages/ui/src/Popover.tsx)（+ [Popover.module.css](../../../packages/ui/src/Popover.module.css)，`src/index.ts` 导出 `Popover`/`PopoverProps`/`PopoverPlacement`/`PopoverAlign`）。核心是把「复杂弹层」中最缺的 **portal** 补上：

- **portal**：内容经 `react-dom` 的 `createPortal` 渲染到 `document.body`，脱离触发容器/任何 `overflow|transform|clip` 上下文，`z-index` 稳定。`react-dom` 是宿主注入的 React 宿主运行时（与 `react` 同理，非新增 UI 库），已加为 `peerDependency` 并在 [build-client.ts](../../../packages/ui/scripts/build-client.ts) 走 `--external`。
- **定位**：`placement`（top/bottom/left/right）+ `align`（start/center/end）+ viewport 边距钳制（`VIEWPORT_MARGIN = 8`），打开时 `useLayoutEffect` 测量 anchor/面板尺寸计算 `top/left`，并监听 `resize`/`scroll` 重算。
- **可访问性**：anchor 带 `aria-haspopup="dialog"`/`aria-expanded`/`aria-controls`；Enter/Space 切换、ESC 或点击外部关闭。focus-trap 不属于 popover（非模态上下文面板），归 `Modal`/`Dialog`。
- **门禁**：面板样式全 `var(--bk-*)`、禁魔法色值；只依赖 `react` + `react-dom`（`createPortal`）+ `clsx`（内联），不引 Tailwind/CVA/tailwind-merge/Radix。

该落地与 S2/Package 的「零 Tailwind、纯 CSS Modules、不加 Tailwind/Radix/CVA」契约一致：Radix 被否决不是因为值不值得，而是因为 `@berkshire/ui` 目前只有 `Modal` 一处 focus-trap、无 portal，「补 portal + 定位」这个最小缺口用方案 1 即可低成本覆盖，不必为它引入 Radix 的依赖面与类型图。

## 曾考虑的替代方案

- **方案 2（引 `@radix-ui/*` 原语做底层）**：否决。Radix 强项是复杂交互的可访问性（虚拟焦点环、跨浏览器行为、键盘模型已拿 Armstrong 级解决），但代价是引入一个依赖面与类型图（每个原语一个子包）到本应「独立、仅 react+clsx」的原子库。当前 `@berkshire/ui` 只有一个复杂交互（Modal focus-trap）是自实现的、尚无 portal——缺口具体且小，用方案 1 的自实现即可达成「一个代表件可访问」，不值得为延后型收益预先背上 Radix 依赖。若未来组合弹层序（Combobox/多级 Menu/Drawer focus 模型）扩散且自实现成本抬头，再回评方案 2；届时仍只引功能原语、不引 Tailwind/CVA/tailwind-merge。
- **方案 3（维持现轻实现，不实现复杂弹层）**：否决。「目标态/待决策」永远不转实现、`Dropdown` 的定位缺陷（无 portal 受容器裁剪）就永远留着，S2 的悬置点没有收敛，与「复杂交互何时转实现」的追问不符。至少落地一个代表件（Popover）是这个决策的最低可交付。
- **portal 用不依赖 `react-dom` 的自定义实现**：否决。React 渲染到 body 的规范路径就是 `createPortal`，`react-dom` 是 webview 必然存在的宿主运行时（宿主本就注入它），自写 portal（手动 `createRoot`/`render`）反而破坏 React 提交/清理语义、引入重复心智模型，得不偿失。

## 后果

- **收益**：`@berkshire/ui` 补上 portal 能力，`Popover` 作为第一个可访问的高频复杂弹层可用；`Dropdown` 的定位局限有了可迁移的目标组件（仍保留，接口不破坏）；S2 里「Popover」这一目标态标注转「已实现」（Combobox/Drawer/ContextMenu、flip 翻转/箭头/动画仍目标态，见 `src/index.ts` 头部 JSDoc）。
- **代价**：本包新增 `peerDependency: react-dom`（此前仅 react），`createPortal` 要求消费方已持有 `react-dom` —— webview 宿主本就满足，插件/壳经宿主注入亦然；`useLayoutEffect` 定位在 SSR（冒烟测试的 renderToStaticMarkup 场景）下因 `document.body` 不存在而门户面板不渲染，需测试按此诚实断言。
- **仍目标态**：flip 碰撞翻转、箭头、submenu/多级、进出场动画，以及 `Combobox`/`Drawer`/`ContextMenu` 等其余复杂弹层——均如实标「目标态/待决策」，未写成已实现。

## 相关

- 特性来源：`.agents/features/ui-shadcn-redesign/` 批次（用完即删；本决策的持久化源头即本文档 + `packages/ui` 实现，不依赖 transient 特性文件）
- 组件的诚实标注与导出：`packages/ui/src/index.ts`
- 上一版评估的三个候选方案：见本文档「曾考虑的替代方案」