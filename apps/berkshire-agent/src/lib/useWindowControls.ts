/**
 * useWindowControls —— 自绘标题栏的窗口控制 hook（宿主专用，WP-5）。
 *
 * 壳组件（`@berkshire/base-ui` 的 TitleBar）不依赖宿主 `lib/api`；窗口控制能力（最小化/最大化/
 * 关闭 + 最大态）由宿主这里经 Rust window command 封装后，作为 `titleBar` 控制器 **prop/context
 * 注入**给壳（与 `routes`/`bridgeOnline` 同款装配模式）。
 *
 * 最大态同步：初始查一次 `window_is_maximized` + 订阅 `tauri://resize`（最大化/还原会触发 resize）
 * 后按事件重查。标题经 `window_title`（Rust 读 `tauri.conf.json`，单一真源）查询一次——不硬编码，
 * 避免与系统任务栏/Alt-Tab 标题漂移。所有命令 fail-closed：任何一步失败都不崩页
 * （`catch(() => {})`），按钮退化为无操作、标题退化为缺省文案。
 */
import { useEffect, useState } from "react";
import {
  onWindowResized,
  windowClose,
  windowIsMaximized,
  windowMinimize,
  windowTitle,
  windowToggleMaximize,
} from "./api";

/** 自绘标题栏缺省文案（仅当 `window_title` 查询失败 fallback 用，非真源）。 */
const FALLBACK_TITLE = "Berkshire Agent";

/** 自绘标题栏窗口控制契约（注入 base-ui TitleBar；结构镜像 @berkshire/ui-slots 的 TitleBarController）。 */
export interface WindowControls {
  title: string;
  onMinimize(): void;
  onToggleMaximize(): void;
  onClose(): void;
  isMaximized: boolean;
}

export function useWindowControls(): WindowControls {
  const [isMaximized, setIsMaximized] = useState(false);
  const [title, setTitle] = useState(FALLBACK_TITLE);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    const refresh = () => {
      void windowIsMaximized()
        .then((v) => {
          if (mounted) setIsMaximized(v);
        })
        .catch(() => {
          /* 查询失败：保持上一次最大态；fail-closed 不崩页。 */
        });
    };

    refresh();
    // 标题单一真源在 Rust（`tauri.conf.json`）；查一次覆盖缺省文案（保持为 window 真实标题）。
    void windowTitle()
      .then((t) => {
        if (mounted) setTitle(t);
      })
      .catch(() => {
        /* 标题查询失败：保持缺省文案；fail-closed 不崩页。 */
      });
    void onWindowResized(refresh)
      .then((un) => {
        if (mounted) unlisten = un;
        else un();
      })
      .catch(() => {
        /* 订阅失败：已初始查一次兜底，最大态后续不自动刷新。 */
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  return {
    title,
    isMaximized,
    onMinimize() {
      void windowMinimize().catch(() => {});
    },
    onToggleMaximize() {
      void windowToggleMaximize()
        .then(setIsMaximized)
        .catch(() => {});
    },
    onClose() {
      void windowClose().catch(() => {});
    },
  };
}
