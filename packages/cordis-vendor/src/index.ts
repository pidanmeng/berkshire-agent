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
 *
 * 注：本包目录名为 `cordis-vendor`（分包名仍 `@berkshire/cordis`）是有意为之——Bun 的
 * workspace 解析会把工作区目录的**文件夹名**当作裸名的别名，若目录名取 `cordis`，则工作区内
 * 所有 `import 'cordis'`（含本包自身的 `export * from 'cordis'`）都会被解析成本包自身（形成
 * 环 / 0 导出），而解析不到 `node_modules` 里的真实要重导出的官方 `cordis`。改名后裸名
 * `cordis` 才正确落到官方包，`export *` 也才能被 Bun 正常枚举。改名由
 * `packages/tsconfig.json` 的 `paths` 与 `scripts/modules.ts` 的 `dir` 同步。
 */
export * from 'cordis'