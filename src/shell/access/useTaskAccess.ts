"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { taskAccessClient, type TaskAccess, type TaskAccessClient } from "./task-access-client";

export const TASK_ACCESS_CHANGED = "oceanleo:task-access-changed";
export function notifyTaskAccessChanged(taskId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TASK_ACCESS_CHANGED, { detail: { taskId } }));
}

/** Server decisions are refreshed while the page is open, including after revocation. */
export function useTaskAccess(taskId: string | null | undefined, client: TaskAccessClient = taskAccessClient) {
  const [snapshot, setSnapshot] = useState<{ id: string; access: TaskAccess | null; signedIn: boolean; error: boolean }>({ id: "", access: null, signedIn: false, error: false });
  const generation = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    const current = ++generation.current;
    if (!taskId) return;
    const controller = new AbortController();
    let active = false;
    const read = async () => {
      if (active || controller.signal.aborted) return;
      active = true;
      try {
        const [access, signedIn] = await Promise.all([client.getAccess(taskId, controller.signal), client.signedIn()]);
        if (generation.current === current && !controller.signal.aborted) setSnapshot({ id: taskId, access, signedIn, error: false });
      } catch {
        // Loss of access or a failed revalidation locks sends immediately; no stale write permissions.
        if (generation.current === current && !controller.signal.aborted) setSnapshot(old => ({ id: taskId, access: null, signedIn: old.id === taskId && old.signedIn, error: true }));
      } finally { active = false; }
    };
    refreshRef.current = read;
    void read();
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") void read(); }, 2000);
    const changed = (event: Event) => {
      const id = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!id || id === taskId) void read();
    };
    window.addEventListener(TASK_ACCESS_CHANGED, changed);
    window.addEventListener("focus", changed);
    window.addEventListener("online", changed);
    document.addEventListener("visibilitychange", changed);
    return () => {
      ++generation.current;
      controller.abort(); clearInterval(timer);
      refreshRef.current = async () => {};
      window.removeEventListener(TASK_ACCESS_CHANGED, changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener("online", changed);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [taskId, client]);
  return {
    access: snapshot.id === taskId ? snapshot.access : null,
    signedIn: snapshot.id === taskId && snapshot.signedIn,
    error: snapshot.id === taskId && snapshot.error,
    loading: Boolean(taskId && (snapshot.id !== taskId || !snapshot.access && !snapshot.error)),
    refresh,
  };
}
