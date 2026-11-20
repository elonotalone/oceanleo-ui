"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getFrame, getFrames, getHistoryWindow, openFrames, type AcpCatalog, type AcpFrameRow, type AcpFrames, type AcpFramesState, type AcpLinkState } from "../../lib/acp-frames-api";
import { readTaskConversationAnchor } from "../task-open-cache";

export type AcpFramesView = {
  rows: AcpFrameRow[];
  state: AcpFramesState | "idle";
  link: AcpLinkState | null;
  configState: AcpCatalog | null;
  hasMore: boolean;
  loadingEarlier: boolean;
  capped: boolean;
  loadEarlier: () => Promise<void>;
  expandRow: (rowId: number) => Promise<void>;
  hasMoreAfter: boolean;
  jumpingLatest: boolean;
  jumpToLatest: () => Promise<void>;
  /**
   * Read every stored row after the newest one this page has (the socket may have missed them) and add them; when it
   * did miss some, reconnect the socket too. Also runs when the tab becomes visible again.
   */
  catchUp: () => Promise<void>;
};
const noop = async () => undefined;
const IDLE: AcpFramesView = { rows: [], state: "idle", link: null, configState: null, hasMore: false, loadingEarlier: false, capped: false, loadEarlier: noop, hasMoreAfter: false, jumpingLatest: false, jumpToLatest: noop, expandRow: noop, catchUp: noop };
const FLUSH_MS = 16;
const CATCH_UP_PAGE = 500;
const CATCH_UP_PAGES = 20;

/** Rows not yet in `current`, merged in id order (null when nothing is new). */
function mergeRows(current: readonly AcpFrameRow[], incoming: readonly AcpFrameRow[]): AcpFrameRow[] | null {
  const known = new Set(current.map((row) => row.id));
  const fresh = incoming.filter((row) => !known.has(row.id));
  return fresh.length ? [...current, ...fresh].sort((a, b) => a.id - b.id) : null;
}

/** Read stored history from the route id; the live connection is an independent effect. */
export function useAcpFrames(taskId: string | null, nativeHint = true): AcpFramesView {
  const [view, setView] = useState<{ taskId: string; value: AcpFramesView }>({ taskId: "", value: IDLE });
  const [tail, setTail] = useState<{ taskId: string; after: number } | null>(null);
  const viewRef = useRef(view);
  const tailRef = useRef(tail);
  useLayoutEffect(() => { viewRef.current = view; tailRef.current = tail; }, [view, tail]);
  const socketRef = useRef<{ taskId: string; socket: AcpFrames } | null>(null);
  const catching = useRef<{ taskId: string; promise: Promise<void> } | null>(null);
  const catchUp = useCallback((): Promise<void> => {
    if (!taskId) return Promise.resolve();
    if (catching.current?.taskId === taskId) return catching.current.promise;
    const promise = (async () => {
      const shown = viewRef.current.taskId === taskId ? viewRef.current.value.rows : [];
      const start = tailRef.current?.taskId === taskId ? tailRef.current.after : null;
      // Before the first window has loaded there is nothing to catch up to; with no window at all the socket
      // already replays every row from the start.
      if (start === null || start === 0 && !shown.length) return;
      let after = shown.reduce((max, row) => Math.max(max, row.id), start);
      const found: AcpFrameRow[] = [];
      for (let page = 0; page < CATCH_UP_PAGES; page++) {
        const rows = await getFrames(taskId, after, CATCH_UP_PAGE);
        if (!Array.isArray(rows) || !rows.length) break;
        found.push(...rows);
        after = rows.reduce((max, row) => Math.max(max, row.id), after);
        if (rows.length < CATCH_UP_PAGE) break;
      }
      if (!found.length) return;
      setView((current) => {
        if (current.taskId !== taskId) return current;
        const rows = mergeRows(current.value.rows, found);
        return rows ? { taskId, value: { ...current.value, rows } } : current;
      });
      // Stored rows the socket never delivered: it is behind or dead, open a new one from its cursor.
      if (socketRef.current?.taskId === taskId) socketRef.current.socket.resync();
    })().finally(() => { if (catching.current?.promise === promise) catching.current = null; });
    catching.current = { taskId, promise };
    return promise;
  }, [taskId]);
  useEffect(() => {
    if (!taskId || typeof document === "undefined") return;
    const onVisible = () => { if (document.visibilityState === "visible") void catchUp().catch(() => undefined); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [taskId, catchUp]);
  const expandRow = useCallback(async (rowId: number) => {
    if (!taskId) return;
    const full = await getFrame(taskId, rowId);
    if (full.id !== rowId) throw new Error("消息内容不匹配，请重试");
    setView((current) => current.taskId !== taskId ? current : {
      taskId, value: { ...current.value, rows: current.value.rows.map((row) => row.id === rowId ? { ...full, truncated: undefined } : row) },
    });
  }, [taskId]);
  const committed = useRef<Array<{ taskId: string; rowId: number | null; resolve: () => void }>>([]);
  useLayoutEffect(() => {
    committed.current = committed.current.filter((waiter) => {
      if (waiter.taskId === view.taskId && (waiter.rowId == null || view.value.rows.some((row) => row.id === waiter.rowId))) {
        waiter.resolve();
        return false;
      }
      return true;
    });
  }, [view]);
  useEffect(() => {
    if (!taskId) return;
    let closed = false;
    let before: number | null = null;
    const saved = readTaskConversationAnchor(taskId);
    let anchor: number | undefined = saved && !saved.atBottom && Number.isSafeInteger(saved.rowId) ? saved.rowId : undefined;
    let earlierRequest: Promise<void> | null = null;
    let windowVersion = 0;
    const controller = new AbortController();
    const fallback = () => {
      if (closed) return;
      setView({ taskId, value: { ...IDLE, state: "connecting", expandRow, catchUp } });
      setTail({ taskId, after: 0 });
    };
    const loadEarlier = (): Promise<void> => {
      if (earlierRequest) return earlierRequest;
      if (closed || before == null) return Promise.resolve();
      earlierRequest = (async () => {
        setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, loadingEarlier: true } } : current);
        try {
          const page = await getHistoryWindow(taskId, { before, turns: 8, signal: controller.signal });
          if (closed) return;
          before = page.next_before;
          const applied = new Promise<void>((resolve) => {
            committed.current.push({ taskId, rowId: page.rows[0]?.id ?? null, resolve });
          });
          setView((current) => {
            if (current.taskId !== taskId) return current;
            const known = new Set(current.value.rows.map((row) => row.id));
            const older = page.rows.filter((row) => !known.has(row.id));
            return { taskId, value: { ...current.value, rows: older.length ? [...older, ...current.value.rows] : current.value.rows, hasMore: page.has_more, capped: page.capped, loadingEarlier: false } };
          });
          await applied;
        } finally {
          earlierRequest = null;
          if (!closed) setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, loadingEarlier: false } } : current);
        }
      })();
      return earlierRequest;
    };
    const attachWindow = (page: Awaited<ReturnType<typeof getHistoryWindow>>, rows: AcpFrameRow[]) => {
      before = page.next_before;
      windowVersion += 1;
      setView({ taskId, value: { rows, state: "connecting", link: page.link ?? null, configState: page.config_state ?? null, hasMore: page.has_more, loadingEarlier: false, capped: page.capped, loadEarlier, expandRow, hasMoreAfter: Boolean(page.has_more_after), jumpingLatest: false, jumpToLatest, catchUp } });
      setTail({ taskId, after: page.tail_id });
    };
    const fillForward = async (page: Awaited<ReturnType<typeof getHistoryWindow>>) => {
      let rows = [...page.rows];
      let cursor = page.next_after ?? page.newest_id;
      let hasMoreAfter = page.has_more_after === true;
      let current = page;
      let guard = 0;
      while (!closed && anchor != null && hasMoreAfter && cursor != null && guard++ < 32) {
        current = await getHistoryWindow(taskId, { after: cursor, turns: 8, signal: controller.signal });
        const known = new Set(rows.map((row) => row.id));
        rows = [...rows, ...current.rows.filter((row) => !known.has(row.id))];
        cursor = current.next_after ?? current.newest_id;
        hasMoreAfter = current.has_more_after === true;
      }
      return { page: current, rows };
    };
    const jumpToLatest = async () => {
      if (closed) return;
      setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, jumpingLatest: true } } : current);
      const page = await getHistoryWindow(taskId, { turns: 8, signal: controller.signal });
      if (closed || !Array.isArray(page.rows)) return;
      anchor = undefined;
      attachWindow(page, page.rows);
    };
    setView({ taskId, value: { ...IDLE, state: "connecting", loadEarlier, expandRow, jumpToLatest, catchUp } });
    setTail(null);
    getHistoryWindow(taskId, { anchor, turns: 8, signal: controller.signal }).then(async (page) => {
      if (closed) return;
      if (!page || !Array.isArray(page.rows) || typeof page.tail_id !== "number") { fallback(); return; }
      // A long turn can exceed the server's row cap: even an anchored window
      // then contains only its newest chunks. Recover the earlier pages before
      // deciding the saved message is gone or rendering a different chunk id.
      while (anchor != null && !page.rows.some((row) => row.id === anchor)
        && page.has_more && page.next_before != null && page.next_before > anchor) {
        const before = page.next_before;
        const older = await getHistoryWindow(taskId, { before, turns: 8, signal: controller.signal });
        if (closed) return;
        if (!Array.isArray(older.rows) || !older.rows.length
          || older.next_before != null && older.next_before >= before) break;
        const known = new Set(page.rows.map((row) => row.id));
        page = { ...page, rows: [...older.rows.filter((row) => !known.has(row.id)), ...page.rows],
          oldest_id: older.oldest_id, next_before: older.next_before, has_more: older.has_more,
          capped: page.capped || older.capped };
      }
      if (anchor != null && !page.rows.some((row) => row.id === anchor)) {
        void jumpToLatest().catch(fallback);
        return;
      }
      attachWindow(page, page.rows);
      if (anchor != null && page.has_more_after === true) {
        const version = windowVersion;
        // The first stored window already renders and subscribes. Forward fill
        // must not postpone live rows or overwrite rows that arrived meanwhile.
        void fillForward(page).then((filled) => {
          if (closed || version !== windowVersion) return;
          setView((current) => {
            if (current.taskId !== taskId) return current;
            const known = new Set(current.value.rows.map((row) => row.id));
            const fresh = filled.rows.filter((row) => !known.has(row.id));
            return { taskId, value: { ...current.value, rows: [...current.value.rows, ...fresh].sort((a, b) => a.id - b.id), hasMoreAfter: Boolean(filled.page.has_more_after) } };
          });
        }).catch(() => { /* Keep the displayed window; Latest remains available for retry. */ });
      }
    }).catch(fallback);
    return () => { closed = true;
      committed.current = committed.current.filter((waiter) => { if (waiter.taskId !== taskId) return true; waiter.resolve(); return false; });
      controller.abort(); };
  }, [taskId, expandRow, catchUp]);
  const canStream = nativeHint || (view.taskId === taskId && view.value.rows.length > 0);
  useEffect(() => {
    if (!taskId || !canStream || tail?.taskId !== taskId) return;
    const socket = openFrames(taskId, tail.after);
    socketRef.current = { taskId, socket };
    let pending: AcpFrameRow[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const rows = pending; pending = [];
      if (!rows.length) return;
      setView((current) => {
        if (current.taskId !== taskId) return current;
        const merged = mergeRows(current.value.rows, rows);
        return merged ? { taskId, value: { ...current.value, rows: merged } } : current;
      });
    };
    const unsubscribe = socket.rows$.subscribe((event) => {
      if (event.type === "rows") {
        pending.push(...event.rows);
        if (timer === null) timer = setTimeout(flush, FLUSH_MS);
        return;
      }
      if (timer !== null) { clearTimeout(timer); flush(); }
      setView((current) => current.taskId !== taskId ? current : {
        taskId, value: event.type === "state" ? { ...current.value, state: event.state }
          : event.type === "config" ? { ...current.value, configState: event.configState }
            : { ...current.value, link: event.link },
      });
    });
    return () => {
      unsubscribe(); if (timer !== null) clearTimeout(timer); socket.close();
      if (socketRef.current?.socket === socket) socketRef.current = null;
    };
  }, [taskId, canStream, tail]);
  return taskId && view.taskId === taskId ? view.value : IDLE;
}
