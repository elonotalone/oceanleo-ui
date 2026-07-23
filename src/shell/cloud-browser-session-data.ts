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
  setLifecycleIssue?: Dispatch<
    SetStateAction<CloudBrowserLifecycleIssue | null>
  >;
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

export type CloudBrowserSessionOpenAction =
  | "connect"
  | "resume"
  | "unavailable";

export type CloudBrowserLifecycleDiagnosticValue =
  | string
  | number
  | boolean;

export type CloudBrowserLifecycleIssue = {
  message: string;
  code: string;
  operation: string;
  retryable: boolean | null;
  retryAfterSeconds: number | null;
  diagnostics: Record<
    string,
    CloudBrowserLifecycleDiagnosticValue
  >;
  status: number;
};

type CloudBrowserLifecycleFailure = {
  error?: unknown;
  status?: number;
  detail?: unknown;
  code?: unknown;
  operation?: unknown;
  retryable?: unknown;
  diagnostics?: unknown;
  retryAfterSeconds?: unknown;
  retry_after_seconds?: unknown;
  headers?: unknown;
};

const PUBLIC_LIFECYCLE_CODES = new Set([
  "BROWSER_NOT_CONFIGURED",
  "EXECUTOR_ORIGIN_REJECTED",
  "EXECUTOR_BUSY",
  "BROWSER_CAPACITY_EXHAUSTED",
  "INVALID_LIFECYCLE_STATE",
  "STALE_FENCE",
  "PERSISTENCE_UNAVAILABLE",
  "SESSION_NOT_FOUND",
  "TASK_NOT_FOUND",
  "NAVIGATION_URL_REJECTED",
  "BROWSER_RESTORE_FAILED",
  "BROWSER_HIBERNATE_FAILED",
  "BROWSER_DELETE_FAILED",
  "BROWSER_WARM_FAILED",
]);

const PUBLIC_DIAGNOSTIC_KEYS = new Set([
  "component",
  "reason",
  "scope",
  "tier",
  "state",
  "live_nodes",
  "eligible_nodes",
  "capacity",
  "active_runtimes",
  "free_slots",
]);

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
  result: CloudBrowserLifecycleFailure,
  fallback: string,
): string {
  return cloudBrowserLifecycleIssue(result, fallback).message;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsedErrorRecord(value: unknown): Record<string, unknown> | null {
  const direct = recordValue(value);
  if (direct) return direct;
  if (typeof value !== "string") return null;
  const source = value.trim();
  if (!source.startsWith("{") || source.length > 8_192) return null;
  try {
    return recordValue(JSON.parse(source));
  } catch {
    return null;
  }
}

function publicLifecycleCode(value: unknown): string {
  const source = String(value || "").trim().toUpperCase();
  if (PUBLIC_LIFECYCLE_CODES.has(source)) return source;
  if (
    /^BROWSER_SESSION_(?:LIST|CREATE|READ|CHECKPOINTS?)_(?:UNAVAILABLE|CONTRACT_INVALID)$/.test(
      source,
    )
  ) {
    return source;
  }
  return "";
}

function codeFromText(value: unknown): string {
  if (typeof value !== "string") return "";
  for (const token of value.match(/[A-Z][A-Z0-9_]{2,80}/g) || []) {
    const code = publicLifecycleCode(token);
    if (code) return code;
  }
  return "";
}

function boundedOperation(value: unknown): string {
  const source = String(value || "").trim();
  return /^[a-z][a-z0-9_]{0,63}$/.test(source) ? source : "";
}

function boundedRetryAfter(value: unknown): number | null {
  const parsed =
    typeof value === "string" && value.trim()
      ? Number(value)
      : value;
  return typeof parsed === "number" &&
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 3_600
    ? parsed
    : null;
}

function retryAfterFromHeaders(value: unknown): number | null {
  if (
    value &&
    typeof value === "object" &&
    "get" in value &&
    typeof (value as { get?: unknown }).get === "function"
  ) {
    try {
      return boundedRetryAfter(
        (value as { get: (name: string) => unknown }).get(
          "Retry-After",
        ),
      );
    } catch {
      return null;
    }
  }
  const headers = recordValue(value);
  if (headers) {
    return boundedRetryAfter(
      headers["Retry-After"] ?? headers["retry-after"],
    );
  }
  return null;
}

function publicDiagnostics(
  value: unknown,
): Record<string, CloudBrowserLifecycleDiagnosticValue> {
  const source = recordValue(value);
  if (!source) return {};
  const diagnostics: Record<
    string,
    CloudBrowserLifecycleDiagnosticValue
  > = {};
  for (const [key, raw] of Object.entries(source)) {
    if (!PUBLIC_DIAGNOSTIC_KEYS.has(key)) continue;
    if (
      typeof raw === "number" &&
      Number.isSafeInteger(raw) &&
      raw >= 0 &&
      raw <= 1_000_000
    ) {
      diagnostics[key] = raw;
      continue;
    }
    if (typeof raw === "boolean") {
      diagnostics[key] = raw;
      continue;
    }
    if (
      typeof raw === "string" &&
      raw.length > 0 &&
      raw.length <= 120 &&
      /^[A-Za-z0-9._:-]+$/.test(raw)
    ) {
      diagnostics[key] = raw;
    }
  }
  return diagnostics;
}

function fallbackCodeForStatus(status: number): string {
  if (status === 0) return "NETWORK_UNAVAILABLE";
  if (status === 404) return "SESSION_NOT_FOUND";
  if (status === 409) return "INVALID_LIFECYCLE_STATE";
  if (status === 502) return "BROWSER_GATEWAY_ERROR";
  // An unstructured 503 has unknown cause. Never mislabel it as a
  // configuration failure; only an explicit stable code can do that.
  if (status === 503) return "BROWSER_SERVICE_UNAVAILABLE";
  return "";
}

function defaultRetryableForCode(code: string): boolean | null {
  if (
    code === "EXECUTOR_BUSY" ||
    code === "BROWSER_CAPACITY_EXHAUSTED" ||
    code === "BROWSER_SERVICE_UNAVAILABLE" ||
    code === "NETWORK_UNAVAILABLE" ||
    code.endsWith("_UNAVAILABLE")
  ) {
    return true;
  }
  if (!code || code === "BROWSER_GATEWAY_ERROR") return null;
  return false;
}

export function cloudBrowserLifecycleIssue(
  result: CloudBrowserLifecycleFailure,
  fallback: string,
): CloudBrowserLifecycleIssue {
  const status =
    typeof result.status === "number" &&
    Number.isInteger(result.status)
      ? result.status
      : 0;
  const errorRecord = parsedErrorRecord(result.error);
  const directDetail = recordValue(result.detail);
  const envelope =
    recordValue(directDetail?.detail) ||
    directDetail ||
    recordValue(errorRecord?.detail) ||
    errorRecord ||
    recordValue(result);
  const rawError =
    typeof result.error === "string" ? result.error.trim() : "";
  const code =
    publicLifecycleCode(envelope?.code ?? result.code) ||
    codeFromText(rawError) ||
    fallbackCodeForStatus(status);
  const operation = boundedOperation(
    envelope?.operation ?? result.operation,
  );
  const explicitRetryable =
    typeof (envelope?.retryable ?? result.retryable) === "boolean"
      ? Boolean(envelope?.retryable ?? result.retryable)
      : null;
  const retryable =
    explicitRetryable ?? defaultRetryableForCode(code);
  const retryAfterSeconds =
    boundedRetryAfter(
      envelope?.retry_after_seconds ??
        envelope?.retryAfterSeconds ??
        result.retry_after_seconds ??
        result.retryAfterSeconds,
    ) ?? retryAfterFromHeaders(result.headers);
  const diagnostics = publicDiagnostics(
    envelope?.diagnostics ?? result.diagnostics,
  );
  const suffix = [
    code,
    retryAfterSeconds !== null
      ? `Retry-After ${retryAfterSeconds}s`
      : "",
  ].filter(Boolean);
  return {
    message: suffix.length
      ? `${fallback}: ${suffix.join(" · ")}`
      : fallback,
    code,
    operation,
    retryable,
    retryAfterSeconds,
    diagnostics,
    status,
  };
}

export function cloudBrowserSessionNeedsResume(
  session: CloudBrowserSession | null,
): boolean {
  return cloudBrowserSessionOpenAction(session) === "resume";
}

export function cloudBrowserSessionOpenAction(
  session: CloudBrowserSession | null,
): CloudBrowserSessionOpenAction {
  if (!session) return "unavailable";
  const status = String(session.status || "").trim();
  const runtimeState = String(session.runtime_state || "").trim();
  const hasLiveRuntime =
    Boolean(session.runtime_id) && session.incarnation > 0;

  if (
    (status === "active" || status === "warm") &&
    runtimeState === "ready" &&
    hasLiveRuntime
  ) {
    return "connect";
  }
  if (
    (status === "active" || status === "warm") &&
    (!hasLiveRuntime ||
      !runtimeState ||
      runtimeState === "absent" ||
      runtimeState === "dead")
  ) {
    return "resume";
  }
  if (
    status === "created" ||
    status === "hibernated" ||
    status === "failed"
  ) {
    return "resume";
  }
  return "unavailable";
}

export function cloudBrowserSessionCanHibernate(
  session: CloudBrowserSession | null,
  transportState: string,
): boolean {
  return (
    transportState === "streaming" &&
    cloudBrowserSessionOpenAction(session) === "connect"
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
  setLifecycleIssue,
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
        const issue = cloudBrowserLifecycleIssue(
          { operation: "session_list", ...recentResult },
          tt("浏览记录加载失败"),
        );
        const message = issue.message;
        sessionLoadErrorRef.current = message;
        setLifecycleIssue?.(issue);
        setError(message);
        return;
      }
      if (effectiveTaskId && taskResult && !taskResult.ok) {
        const issue = cloudBrowserLifecycleIssue(
          { operation: "session_list", ...taskResult },
          tt("当前任务的浏览记录加载失败"),
        );
        const message = issue.message;
        sessionLoadErrorRef.current = message;
        setLifecycleIssue?.(issue);
        setError(message);
      } else {
        const previous = sessionLoadErrorRef.current;
        sessionLoadErrorRef.current = "";
        if (previous) {
          setLifecycleIssue?.(null);
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
    [effectiveTaskId, setError, setLifecycleIssue, tt],
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
          { operation: "checkpoint_list", ...result },
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
