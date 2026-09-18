/**
 * 极简错误边界（ExtensionBoundary 精神，先简单实现）。
 *
 * 纪律（docs/secondary-development.md §4 / plugin-development.md §4）：slot 组件永远包在
 * 错误边界内——坏插件/坏面板绝不让宿主页崩；失败降级为 fallback/横幅 + 控制台日志。
 *
 * 这不是正式 slot 宿主（router/slots 仍目标态），仅 T3 demo 面板的最小隔离件。
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

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
    console.warn("[ExtensionBoundary] demo 面板降级，不拖垮宿主页:", error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="boundary-fallback">⚠ 面板已降级（详见控制台日志），宿主页仍可用。</div>
        )
      );
    }
    return this.props.children;
  }
}