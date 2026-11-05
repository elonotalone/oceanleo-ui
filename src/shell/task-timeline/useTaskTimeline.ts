"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentMessage } from "../../lib/agent";
import {
  getTaskTimeline,
  openTaskTimeline,
  type TaskAcceptedMessage,
  type TaskLiveEvent,
  type TaskLocalMessageInput,
  type TaskSessionSummary,
  type TaskState,
  type TaskTimelineEntry,
  type TaskTimelineInflightEntry,
} from "../../lib/task-timeline-api";
import {
  acceptedTaskMessage,
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

function inflightKey(entry: Pick<TaskTimelineInflightEntry, "session_id" | "epoch" | "s">): string {
  return `${entry.session_id}:${entry.epoch}:${entry.s}`;
}

function coverageKey(entry: Pick<TaskTimelineInflightEntry, "session_id" | "epoch">): string {
  return `${entry.session_id}:${entry.epoch}`;
}

function sortInflight(entries: Iterable<TaskTimelineInflightEntry>): TaskTimelineInflightEntry[] {
  return [...entries].sort((a, b) => a.session_id.localeCompare(b.session_id) || a.epoch.localeCompare(b.epoch) || a.s - b.s);
}

export function filterCoveredInflight(
  entries: readonly TaskTimelineInflightEntry[],
  covers: ReadonlyMap<string, number>,
): TaskTimelineInflightEntry[] {
  return sortInflight(entries.filter((entry) => entry.s > (covers.get(coverageKey(entry)) ?? 0)));
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
  const [inflight, setInflight] = useState<TaskTimelineInflightEntry[]>([]);
  const [coverage, setCoverage] = useState<Map<string, number>>(new Map());
  const [accepted, setAccepted] = useState<Map<string, TaskAcceptedMessage>>(new Map());
  const [taskState, setTaskState] = useState<TaskState | null>(null);
  const [sessions, setSessions] = useState<TaskSessionSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [olderLoading, setOlderLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const socketRef = useRef<{ close: () => void } | null>(null);
  const taskRef = useRef(taskId);
  taskRef.current = taskId;
  const nextBeforeRef = useRef(nextBefore);
  nextBeforeRef.current = nextBefore;
  const olderLoadingRef = useRef(false);
  const coverageRef = useRef(coverage);
  coverageRef.current = coverage;
  const mappingCacheRef = useRef<TaskTimelineProjectionCache>(createTaskTimelineProjectionCache());

  const updateLocals = useCallback((update: (current: Map<string, LocalRecord>) => Map<string, LocalRecord>) => {
    setLocalRecords((current) => {
      const next = update(current);
      localRecordsRef.current = next;
      return next;
    });
  }, []);

  const clearLive = useCallback(() => {
    coverageRef.current = new Map();
    setCoverage(new Map());
    setInflight([]);
    setAccepted(new Map());
  }, []);

  useEffect(() => {
    if (localTaskRef.current === taskId) return;
    localTaskRef.current = taskId;
    const next = recordsForInputs(takeStashedLocals(taskId), orderRef);
    localRecordsRef.current = next;
    setLocalRecords(next);
  }, [taskId]);

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
    mappingCacheRef.current = createTaskTimelineProjectionCache();
    clearLive();
    setEntries([]);
    setTaskState(null);
    setSessions([]);
    setNextBefore(null);
    setHasOlder(false);
    setError(null);
    setLoading(enabled);
    setOlderLoading(false);
    olderLoadingRef.current = false;
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
        } else if (event.type === "inflight") {
          setInflight((current) => {
            const next = new Map(current.map((entry) => [inflightKey(entry), entry]));
            for (const entry of event.entries) {
              const through = coverageRef.current.get(coverageKey(entry)) ?? 0;
              if (entry.s > through) next.set(inflightKey(entry), entry);
            }
            return filterCoveredInflight([...next.values()], coverageRef.current);
          });
        } else if (event.type === "covered") {
          const nextCoverage = new Map(coverageRef.current);
          for (const cover of event.covers) {
            const key = coverageKey(cover);
            nextCoverage.set(key, Math.max(nextCoverage.get(key) ?? 0, cover.through));
          }
          coverageRef.current = nextCoverage;
          setCoverage(nextCoverage);
          setInflight((current) => filterCoveredInflight(current, nextCoverage));
        } else if (event.type === "accepted") {
          const message = event.message;
          if (message?.client_message_id) {
            setAccepted((current) => {
              const next = new Map(current);
              next.set(message.client_message_id, message);
              return next;
            });
          }
        } else if (event.type === "state") {
          setTaskState(event.state);
        } else if (event.type === "reset") {
          setReloadNonce((value) => value + 1);
        }
      }, (event) => {
        if (!cancelled) setError((current) => current ?? new Error(`任务实时连接已断开${event?.type ? `（${event.type}）` : ""}，正在重连`));
      }, () => {
        if (cancelled) return;
        clearLive();
        setError(null);
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
  }, [applyPage, clearLive, enabled, limit, taskId, reloadNonce]);

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
    inflight,
    cache: mappingCacheRef.current,
  }), [entries, inflight]);
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
    setAccepted((current) => {
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
    const acceptedRows = [...accepted.values()].map(acceptedTaskMessage);
    const localRows = [...localRecords.values()]
      .sort((a, b) => a.order - b.order)
      .map((record) => localTaskMessage(record.input, record.delivery, record.reason, record.createdAt));
    return mergeTaskTimelineUserRows([...marked, ...queued, ...acceptedRows, ...localRows]);
  }, [accepted, localRecords, mapped, queued, queuedIds]);

  return {
    items,
    state,
    loadOlder,
    hasOlder,
    loading,
    olderLoading,
    error,
    sessions,
    sendLocal,
    settleLocal,
    retryLocal,
    dropLocal,
  };
}
