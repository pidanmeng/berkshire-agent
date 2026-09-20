/**
 * 可发布包拓扑 —— `scripts/` 下构建/发布脚本的**唯一事实源**。
 *
 * 顺序 = 依赖拓扑（lib 在前、插件在后）；`name` 是发布到 npm 的 scope 名，`dir` 是
 * `packages/` 相对目录。新增可发布包时**只改这里**，`build-packages.ts` 与
 * `publish-plugins.ts` 都会自动跟随，避免两套拓扑数组漂移。
 */
export interface BkModule {
  /** 发布到 npm 的 scoped 名（`publish-plugins.ts` 的 ORDER 用之）。 */
  name: string;
  /** `packages/` 相对目录（`build-packages.ts` 的 `packages/${dir}` 用之）。 */
  dir: string;
  /** 是否纳入 `build:plugins` scope。sidecar 仅供宿主运行时经 `$BK_HOME` 拉取，不在插件链。 */
  pluginChain: boolean;
}

export const MODULES: readonly BkModule[] = [
  { name: "@berkshire/cordis", dir: "cordis-vendor", pluginChain: true },
  { name: "@berkshire/core", dir: "core", pluginChain: true },
  { name: "@berkshire/boot", dir: "boot", pluginChain: true },
  { name: "@berkshire/sidecar", dir: "sidecar", pluginChain: false },
  { name: "@berkshire/theme", dir: "theme", pluginChain: true },
  { name: "@berkshire/ui-slots", dir: "ui-slots", pluginChain: true },
  { name: "@berkshire/plugin-notify-console", dir: "plugins/notify-console", pluginChain: true },
  { name: "@berkshire/plugin-demo", dir: "plugins/demo", pluginChain: true },
  { name: "@berkshire/base-ui", dir: "plugins/base-ui", pluginChain: true },
];

/** 全量（`build:packages` 默认 scope + `publish:plugins` ORDER）。 */
export const ALL: readonly BkModule[] = MODULES;

/** 插件链（`build:plugins` scope）：插件包 + 它们依赖的 workspace lib，不含 sidecar。 */
export const PLUGIN_CHAIN: readonly BkModule[] = MODULES.filter((m) => m.pluginChain);