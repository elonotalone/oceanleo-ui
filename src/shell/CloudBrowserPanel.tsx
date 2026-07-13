"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
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

export function CloudBrowserPanel({
  taskId,
  accent = "#4f46e5",
}: {
  taskId?: string | null;
  accent?: string;
}) {
  const tt = useUI();
  const workspace = useOptionalWorkspaceSession();
  const effectiveTaskId = taskId || workspace?.taskId || "";
  const [sessions, setSessions] = useState<CloudBrowserSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [events, setEvents] = useState<CloudBrowserEvent[]>([]);
  const [eventId, setEventId] = useState<number | null>(null);
  const [shotUrl, setShotUrl] = useState("");
  const [frame, setFrame] = useState("");
  const [live, setLive] = useState(false);
  const [driving, setDriving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [address, setAddress] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://www.google.com/");
  const [title, setTitle] = useState("");
  const [typing, setTyping] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const socketGenerationRef = useRef(0);
  const selectedIdRef = useRef("");
  const taskScopeRef = useRef<string | null>(null);
  const reloadGenerationRef = useRef(0);

  const selected = sessions.find((item) => item.id === selectedId) || null;

  const reload = useCallback(async (preferredId = "") => {
    const generation = ++reloadGenerationRef.current;
    const [recentResult, taskResult] = await Promise.all([
      listCloudBrowsers(),
      effectiveTaskId
        ? listCloudBrowsers(1, effectiveTaskId)
        : Promise.resolve(null),
    ]);
    if (generation !== reloadGenerationRef.current) return;
    if (!recentResult.ok) {
      setError(recentResult.error || tt("云端浏览器加载失败"));
      return;
    }
    if (effectiveTaskId && taskResult && !taskResult.ok) {
      setError(taskResult.error || tt("当前任务的云端浏览器加载失败"));
    } else {
      setError("");
    }
    const recent = recentResult.data?.items || [];
    const scoped = taskResult?.ok ? taskResult.data?.items || [] : [];
    const items = [
      ...scoped,
      ...recent.filter(
        (item) => !scoped.some((scopedItem) => scopedItem.id === item.id),
      ),
    ];
    const scopeChanged = taskScopeRef.current !== effectiveTaskId;
    taskScopeRef.current = effectiveTaskId;
    setSessions(items);
    setSelectedId((current) => {
      if (preferredId && items.some((item) => item.id === preferredId)) {
        return preferredId;
      }
      const taskSession = items.find(
        (item) => effectiveTaskId && item.task_id === effectiveTaskId,
      );
      if (scopeChanged && effectiveTaskId) return taskSession?.id || "";
      if (current && items.some((item) => item.id === current)) return current;
      if (taskSession) return taskSession.id;
      return items[0]?.id || "";
    });
  }, [effectiveTaskId, tt]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    ++socketGenerationRef.current;
    setDeleteArmed(false);
    setFrame("");
    setLive(false);
    setDriving(false);
    socketRef.current?.close();
    socketRef.current = null;
    if (!selectedId) {
      setEvents([]);
      setEventId(null);
      return;
    }
    let alive = true;
    void listCloudBrowserEvents(selectedId).then((result) => {
      if (!alive) return;
      const items = result.data?.items || [];
      setEvents(items);
      const latest = [...items].reverse().find((item) => item.has_screenshot);
      setEventId(latest?.id || null);
    });
    return () => {
      alive = false;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || live) return;
    let alive = true;
    const refreshEvents = () => {
      void listCloudBrowserEvents(selectedId).then((result) => {
        if (!alive || !result.ok) return;
        const items = result.data?.items || [];
        setEvents(items);
        setEventId((current) => {
          if (
            current &&
            items.some((item) => item.id === current && item.has_screenshot)
          ) {
            return current;
          }
          return [...items].reverse().find((item) => item.has_screenshot)?.id || null;
        });
      });
    };
    const timer = window.setInterval(refreshEvents, 5_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [selectedId, live]);

  useEffect(() => {
    if (!eventId || live) {
      setShotUrl("");
      return;
    }
    let url = "";
    let alive = true;
    void cloudBrowserScreenshot(eventId).then((result) => {
      if (!alive || !result.ok || !result.data) return;
      url = URL.createObjectURL(result.data);
      setShotUrl(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId, live]);

  useEffect(
    () => () => {
      socketRef.current?.close();
    },
    [],
  );

  async function openLive(sessionId?: string) {
    const requestedSessionId = sessionId || selectedId;
    if (!requestedSessionId || busy) return;
    const generation = ++socketGenerationRef.current;
    setBusy(true);
    setError("");
    const ticket = await createCloudBrowserTicket(requestedSessionId);
    setBusy(false);
    if (
      generation !== socketGenerationRef.current ||
      selectedIdRef.current !== requestedSessionId
    ) {
      return;
    }
    if (!ticket.ok || !ticket.data) {
      setError(ticket.error || tt("云端浏览器恢复失败"));
      return;
    }
    socketRef.current?.close();
    const socket = new WebSocket(cloudBrowserLiveUrl(requestedSessionId));
    socketRef.current = socket;
    socket.onopen = () => {
      if (socketRef.current !== socket || generation !== socketGenerationRef.current) {
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ t: "auth", ticket: ticket.data!.ticket }));
      setLive(true);
    };
    socket.onmessage = (event) => {
      if (socketRef.current !== socket || generation !== socketGenerationRef.current) {
        return;
      }
      try {
        const message = JSON.parse(String(event.data));
        if (message.t === "frame" && message.data) setFrame(message.data);
        if (message.t === "meta") {
          setAddress(String(message.url || ""));
          setTitle(String(message.title || ""));
        }
        if (message.t === "lock") setDriving(message.driving === "human");
        if (message.t === "error") setError(String(message.msg || ""));
      } catch {
        /* ignore malformed frames */
      }
    };
    socket.onerror = () => {
      if (socketRef.current === socket) setError(tt("实时浏览器连接失败"));
    };
    socket.onclose = () => {
      if (socketRef.current !== socket || generation !== socketGenerationRef.current) {
        return;
      }
      setLive(false);
      setDriving(false);
      socketRef.current = null;
      void reload();
    };
  }

  function send(message: Record<string, unknown>) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  async function startBrowser() {
    if (busy) return;
    let url = targetUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setBusy(true);
    setError("");
    const result = await createCloudBrowser(url, effectiveTaskId || undefined);
    setBusy(false);
    const session = result.data?.session;
    if (!result.ok || !session) {
      setError(result.error || tt("云端浏览器启动失败"));
      return;
    }
    selectedIdRef.current = session.id;
    setSelectedId(session.id);
    await reload(session.id);
    await openLive(session.id);
  }

  function navigateLive() {
    const value = targetUrl.trim();
    if (!driving || !value) return;
    const url = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    send({ t: "key", event: "press", key: "Control+L" });
    send({ t: "key", event: "char", text: url });
    send({ t: "key", event: "press", key: "Enter" });
  }

  function clickFrame(event: MouseEvent<HTMLImageElement>) {
    if (!driving) return;
    const rect = event.currentTarget.getBoundingClientRect();
    send({
      t: "mouse",
      event: "click",
      nx: (event.clientX - rect.left) / rect.width,
      ny: (event.clientY - rect.top) / rect.height,
    });
  }

  async function resume() {
    if (!selectedId) return;
    setBusy(true);
    const result = await resumeCloudBrowser(selectedId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error || tt("恢复失败"));
      return;
    }
    await reload();
    await openLive();
  }

  async function hibernate() {
    if (!selectedId) return;
    socketRef.current?.close();
    setBusy(true);
    const result = await hibernateCloudBrowser(selectedId);
    setBusy(false);
    if (!result.ok) setError(result.error || tt("保存失败"));
    await reload();
  }

  async function remove() {
    if (!selectedId) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setBusy(true);
    const result = await deleteCloudBrowser(selectedId);
    setBusy(false);
    setDeleteArmed(false);
    if (!result.ok) {
      setError(result.error || tt("删除失败"));
      return;
    }
    setSelectedId("");
    await reload();
  }

  if (!sessions.length) {
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="w-full max-w-md">
          <BrowserGlyph className="mx-auto h-10 w-10 text-stone-300" />
          <p className="mt-3 text-[13px] text-stone-500">
            {tt("直接打开云端浏览器；Agent 使用时也会复用并保存到这里。")}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void startBrowser();
              }}
              placeholder="https://example.com"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[12px] outline-none focus:border-stone-400"
            />
            <button
              type="button"
              onClick={() => void startBrowser()}
              disabled={busy || !targetUrl.trim()}
              className="rounded-xl px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: accent }}
            >
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
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] text-stone-700 outline-none"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.last_title || session.last_url || tt("云端浏览器")} ·{" "}
                {new Date(session.updated_at || session.created_at).toLocaleString()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void startBrowser()}
            disabled={busy || !targetUrl.trim()}
            title={tt("打开新网址")}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] text-stone-600 disabled:opacity-40"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => void (selected?.status === "hibernated" ? resume() : openLive())}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            style={{ background: accent }}
          >
            {selected?.status === "hibernated" ? tt("恢复") : tt("实时")}
          </button>
          <button
            type="button"
            onClick={() => void hibernate()}
            disabled={busy}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] text-stone-600 disabled:opacity-50"
          >
            {tt("保存")}
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${
              deleteArmed
                ? "border-rose-300 bg-rose-50 text-rose-600"
                : "border-stone-200 text-stone-400"
            }`}
          >
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
        {live && frame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt={title}
            onClick={clickFrame}
            className={`h-full w-full object-contain ${driving ? "cursor-crosshair" : ""}`}
          />
        ) : shotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shotUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="grid h-full place-items-center text-[12px] text-stone-400">
            {tt("这个时间点没有截图。")}
          </div>
        )}
      </div>

      {live && (
        <div className="shrink-0 border-t border-stone-200 bg-white px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                send({ t: driving ? "release" : "takeover" })
              }
              className={`rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                driving
                  ? "bg-amber-100 text-amber-700"
                  : "bg-stone-100 text-stone-700"
              }`}
            >
              {driving ? tt("交还 Agent") : tt("接管")}
            </button>
            <input
              value={typing}
              onChange={(event) => setTyping(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !driving || !typing) return;
                send({ t: "key", event: "char", text: typing });
                send({ t: "key", event: "press", key: "Enter" });
                setTyping("");
              }}
              disabled={!driving}
              placeholder={driving ? tt("输入文字，回车发送") : tt("接管后可输入")}
              className="min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-[12px] outline-none disabled:bg-stone-50"
            />
            <button
              type="button"
              onClick={() => send({ t: "scroll", dy: 560 })}
              disabled={!driving}
              className="rounded-lg border border-stone-200 px-2 py-1.5 text-[12px] text-stone-500 disabled:opacity-40"
            >
              ↓
            </button>
          </div>
        </div>
      )}

      {!live && events.length > 0 && (
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-stone-200 bg-white p-2">
          {events
            .filter((event) => event.has_screenshot)
            .map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => setEventId(event.id)}
                className={`max-w-[150px] shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-[10px] ${
                  eventId === event.id
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-stone-200 text-stone-500"
                }`}
              >
                <span className="block truncate">{event.title || event.action || tt("页面")}</span>
                <span className="block text-stone-400">
                  {event.created_at
                    ? new Date(event.created_at).toLocaleString()
                    : ""}
                </span>
              </button>
            ))}
        </div>
      )}
      {error && (
        <div className="shrink-0 bg-rose-50 px-3 py-2 text-[12px] text-rose-600">
          {error}
        </div>
      )}
    </div>
  );
}

function BrowserGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M3 8h18M6 6h.01M9 6h.01" strokeLinecap="round" />
      <path d="M8 13h8M10 16h4" strokeLinecap="round" />
    </svg>
  );
}
