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
};
const noop = async () => undefined;
const IDLE: AcpFramesView = { rows: [], state: "idle", link: null, hasMore: false, loadingEarlier: false, capped: false, loadEarlier: noop };
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
    const fallback = () => { if (!closed) { const frames = openFrames(taskId, 0); setView({ taskId, value: { ...IDLE, state: frames.state, loadEarlier: noop } }); subscribe(frames); } };
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
    const anchor = readTaskConversationAnchor(taskId)?.rowId;
    setView({ taskId, value: { ...IDLE, state: "connecting", loadEarlier } });
    getHistoryWindow(taskId, { anchor, turns: 8 }).then((page) => {
      if (closed) return;
      if (!page || !Array.isArray(page.rows) || typeof page.tail_id !== "number") { fallback(); return; }
      before = page.next_before;
      setView({ taskId, value: { rows: page.rows, state: "connecting", link: null, hasMore: page.has_more, loadingEarlier: false, capped: page.capped, loadEarlier } });
      subscribe(openFrames(taskId, page.tail_id));
    }).catch(fallback);
    return () => { closed = true; unsubscribe?.(); if (timer !== null) clearTimeout(timer); socket?.close(); };
  }, [taskId]);
  return taskId && view.taskId === taskId ? view.value : IDLE;
}
