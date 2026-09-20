/**
 * 首启引导（onboarding）的类型化「步骤缝」——本轮 v1 的目标：**通过这个 seam 预留多步扩展**。
 *
 * 诚实标注：首次启动发生在 `$BK_HOME/cordis.yml` **落盘之前**，故这些步骤不可能由
 * cordis.yml 装载的 Cordis 插件贡献（无配置文件可装配它们）；因此 v1 把它们实现为**宿主侧**的
 * 一个类型化步骤列表（`STEPS`），只含一个内置「选择默认配置」步骤。让 Cordis 插件向后可贡献
 * 步骤的接线（经 slot/事件把步骤注册进来）属目标态。
 */
import type { ComponentType } from "react";

/** 可勾选的默认插件选项（默认 cordis.yml 里的「装哪些」）。 */
export interface DefaultPluginOption {
  /** cordis.yml 行的 `id`。 */
  id: string;
  /** 插件包名（`@berkshire/...`，resolver 在 dev 走 workspace 解析）。 */
  name: string;
  label: string;
  description: string;
  /** 是否默认勾选。 */
  defaultOn: boolean;
}

/** 步骤组件的 props：选中态、提交、忙/错状态都经这里。 */
export interface OnboardingStepProps {
  /** 勾选态：DefaultPluginOption.id → 是否装载。 */
  selected: Record<string, boolean>;
  onSelectedChange: (next: Record<string, boolean>) => void;
  /** 提交步骤：把完整 cordis.yml 文本写到 $BK_HOME 并重启 sidecar。 */
  provision: (cordisYml: string) => Promise<void>;
  busy: boolean;
  error: string | null;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description?: string;
  component: ComponentType<OnboardingStepProps>;
}