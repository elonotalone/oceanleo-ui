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
  const runningRef = useRef(false);
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");

  const run = useCallback(async () => {
    if (!flush || runningRef.current) return;
    runningRef.current = true;
    setState("saving");
    try {
      const result = await flush();
      if (!result.ok) {
        setState("error");
        return;
      }
      if (result.item && session) {
        await session.recordSavedItem(result.item);
      }
      setState("saved");
    } catch {
      setState("error");
    } finally {
      runningRef.current = false;
    }
  }, [flush, session]);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirty) {
      setState("saved");
      return;
    }
    setState(flush ? "saving" : "error");
    if (!flush) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run();
    }, 1600);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [dirty, flush, run]);

  return { state, run };
}
