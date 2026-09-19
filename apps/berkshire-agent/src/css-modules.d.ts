/**
 * CSS Modules 全局类型声明（host 侧）。
 *
 * 仓库既有类型纪律：host 组件用 `.module.css` + clsx（H2），构建期哈希、类名自动唯一。
 * `.module.css` 导入产出 `<Record<class, string>>`（类名映射）；`:global` 仅穿透第三方/跨包，
 * 不定义新全局类。类名一律 camelCase；状态类由 clsx 挂载。禁 `composes`。
 * （组件数超 20 再评估 typed-css-modules 强类型方案。）
 */
declare module "*.module.css" {
  const classes: Record<string, string>
  export default classes
}