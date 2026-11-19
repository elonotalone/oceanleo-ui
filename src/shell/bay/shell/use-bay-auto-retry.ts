"use client";

import { useEffect, useRef } from "react";

/** Retain the backoff when a failed pane briefly unmounts to show its loading skeleton. */
const attempts = new Map<string, { count: number; last: number }>();
export function bayFailureKind(error: unknown): "temporary" | "missing" | "denied" {
  const value = error as { status?: number; code?: string; message?: string; kind?: string } | null;
  if (value?.kind === "not-found") return "missing";
  if (value?.kind === "no-access") return "denied";
  if (value?.status === 403 || value?.status === 401) return "denied";
  if (value?.status === 404 || value?.status === 410) return "missing";
  const text = typeof error === "string" ? error : `${value?.code || ""} ${value?.message || ""}`;
  if (/not.found|removed|not.published|不存在|已下架|找不到|尚未公开/i.test(text)) return "missing";
  if (/forbidden|no.access|permission.denied|无权|没有权限|无权限/i.test(text)) return "denied";
  return "temporary";
}

/** No request while hidden/offline, one timer, capped backoff, immediate recovery on return. */
export function useBayAutoRetry(enabled: boolean, reload: () => unknown, scope?: string) {
  const callback = useRef(reload);
  callback.current = reload;
  const count = useRef(0);
  useEffect(() => {
    const key = scope ? `${window.location.pathname}${window.location.search}:${scope}` : null;
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let disposed = false;
    const ready = () => navigator.onLine !== false && document.visibilityState !== "hidden";
    const schedule = () => {
      clearTimeout(timer);
      if (disposed || !ready()) return;
      const previous = key ? attempts.get(key) : undefined;
      const step = previous && Date.now() - previous.last < 120_000 ? previous.count : count.current;
      timer = setTimeout(run, Math.min(30_000, 1000 * 2 ** Math.min(step, 5)));
    };
    const run = async () => {
      clearTimeout(timer);
      if (disposed || running || !ready()) return;
      running = true;
      count.current += 1;
      if (key) {
        const previous = attempts.get(key);
        // Bound this small cache even when users visit many failing detail pages.
        if (attempts.size > 100) attempts.delete(attempts.keys().next().value!);
        attempts.set(key, { count: (previous?.count || 0) + 1, last: Date.now() });
      }
      try { await callback.current(); } catch { /* Owner retains the failure and its content. */ }
      finally { running = false; schedule(); }
    };
    const wake = () => {
      clearTimeout(timer);
      if (ready()) void run();
    };
    schedule();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, scope]);
}
