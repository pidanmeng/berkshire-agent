/* CSS Modules 全局类型声明（`@berkshire/base-ui` webview 壳插件侧）。
 * 与 `@berkshire/ui-slots`/宿主同纪律：`.module.css` 导入产出 `<Record<class,string>>`。
 */
declare module "*.module.css" {
  const classes: Record<string, string>
  export default classes
}