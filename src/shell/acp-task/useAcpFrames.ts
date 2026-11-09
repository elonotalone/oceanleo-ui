"use client";

import { useEffect, useState } from "react";
import { getHistoryWindow, openFrames, type AcpFrameRow, type AcpFramesState, type AcpLinkState } from "../../lib/acp-frames-api";
import { readTaskConversationAnchor } from "../task-open-cache";

export type AcpFramesView = {
  rows: AcpFrameRow[];
  state: AcpFramesState | "idle";
  link: AcpLinkState | null;
  hasMore: boolean;
  loadingEarlier: boolean;
  capped: boolean;
  loadEarlier: () => Promise<void>;
  hasMoreAfter: boolean;
  jumpingLatest: boolean;
  jumpToLatest: () => Promise<void>;
};
const noop = async () => undefined;
const IDLE: AcpFramesView = { rows: [], state: "idle", link: null, hasMore: false, loadingEarlier: false, capped: false, loadEarlier: noop, hasMoreAfter: false, jumpingLatest: false, jumpToLatest: noop };
const FLUSH_MS = 16;

/** Open C9's bounded window, then stream rows after its tail; old gateways fall back to frames. */
export function useAcpFrames(taskId: string | null): AcpFramesView {
  const [view, setView] = useState<{ taskId: string; value: AcpFramesView }>({ taskId: "", value: IDLE });
  useEffect(() => {
    if (!taskId) return;
    let closed = false;
    let socket: ReturnType<typeof openFrames> | null = null;
    let unsubscribe: (() => void) | null = null;
    let before: number | null = null;
    let anchor: number | undefined = readTaskConversationAnchor(taskId)?.rowId;
    let loadingEarlier = false;
    let pending: AcpFrameRow[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const append = (rows: AcpFrameRow[]) => {
      if (closed || !rows.length) return;
      setView((current) => {
        if (current.taskId !== taskId) return current;
        const known = new Set(current.value.rows.map((row) => row.id));
        const fresh = rows.filter((row) => !known.has(row.id));
        return fresh.length ? { taskId, value: { ...current.value, rows: [...current.value.rows, ...fresh] } } : current;
      });
    };
    const flush = () => { timer = null; const rows = pending; pending = []; append(rows); };
    const subscribe = (frames: ReturnType<typeof openFrames>) => {
      socket = frames;
      unsubscribe = frames.rows$.subscribe((event) => {
        if (event.type === "rows") { pending.push(...event.rows); if (timer === null) timer = setTimeout(flush, FLUSH_MS); return; }
        if (timer !== null) { clearTimeout(timer); flush(); }
        setView((current) => current.taskId !== taskId ? current : { taskId, value: event.type === "state" ? { ...current.value, state: event.state } : { ...current.value, link: event.link } });
      });
    };
    const fallback = () => { if (!closed) { const frames = openFrames(taskId, 0); setView({ taskId, value: { ...IDLE, state: frames.state, loadEarlier: noop, jumpToLatest: noop } }); subscribe(frames); } };
    const loadEarlier = async () => {
      if (closed || loadingEarlier || before == null) return;
      loadingEarlier = true;
      setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, loadingEarlier: true } } : current);
      try {
        const page = await getHistoryWindow(taskId, { before, turns: 8 });
        if (closed) return;
        before = page.next_before;
        setView((current) => {
          if (current.taskId !== taskId) return current;
          const known = new Set(current.value.rows.map((row) => row.id));
          const older = page.rows.filter((row) => !known.has(row.id));
          return { taskId, value: { ...current.value, rows: [...older, ...current.value.rows], hasMore: page.has_more, capped: page.capped, loadingEarlier: false } };
        });
      } finally {
        loadingEarlier = false;
        if (!closed) setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, loadingEarlier: false } } : current);
      }
    };
    const attachWindow = (page: Awaited<ReturnType<typeof getHistoryWindow>>, rows: AcpFrameRow[]) => {
      before = page.next_before;
      setView({ taskId, value: { rows, state: "connecting", link: null, hasMore: page.has_more, loadingEarlier: false, capped: page.capped, loadEarlier, hasMoreAfter: Boolean(page.has_more_after), jumpingLatest: false, jumpToLatest } });
      subscribe(openFrames(taskId, page.tail_id));
    };
    const fillForward = async (page: Awaited<ReturnType<typeof getHistoryWindow>>) => {
      let rows = [...page.rows];
      let cursor = page.next_after ?? page.newest_id;
      let hasMoreAfter = page.has_more_after === true;
      let current = page;
      let guard = 0;
      while (!closed && anchor != null && hasMoreAfter && cursor != null && guard++ < 32) {
        current = await getHistoryWindow(taskId, { after: cursor, turns: 8 });
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
      const page = await getHistoryWindow(taskId, { turns: 8 });
      if (closed || !Array.isArray(page.rows)) return;
      unsubscribe?.(); socket?.close(); unsubscribe = null; socket = null;
      anchor = undefined;
      attachWindow(page, page.rows);
    };
    setView({ taskId, value: { ...IDLE, state: "connecting", loadEarlier, jumpToLatest } });
    getHistoryWindow(taskId, { anchor, turns: 8 }).then(async (page) => {
      if (closed) return;
      if (!page || !Array.isArray(page.rows) || typeof page.tail_id !== "number") { fallback(); return; }
      if (anchor == null || page.has_more_after !== true) attachWindow(page, page.rows);
      else {
        setView((current) => current.taskId === taskId ? { ...current, value: { ...current.value, rows: page.rows, hasMoreAfter: true } } : current);
        const oldestBefore = before;
        const filled = await fillForward(page);
        if (!closed) {
          attachWindow(filled.page, filled.rows);
          before = oldestBefore;
        }
      }
    }).catch(fallback);
    return () => { closed = true; unsubscribe?.(); if (timer !== null) clearTimeout(timer); socket?.close(); };
  }, [taskId]);
  return taskId && view.taskId === taskId ? view.value : IDLE;
}
