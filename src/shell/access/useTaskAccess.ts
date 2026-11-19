"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cacheUser } from "../../lib/user-scoped-cache";
import { isTaskAccess, TaskAccessError, taskAccessClient, type TaskAccess, type TaskAccessClient } from "./task-access-client";

export const TASK_ACCESS_CHANGED = "oceanleo:task-access-changed";
export const TASK_ACCESS_POLL_MS = 15_000;
export const TASK_ACCESS_TIMEOUT_MS = 8_000;
export function notifyTaskAccessChanged(taskId: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TASK_ACCESS_CHANGED, { detail: { taskId } }));
}

type Snapshot = { id: string; access: TaskAccess | null; signedIn: boolean; failures: number };
const empty = (id: string): Snapshot => ({ id, access: null, signedIn: false, failures: 0 });

/** Detail and access responses share one decision. Only explicit denials revoke it. */
export function useTaskAccess(taskId: string | null | undefined, client: TaskAccessClient = taskAccessClient, initialAccess?: unknown) {
  const seed = useRef(initialAccess);
  seed.current = initialAccess;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    ...empty(taskId ?? ""), access: isTaskAccess(initialAccess) ? initialAccess : null,
  }));
  const revision = useRef(0);
  const scope = useRef({ taskId, client });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const detailRef = useRef<(id: string, access: unknown) => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const receiveDetail = useCallback((id: string, access: unknown) => detailRef.current(id, access), []);
  const captureDetail = useCallback(() => {
    const started = revision.current;
    return (id: string, access: unknown) => {
      if (started === revision.current) detailRef.current(id, access);
    };
  }, []);
  useEffect(() => {
    // Effect replay keeps the pending detail; a different task/client cannot.
    if (scope.current.taskId !== taskId || scope.current.client !== client) {
      ++revision.current;
      scope.current = { taskId, client };
    }
    if (!taskId) { setSnapshot(empty("")); return; }
    let live = true;
    let active = false;
    let pending = false;
    let epoch = 0;
    let identityEpoch = 0;
    let userId: string | null | undefined = cacheUser() || undefined;
    let cancelRead = () => {};
    let latest: Snapshot = { ...empty(taskId), access: isTaskAccess(seed.current) ? seed.current : null };
    const publish = (next: Snapshot) => { if (live) { latest = next; setSnapshot(next); } };
    publish(latest);
    const adopt = (access: TaskAccess) => {
      publish({ ...latest, access, failures: 0 });
    };
    // A token refresh/sign-in probe must never fail an otherwise valid access read.
    const readIdentity = async () => {
      const identity = ++identityEpoch;
      try {
        const signedIn = await client.signedIn();
        if (live && identity === identityEpoch) publish({ ...latest, signedIn });
      } catch { /* Preserve the last identity on network/auth refresh failure. */ }
    };
    const read = async (force = false) => {
      if (!live) return;
      if (active) { pending ||= force; return; }
      active = true;
      const decision = epoch;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<never>((_, reject) => {
          cancelRead = () => { controller.abort(); reject(new Error("access read aborted")); };
          timer = setTimeout(cancelRead, TASK_ACCESS_TIMEOUT_MS);
        });
        const access = await Promise.race([client.getAccess(taskId, controller.signal), deadline]);
        if (!isTaskAccess(access)) throw new TaskAccessError(502);
        if (live && decision === epoch) { ++revision.current; adopt(access); }
      } catch (error) {
        if (live && decision === epoch) {
          const denied = error instanceof TaskAccessError && [401, 403, 404, 410].includes(error.status);
          if (denied) ++revision.current;
          publish({ ...latest, ...(denied ? { access: null } : {}), failures: latest.failures + 1 });
        }
      } finally {
        clearTimeout(timer);
        active = false;
        if (pending && live) { pending = false; void read(); }
      }
    };
    detailRef.current = (id, access) => {
      if (id !== taskId || !isTaskAccess(access)) return;
      ++epoch; // A settled detail/event wins over an older access request.
      adopt(access);
    };
    refreshRef.current = async () => { void readIdentity(); await read(true); };
    void readIdentity();
    if (latest.access) adopt(latest.access);
    // Owners already have an authoritative decision in the detail; no extra gate/read.
    if (latest.access?.role !== "owner") void read();
    const revalidate = () => {
      if (document.visibilityState !== "hidden" && latest.access?.role !== "owner") void read();
    };
    const timer = setInterval(revalidate, TASK_ACCESS_POLL_MS);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ taskId?: string; access?: unknown; event?: string; userId?: string | null }>).detail;
      if (detail?.taskId && detail.taskId !== taskId) return;
      if (event.type === "oceanleo:auth-state") {
        const nextUserId = detail?.userId || null;
        // Session hydration/renewal is not an account change. Invalidating the
        // captured detail here would leave a hard load waiting on /access alone.
        // Supabase can emit SIGNED_IN before INITIAL_SESSION during recovery.
        const sameUser = nextUserId && (nextUserId === userId || userId === undefined &&
          (detail?.event === "SIGNED_IN" || detail?.event === "INITIAL_SESSION" || detail?.event === "TOKEN_REFRESHED"));
        userId = nextUserId;
        if (sameUser) {
          void readIdentity();
          if (latest.access?.role !== "owner") void read();
          return;
        }
      }
      ++epoch;
      ++revision.current;
      if (event.type === "oceanleo:auth-state") {
        publish(empty(taskId));
        void readIdentity();
      } else if (isTaskAccess(detail?.access)) {
        adopt(detail.access);
        return;
      }
      void read(true);
    };
    window.addEventListener(TASK_ACCESS_CHANGED, changed);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    window.addEventListener("oceanleo:auth-state", changed);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      live = false;
      cancelRead(); clearInterval(timer);
      refreshRef.current = async () => {};
      detailRef.current = () => {};
      window.removeEventListener(TASK_ACCESS_CHANGED, changed);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      window.removeEventListener("oceanleo:auth-state", changed);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [taskId, client]);
  // A host-provided detail can paint before effects run, including on task switches.
  const current = snapshot.id === taskId ? snapshot : {
    ...empty(taskId ?? ""), access: isTaskAccess(initialAccess) ? initialAccess : null,
  };
  return {
    access: current.access,
    signedIn: current.signedIn,
    error: current.failures > 0,
    unstable: current.failures >= 2 && Boolean(current.access),
    loading: Boolean(taskId && !current.access && current.failures === 0),
    refresh,
    receiveDetail,
    captureDetail,
  };
}
