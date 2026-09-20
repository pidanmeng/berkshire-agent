/**
 * `@berkshire/cordis` —— 官方 `cordis` 的 vendor 重导出（M4）。
 *
 * 单一事实源仍是 `cordis`；本包只做**中转**，让全仓类型增强/导入统一走 `@berkshire/cordis`：
 * - `export *` 重导出 `cordis` 的全部值/类型（Context、Service、Plugin、Fiber、Events……）；
 * - 各服务/事件在 `declare module '@berkshire/cordis'` 上做类型合并（替代原先
 *   `declare module 'cordis'`），随 `@berkshire/core` 侧效应导入被消费方带上；
 * - 这样换 scoped 名不改 cordis 本体，未来可平滑加入额外类型便利而不污染上游。
 *
 * 约束：本包**不含业务逻辑**，只 re-export；不得 import `@berkshire/*`（避免环）。
 */
export * from 'cordis'