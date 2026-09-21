/**
 * 共享依赖 import-map（M3：让 `bk://` 动态 import 的插件 bundle 里的**裸 specifier** 可解析）。
 *
 * 插件 client 半身按 base-ui 同款姿势打包：`bun build --target=browser` + `--external` 共享包，
 * 因此产物里 `react`/`@berkshire/ui-slots`/`@berkshire/theme`/… 仍是裸 import。webview 在运行时
 * `import("bk:///…")` 遇到这些裸名不会像 Vite 打包那样被解析，必须由**宿主注入 `<script type="importmap">`**
 * 把裸名映射到宿主可 fetch 的 ESM 地址（如宿主自身 bundle 分块，或 dev server 提供的模块 URL）。
 *
 * 诚实边界：把「共享 dep 名 → 实际可 fetch URL」的取值留作**宿主/壳接线**（`buildSharedImportMap` +
 * `injectSharedImportMap(map)`）。任何运行部署（Tauri webview dev/prod）必须由壳提供真实 URL 才让
 * 动态 import 解析；本仓库当前默认映射为空（无条目）→ 缺壳接线时插件 bundle 若不内联共享 dep 就
 * 解析不到，属已登记的**待运行验证接线点**，而非宿主硬编码插件装载逻辑。
 */
export interface SharedImportMap {
  imports: Record<string, string>
}

/** 本仓库插件 client bundle 依赖的共享包裸名（与各插件 `--external` 一致）。
 * `react-dom`/`react-dom/client` 一并注册：`@berkshire/ui` 的 `Popover` 经 `createPortal`
 * 依赖 `react-dom`，且 `@berkshire/ui` 打包时 `--external react-dom`（见 packages/ui/scripts/build-client.ts），
 * 故 webview 动态 import 插件/ui bundle 时该裸名必须能在 import-map 解析（与 `react` 同源，宿主注入）。 */
export const SHARED_IMPORTS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@berkshire/ui-slots",
  "@berkshire/theme",
  "@berkshire/ui",
  "react-router-dom",
  "clsx",
] as const

export type SharedImportName = (typeof SHARED_IMPORTS)[number]

/** 由「部分裸名 → URL」映射补进共享表（缺省为空，不影响未装载插件的其他模块）。 */
export function buildSharedImportMap(partial?: Partial<Record<SharedImportName, string>>): SharedImportMap {
  const imports: Record<string, string> = {}
  for (const name of SHARED_IMPORTS) {
    const url = partial?.[name as SharedImportName]
    if (url) imports[name] = url
  }
  return { imports }
}

/** 幂等地把 import-map 注入当前页（同位替换，避免重复 script 累积）；空映射不注入。 */
export function injectSharedImportMap(map: SharedImportMap): void {
  if (Object.keys(map.imports).length === 0) return
  const tag = document.createElement("script")
  tag.type = "importmap"
  tag.dataset.bkImportMap = "1"
  tag.textContent = JSON.stringify(map)
  document.querySelectorAll("script[data-bk-import-map]").forEach((n) => n.remove())
  document.head.appendChild(tag)
}