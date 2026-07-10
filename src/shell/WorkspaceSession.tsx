"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  archiveAppSession,
  ensureAppSession,
  getAppSession,
  listAppSessions,
  updateAppSession,
  type AppSession,
} from "../lib/app-session";
import { WorkspaceSessionContext } from "./workspace-session-context";
import { findLinkedAgentTaskId } from "./workspace-session-task";
import {
  availabilityForSessionFailure,
  blockedSnapshotSave,
  isArchivedAppSession,
  isStaleSessionResponse,
  isWorkspaceSessionReadOnly,
  matchingInitialSession,
  changedDuringLoad,
  snapshotTargetsCurrentSession,
  workspaceSessionMismatch,
  workspaceSnapshotsEqual,
  type EnsureWorkspaceSessionOptions,
  type SaveWorkspaceSnapshotOptions,
  type WorkspaceSessionAvailability,
  type WorkspaceSessionConflict,
  type WorkspaceSessionContextValue,
  type WorkspaceSessionProviderProps,
  type WorkspaceSessionRecordContext,
  type WorkspaceSnapshotSaveResult,
} from "./workspace-session-model";

export type {
  EnsureWorkspaceSessionOptions,
  WorkspaceRuntime,
  WorkspaceSessionAvailability,
  WorkspaceSessionConflict,
  WorkspaceSessionContextValue,
  WorkspaceSessionMode,
  WorkspaceSessionProviderProps,
  WorkspaceSessionRecordContext,
  WorkspaceSnapshotSaveResult,
  SaveWorkspaceSnapshotOptions,
} from "./workspace-session-model";
export {
  useOptionalWorkspaceSession,
  useWorkspaceSession,
} from "./workspace-session-context";

export function WorkspaceSessionProvider({
  children,
  siteId,
  appId,
  title: sessionTitle = "",
  sessionId: controlledSessionId,
  onSessionIdChange,
  mode = "workspace",
  initialSession = null,
  resumeLatest,
}: WorkspaceSessionProviderProps) {
  const site = (siteId || "").trim();
  const app = (appId || "").trim();
  const appTitle = (sessionTitle || "").trim();
  const controlled = controlledSessionId !== undefined;
  const [internalSessionId, setInternalSessionId] = useState<string | null>(
    controlledSessionId ?? initialSession?.id ?? null,
  );
  const effectiveSessionId = controlled
    ? controlledSessionId ?? null
    : internalSessionId;
  const shouldResumeLatest = resumeLatest ?? mode !== "history";

  const [session, setSession] = useState<AppSession | null>(
    initialSession || null,
  );
  const [availability, setAvailability] =
    useState<WorkspaceSessionAvailability>(
      initialSession ? "ready" : "loading",
    );
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] =
    useState<WorkspaceSessionConflict | null>(null);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(
    initialSession?.task_id ?? null,
  );
  const [runtimeEpoch, setRuntimeEpoch] = useState(0);
  const [restartFeedback, setRestartFeedback] = useState<
    "saved" | "reset" | null
  >(null);
  const restartFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(
    () => () => {
      if (restartFeedbackTimerRef.current) {
        clearTimeout(restartFeedbackTimerRef.current);
      }
    },
    [],
  );

  const sessionRef = useRef<AppSession | null>(session);
  sessionRef.current = session;
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;
  const errorRef = useRef(error);
  errorRef.current = error;
  const conflictRef = useRef<WorkspaceSessionConflict | null>(conflict);
  conflictRef.current = conflict;
  const identityRef = useRef(`${site}:${app}`);
  const ensurePromiseRef = useRef<Promise<AppSession | null> | null>(null);
  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());

  const publishSessionId = useCallback(
    (id: string | null) => {
      if (!controlled) setInternalSessionId(id);
      onSessionIdChange?.(id);
    },
    [controlled, onSessionIdChange],
  );

  const applySession = useCallback(
    (next: AppSession) => {
      const previous = sessionRef.current;
      if (isStaleSessionResponse(previous, next)) return;
      const previousId = previous?.id;
      sessionRef.current = next;
      setSession(next);
      if (previousId !== next.id) {
        setLinkedTaskId(next.task_id ?? null);
      }
      availabilityRef.current = "ready";
      errorRef.current = null;
      setAvailability("ready");
      setError(null);
      if (effectiveSessionId !== next.id) publishSessionId(next.id);
    },
    [effectiveSessionId, publishSessionId],
  );

  const clearCurrent = useCallback(() => {
    sessionRef.current = null;
    setSession(null);
    setLinkedTaskId(null);
    conflictRef.current = null;
    setConflict(null);
    availabilityRef.current = "ready";
    errorRef.current = null;
    setAvailability("ready");
    setError(null);
    publishSessionId(null);
  }, [publishSessionId]);

  const reportFailure = useCallback(
    (status?: number, message?: string) => {
      const nextAvailability = availabilityForSessionFailure(status);
      const nextError = message || "工作会话暂不可用";
      availabilityRef.current = nextAvailability;
      errorRef.current = nextError;
      setAvailability(nextAvailability);
      setError(nextError);
    },
    [],
  );

  const enqueueMutation = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      const result = mutationQueueRef.current.then(operation, operation);
      mutationQueueRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    [],
  );

  const hydrateLinkedTask = useCallback(async (active: AppSession) => {
    const taskId = await findLinkedAgentTaskId(active);
    if (taskId === undefined) return;
    if (sessionRef.current?.id !== active.id) return;
    setLinkedTaskId(taskId);
  }, []);

  useEffect(() => {
    const identity = `${site}:${app}`;
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    ensurePromiseRef.current = null;
    mutationQueueRef.current = Promise.resolve();
    sessionRef.current = null;
    setSession(null);
    setLinkedTaskId(null);
    conflictRef.current = null;
    setConflict(null);
    setError(null);
    if (!controlled) setInternalSessionId(null);
  }, [site, app, controlled]);

  useEffect(() => {
    let alive = true;
    const injected = matchingInitialSession(
      initialSession,
      effectiveSessionId,
      site,
      app,
    );
    if (
      injected &&
      (mode === "history" || !isArchivedAppSession(injected))
    ) {
      applySession(injected);
      void hydrateLinkedTask(injected);
      return () => {
        alive = false;
      };
    }
    if (!site || !app) {
      sessionRef.current = null;
      setSession(null);
      availabilityRef.current = "error";
      errorRef.current = "siteId 与 appId 不能为空";
      setAvailability("error");
      setError("siteId 与 appId 不能为空");
      return () => {
        alive = false;
      };
    }

    availabilityRef.current = "loading";
    errorRef.current = null;
    setAvailability("loading");
    setError(null);
    const sessionAtLoadStart = sessionRef.current;
    void (async () => {
      if (effectiveSessionId) {
        const result = await getAppSession(effectiveSessionId);
        if (!alive) return;
        const mismatch = workspaceSessionMismatch(result.data, site, app);
        const archivedForLive =
          mode !== "history" && isArchivedAppSession(result.data);
        if (
          result.ok &&
          result.data &&
          !mismatch &&
          !archivedForLive
        ) {
          applySession(result.data);
          void hydrateLinkedTask(result.data);
        } else {
          if (sessionRef.current !== sessionAtLoadStart) return;
          clearCurrent();
          if (archivedForLive) return;
          reportFailure(
            mismatch ? 400 : result.status,
            mismatch ? "工作会话与当前 app 不匹配" : result.error,
          );
        }
        return;
      }
      if (!shouldResumeLatest) {
        clearCurrent();
        return;
      }
      const result = await listAppSessions({
        siteId: site,
        appId: app,
        status: "active",
        includeArchived: false,
        limit: 1,
      });
      if (!alive) return;
      if (result.ok && result.data) {
        const latest = result.data.items[0] ?? null;
        if (latest) {
          const fullResult = await getAppSession(latest.id);
          if (!alive) return;
          const mismatch = workspaceSessionMismatch(fullResult.data, site, app);
          const archivedForLive =
            mode !== "history" &&
            isArchivedAppSession(fullResult.data);
          if (
            fullResult.ok &&
            fullResult.data &&
            !mismatch &&
            !archivedForLive
          ) {
            const current = sessionRef.current;
            if (changedDuringLoad(sessionAtLoadStart, current, fullResult.data.id)) return;
            applySession(fullResult.data);
            void hydrateLinkedTask(fullResult.data);
          } else {
            if (sessionRef.current !== sessionAtLoadStart) return;
            if (archivedForLive) {
              clearCurrent();
              return;
            }
            reportFailure(
              mismatch ? 400 : fullResult.status,
              mismatch ? "工作会话与当前 app 不匹配" : fullResult.error,
            );
          }
        } else {
          if (sessionRef.current === sessionAtLoadStart) clearCurrent();
          else {
            availabilityRef.current = "ready";
            setAvailability("ready");
          }
        }
      } else {
        if (sessionRef.current !== sessionAtLoadStart) return;
        reportFailure(result.status, result.error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [
    site,
    app,
    effectiveSessionId,
    initialSession?.id,
    initialSession?.revision,
    mode,
    shouldResumeLatest,
    applySession,
    clearCurrent,
    reportFailure,
    hydrateLinkedTask,
  ]);

  const reload = useCallback(async (): Promise<AppSession | null> => {
    const id = sessionRef.current?.id || effectiveSessionId;
    if (!id) return null;
    const result = await getAppSession(id);
    if (result.ok && result.data) {
      applySession(result.data);
      return result.data;
    }
    reportFailure(result.status, result.error);
    return null;
  }, [effectiveSessionId, applySession, reportFailure]);

  const ensureActive = useCallback(
    async (
      options: EnsureWorkspaceSessionOptions = {},
    ): Promise<AppSession | null> => {
      const current = sessionRef.current;
      if (
        current &&
        current.site_id === site &&
        current.app_id === app &&
        !isArchivedAppSession(current)
      ) {
        return current;
      }
      // 历史路由只能继续它明确加载的那一条 active session，绝不能在记录缺失、
      // 已归档或身份不匹配时悄悄 ensure 出另一条会话来伪装历史。
      if (mode === "history") return null;
      if (!site || !app) return null;
      if (ensurePromiseRef.current) return ensurePromiseRef.current;

      const pending = (async () => {
        const result = await ensureAppSession({
          siteId: site,
          appId: app,
          title: options.title || appTitle,
          snapshot: options.snapshot,
          schemaVersion: options.schemaVersion,
        });
        if (!result.ok || !result.data) {
          reportFailure(result.status, result.error);
          return null;
        }
        if (isArchivedAppSession(result.data)) {
          reportFailure(
            409,
            "服务端返回了已归档会话，已拒绝继续写入。",
          );
          return null;
        }
        applySession(result.data);
        return result.data;
      })();
      ensurePromiseRef.current = pending;
      try {
        return await pending;
      } finally {
        if (ensurePromiseRef.current === pending) {
          ensurePromiseRef.current = null;
        }
      }
    },
    [site, app, appTitle, mode, applySession, reportFailure],
  );

  const saveSnapshot = useCallback(
    async (
      snapshot: unknown,
      schemaVersion: number,
      options: SaveWorkspaceSnapshotOptions = {},
    ): Promise<WorkspaceSnapshotSaveResult> => {
      if (
        !snapshot ||
        typeof snapshot !== "object" ||
        Array.isArray(snapshot)
      ) {
        return {
          ok: false,
          error: "工作会话 snapshot 必须是 JSON object。",
        };
      }
      const recordSnapshot = snapshot as Record<string, unknown>;
      const current = sessionRef.current;
      if (isWorkspaceSessionReadOnly(mode, current)) {
        return {
          ok: false,
          session: current || undefined,
          readOnly: true,
          error: "已归档工作会话为只读。",
        };
      }
      if (
        !snapshotTargetsCurrentSession(
          current,
          options.expectedSessionId,
        )
      ) {
        return {
          ok: false,
          session: current || undefined,
          stale: true,
          error: "保存属于已经离开的工作会话。",
        };
      }
      const blocked = blockedSnapshotSave(conflictRef.current);
      if (blocked) return blocked;
      return enqueueMutation(async () => {
        const queuedCurrent = sessionRef.current;
        if (isWorkspaceSessionReadOnly(mode, queuedCurrent)) {
          return {
            ok: false,
            session: queuedCurrent || undefined,
            readOnly: true,
            error: "已归档工作会话为只读。",
          };
        }
        if (
          !snapshotTargetsCurrentSession(
            queuedCurrent,
            options.expectedSessionId,
          )
        ) {
          return {
            ok: false,
            session: queuedCurrent || undefined,
            stale: true,
            error: "保存属于已经离开的工作会话。",
          };
        }
        const queuedBlocked = blockedSnapshotSave(conflictRef.current);
        if (queuedBlocked) return queuedBlocked;
        const beforeEnsure = sessionRef.current;
        const active = await ensureActive({
          title: options.title,
          snapshot: recordSnapshot,
          schemaVersion,
        });
        if (!active) {
          return {
            ok: false,
            unavailable:
              availabilityRef.current === "signed-out" ||
              availabilityRef.current === "unsupported",
            error: errorRef.current || "工作会话暂不可用",
          };
        }
        if (isArchivedAppSession(active)) {
          return {
            ok: false,
            session: active,
            readOnly: true,
            error: "已归档工作会话不可保存。",
          };
        }

        if (
          !beforeEnsure &&
          active.schema_version === schemaVersion &&
          workspaceSnapshotsEqual(active.snapshot, recordSnapshot)
        ) {
          conflictRef.current = null;
          setConflict(null);
          return { ok: true, session: active };
        }

        const result = await updateAppSession(active.id, {
          revision: active.revision,
          snapshot: recordSnapshot,
          schemaVersion,
          title: options.title,
        });
        if (result.ok && result.data) {
          if (isArchivedAppSession(result.data)) {
            applySession(result.data);
            return {
              ok: false,
              session: result.data,
              readOnly: true,
              error: "工作会话已归档，本次保存未继续。",
            };
          }
          applySession(result.data);
          conflictRef.current = null;
          setConflict(null);
          return { ok: true, session: result.data };
        }

        if (result.status === 409) {
          // 冲突后只重新读取，不拿新 revision 偷偷覆盖。站点可据 conflict 显式合并/重试。
          const latestResult = await getAppSession(active.id);
          if (latestResult.ok && latestResult.data) {
            applySession(latestResult.data);
            const nextConflict: WorkspaceSessionConflict = {
              attemptedSnapshot: recordSnapshot,
              attemptedSchemaVersion: schemaVersion,
              latest: latestResult.data,
            };
            conflictRef.current = nextConflict;
            setConflict(nextConflict);
            errorRef.current = "工作会话已在别处更新，请确认后再保存。";
            setError(errorRef.current);
            return {
              ok: false,
              session: latestResult.data,
              conflict: nextConflict,
              error: "revision conflict",
            };
          }
        }

        reportFailure(result.status, result.error);
        return {
          ok: false,
          unavailable:
            result.status === 401 ||
            result.status === 404 ||
            result.status === 405 ||
            result.status === 501,
          error: result.error || "保存工作会话失败",
        };
      });
    },
    [
      enqueueMutation,
      ensureActive,
      applySession,
      reportFailure,
      mode,
    ],
  );

  const touch = useCallback(
    async (title?: string): Promise<AppSession | null> =>
      enqueueMutation(async () => {
        const current = sessionRef.current;
        if (mode === "history") return current;
        if (!site || !app) return null;
        const result = await ensureAppSession({
          siteId: site,
          appId: app,
          title: title || appTitle,
        });
        if (!result.ok || !result.data) {
          reportFailure(result.status, result.error);
          return null;
        }
        if (isArchivedAppSession(result.data)) {
          reportFailure(
            409,
            "服务端返回了已归档会话，已拒绝继续写入。",
          );
          return null;
        }
        applySession(result.data);
        return result.data;
      }),
    [enqueueMutation, mode, site, app, appTitle, applySession, reportFailure],
  );

  const bindTask = useCallback(
    async (
      taskId: string | null,
      title?: string,
    ): Promise<AppSession | null> => {
      const current = sessionRef.current;
      if (isWorkspaceSessionReadOnly(mode, current)) return current;
      const active = await touch(title);
      if (active) setLinkedTaskId(taskId);
      return active;
    },
    [mode, touch],
  );

  const artifactContext = useCallback(
    async (title?: string): Promise<WorkspaceSessionRecordContext | null> => {
      if (isWorkspaceSessionReadOnly(mode, sessionRef.current)) return null;
      const active = await ensureActive({ title });
      if (!active) return null;
      return {
        sessionId: active.id,
        session_id: active.id,
        siteId: active.site_id,
        site_id: active.site_id,
        appId: active.app_id,
        app_id: active.app_id,
      };
    },
    [mode, ensureActive],
  );

  const recordArtifact = useCallback(
    async (
      recorder: (
        context: WorkspaceSessionRecordContext,
      ) => Promise<unknown> | unknown,
      title?: string,
    ): Promise<boolean> => {
      const context = await artifactContext(title);
      if (!context) return false;
      await recorder(context);
      if (sessionRef.current?.id === context.sessionId) void touch(title);
      return true;
    },
    [artifactContext, touch],
  );

  const archive = useCallback(
    async (): Promise<false | "empty" | "archived"> =>
      enqueueMutation(async () => {
        const active = sessionRef.current;
        if (!active) {
          clearCurrent();
          return "empty";
        }
        if (!isArchivedAppSession(active)) {
          const result = await archiveAppSession(active.id);
          if (!result.ok) {
            if (result.status === 409) {
              const latest = await reload();
              if (!isArchivedAppSession(latest)) return false;
            } else {
              reportFailure(result.status, result.error);
              return false;
            }
          }
        }
        // 从一条旧的归档历史点「重新开始」时，同一 app 可能另有 live 活跃会话。
        // 若只处理当前历史行，跳回 /workspace 后会立刻恢复那条 live 会话，看起来像
        // “清空失败”。历史重启必须同时归档这个 app 当前唯一的 active session。
        if (mode === "history") {
          const activeResult = await listAppSessions({
            siteId: site,
            appId: app,
            status: "active",
            includeArchived: false,
            limit: 1,
          });
          if (!activeResult.ok) {
            reportFailure(activeResult.status, activeResult.error);
            return false;
          }
          const live = activeResult.data?.items[0];
          if (live && live.id !== active.id) {
            const liveArchive = await archiveAppSession(live.id);
            if (!liveArchive.ok) {
              reportFailure(liveArchive.status, liveArchive.error);
              return false;
            }
          }
        }
        clearCurrent();
        return "archived";
      }),
    [enqueueMutation, mode, site, app, clearCurrent, reload, reportFailure],
  );

  const clearConflict = useCallback(() => {
    conflictRef.current = null;
    setConflict(null);
    errorRef.current = null;
    setError(null);
  }, []);

  const restart = useCallback(async (): Promise<
    false | "empty" | "archived"
  > => {
    const result = await archive();
    if (result) {
      setRestartFeedback(result === "archived" ? "saved" : "reset");
      if (restartFeedbackTimerRef.current) {
        clearTimeout(restartFeedbackTimerRef.current);
      }
      restartFeedbackTimerRef.current = setTimeout(
        () => setRestartFeedback(null),
        2600,
      );
      // Remount the real site runtime only after the aggregate was safely
      // archived. CatalogOps then establishes that app's clean initial state;
      // the next meaningful action creates a new active cache.
      setRuntimeEpoch((value) => value + 1);
    }
    return result;
  }, [archive]);

  const value = useMemo<WorkspaceSessionContextValue>(
    () => ({
      sessionId: session?.id ?? effectiveSessionId,
      siteId: site,
      appId: app,
      appTitle,
      mode,
      session,
      taskId: linkedTaskId ?? session?.task_id ?? null,
      readOnly: isWorkspaceSessionReadOnly(mode, session),
      availability,
      error,
      conflict,
      restartFeedback,
      ensureActive,
      saveSnapshot,
      touch,
      bindTask,
      artifactContext,
      recordArtifact,
      archive,
      restart,
      clearConflict,
      reload,
    }),
    [
      session,
      linkedTaskId,
      effectiveSessionId,
      site,
      app,
      appTitle,
      mode,
      availability,
      error,
      conflict,
      restartFeedback,
      ensureActive,
      saveSnapshot,
      touch,
      bindTask,
      artifactContext,
      recordArtifact,
      archive,
      restart,
      clearConflict,
      reload,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      <Fragment key={runtimeEpoch}>{children}</Fragment>
    </WorkspaceSessionContext.Provider>
  );
}
