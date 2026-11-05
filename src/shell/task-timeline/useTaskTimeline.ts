"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "../../lib/agent";
import {
  getTaskTimeline,
  openTaskTimeline,
  type TaskLiveEvent,
  type TaskLocalMessageInput,
  type TaskSessionSummary,
  type TaskState,
  type TaskTimelineLiveFrame,
  type TaskTimelineLiveStatus,
  type TaskTimelineEntry,
} from "../../lib/task-timeline-api";
import {
  createTaskTimelineProjectionCache,
  localTaskMessage,
  mapTaskState,
  mapTaskTimelineEntries,
  mergeTaskTimelineUserRows,
  queuedTaskMessages,
  type TaskTimelineProjectionCache,
  type TaskUiState,
} from "./map";

export type TaskTimelineOptions = {
  enabled?: boolean;
  limit?: number;
};

export type TaskLocalSettleOutcome =
  | { ok: true; delivery?: "started" | "injected" | "queued" }
  | { ok: false; reason: string };

export type TaskTimelineResult = {
  items: ReturnType<typeof mapTaskTimelineEntries>;
  state: TaskUiState | null;
  loadOlder: () => Promise<void>;
  hasOlder: boolean;
  loading: boolean;
  olderLoading: boolean;
  error: Error | null;
  sessions: TaskSessionSummary[];
  liveStatus: TaskTimelineLiveStatus;
  liveNotice: boolean;
  retry: () => void;
  sendLocal: (input: TaskLocalMessageInput) => void;
  settleLocal: (clientMessageId: string, outcome: TaskLocalSettleOutcome) => void;
  retryLocal: (clientMessageId: string) => TaskLocalMessageInput | null;
  dropLocal: (clientMessageId: string) => void;
};

type LocalRecord = {
  input: TaskLocalMessageInput;
  createdAt: string;
  delivery: "sending" | "sent" | "unsent";
  reason?: string;
  order: number;
};

const stashedLocals = new Map<string, TaskLocalMessageInput[]>();

/** Save a home-page prompt until the task page's timeline hook mounts. */
export function stashLocalForTask(taskId: string, input: TaskLocalMessageInput): void {
  if (!taskId || !input.clientMessageId) return;
  const current = stashedLocals.get(taskId) ?? [];
  current.push({ ...input, attachments: [...(input.attachments ?? [])] });
  stashedLocals.set(taskId, current);
}

function takeStashedLocals(taskId: string | null | undefined): TaskLocalMessageInput[] {
  if (!taskId) return [];
  const current = stashedLocals.get(taskId) ?? [];
  stashedLocals.delete(taskId);
  return current;
}

function recordsForInputs(inputs: readonly TaskLocalMessageInput[], nextOrder: { current: number }): Map<string, LocalRecord> {
  const records = new Map<string, LocalRecord>();
  const createdAt = new Date().toISOString();
  for (const input of inputs) {
    if (!input.clientMessageId) continue;
    records.set(input.clientMessageId, {
      input: { ...input, attachments: [...(input.attachments ?? [])] },
      createdAt,
      delivery: "sending",
      order: nextOrder.current++,
    });
  }
  return records;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value || "加载任务失败"));
}

function mergeAtCursor(current: TaskTimelineEntry[], incoming: readonly TaskTimelineEntry[], prepend = false): TaskTimelineEntry[] {
  const next = current.slice();
  const indexes = new Map(next.map((entry, index) => [entry.cursor, index]));
  const fresh: TaskTimelineEntry[] = [];
  for (const entry of incoming) {
    const index = indexes.get(entry.cursor);
    if (index === undefined) {
      fresh.push(entry);
      indexes.set(entry.cursor, -1);
    } else if (index >= 0) {
      next[index] = entry;
    }
  }
  if (fresh.length) return prepend ? [...fresh, ...next] : [...next, ...fresh];
  return next;
}

function newestCursor(entries: readonly TaskTimelineEntry[]): string | undefined {
  return entries.length ? entries[entries.length - 1].cursor : undefined;
}

export function committedThrough(entries: readonly TaskTimelineEntry[], sessionId: string): number {
  let through = 0;
  for (const entry of entries) {
    if (entry.source !== "native" || entry.session_id !== sessionId || !Number.isFinite(entry.no_to)) continue;
    through = Math.max(through, entry.no_to as number);
  }
  return through;
}

export function filterLiveFrames(
  entries: readonly TaskTimelineEntry[],
  live: readonly TaskTimelineLiveFrame[],
): TaskTimelineLiveFrame[] {
  const seen = new Set<string>();
  return [...live]
    .filter((frame) => {
      if (!frame || typeof frame.session_id !== "string" || !Number.isSafeInteger(frame.no)) return false;
      if (frame.no <= committedThrough(entries, frame.session_id)) return false;
      const key = `${frame.session_id}:${frame.no}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.no - b.no);
}

export function mergeLiveFrame(
  entries: readonly TaskTimelineEntry[],
  current: readonly TaskTimelineLiveFrame[],
  frame: TaskTimelineLiveFrame,
): TaskTimelineLiveFrame[] {
  if (!frame || typeof frame.session_id !== "string" || !Number.isSafeInteger(frame.no)) return [...current];
  if (frame.no <= committedThrough(entries, frame.session_id)) return filterLiveFrames(entries, current);
  const next = new Map(filterLiveFrames(entries, current).map((item) => [`${item.session_id}:${item.no}`, item]));
  next.set(`${frame.session_id}:${frame.no}`, frame);
  return [...next.values()].sort((a, b) => a.session_id.localeCompare(b.session_id) || a.no - b.no);
}

function serverMessageIds(rows: readonly AgentMessage[]): Set<string> {
  return new Set(rows
    .map((row) => typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "")
    .filter(Boolean));
}

export function useTaskTimeline(taskId: string | null | undefined, options: TaskTimelineOptions = {}): TaskTimelineResult {
  const enabled = options.enabled !== false && Boolean(taskId);
  const limit = options.limit;
  const orderRef = useRef(0);
  const [localRecords, setLocalRecords] = useState<Map<string, LocalRecord>>(() =>
    recordsForInputs(takeStashedLocals(taskId), orderRef),
  );
  const localRecordsRef = useRef(localRecords);
  localRecordsRef.current = localRecords;
  const localTaskRef = useRef(taskId);
  const [entries, setEntries] = useState<TaskTimelineEntry[]>([]);
  const [live, setLive] = useState<TaskTimelineLiveFrame[]>([]);
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [sessions, setSessions] = useState<TaskSessionSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [liveStatus, setLiveStatus] = useState<TaskTimelineLiveStatus>(enabled ? "connecting" : "connected");
  const [liveNotice, setLiveNotice] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const socketRef = useRef<{ close: () => void } | null>(null);
  const taskRef = useRef(taskId);
  taskRef.current = taskId;
  const nextBeforeRef = useRef(nextBefore);
  nextBeforeRef.current = nextBefore;
  const olderLoadingRef = useRef(false);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const liveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mappingCacheRef = useRef<TaskTimelineProjectionCache>(createTaskTimelineProjectionCache());

  const updateLocals = useCallback((update: (current: Map<string, LocalRecord>) => Map<string, LocalRecord>) => {
    setLocalRecords((current) => {
      const next = update(current);
      localRecordsRef.current = next;
      return next;
    });
  }, []);

  const clearLive = useCallback(() => {
    setLive([]);
  }, []);

  const updateLiveStatus = useCallback((status: TaskTimelineLiveStatus) => {
    setLiveStatus(status);
    if (status === "reconnecting") {
      if (liveNoticeTimerRef.current === null) {
        liveNoticeTimerRef.current = setTimeout(() => {
          liveNoticeTimerRef.current = null;
          setLiveNotice(true);
        }, 3_000);
      }
      return;
    }
    if (liveNoticeTimerRef.current !== null) clearTimeout(liveNoticeTimerRef.current);
    liveNoticeTimerRef.current = null;
    setLiveNotice(false);
  }, []);

  useEffect(() => {
    if (localTaskRef.current === taskId) return;
    localTaskRef.current = taskId;
    const next = recordsForInputs(takeStashedLocals(taskId), orderRef);
    localRecordsRef.current = next;
    setLocalRecords(next);
  }, [taskId]);

  const applyPage = useCallback((page: Awaited<ReturnType<typeof getTaskTimeline>>, prepend = false) => {
    setEntries((current) => {
      const next = prepend ? mergeAtCursor(current, page.entries, true) : mergeAtCursor(current, page.entries);
      entriesRef.current = next;
      return next;
    });
    setTaskState(page.state);
    setSessions(page.sessions);
    setHasOlder(page.has_older === true && page.next_before != null);
    setNextBefore(page.next_before ?? null);
  }, []);

  useEffect(() => {
    socketRef.current?.close();
    socketRef.current = null;
    mappingCacheRef.current = createTaskTimelineProjectionCache();
    clearLive();
    updateLiveStatus(enabled ? "connecting" : "connected");
    setEntries([]);
    entriesRef.current = [];
    setTaskState(null);
    setSessions([]);
    setNextBefore(null);
    setHasOlder(false);
    setError(null);
    setLoading(enabled);
    setOlderLoading(false);
    olderLoadingRef.current = false;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let reading = false;
    let loaded = false;
    const retryDelays = [1_000, 2_000, 5_000, 10_000, 15_000];
    const clearRetry = () => {
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
    };
    const runRead = async (): Promise<void> => {
      if (cancelled || !taskId || reading || loaded) return;
      reading = true;
      const controller = new AbortController();
      try {
        const page = await getTaskTimeline(taskId, { limit, signal: controller.signal });
        if (cancelled) return;
        loaded = true;
        clearRetry();
        applyPage(page);
        setLoading(false);
        setError(null);
        socketRef.current = openTaskTimeline(taskId, newestCursor(page.entries), (event: TaskLiveEvent) => {
          if (cancelled) return;
          if (event.type === "entries") {
            const next = mergeAtCursor(entriesRef.current, event.entries);
            entriesRef.current = next;
            setEntries(next);
            setLive((current) => filterLiveFrames(next, current));
          } else if (event.type === "live") {
            setLive((current) => mergeLiveFrame(entriesRef.current, current, event));
          } else if (event.type === "state") {
            setTaskState(event.state);
          } else if (event.type === "error" && event.code === "storage_unavailable") {
            // Storage delay is a degraded stream state. Keep the live socket and
            // committed read healthy; W14 will clear this with the next state.
            setTaskState((current) => current
              ? { ...current, saving_delayed: true, reason: current.reason ?? event.code ?? "storage_unavailable" }
              : current);
          } else if (event.type === "reset") {
            setReloadNonce((value) => value + 1);
          }
        }, undefined, () => {
          if (cancelled) return;
          clearLive();
        }, updateLiveStatus);
      } catch (caught) {
        if (cancelled) return;
        setError(asError(caught));
        setLoading(false);
        const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)];
        retryAttempt += 1;
        clearRetry();
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void runRead();
        }, delay);
      } finally {
        reading = false;
      }
    };
    const retryFromNetwork = () => {
      if (cancelled || loaded || reading) return;
      clearRetry();
      void runRead();
    };
    if (enabled && taskId) {
      void runRead();
      if (typeof window !== "undefined") window.addEventListener("online", retryFromNetwork);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", retryFromNetwork);
    }
    return () => {
      cancelled = true;
      clearRetry();
      if (typeof window !== "undefined") window.removeEventListener("online", retryFromNetwork);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", retryFromNetwork);
      socketRef.current?.close();
      socketRef.current = null;
      if (liveNoticeTimerRef.current !== null) clearTimeout(liveNoticeTimerRef.current);
      liveNoticeTimerRef.current = null;
    };
  }, [applyPage, clearLive, enabled, limit, taskId, reloadNonce, updateLiveStatus]);

  const loadOlder = useCallback(async () => {
    const id = taskRef.current;
    const before = nextBeforeRef.current;
    if (!id || !before || olderLoadingRef.current) return;
    olderLoadingRef.current = true;
    setOlderLoading(true);
    try {
      const page = await getTaskTimeline(id, { before, limit });
      if (taskRef.current === id) {
        applyPage(page, true);
        setError(null);
      }
    } catch (caught) {
      if (taskRef.current === id) setError(asError(caught));
    } finally {
      olderLoadingRef.current = false;
      setOlderLoading(false);
    }
  }, [applyPage, limit]);

  const sendLocal = useCallback((input: TaskLocalMessageInput) => {
    if (!input.clientMessageId) return;
    const record: LocalRecord = {
      input: { ...input, attachments: [...(input.attachments ?? [])] },
      createdAt: new Date().toISOString(),
      delivery: "sending",
      order: orderRef.current++,
    };
    updateLocals((current) => {
      const next = new Map(current);
      next.set(input.clientMessageId, record);
      return next;
    });
  }, [updateLocals]);

  const settleLocal = useCallback((clientMessageId: string, outcome: TaskLocalSettleOutcome) => {
    updateLocals((current) => {
      const previous = current.get(clientMessageId);
      if (!previous) return current;
      const next = new Map(current);
      next.set(clientMessageId, {
        ...previous,
        delivery: outcome.ok ? "sent" : "unsent",
        ...(outcome.ok ? { reason: undefined } : { reason: outcome.reason }),
      });
      return next;
    });
  }, [updateLocals]);

  const retryLocal = useCallback((clientMessageId: string): TaskLocalMessageInput | null => {
    const previous = localRecordsRef.current.get(clientMessageId);
    if (!previous) return null;
    const next = new Map(localRecordsRef.current);
    next.set(clientMessageId, { ...previous, delivery: "sending", reason: undefined });
    localRecordsRef.current = next;
    setLocalRecords(next);
    return { ...previous.input, attachments: [...(previous.input.attachments ?? [])] };
  }, []);

  const dropLocal = useCallback((clientMessageId: string) => {
    updateLocals((current) => {
      if (!current.has(clientMessageId)) return current;
      const next = new Map(current);
      next.delete(clientMessageId);
      return next;
    });
  }, [updateLocals]);

  const state = useMemo(() => taskState ? mapTaskState(taskState) : null, [taskState]);
  const mapped = useMemo(() => mapTaskTimelineEntries(entries, {
    live,
    cache: mappingCacheRef.current,
  }), [entries, live]);
  const queued = useMemo(() => taskState ? queuedTaskMessages(taskState) : [], [taskState]);
  const queuedIds = useMemo(() => serverMessageIds(queued), [queued]);
  const mappedIds = useMemo(() => serverMessageIds(mapped), [mapped]);
  const serverIds = useMemo(() => new Set([...mappedIds, ...queuedIds]), [mappedIds, queuedIds]);

  useEffect(() => {
    if (!serverIds.size) return;
    updateLocals((current) => {
      let changed = false;
      const next = new Map(current);
      for (const id of serverIds) {
        if (next.delete(id)) changed = true;
      }
      return changed ? next : current;
    });
  }, [serverIds, updateLocals]);

  const items = useMemo(() => {
    const marked = mapped.map((row) => {
      const id = String(row.meta?.client_message_id || "");
      if (!id || !queuedIds.has(id)) return row;
      const queuedRow = queued.find((item) => String(item.meta?.client_message_id || "") === id);
      return queuedRow ? {
        ...row,
        meta: {
          ...(row.meta ?? {}),
          task_timeline_queued: true,
          queued: true,
          client_message_id: id,
          ...(queuedRow.meta?.engine ? { engine: queuedRow.meta.engine } : {}),
        },
      } : row;
    });
    const localRows = [...localRecords.values()]
      .sort((a, b) => a.order - b.order)
      .map((record) => localTaskMessage(record.input, record.delivery, record.reason, record.createdAt));
    return mergeTaskTimelineUserRows([...marked, ...queued, ...localRows]);
  }, [localRecords, mapped, queued, queuedIds]);

  return {
    items,
    state,
    loadOlder,
    hasOlder,
    loading,
    olderLoading,
    error,
    sessions,
    liveStatus,
    liveNotice,
    retry: () => setReloadNonce((value) => value + 1),
    sendLocal,
    settleLocal,
    retryLocal,
    dropLocal,
  };
}
