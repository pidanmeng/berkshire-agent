/**
 * 共享**跨服务**事件增强（照抄 dsh 模式，docs/reference/cordis-pattern-report.md §5）。
 *
 * 只有 `client/changed` 这一个事件**同时被多个服务发出**（`Slots` 与 `ClientModules`
 * 都在 emit，见 services/slots.ts / services/clientModules.ts），无法归属到单一方，
 * 故保留在公共处。**其余各服务自己的 Context 与事件已 co-locate 到各自服务文件**：
 * - `notify/request` → seams/notify.ts
 * - `capabilities/changed` → services/capabilities.ts
 *
 * 事件在 JSDoc 里用 `@mode` 标注派发模式；消费方经 `ctx.inject` / `ctx.<key>` 读取。
 */
declare module '@berkshire/cordis' {
  interface Events {
    /**
     * client 插件图变化（slot 占用 或 clientModules 注册变更），供 owner 推给宿主/webview。
     * @mode emit
     * @param payload.kind 变化来源：'slots'（slot 占用变）或 'clientModules'（bundle 变）
     */
    'client/changed'(payload: { kind: 'slots' | 'clientModules' }): void
  }
}

export {}