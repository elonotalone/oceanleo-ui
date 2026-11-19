"use client";

import { useEffect, useRef } from "react";

export const RECOVERY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

/** A single serial retry loop. Background/offline pages never spend retry attempts. */
export function startAutoRecovery(
  recover: () => void | Promise<unknown>,
  options: { delayMs?: number; attempt?: { current: number } } = {},
): () => void {
  let disposed = false;
  let running = false;
  const attempts = options.attempt ?? { current: 0 };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const active = () =>
    (typeof document === "undefined" || document.visibilityState !== "hidden") &&
    (typeof navigator === "undefined" || navigator.onLine !== false);
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const schedule = () => {
    if (disposed || running || timer !== undefined || !active()) return;
    timer = setTimeout(run, options.delayMs ?? RECOVERY_DELAYS_MS[Math.min(attempts.current, RECOVERY_DELAYS_MS.length - 1)]);
  };
  const run = async () => {
    clear();
    if (disposed || running || !active()) return;
    running = true;
    attempts.current += 1;
    try { await recover(); } catch { /* The owning surface keeps its recovery state. */ }
    finally { running = false; schedule(); }
  };
  const wake = () => {
    clear();
    if (active()) void run();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    window.addEventListener("focus", wake);
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", wake);
  schedule();
  return () => {
    disposed = true;
    clear();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      window.removeEventListener("focus", wake);
    }
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", wake);
  };
}

/** Callback identity changes must not reset the backoff or cancel a pending recovery. */
export function useAutoRecovery(enabled: boolean, recover: () => void | Promise<unknown>, identity: unknown = "", retainedAttempts?: { current: number }) {
  const localAttempts = useRef(0);
  const attempts = retainedAttempts ?? localAttempts;
  const key = useRef(identity);
  if (key.current !== identity) { key.current = identity; attempts.current = 0; }
  const latest = useRef(recover);
  latest.current = recover;
  useEffect(() => enabled ? startAutoRecovery(() => latest.current(), { attempt: attempts }) : undefined, [enabled, identity]);
}

export function waitForRecovery(delayMs: number): Promise<void> {
  return new Promise(resolve => {
    const stop = startAutoRecovery(() => { stop(); resolve(); }, { delayMs });
  });
}
