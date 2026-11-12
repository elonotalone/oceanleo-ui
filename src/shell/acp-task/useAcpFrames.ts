"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getFrame, getHistoryWindow, openFrames, type AcpFrameRow, type AcpFramesState, type AcpLinkState } from "../../lib/acp-frames-api";
import { readTaskConversationAnchor } from "../task-open-cache";

export type AcpFramesView = {
  rows: AcpFrameRow[];
  state: AcpFramesState | "idle";
  link: AcpLinkState | null;
  hasMore: boolean;
  loadingEarlier: boolean;
  capped: boolean;
  loadEarlier: () => Promise<void>;
  expandRow: (rowId: number) => Promise<void>;
  hasMoreAfter: boolean;
  jumpingLatest: boolean;
  jumpToLatest: () => Promise<void>;
};
const noop = async () => undefined;
const IDLE: AcpFramesView = { rows: [], state: "idle", link: null, hasMore: false, loadingEarlier: false, capped: false, loadEarlier: noop, hasMoreAfter: false, jumpingLatest: false, jumpToLatest: noop, expandRow: noop };
const FLUSH_MS = 16;

/** Read stored history from the route id; the live connection is an independent effect. */
export function useAcpFrames(taskId: string | null, nativeHint = true): AcpFramesView {
  const [view, setView] = useState<{ taskId: string; value: AcpFramesView }>({ taskId: "", value: IDLE });
  const [tail, setTail] = useState<{ taskId: string; after: number } | null>(null);
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
    let anchor: number | undefined = readTaskConversationAnchor(taskId)?.rowId;
    let earlierRequest: Promise<void> | null = null;
    let windowVersion = 0;
    const controller = new AbortController();
    const fallback = () => {
      if (closed) return;
      setView({ taskId, value: { ...IDLE, state: "connecting", expandRow } });
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
      setView({ taskId, value: { rows, state: "connecting", link: null, hasMore: page.has_more, loadingEarlier: false, capped: page.capped, loadEarlier, expandRow, hasMoreAfter: Boolean(page.has_more_after), jumpingLatest: false, jumpToLatest } });
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
    setView({ taskId, value: { ...IDLE, state: "connecting", loadEarlier, expandRow, jumpToLatest } });
    setTail(null);
    getHistoryWindow(taskId, { anchor, turns: 8, signal: controller.signal }).then((page) => {
      if (closed) return;
      if (!page || !Array.isArray(page.rows) || typeof page.tail_id !== "number") { fallback(); return; }
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
  }, [taskId, expandRow]);
  const canStream = nativeHint || (view.taskId === taskId && view.value.rows.length > 0);
  useEffect(() => {
    if (!taskId || !canStream || tail?.taskId !== taskId) return;
    const socket = openFrames(taskId, tail.after);
    let pending: AcpFrameRow[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const rows = pending; pending = [];
      if (!rows.length) return;
      setView((current) => {
        if (current.taskId !== taskId) return current;
        const known = new Set(current.value.rows.map((row) => row.id));
        const fresh = rows.filter((row) => !known.has(row.id));
        return fresh.length ? { taskId, value: { ...current.value, rows: [...current.value.rows, ...fresh].sort((a, b) => a.id - b.id) } } : current;
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
        taskId, value: event.type === "state" ? { ...current.value, state: event.state } : { ...current.value, link: event.link },
      });
    });
    return () => { unsubscribe(); if (timer !== null) clearTimeout(timer); socket.close(); };
  }, [taskId, canStream, tail]);
  return taskId && view.taskId === taskId ? view.value : IDLE;
}
