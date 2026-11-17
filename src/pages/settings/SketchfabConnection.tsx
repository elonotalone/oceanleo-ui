"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { disconnectSketchfab, materialConnections, startSketchfabConnection } from "../../lib/live-materials";

/** Per-user OAuth. The settings row and result cards use the same connection flow. */
export function SketchfabConnection({ compact = false, onConnected }: { compact?: boolean; onConnected?: () => void }) {
  const tt = useUI();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const refresh = useCallback(async () => {
    try {
      const connections = await materialConnections();
      const ready = connections.some(item => item.provider === "sketchfab" && item.status === "connected");
      setConnected(ready); setError("");
      if (ready) {
        if (waiting) setWaiting(false);
        if (waiting || compact) onConnectedRef.current?.();
      }
    } catch { setError("连接状态未能加载，请重试"); }
  }, [waiting, compact]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!waiting) return;
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [waiting, refresh]);

  async function connect() {
    setBusy(true); setError("");
    try {
      const url = await startSketchfabConnection();
      setAuthorizationUrl(url);
      window.open(url, "_blank", "noopener,noreferrer");
      setWaiting(true);
    } catch { setError("连接未完成，请重试"); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    setBusy(true); setError("");
    try { await disconnectSketchfab(); setConnected(false); setWaiting(false); }
    catch { setError("断开未完成，请重试"); }
    finally { setBusy(false); }
  }
  return <section data-sketchfab-connection className={compact ? "text-xs" : "mb-5 rounded-xl border border-[var(--border)] p-4"}>
    {!compact ? <><h3 className="font-medium">Sketchfab</h3><p className="my-2 text-xs text-[var(--fg-2)]">{tt("使用自己的 Sketchfab 账号授权后，可将免费模型存入我的库。")}</p></> : null}
    {connected ? <><span role="status">{tt("已连接")}</span>{!compact ? <button type="button" disabled={busy} onClick={() => void disconnect()} className="ml-3 min-h-11 px-3">{tt("断开连接")}</button> : null}</>
      : <button type="button" disabled={busy} onClick={() => void connect()} className="min-h-11 rounded-lg border border-[var(--border)] px-3">{tt(busy ? "处理中…" : "连接 Sketchfab")}</button>}
    {waiting ? <><p role="status">{tt("授权后返回此处")}</p><a href={authorizationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{tt("连接 Sketchfab")}</a></> : null}
    {error ? <p role="alert">{tt(error)}</p> : null}
    {waiting || error ? <button type="button" disabled={busy} className="min-h-11 px-3 underline" onClick={() => void refresh()}>{tt("刷新连接状态")}</button> : null}
  </section>;
}
