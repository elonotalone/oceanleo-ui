"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvancedFlushResult,
  AdvancedSessionActions,
} from "./advanced-session-context";
import {
  AdvancedPersistenceController,
  type AdvancedEditRevision,
} from "./advanced-persistence-controller";
import type { LibraryItem } from "./library-data";

export type AdvancedAutoSaveState = "saved" | "saving" | "error";

export function useAdvancedAutoSave({
  dirty,
  revision,
  flush,
  session,
}: {
  dirty: boolean;
  revision: AdvancedEditRevision;
  flush?: () => Promise<AdvancedFlushResult> | AdvancedFlushResult;
  session: AdvancedSessionActions | null;
}) {
  const flushRef = useRef(flush);
  const sessionRef = useRef(session);
  const mountedRef = useRef(true);
  const [state, setState] = useState<AdvancedAutoSaveState>("saved");
  flushRef.current = flush;
  sessionRef.current = session;

  const makeController = useCallback(
    () =>
      new AdvancedPersistenceController<LibraryItem>({
        flushRevision: async () => {
          const activeFlush = flushRef.current;
          if (!activeFlush) {
            return { ok: false, error: "当前编辑器无法保存未提交修改" };
          }
          return activeFlush();
        },
        recordSavedItem: async (item) => {
          const activeSession = sessionRef.current;
          return activeSession
            ? activeSession.recordSavedItem(item)
            : true;
        },
        onStateChange: (next) => {
          if (mountedRef.current) setState(next);
        },
      }),
    [],
  );
  const controllerRef =
    useRef<AdvancedPersistenceController<LibraryItem> | null>(null);
  if (!controllerRef.current) controllerRef.current = makeController();

  useEffect(() => {
    mountedRef.current = true;
    if (!controllerRef.current) controllerRef.current = makeController();
    return () => {
      mountedRef.current = false;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [makeController]);

  useEffect(() => {
    controllerRef.current?.observe({ revision, dirty });
  }, [dirty, revision]);

  const flushLatest = useCallback(
    (): Promise<AdvancedFlushResult> =>
      controllerRef.current?.flushLatest() ??
      Promise.resolve({ ok: false, error: "自动保存控制器不可用" }),
    [],
  );
  const retry = useCallback(
    (): Promise<AdvancedFlushResult> =>
      controllerRef.current?.retry() ??
      Promise.resolve({ ok: false, error: "自动保存控制器不可用" }),
    [],
  );

  return { state, flushLatest, retry };
}
