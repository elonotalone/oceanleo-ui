"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  listCloudBrowserCheckpoints,
  listCloudBrowsers,
  type CloudBrowserCheckpoint,
  type CloudBrowserSession,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";

type SessionDataOptions = {
  effectiveTaskId: string;
  liveRequested: boolean;
  tt: UITranslate;
  setError: Dispatch<SetStateAction<string>>;
};

type SessionSelectionOptions = {
  sessions: ReadonlyArray<
    Pick<CloudBrowserSession, "id" | "task_id">
  >;
  effectiveTaskId: string;
  preferredId?: string;
  currentId?: string;
  keepCurrent?: boolean;
};

const CHECKPOINT_STATES = new Set([
  "ready",
  "warm",
  "hibernated",
  "restoring",
  "restored",
  "failed",
]);

export function resolveCloudBrowserSessionSelection({
  sessions,
  effectiveTaskId,
  preferredId = "",
  currentId = "",
  keepCurrent = false,
}: SessionSelectionOptions): string {
  if (
    preferredId &&
    sessions.some((item) => item.id === preferredId)
  ) {
    return preferredId;
  }
  if (
    keepCurrent &&
    currentId &&
    sessions.some((item) => item.id === currentId)
  ) {
    return currentId;
  }
  if (effectiveTaskId) {
    return (
      sessions.find(
        (item) => item.task_id === effectiveTaskId,
      )?.id || ""
    );
  }
  // Global history stays available in the history panel, but loading it must
  // never make a session live or dismiss the explicit power-on state.
  return "";
}

export function formatCloudBrowserLifecycleError(
  result: { error?: string; status?: number },
  fallback: string,
): string {
  const raw = String(result.error || "").trim();
  if (raw.includes("BROWSER_NOT_CONFIGURED")) {
    return `${fallback}: BROWSER_NOT_CONFIGURED`;
  }
  if (raw.includes("EXECUTOR_ORIGIN_REJECTED")) {
    return `${fallback}: EXECUTOR_ORIGIN_REJECTED`;
  }
  if (result.status === 503) {
    // The shared API client currently flattens structured FastAPI detail to
    // "HTTP 503". Keep the two server-side configuration causes visible
    // instead of presenting an unactionable generic failure.
    return `${fallback}: BROWSER_NOT_CONFIGURED / EXECUTOR_ORIGIN_REJECTED`;
  }
  // Gateway details can contain executor paths, private hosts, or credentials.
  // Only the public allowlisted codes above may cross into product copy.
  return fallback;
}

export function cloudBrowserSessionNeedsResume(
  session: CloudBrowserSession | null,
): boolean {
  if (!session) return false;
  if (session.status === "hibernated" || session.status === "failed") {
    return true;
  }
  if (!["active", "warm"].includes(session.status)) return true;
  if (!session.runtime_id || session.incarnation <= 0) return true;
  return Boolean(
    session.runtime_state &&
      session.runtime_state !== "ready",
  );
}

function validCheckpoint(
  value: CloudBrowserCheckpoint,
  sessionId: string,
): boolean {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      value.id.length > 0 &&
      value.id.length <= 160 &&
      value.session_id === sessionId &&
      Number.isSafeInteger(value.generation) &&
      value.generation > 0 &&
      typeof value.created_at === "string" &&
      Number.isFinite(Date.parse(value.created_at)) &&
      typeof value.page_title === "string" &&
      value.page_title.length <= 512 &&
      typeof value.page_url === "string" &&
      value.page_url.length <= 2_048 &&
      CHECKPOINT_STATES.has(value.state) &&
      Number.isSafeInteger(value.session_version) &&
      value.session_version > 0 &&
      typeof value.runtime_version === "string" &&
      value.runtime_version.length > 0 &&
      value.runtime_version.length <= 160,
  );
}

export function normalizeCloudBrowserCheckpoints(
  value: unknown,
  sessionId: string,
): CloudBrowserCheckpoint[] | null {
  if (!Array.isArray(value)) return null;
  const checkpoints = value.filter(
    (item): item is CloudBrowserCheckpoint =>
      validCheckpoint(item as CloudBrowserCheckpoint, sessionId),
  );
  if (checkpoints.length !== value.length) return null;
  checkpoints.sort((left, right) => right.generation - left.generation);
  const generations = new Set<number>();
  for (const checkpoint of checkpoints) {
    if (generations.has(checkpoint.generation)) return null;
    generations.add(checkpoint.generation);
  }
  return checkpoints;
}

export function useCloudBrowserSessionData({
  effectiveTaskId,
  liveRequested,
  tt,
  setError,
}: SessionDataOptions) {
  const [sessions, setSessions] = useState<CloudBrowserSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [checkpoints, setCheckpoints] = useState<
    CloudBrowserCheckpoint[]
  >([]);
  const [checkpointsLoading, setCheckpointsLoading] = useState(false);
  const [checkpointsError, setCheckpointsError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);
  const taskScopeRef = useRef(effectiveTaskId);
  const selectionExplicitRef = useRef(false);
  const reloadGenerationRef = useRef(0);
  const checkpointGenerationRef = useRef(0);
  const selectedIdRef = useRef("");
  const sessionLoadErrorRef = useRef("");

  const reload = useCallback(
    async (preferredId = "") => {
      const generation = ++reloadGenerationRef.current;
      const [recentResult, taskResult] = await Promise.all([
        listCloudBrowsers(),
        effectiveTaskId
          ? listCloudBrowsers(1, effectiveTaskId)
          : Promise.resolve(null),
      ]);
      if (generation !== reloadGenerationRef.current) return;
      if (!recentResult.ok) {
        const message =
          formatCloudBrowserLifecycleError(
            recentResult,
            tt("浏览记录加载失败"),
          );
        sessionLoadErrorRef.current = message;
        setError(message);
        return;
      }
      if (effectiveTaskId && taskResult && !taskResult.ok) {
        const message =
          formatCloudBrowserLifecycleError(
            taskResult,
            tt("当前任务的浏览记录加载失败"),
          );
        sessionLoadErrorRef.current = message;
        setError(message);
      } else {
        const previous = sessionLoadErrorRef.current;
        sessionLoadErrorRef.current = "";
        if (previous) {
          setError((current) =>
            current === previous ? "" : current,
          );
        }
      }
      const recent = recentResult.data?.items || [];
      const scoped = taskResult?.ok ? taskResult.data?.items || [] : [];
      const items = [
        ...scoped,
        ...recent.filter(
          (item) =>
            !scoped.some(
              (scopedItem) => scopedItem.id === item.id,
            ),
        ),
      ];
      setSessions(items);
      setSelectedId((current) => {
        const next = resolveCloudBrowserSessionSelection({
          sessions: items,
          effectiveTaskId,
          preferredId,
          currentId: current,
          keepCurrent: selectionExplicitRef.current,
        });
        selectedIdRef.current = next;
        return next;
      });
    },
    [effectiveTaskId, setError, tt],
  );

  const refreshCheckpoints = useCallback(async () => {
    const sessionId = selectedIdRef.current;
    if (!sessionId) {
      setCheckpoints([]);
      return;
    }
    const generation = ++checkpointGenerationRef.current;
    setCheckpointsLoading(true);
    const result = await listCloudBrowserCheckpoints(sessionId);
    if (generation !== checkpointGenerationRef.current) return;
    setCheckpointsLoading(false);
    if (!result.ok) {
      setCheckpointsError(
        formatCloudBrowserLifecycleError(
          result,
          tt("会话快照加载失败"),
        ),
      );
      return;
    }
    const normalized = normalizeCloudBrowserCheckpoints(
      result.data?.items,
      sessionId,
    );
    if (!normalized) {
      setCheckpoints([]);
      setCheckpointsError(tt("会话快照数据不符合 v3 契约"));
      return;
    }
    setCheckpoints(normalized);
    setCheckpointsError("");
  }, [tt]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (taskScopeRef.current === effectiveTaskId) return;
    taskScopeRef.current = effectiveTaskId;
    selectionExplicitRef.current = false;
    selectedIdRef.current = "";
    ++reloadGenerationRef.current;
    setSelectedId("");
  }, [effectiveTaskId]);

  useEffect(() => {
    if (liveRequested) return;
    void reload();
    const timer = window.setInterval(() => void reload(), 5_000);
    return () => window.clearInterval(timer);
  }, [liveRequested, reload]);

  useEffect(() => {
    setDeleteArmed(false);
    setCheckpoints([]);
    setCheckpointsError("");
    ++checkpointGenerationRef.current;
    if (!selectedId) return;
    void refreshCheckpoints();
  }, [refreshCheckpoints, selectedId]);

  const chooseSession = useCallback((sessionId: string) => {
    selectionExplicitRef.current = true;
    selectedIdRef.current = sessionId;
    setSelectedId(sessionId);
  }, []);

  const upsertSession = useCallback((session: CloudBrowserSession) => {
    selectionExplicitRef.current = true;
    setSessions((current) => [
      session,
      ...current.filter((item) => item.id !== session.id),
    ]);
    selectedIdRef.current = session.id;
    setSelectedId(session.id);
  }, []);

  const clearSelection = useCallback(() => {
    selectionExplicitRef.current = false;
    selectedIdRef.current = "";
    setSelectedId("");
  }, []);

  return {
    sessions,
    selectedId,
    selected:
      sessions.find((item) => item.id === selectedId) || null,
    checkpoints,
    checkpointsLoading,
    checkpointsError,
    deleteArmed,
    setDeleteArmed,
    reload,
    refreshCheckpoints,
    chooseSession,
    upsertSession,
    clearSelection,
  };
}
