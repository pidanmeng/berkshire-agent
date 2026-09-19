/**
 * 极简错误边界（ExtensionBoundary 精神，先简单实现）。
 *
 * 纪律（docs/secondary-development.md §4 / plugin-development.md §4）：slot 组件永远包在
 * 错误边界内——坏插件/坏面板绝不让宿主页崩；失败降级为 fallback/横幅 + 控制台日志。
 *
 * 诚实标注：从宿主 `apps/berkshire-agent/src/lib/ExtensionBoundary.tsx` 迁出的**共享缝件**，
 * 供宿主与所有插件共同 import。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ExtensionBoundary.module.css";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

export class ExtensionBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("[ExtensionBoundary] 面板降级，不拖垮宿主页:", error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      // 显式区分「未提供 fallback」（undefined，走默认横幅）与「fallback 为 null」
      // （调用方想要紧凑降级，彻底不留占位）——compact 场景需要后者。
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div className={styles.fallback}>⚠ 面板已降级（详见控制台日志），宿主页仍可用。</div>
      );
    }
    return this.props.children;
  }
}