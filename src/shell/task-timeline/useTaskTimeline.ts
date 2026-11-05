"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTaskTimeline,
  openTaskTimeline,
  type TaskLiveEvent,
  type TaskSessionSummary,
  type TaskState,
  type TaskTimelineEntry,
} from "../../lib/task-timeline-api";
import {
  mapTaskState,
  mapTaskTimelineEntries,
  queuedTaskMessages,
  type TaskUiState,
} from "./map";

export type TaskTimelineOptions = {
  enabled?: boolean;
  limit?: number;
};

export type TaskTimelineResult = {
  items: ReturnType<typeof mapTaskTimelineEntries>;
  state: TaskUiState | null;
  loadOlder: () => Promise<void>;
  hasOlder: boolean;
  loading: boolean;
  error: Error | null;
  sessions: TaskSessionSummary[];
};

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

export function useTaskTimeline(taskId: string | null | undefined, options: TaskTimelineOptions = {}): TaskTimelineResult {
  const enabled = options.enabled !== false && Boolean(taskId);
  const limit = options.limit;
  const [entries, setEntries] = useState<TaskTimelineEntry[]>([]);
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [sessions, setSessions] = useState<TaskSessionSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const socketRef = useRef<{ close: () => void } | null>(null);
  const taskRef = useRef(taskId);
  taskRef.current = taskId;

  const applyPage = useCallback((page: Awaited<ReturnType<typeof getTaskTimeline>>, prepend = false) => {
    setEntries((current) => prepend ? mergeAtCursor(current, page.entries, true) : mergeAtCursor(current, page.entries));
    setTaskState(page.state);
    setSessions(page.sessions);
    setHasOlder(page.has_older === true && page.next_before != null);
    setNextBefore(page.next_before ?? null);
  }, []);

  useEffect(() => {
    socketRef.current?.close();
    socketRef.current = null;
    setEntries([]);
    setTaskState(null);
    setSessions([]);
    setNextBefore(null);
    setHasOlder(false);
    setError(null);
    setLoading(enabled);
    if (!enabled || !taskId) return;
    const controller = new AbortController();
    let cancelled = false;
    void getTaskTimeline(taskId, { limit, signal: controller.signal }).then((page) => {
      if (cancelled) return;
      applyPage(page);
      setLoading(false);
      socketRef.current = openTaskTimeline(taskId, newestCursor(page.entries), (event: TaskLiveEvent) => {
        if (cancelled) return;
        if (event.type === "entries") {
          setEntries((current) => mergeAtCursor(current, event.entries));
        } else if (event.type === "state") {
          setTaskState(event.state);
        } else if (event.type === "reset") {
          setReloadNonce((value) => value + 1);
        }
      }, () => {
        if (!cancelled) setError((current) => current ?? new Error("任务实时连接已断开，正在重连"));
      });
    }).catch((caught) => {
      if (cancelled || controller.signal.aborted) return;
      setError(asError(caught));
      setLoading(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [applyPage, enabled, limit, taskId, reloadNonce]);

  const loadOlder = useCallback(async () => {
    const id = taskRef.current;
    const before = nextBefore;
    if (!id || !before || loading) return;
    setLoading(true);
    try {
      const page = await getTaskTimeline(id, { before, limit });
      applyPage(page, true);
      setError(null);
    } catch (caught) {
      setError(asError(caught));
    } finally {
      setLoading(false);
    }
  }, [applyPage, limit, loading, nextBefore]);

  const state = useMemo(() => taskState ? mapTaskState(taskState) : null, [taskState]);
  const items = useMemo(() => {
    const mapped = mapTaskTimelineEntries(entries);
    const queued = taskState ? queuedTaskMessages(taskState) : [];
    const committedIds = new Set(mapped.map((row) => String(row.meta?.client_message_id || "")).filter(Boolean));
    const marked = mapped.map((row) => {
      const id = String(row.meta?.client_message_id || "");
      if (!id || !queued.some((item) => String(item.meta?.client_message_id || "") === id)) return row;
      const queuedRow = queued.find((item) => String(item.meta?.client_message_id || "") === id)!;
      return { ...row, meta: { ...(row.meta ?? {}), task_timeline_queued: true, queued: true, client_message_id: id, ...(queuedRow.meta?.engine ? { engine: queuedRow.meta.engine } : {}) } };
    });
    return [...marked, ...queued.filter((item) => !committedIds.has(String(item.meta?.client_message_id || "")))];
  }, [entries, taskState]);
  return { items, state, loadOlder, hasOlder, loading, error, sessions };
}
