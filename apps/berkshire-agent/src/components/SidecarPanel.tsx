/**
 * T3 最小 demo 面板：证明核心「经 Rust 桥 → webview」为前端所用。
 *
 * 渲染：capabilities/list、一个触发 notify/send 的按钮、实时追加 sidecar 推送的
 * notify/request 事件、以及最近 log/list。整块包在 ExtensionBoundary 内：
 * bridge 断/超时 → 显示「bridge 不可用」横幅 + console.warn，**绝不崩宿主页**。
 *
 * 诚实边界：这不是正式 slot/router（那些仍目标态），只是「核心→前端可用」的最小证明面。
 */
import { useCallback, useEffect, useState } from "react";
import {
  capabilitiesList,
  logList,
  notifySend,
  onCapabilitiesChanged,
  onNotifyRequest,
  type Capability,
  type LogEntry,
  type NotifyLevel,
  type NotifyPayload,
} from "../lib/api";
import { ExtensionBoundary } from "@berkshire/ui-slots";
import styles from "./SidecarPanel.module.css";

type BridgeStatus = "loading" | "connected" | "unavailable";

interface LiveNotify {
  message: string;
  level?: NotifyLevel;
  at: number;
}

function SidecarPanelInner() {
  const [status, setStatus] = useState<BridgeStatus>("loading");
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [caps, setCaps] = useState<Capability[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [live, setLive] = useState<LiveNotify[]>([]);
  const [message, setMessage] = useState("交易日 09:30 数据已更新");
  const [level, setLevel] = useState<NotifyLevel>("info");
  const [sending, setSending] = useState(false);

  const loadSnapshot = useCallback(async () => {
    try {
      const [c, l] = await Promise.all([capabilitiesList(), logList()]);
      setCaps(c);
      setLogs(l);
      setStatus("connected");
      setBridgeError(null);
    } catch (err) {
      // bridge 断/超时：fail-closed 显式错误，不崩页。
      console.warn("[SidecarPanel] bridge 不可用:", err);
      setStatus("unavailable");
      setBridgeError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    (async () => {
      const offNotify = await onNotifyRequest((payload: NotifyPayload) => {
        if (!cancelled) setLive((prev) => [{ level: payload.level, message: payload.message, at: Date.now() }, ...prev]);
      });
      const offCaps = await onCapabilitiesChanged((payload) => {
        // 能力可用性变化实时更新面板里的列表。
        setCaps((prev) =>
          prev.map((c) => (c.id === payload.capability ? { ...c, usable: payload.usable } : c)),
        );
      });
      if (cancelled) {
        offNotify();
        offCaps();
        return;
      }
      unsubs.push(offNotify, offCaps);
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  const sendNotify = useCallback(async () => {
    setSending(true);
    try {
      const delivered = await notifySend(message, level);
      // 成功：log 由 sidecar 侧追加；这里手动刷新 log，保证「可见即已记录」。
      const l = await logList();
      setLogs(l);
      console.log("[SidecarPanel] notify delivered to:", delivered);
      setBridgeError(null);
    } catch (err) {
      console.warn("[SidecarPanel] notify/send 失败:", err);
      setBridgeError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }, [message, level]);

  return (
    <section className={styles.panel}>
      <h2>Sidecar 桥 demo 面板</h2>

      {status === "loading" && <p className={styles.hint}>正在连接 sidecar…</p>}
      {status === "unavailable" && (
        <div className={styles.banner} role="alert">
          ⚠ bridge 不可用（{bridgeError ?? "未知原因"}）——宿主页不受影响，可继续交互。
        </div>
      )}

      <fieldset>
        <legend>capabilities/list（usable 门控）</legend>
        {caps.length === 0 ? (
          <p className={styles.hint}>（无能力 / bridge 未接通）</p>
        ) : (
          <ul>
            {caps.map((c) => (
              <li key={String(c.id)}>
                <code>{String(c.id)}</code> — {c.label} · {c.usable ? "可用" : "不可用"}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>notify/send</legend>
        <label>
          消息
          <input value={message} onChange={(e) => setMessage(e.currentTarget.value)} />
        </label>
        <label>
          级别
          <select value={level} onChange={(e) => setLevel(e.currentTarget.value as NotifyLevel)}>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <button onClick={() => void sendNotify()} disabled={sending || status === "unavailable"}>
          {sending ? "发送中…" : "发送通知"}
        </button>
      </fieldset>

      <div className={styles.cols}>
        <fieldset>
          <legend>实时推送（sidecar://notify/request）</legend>
          {live.length === 0 ? (
            <p className={styles.hint}>（暂无事件推送）</p>
          ) : (
            <ul>
              {live.map((n, i) => (
                <li key={`${n.at}-${i}`}>
                  [{n.level ?? "info"}] {n.message}
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <fieldset>
          <legend>最近 log/list</legend>
          {logs.length === 0 ? (
            <p className={styles.hint}>（日志为空）</p>
          ) : (
            <ol>
              {logs.slice(-8).map((e) => (
                <li key={e.id}>
                  <code>{e.event}</code>{" "}
                  <span className={styles.logData}>{JSON.stringify(e.data)}</span>
                </li>
              ))}
            </ol>
          )}
        </fieldset>
      </div>
    </section>
  );
}

export default function SidecarPanel() {
  return (
    <ExtensionBoundary>
      <SidecarPanelInner />
    </ExtensionBoundary>
  );
}