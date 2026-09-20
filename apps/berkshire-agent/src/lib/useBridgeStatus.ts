/**
 * useBridgeStatus —— 桥接连通态探测 hook（宿主专用）。
 *
 * 壳下沉到 `@berkshire/base-ui` 后，侧边栏/状态栏组件不再依赖宿主的 `lib/api`；桥接探测
 * （capabilitiesList + onCapabilitiesChanged）留在宿主、把 `boolean | null`（null=检测中）
 * 经 `AppShellProps.bridgeOnline` **prop 注入**给 base-ui 壳。插入/失败均 fail-closed 不崩页。
 *
 * 首启供给竞态防护：默认 cordis.yml 缺失时 sidecar 处于 **provisioning** 阶段，`capabilities/list`
 * 一律 METHOD fail-closed —— 若在引导完成前就探测一次，会永久判「离线」；故探测必须 **gate 在
 * `ready` 上**（`ready=true` 才探测），并订阅 `capabilities/changed` + `client/changed`（`provision_bk_home`
 * 重启后恰好 emit `client/changed`）在接通/重装配事件上**重探测自愈**。
 */
import { useEffect, useState } from "react";
import { capabilitiesList, onCapabilitiesChanged, onClientChanged } from "./api";

export function useBridgeStatus(ready: boolean): boolean | null {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    // 未就绪（探测中/待供给）：不探测，保持 null=检测中（StatusBar 显示「检测中」，不误报离线）。
    if (!ready) {
      setOnline(null);
      return;
    }
    let cancelled = false;
    const probe = () => {
      capabilitiesList()
        .then(() => !cancelled && setOnline(true))
        .catch(() => !cancelled && setOnline(false));
    };
    probe();
    let unCaps: (() => void) | undefined;
    let unClient: (() => void) | undefined;
    void onCapabilitiesChanged(() => probe())
      .then((un) => {
        if (cancelled) un();
        else unCaps = un;
      })
      .catch(() => {
        /* 订阅失败：probe 已兜底。 */
      });
    void onClientChanged(() => probe())
      .then((un) => {
        if (cancelled) un();
        else unClient = un;
      })
      .catch(() => {
        /* 同上。 */
      });
    return () => {
      cancelled = true;
      unCaps?.();
      unClient?.();
    };
  }, [ready]);

  return online;
}