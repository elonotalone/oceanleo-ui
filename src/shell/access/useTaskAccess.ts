"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTaskAccess, taskAccessClient, type TaskAccess, type TaskAccessClient } from "./task-access-client";

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
    let pending = false;
    let decisionEpoch = 0;
    let participantCount = 1;
    let membersReadAt = 0;
    const read = async (force = false) => {
      if (controller.signal.aborted) return;
      if (active) { pending ||= force; return; }
      active = true;
      const epoch = decisionEpoch;
      try {
        const [access, signedIn] = await Promise.all([client.getAccess(taskId, controller.signal), client.signedIn()]);
        if (access.role === "owner" && access.general_access !== "private" && access.participant_count === undefined) {
          if (Date.now() - membersReadAt > 5000) {
            try {
              const members = await client.members(taskId);
              participantCount = 1 + members.filter(row => row.role !== "owner" && row.status !== "declined").length;
            } catch { /* Authorship metadata cannot override a successful access decision. */ }
            membersReadAt = Date.now();
          }
          access.participant_count = participantCount;
        }
        if (generation.current === current && !controller.signal.aborted && epoch === decisionEpoch) setSnapshot({ id: taskId, access, signedIn, error: false });
      } catch {
        // Loss of access or a failed revalidation locks sends immediately; no stale write permissions.
        if (generation.current === current && !controller.signal.aborted && epoch === decisionEpoch) setSnapshot(old => ({ id: taskId, access: null, signedIn: old.id === taskId && old.signedIn, error: true }));
      } finally { active = false; if (pending) { pending = false; void read(); } }
    };
    refreshRef.current = () => read(true);
    void read();
    const timer = setInterval(() => { if (document.visibilityState !== "hidden") void read(); }, 2000);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; access?: unknown }>).detail;
      if (detail?.taskId && detail.taskId !== taskId) return;
      ++decisionEpoch;
      membersReadAt = 0;
      if (event.type === "oceanleo:auth-state") setSnapshot({ id: taskId, access: null, signedIn: false, error: false });
      else if (isTaskAccess(detail?.access)) {
        const access = detail.access;
        setSnapshot(old => ({ id: taskId, access, signedIn: old.id === taskId && old.signedIn, error: false }));
      }
      void read(true);
    };
    window.addEventListener(TASK_ACCESS_CHANGED, changed);
    window.addEventListener("focus", changed);
    window.addEventListener("online", changed);
    window.addEventListener("oceanleo:auth-state", changed);
    document.addEventListener("visibilitychange", changed);
    return () => {
      ++generation.current;
      controller.abort(); clearInterval(timer);
      refreshRef.current = async () => {};
      window.removeEventListener(TASK_ACCESS_CHANGED, changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener("online", changed);
      window.removeEventListener("oceanleo:auth-state", changed);
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
