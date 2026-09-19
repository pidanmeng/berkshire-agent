/**
 * CSS Modules 全局类型声明（`@berkshire/ui-slots` 共享缝引擎侧）。
 *
 * 与宿主 `apps/berkshire-agent/src/css-modules.d.ts` 同纪律：`.module.css` 导入产出
 * `<Record<class, string>>`；`:global` 仅穿透第三方/跨包，不定义新全局类。类名 camelCase。
 */

declare module "*.module.css" {
  const classes: Record<string, string>
  export default classes
}