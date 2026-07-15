"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent,
} from "react";
import {
  cloudBrowserLiveUrl,
  cloudBrowserScreenshot,
  createCloudBrowser,
  createCloudBrowserTicket,
  deleteCloudBrowser,
  hibernateCloudBrowser,
  listCloudBrowserEvents,
  listCloudBrowsers,
  resumeCloudBrowser,
  type CloudBrowserEvent,
  type CloudBrowserSession,
} from "../lib/browser";
import { useUI } from "../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "./WorkspaceSession";
import {
  normalizedHttpUrl,
  playwrightKey,
  pointInContainedFrame,
  useCloudBrowserFramePainter,
} from "./cloud-browser-live";
import {
  BrowserGlyph,
  CloudBrowserLiveControls,
  CloudBrowserTimeline,
} from "./cloud-browser-controls";

const MAX_LIVE_RECONNECTS = 3;
const LIVE_RECONNECT_BASE_MS = 500;
export { pointInContainedFrame } from "./cloud-browser-live";

export function CloudBrowserPanel({ taskId, accent = "#4f46e5" }: {
  taskId?: string | null; accent?: string;
}) {
  const tt = useUI();
  const workspace = useOptionalWorkspaceSession();
  const effectiveTaskId = taskId || workspace?.taskId || "";
  const [sessions, setSessions] = useState<CloudBrowserSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<CloudBrowserEvent[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [shotUrl, setShotUrl] = useState("");
  const [live, setLive] = useState(false);
  const [liveRequested, setLiveRequested] = useState(false);
  const [driving, setDriving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://www.google.com/");
  const [title, setTitle] = useState("");
  const [typing, setTyping] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const socketSessionRef = useRef("");
  const {
    canvasRef,
    frameSizeRef,
    cancelFrameDecode,
    acceptFrameMeta,
    drawBlobFrame,
    drawTextFrame,
  } = useCloudBrowserFramePainter();
  const activePointerRef = useRef<{ pointerId: number; button: string;
    point: { nx: number; ny: number } } | null>(null);
  const socketGenerationRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const liveRequestedRef = useRef(false);
  const selectedIdRef = useRef("");
  const taskScopeRef = useRef<string | null>(null);
  const effectiveTaskRef = useRef(effectiveTaskId);
  const reloadGenerationRef = useRef(0);

  const selected = sessions.find((item) => item.id === selectedId) || null;

  const reload = useCallback(async (preferredId = "") => {
    const generation = ++reloadGenerationRef.current;
    const [recentResult, taskResult] = await Promise.all([
      listCloudBrowsers(),
      effectiveTaskId ? listCloudBrowsers(1, effectiveTaskId) : Promise.resolve(null),
    ]);
    if (generation !== reloadGenerationRef.current) return;
    if (!recentResult.ok) {
      setError(recentResult.error || tt("云端浏览器加载失败")); return;
    }
    if (effectiveTaskId && taskResult && !taskResult.ok)
      setError(taskResult.error || tt("当前任务的云端浏览器加载失败"));
    else setError("");
    const recent = recentResult.data?.items || [];
    const scoped = taskResult?.ok ? taskResult.data?.items || [] : [];
    const items = [...scoped, ...recent.filter((item) =>
      !scoped.some((scopedItem) => scopedItem.id === item.id))];
    const scopeChanged = taskScopeRef.current !== effectiveTaskId;
    taskScopeRef.current = effectiveTaskId;
    setSessions(items);
    setSelectedId((current) => {
      let next = "";
      if (preferredId && items.some((item) => item.id === preferredId)) next = preferredId;
      else {
        const taskSession = items.find((item) =>
          effectiveTaskId && item.task_id === effectiveTaskId);
        if (scopeChanged && effectiveTaskId) next = taskSession?.id || "";
        else if (current && items.some((item) => item.id === current)) next = current;
        else if (taskSession) next = taskSession.id;
        else next = items[0]?.id || "";
      }
      selectedIdRef.current = next;
      return next;
    });
  }, [effectiveTaskId, tt]);

  const stopLive = useCallback((clearFrame = true) => {
    liveRequestedRef.current = false;
    setLiveRequested(false); setLive(false); setDriving(false);
    activePointerRef.current = null;
    ++socketGenerationRef.current;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null;
    }
    const socket = socketRef.current;
    socketRef.current = null; socketSessionRef.current = "";
    try { socket?.close(1000, "client stop"); } catch { /* already closed */ }
    cancelFrameDecode(clearFrame);
  }, [cancelFrameDecode]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    if (effectiveTaskRef.current === effectiveTaskId) return;
    effectiveTaskRef.current = effectiveTaskId;
    if (liveRequestedRef.current) stopLive(true);
  }, [effectiveTaskId, stopLive]);

  useEffect(() => {
    if (liveRequested) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [liveRequested, reload]);

  useEffect(() => {
    setDeleteArmed(false);
    setEvents([]); setEventId(null);
    if (!selectedId || liveRequested) return;
    let alive = true;
    const refreshEvents = () => {
      void listCloudBrowserEvents(selectedId).then((result) => {
        if (!alive || !result.ok) return;
        const items = result.data?.items || [];
        setEvents(items);
        setEventId((current) => {
          if (current && items.some((item) =>
            item.id === current && item.has_screenshot)) return current;
          return [...items].reverse().find((item) => item.has_screenshot)?.id || null;
        });
      });
    };
    refreshEvents();
    const timer = window.setInterval(refreshEvents, 5_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [liveRequested, selectedId]);

  useEffect(() => {
    if (!eventId || liveRequested) { setShotUrl(""); return; }
    let url = "";
    let alive = true;
    void cloudBrowserScreenshot(eventId).then((result) => {
      if (!alive || !result.ok || !result.data) return;
      url = URL.createObjectURL(result.data);
      setShotUrl(url);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [eventId, liveRequested]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelFrameDecode(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelFrameDecode]);

  useEffect(() => {
    return () => {
      liveRequestedRef.current = false;
      ++socketGenerationRef.current;
      if (reconnectTimerRef.current !== null)
        window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      cancelFrameDecode(false);
    };
  }, [cancelFrameDecode]);

  function connectionCurrent(sessionId: string, generation: number) {
    return generation === socketGenerationRef.current && liveRequestedRef.current &&
      socketSessionRef.current === sessionId;
  }

  function scheduleReconnect(sessionId: string, generation: number, reason: string) {
    if (!connectionCurrent(sessionId, generation)) return;
    if (reconnectAttemptsRef.current >= MAX_LIVE_RECONNECTS) {
      liveRequestedRef.current = false;
      setLiveRequested(false); setLive(false); setDriving(false);
      setError(reason || tt("实时浏览器连接已中断"));
      void reload(); return;
    }
    const attempt = reconnectAttemptsRef.current++;
    const delay = LIVE_RECONNECT_BASE_MS * 2 ** attempt;
    setError(tt("实时浏览器连接中断，正在重连…"));
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connectLive(sessionId, generation, false);
    }, delay);
  }

  async function connectLive(sessionId: string, generation: number,
    initial: boolean): Promise<boolean> {
    const ticket = await createCloudBrowserTicket(sessionId);
    if (initial && generation === socketGenerationRef.current) setBusy(false);
    if (!connectionCurrent(sessionId, generation)) return false;
    if (!ticket.ok || !ticket.data) {
      scheduleReconnect(sessionId, generation,
        ticket.error || tt("云端浏览器恢复失败")); return false;
    }
    const socket = new WebSocket(cloudBrowserLiveUrl(sessionId));
    socket.binaryType = "blob"; socketRef.current = socket;
    socket.onopen = () => {
      if (socketRef.current !== socket || generation !== socketGenerationRef.current) {
        socket.close(); return;
      }
      socket.send(JSON.stringify({ t: "auth", ticket: ticket.data!.ticket,
        binary_frames: true }));
      setLive(true); setError("");
    };
    socket.onmessage = (event) => {
      if (socketRef.current !== socket ||
          generation !== socketGenerationRef.current) return;
      if (event.data instanceof Blob) { drawBlobFrame(event.data); return; }
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.t === "frame-meta") {
          acceptFrameMeta(message); return;
        }
        // Text-frame compatibility keeps a rolling frontend/backend deployment
        // usable while executors move to binary JPEG.
        if (message.t === "frame" && message.data) {
          drawTextFrame(String(message.data), message);
        }
        if (message.t === "meta") {
          setAddress(String(message.url || "")); setTitle(String(message.title || ""));
        }
        if (message.t === "lock") {
          const human = message.driving === "human";
          setDriving(human);
          if (!human) activePointerRef.current = null;
        }
        if (message.t === "navigation") {
          if (message.ok === true) {
            setAddress(String(message.url || "")); setError("");
          } else setError(String(message.msg || tt("网址被安全策略拒绝")));
        }
        if (message.t === "error" || message.t === "warn")
          setError(String(message.msg || ""));
      } catch { /* ignore malformed frames */ }
    };
    socket.onerror = () => {
      if (socketRef.current === socket) {
        try { socket.close(); } catch { /* onclose owns reconnect */ }
      }
    };
    socket.onclose = () => {
      if (socketRef.current !== socket ||
          generation !== socketGenerationRef.current) return;
      setLive(false); setDriving(false);
      socketRef.current = null;
      cancelFrameDecode(false);
      scheduleReconnect(sessionId, generation, tt("实时浏览器连接失败"));
    };
    return true;
  }

  async function openLive(sessionId?: string): Promise<boolean> {
    const requestedSessionId = sessionId || selectedIdRef.current;
    if (!requestedSessionId || busy) return false;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null;
    }
    const oldSocket = socketRef.current;
    socketRef.current = null;
    try { oldSocket?.close(1000, "new live request"); } catch { /* closed */ }
    const generation = ++socketGenerationRef.current;
    reconnectAttemptsRef.current = 0;
    socketSessionRef.current = requestedSessionId; liveRequestedRef.current = true;
    setLiveRequested(true); setLive(false); setDriving(false);
    setBusy(true); setError("");
    cancelFrameDecode(true);
    return connectLive(requestedSessionId, generation, true);
  }

  function send(message: Record<string, unknown>) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && liveRequestedRef.current &&
        socketSessionRef.current === selectedIdRef.current) {
      try {
        socket.send(JSON.stringify(message));
      } catch {
        // Inputs are deliberately dropped on transport failure. Never queue or
        // replay clicks/keys after a reconnect.
      }
    }
  }

  async function startBrowser() {
    if (busy) return;
    const url = normalizedHttpUrl(targetUrl);
    if (!url) {
      setError(tt("请输入有效的 http:// 或 https:// 网址"));
      return;
    }
    setBusy(true);
    setError("");
    const result = await createCloudBrowser(url, effectiveTaskId || undefined);
    setBusy(false);
    const session = result.data?.session;
    if (!result.ok || !session) {
      setError(result.error || tt("云端浏览器启动失败"));
      return;
    }
    setSessions((current) => [session,
      ...current.filter((item) => item.id !== session.id)]);
    selectedIdRef.current = session.id; setSelectedId(session.id);
    await openLive(session.id);
    void reload(session.id);
  }

  function navigateLive() {
    if (!driving) return;
    const url = normalizedHttpUrl(targetUrl);
    if (!url) { setError(tt("请输入有效的 http:// 或 https:// 网址")); return; }
    setTargetUrl(url); send({ t: "goto", url });
  }

  function canvasPoint(clientX: number, clientY: number, canvas: HTMLCanvasElement) {
    return pointInContainedFrame(clientX, clientY,
      canvas.getBoundingClientRect(), frameSizeRef.current);
  }

  function pointerButton(button: number) {
    return button === 1 ? "middle" : button === 2 ? "right" : "left";
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!driving) return;
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { /* pointer capture is best effort */ }
    const button = pointerButton(event.button);
    activePointerRef.current = { pointerId: event.pointerId, button, point };
    send({ t: "pointer", event: "down", ...point, button });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!driving) return;
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    event.preventDefault();
    if (activePointerRef.current?.pointerId === event.pointerId)
      activePointerRef.current.point = point;
    send({ t: "pointer", event: "move", ...point });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!driving) return;
    const active = activePointerRef.current;
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget) ||
      (active?.pointerId === event.pointerId ? active.point : null);
    if (!point) return;
    event.preventDefault();
    const button = active?.pointerId === event.pointerId ?
      active.button : pointerButton(event.button);
    send({ t: "pointer", event: "up", ...point, button });
    activePointerRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); }
    catch { /* pointer may already be released */ }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (!driving) return;
    const point = canvasPoint(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 :
      event.deltaMode === 2 ? frameSizeRef.current.height : 1;
    const cap = (value: number) => Math.max(-2_000,
      Math.min(2_000, Math.round(value * unit)));
    send({ t: "scroll", ...point, dx: cap(event.deltaX), dy: cap(event.deltaY) });
  }

  function handleCanvasKeyDown(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (!driving || event.nativeEvent.isComposing ||
        event.key === "Process" || event.key === "Dead") return;
    event.preventDefault();
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      send({ t: "key", event: "char", text: event.key }); return;
    }
    send({ t: "key", event: "press", key: playwrightKey(event) });
  }

  function handleCanvasPaste(event: ReactClipboardEvent<HTMLCanvasElement>) {
    if (!driving) return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault(); send({ t: "key", event: "char", text });
  }

  function chooseSession(sessionId: string) {
    if (sessionId === selectedIdRef.current) return;
    stopLive(true); selectedIdRef.current = sessionId; setSelectedId(sessionId);
  }

  async function resume() {
    if (!selectedId) return;
    setBusy(true);
    const result = await resumeCloudBrowser(selectedId);
    setBusy(false);
    if (!result.ok) { setError(result.error || tt("恢复失败")); return; }
    await openLive(selectedId);
    void reload(selectedId);
  }

  async function hibernate() {
    if (!selectedId) return;
    stopLive(true);
    setBusy(true);
    const result = await hibernateCloudBrowser(selectedId);
    setBusy(false);
    if (!result.ok) setError(result.error || tt("保存失败"));
    await reload();
  }

  async function remove() {
    if (!selectedId) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    stopLive(true);
    setBusy(true);
    const result = await deleteCloudBrowser(selectedId);
    setBusy(false); setDeleteArmed(false);
    if (!result.ok) { setError(result.error || tt("删除失败")); return; }
    selectedIdRef.current = ""; setSelectedId("");
    await reload();
  }

  useEffect(() => {
    if (driving) canvasRef.current?.focus({ preventScroll: true });
  }, [driving]);

  if (!sessions.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="w-full max-w-md">
          <BrowserGlyph className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-[13px] text-stone-500">
            {tt("直接打开云端浏览器；Agent 使用时也会复用并保存到这里。")}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void startBrowser(); }}
              placeholder="https://example.com"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-stone-400"
            />
            <button type="button" onClick={() => void startBrowser()}
              disabled={busy || !targetUrl.trim()}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: accent }}>
              {busy ? tt("打开中…") : tt("打开")}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-rose-500">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-50/60">
      <div className="shrink-0 border-b border-stone-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <select value={selectedId}
            onChange={(event) => chooseSession(event.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] text-stone-700 outline-none">
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.last_title || session.last_url || tt("云端浏览器")} ·{" "}
                {new Date(session.updated_at || session.created_at).toLocaleString()}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void startBrowser()}
            disabled={busy || !targetUrl.trim()}
            title={tt("打开新网址")}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] text-stone-600 disabled:opacity-40">
            ＋</button>
          <button type="button"
            onClick={() => void (selected?.status === "hibernated" ? resume() : openLive())}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            style={{ background: accent }}>
            {selected?.status === "hibernated" ? tt("恢复") : tt("实时")}
          </button>
          <button type="button" onClick={() => void hibernate()}
            disabled={busy}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] text-stone-600 disabled:opacity-50">
            {tt("保存")}</button>
          <button type="button" onClick={() => void remove()}
            disabled={busy}
            className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${
              deleteArmed
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-stone-200 text-stone-400"
            }`}>
            {deleteArmed ? tt("确认删除") : tt("删除")}
          </button>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-stone-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live ? "bg-emerald-500" : "bg-stone-300"
            }`}
          />
          <span className="truncate">{title || selected?.last_title || tt("历史页面")}</span>
          <span className="min-w-0 flex-1 truncate text-right">
            {address || selected?.last_url || ""}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") navigateLive();
            }}
            disabled={!driving}
            placeholder={driving ? tt("输入网址并回车") : tt("接管后可输入网址")}
            className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] outline-none disabled:bg-stone-50"
          />
          <button
            type="button"
            onClick={navigateLive}
            disabled={!driving || !targetUrl.trim()}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] text-stone-600 disabled:opacity-40"
          >
            {tt("前往")}
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-stone-900">
        {liveRequested ? (
          <canvas
            ref={canvasRef}
            tabIndex={driving ? 0 : -1}
            aria-label={tt("云端浏览器实时画面")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={handleCanvasKeyDown}
            onPaste={handleCanvasPaste}
            onContextMenu={(event) => { if (driving) event.preventDefault(); }}
            className={`block h-full w-full touch-none object-contain outline-none ${
              driving ? "cursor-crosshair" : ""
            }`}
          />
        ) : shotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shotUrl} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-stone-400">
            {tt("这个时间点没有截图。")}
          </div>
        )}
        {liveRequested && !live && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-stone-950/20 text-[12px] text-stone-300">
            {tt("正在连接实时浏览器…")}
          </div>
        )}
      </div>

      {live && (
        <CloudBrowserLiveControls
          driving={driving}
          typing={typing}
          setTyping={setTyping}
          send={send}
        />
      )}

      {!liveRequested && events.length > 0 && (
        <CloudBrowserTimeline
          events={events}
          selectedId={eventId}
          onSelect={setEventId}
        />
      )}
      {error && (
        <div className="shrink-0 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}
