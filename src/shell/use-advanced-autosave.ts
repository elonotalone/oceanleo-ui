"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";
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
export { mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";

function withErrorMessage(result: AdvancedFlushResult): AdvancedFlushResult {
  if (result.ok) return result;
  return {
    ...result,
    errorMessage: mapAutosaveErrorMessage(result),
  };
}

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
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  flushRef.current = flush;
  sessionRef.current = session;

  const rememberFlush = useCallback((result: AdvancedFlushResult) => {
    const next = withErrorMessage(result);
    if (mountedRef.current) {
      setErrorMessage(next.ok ? undefined : next.errorMessage);
    }
    return next;
  }, []);

  const makeController = useCallback(
    () =>
      new AdvancedPersistenceController<LibraryItem>({
        flushRevision: async () => {
          const activeFlush = flushRef.current;
          if (!activeFlush) {
            return rememberFlush({
              ok: false,
              error: "当前编辑器无法保存未提交修改",
            });
          }
          return rememberFlush(await activeFlush());
        },
        recordSavedItem: async (item) => {
          const activeSession = sessionRef.current;
          return activeSession
            ? activeSession.recordSavedItem(item)
            : true;
        },
        onStateChange: (next) => {
          if (!mountedRef.current) return;
          setState(next);
          if (next === "saved") setErrorMessage(undefined);
        },
      }),
    [rememberFlush],
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
    async (): Promise<AdvancedFlushResult> =>
      rememberFlush(
        (await controllerRef.current?.flushLatest()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush],
  );
  const retry = useCallback(
    async (): Promise<AdvancedFlushResult> =>
      rememberFlush(
        (await controllerRef.current?.retry()) ?? {
          ok: false,
          error: "自动保存控制器不可用",
        },
      ),
    [rememberFlush],
  );

  return { state, errorMessage, flushLatest, retry };
}
