/**
 * useAppPhase —— 首启供给阶段判定 hook（宿主专用）。
 *
 * 轮询 Rust 命令 `provisioning_status`（sidecar `boot/status`）：返回 `true`=待供给 →
 * 显示首启引导；`false`=已就绪 → 显示正常应用。返回 `[phase, refresh]`：`refresh()` 用于
 * 首启引导提交后立刻重查（Rust 已 restart sidecar，通常一两次轮询内切到 ready）。
 *
 * fail-closed：探测出错（bridge 未就绪/超时）时保持当前阶段不误报，下一轮再试；绝不在
 * 「不知道是否初始化」时把半初始化状态当成 ready 放行。
 */
import { useCallback, useEffect, useState } from "react";
import { provisioningStatus } from "../lib/api";

export type AppPhase = "checking" | "provisioning" | "ready";

const POLL_MS = 1000;

export function useAppPhase(): [AppPhase, () => void] {
  const [phase, setPhase] = useState<AppPhase>("checking");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const check = async () => {
      try {
        const needsProvisioning = await provisioningStatus();
        if (!cancelled) setPhase(needsProvisioning ? "provisioning" : "ready");
      } catch {
        // bridge 未就绪/超时：保持当前 stage，下一轮再试（不误报）。
      }
    };

    void check();
    timer = window.setInterval(() => void check(), POLL_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return [phase, refresh];
}