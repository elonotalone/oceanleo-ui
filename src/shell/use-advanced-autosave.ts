"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvancedFlushResult,
  AdvancedSessionActions,
} from "./advanced-session-context";

export type AdvancedAutoSaveState = "saved" | "saving" | "error";

export function useAdvancedAutoSave({
  dirty,
  flush,
  session,
}: {
  dirty: boolean;
  flush?: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  session: AdvancedSessionActions | null;
}) {
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);
  const queuedRef = useRef(false);
  const retriesRef = useRef(0);
  const dirtyRef = useRef(dirty);
  const flushRef = useRef(flush);
  const sessionRef = useRef(session);
  const pendingItemRef = useRef<
    Extract<AdvancedFlushResult, { ok: true }>["item"] | undefined
  >(undefined);
  const runRef = useRef<() => Promise<void>>(async () => undefined);
  const mountedRef = useRef(true);
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");
  dirtyRef.current = dirty;
  flushRef.current = flush;
  sessionRef.current = session;

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void runRef.current();
      }, delay);
    },
    [clearTimer],
  );

  const run = useCallback(async () => {
    clearTimer();
    if (runningRef.current) {
      queuedRef.current = true;
      return runningRef.current;
    }
    if (!dirtyRef.current && !pendingItemRef.current) {
      if (mountedRef.current) setState("saved");
      return;
    }
    const activeFlush = flushRef.current;
    if (!activeFlush && !pendingItemRef.current) {
      if (mountedRef.current) setState("error");
      return;
    }
    if (mountedRef.current) setState("saving");
    const operation = (async () => {
      try {
        const result = pendingItemRef.current
          ? ({ ok: true, item: pendingItemRef.current } as const)
          : await activeFlush!();
        if (!result.ok) throw new Error(result.error || "autosave failed");
        if (result.item && sessionRef.current) {
          pendingItemRef.current = result.item;
          const recorded = await sessionRef.current.recordSavedItem(result.item);
          if (!recorded) throw new Error("session snapshot failed");
        }
        pendingItemRef.current = undefined;
        retriesRef.current = 0;
        if (dirtyRef.current) {
          schedule(700);
        } else if (mountedRef.current) {
          setState("saved");
        }
      } catch {
        const stillPending = dirtyRef.current || Boolean(pendingItemRef.current);
        if (stillPending && retriesRef.current < 3) {
          const delay = [1_500, 4_000, 9_000][retriesRef.current] || 9_000;
          retriesRef.current += 1;
          if (mountedRef.current) setState("saving");
          schedule(delay);
        } else if (mountedRef.current) {
          setState("error");
        }
      } finally {
        runningRef.current = null;
        if (queuedRef.current) {
          queuedRef.current = false;
          if (dirtyRef.current || pendingItemRef.current) schedule(250);
        }
      }
    })();
    runningRef.current = operation;
    return operation;
  }, [clearTimer, schedule]);
  runRef.current = run;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    if (!dirty) {
      if (runningRef.current) {
        setState("saving");
        return;
      }
      if (pendingItemRef.current) {
        setState("saving");
        schedule(700);
      } else {
        retriesRef.current = 0;
        setState("saved");
      }
      return;
    }
    setState(flush ? "saving" : "error");
    if (!flush) return;
    schedule(1_600);
    return clearTimer;
  }, [clearTimer, dirty, flush, schedule]);

  const retry = useCallback(() => {
    retriesRef.current = 0;
    return run();
  }, [run]);

  return { state, run: retry };
}
