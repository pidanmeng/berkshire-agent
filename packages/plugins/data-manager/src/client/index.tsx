/**
 * data-manager 插件的 **client 入口**（`@berkshire/plugin-data-manager/client`）：
 * webview 半身的打包单元（host 经 `bk://`/Vite `/@fs` 运行时 `import()`，取具名导出）。
 *
 * 样式是 **CSS Modules**：`.tsx` 组件经 `./styles.generated.ts` 拿哈希类名；sidecar 半身
 * import 同一份 `css` 注入代码经 `client/list` 交给 host 运行时注入。host 只注入、不参与哈希。
 */
export { default as DataManagerPage } from "./DataManagerPage"
export { dataManager } from "./styles.generated"
export type { CompiledModuleStyle } from "./styles.generated"
