/**
 * useBridgeStatus —— 桥接连通态探测 hook（宿主专用）。
 *
 * 壳下沉到 `@berkshire/base-ui` 后，侧边栏/状态栏组件不再依赖宿主的 `lib/api`；桥接探测
 * （capabilitiesList + onCapabilitiesChanged）留在宿主、把 `boolean | null`（null=检测中）
 * 经 `AppShellProps.bridgeOnline` **prop 注入**给 base-ui 壳。插入/失败均 fail-closed 不崩页。
 */
import { useEffect, useState } from "react";
import { capabilitiesList, onCapabilitiesChanged } from "./api";

export function useBridgeStatus(): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;
    capabilitiesList()
      .then(() => !cancelled && setOnline(true))
      .catch(() => !cancelled && setOnline(false));
    void onCapabilitiesChanged(() => {
      if (!cancelled) setOnline(true);
    })
      .then((un) => {
        if (cancelled) un();
        else detach = un;
      })
      .catch(() => {
        /* 订阅失败：capabilitiesList 已兜底在线/离线判定。 */
      });
    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  return online;
}