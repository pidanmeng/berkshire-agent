/**
 * `@berkshire/sidecar` 默认定时任务的**调度入口别名**（S3-sync-autopilot）。
 *
 * 本模块只是 `./autopilot` 的透明别名壳，便于按「调度器」语义 import；真实实现与装配逻辑在
 * [autopilot.ts](./autopilot.ts)（`attachAutopilot` 挂 ready 生命周期：启动同步 + 收盘同步）。
 *
 * 导出透传，无额外逻辑；`autopilot` 是唯一事实源。
 */
export * from './autopilot'