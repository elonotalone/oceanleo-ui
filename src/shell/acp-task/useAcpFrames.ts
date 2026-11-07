"use client";

import { useEffect, useState } from "react";
import { openFrames, type AcpFrameRow, type AcpFramesState, type AcpLinkState } from "../../lib/acp-frames-api";

export type AcpFramesView = {
  rows: AcpFrameRow[];
  /** `idle` = no task to read (a draft). */
  state: AcpFramesState | "idle";
  /** The last agent-link state the gateway reported, null until it said one. */
  link: AcpLinkState | null;
};

const IDLE: AcpFramesView = { rows: [], state: "idle", link: null };

/** Rows arriving together (a backlog, a burst of chunks) are rendered once per tick. */
const FLUSH_MS = 16;

/**
 * One frames socket per open task page. Rows live only in this page's memory
 * (no cache, no second store); a reconnect continues after the last row.
 */
export function useAcpFrames(taskId: string | null): AcpFramesView {
  const [view, setView] = useState<{ taskId: string; value: AcpFramesView }>({ taskId: "", value: IDLE });
  useEffect(() => {
    if (!taskId) return;
    const frames = openFrames(taskId, 0);
    let pending: AcpFrameRow[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const rows = pending;
      pending = [];
      setView((current) => current.taskId === taskId
        ? { taskId, value: { ...current.value, rows: [...current.value.rows, ...rows] } }
        : current);
    };
    setView({ taskId, value: { rows: [], state: frames.state, link: null } });
    const off = frames.rows$.subscribe((event) => {
      if (event.type === "rows") {
        pending.push(...event.rows);
        if (timer === null) timer = setTimeout(flush, FLUSH_MS);
        return;
      }
      // Rows already received are shown before the state that follows them.
      if (timer !== null) { clearTimeout(timer); flush(); }
      setView((current) => current.taskId !== taskId ? current : {
        taskId,
        value: event.type === "state" ? { ...current.value, state: event.state } : { ...current.value, link: event.link },
      });
    });
    return () => {
      off();
      if (timer !== null) clearTimeout(timer);
      frames.close();
    };
  }, [taskId]);
  return taskId && view.taskId === taskId ? view.value : IDLE;
}
