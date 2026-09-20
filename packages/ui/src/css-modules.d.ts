/**
 * CSS Modules 全局类型声明（`@berkshire/ui` 原子组件库侧）。
 *
 * 与 `@berkshire/ui-slots` / 宿主 `apps/berkshire-agent/src/css-modules.d.ts` 同纪律：
 * `.module.css` 导入产出 `<Record<class, string>>`；`:global` 仅穿透第三方/跨包，不定义新全局类。
 * 类名 camelCase（构建期哈希自动唯一）。
 */

declare module "*.module.css" {
  const classes: Record<string, string>
  export default classes
}