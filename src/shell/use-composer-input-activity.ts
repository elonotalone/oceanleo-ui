"use client";

import { useCallback, useEffect, useRef } from "react";
import { request } from "../lib/acp-frames-api";
import { notifyHistoryActivity } from "../lib/history-events";

/** Only the timestamp leaves the composer; text and attachments stay in drafts. */
export function useComposerInputActivity(
  taskId: string | undefined,
  value: string,
  change: (next: string) => void,
): (next: string) => void {
  const pending = useRef<{ taskId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const flush = useCallback(() => {
    const entry = pending.current;
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.current = null;
    // Advisory write: failures leave the user's text intact; the next edit
    // retries. The list uses the local timestamp immediately.
    void request(`/v1/agent/tasks/${encodeURIComponent(entry.taskId)}/input-activity`, {
      method: "POST", keepalive: true,
    }).catch(() => {});
  }, []);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [taskId, flush]);
  return useCallback((next: string) => {
    change(next);
    if (!taskId || next === value || !next.trim()) return;
    notifyHistoryActivity({ taskId, user: true, at: new Date().toISOString() });
    // One write per typing interval, including continuous typing. A task
    // switch/unmount flushes the last edit against its original task id.
    if (!pending.current) pending.current = { taskId, timer: setTimeout(flush, 2_000) };
  }, [taskId, value, change, flush]);
}
