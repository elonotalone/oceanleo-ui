"use client";

import { isUnsupportedShellCommand } from "../api/device-error-copy";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export const LOCAL_ACTION_KINDS = [
  "fs.list",
  "fs.read_summary",
  "file.write",
  "python.run",
  "shell.run",
  "app.open",
] as const;

export type LocalActionKind = (typeof LOCAL_ACTION_KINDS)[number];

export interface LocalActionPayloadByKind {
  "fs.list": { path: string };
  "fs.read_summary": { path: string };
  "file.write": { path: string; content_b64: string };
  "python.run": { cwd: string; code: string };
  "shell.run": { cwd: string; command: string };
  "app.open": { path: string };
}

export type LocalActionPayload<K extends LocalActionKind> =
  LocalActionPayloadByKind[K];

export const LOCAL_TASK_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
] as const;

export type LocalTaskStatus = (typeof LOCAL_TASK_STATUSES)[number];

export type LocalTaskDenyReason =
  | "local_exec_disabled"
  | "grant_missing"
  | "path_outside_grant"
  | "confirm_timeout"
  | "user_denied"
  | "command_unsupported"
  | "revoked";

export interface LocalTaskSummaryFile {
  name: string;
  bytes: number;
  kind: string;
}

/** The complete browser-visible allowlist from protocol §5.3. */
export interface LocalTaskResultSummary {
  entries?: number;
  bytes?: number;
  columns?: string[];
  rows?: number;
  /** `fs.read_summary` only: `"file"` or `"directory"` (contract §2). */
  kind?: string;
  files?: LocalTaskSummaryFile[];
  exit_code?: number;
  output_bytes?: number;
  stdout_tail?: string;
  stderr_tail?: string;
}

export interface LocalTask {
  status: LocalTaskStatus;
  actionKind?: LocalActionKind;
  resultSummary?: LocalTaskResultSummary;
  denyReason?: LocalTaskDenyReason;
}

export interface CreatedLocalTask {
  taskId: string;
  offline: boolean;
}

export class LocalTaskApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Quota ceiling named by the server, when it names one. */
  readonly limit?: number;

  constructor(code: string, status: number, limit?: number) {
    super(code);
    this.name = "LocalTaskApiError";
    this.code = code;
    this.status = status;
    if (limit !== undefined) this.limit = limit;
  }
}

interface JsonObject {
  [key: string]: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorCode(payload: unknown, status: number): string {
  if (isObject(payload)) {
    const direct = stringField(payload.code) || stringField(payload.error_code);
    if (direct) return direct;
    // Contract §1.2b makes `detail` an object; a plain string is the older
    // shape and still has to resolve, or a stale gateway turns every refusal
    // into an unknown code.
    if (isObject(payload.detail)) {
      const nested =
        stringField(payload.detail.code) || stringField(payload.detail.error_code);
      if (nested) return nested;
    }
    if (typeof payload.detail === "string" && payload.detail) return payload.detail;
  }
  return status === 401 ? "unauthorized" : `http_${status}`;
}

function errorLimit(payload: unknown): number | undefined {
  if (!isObject(payload)) return undefined;
  const nested = isObject(payload.detail) ? payload.detail.limit : undefined;
  // Contract §1.2b puts the ceiling on `detail`; a top-level `limit` is only
  // tolerated so an older or proxied shape still reaches the same sentence.
  for (const candidate of [nested, payload.limit]) {
    const parsed = numberField(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await accessToken();
  if (!token) throw new LocalTaskApiError("unauthorized", 401);

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new LocalTaskApiError("network_error", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LocalTaskApiError(
      errorCode(payload, response.status),
      response.status,
      errorLimit(payload),
    );
  }
  return payload;
}

function isStatus(value: unknown): value is LocalTaskStatus {
  return LOCAL_TASK_STATUSES.some((status) => status === value);
}

function isActionKind(value: unknown): value is LocalActionKind {
  return LOCAL_ACTION_KINDS.some((actionKind) => actionKind === value);
}

function isDenyReason(value: unknown): value is LocalTaskDenyReason {
  return [
    "local_exec_disabled",
    "grant_missing",
    "path_outside_grant",
    "confirm_timeout",
    "user_denied",
    "command_unsupported",
    "revoked",
  ].some((reason) => reason === value);
}

/**
 * Drop every field that is not explicitly allowed by protocol §5.3. This is a
 * browser-side defence in depth; the server performs the authoritative filter.
 */
export function sanitizeLocalTaskSummary(
  value: unknown,
  actionKind?: LocalActionKind,
): LocalTaskResultSummary | undefined {
  if (!isObject(value)) return undefined;
  const summary: LocalTaskResultSummary = {};
  const entries = numberField(value.entries);
  const bytes = numberField(value.bytes);
  const rows = numberField(value.rows);
  const exitCode = numberField(value.exit_code);
  const outputBytes = numberField(value.output_bytes);
  if (actionKind === "shell.run") {
    if (exitCode !== undefined) summary.exit_code = exitCode;
    if (outputBytes !== undefined) summary.output_bytes = outputBytes;
    return Object.keys(summary).length > 0 ? summary : undefined;
  }
  if (entries !== undefined) summary.entries = entries;
  if (bytes !== undefined) summary.bytes = bytes;
  if (rows !== undefined) summary.rows = rows;
  if (actionKind === undefined || actionKind === "fs.read_summary") {
    const kind = stringField(value.kind);
    if (kind !== undefined) summary.kind = kind.slice(0, 64);
  }
  if (exitCode !== undefined) summary.exit_code = exitCode;
  if (outputBytes !== undefined) summary.output_bytes = outputBytes;

  if (Array.isArray(value.columns)) {
    summary.columns = value.columns.filter(
      (column): column is string => typeof column === "string",
    );
  }
  if (Array.isArray(value.files)) {
    summary.files = value.files.flatMap((file) => {
      if (!isObject(file)) return [];
      const name = stringField(file.name);
      const fileBytes = numberField(file.bytes);
      const kind = stringField(file.kind);
      return name && fileBytes !== undefined && kind
        ? [{ name, bytes: fileBytes, kind }]
        : [];
    });
  }
  if (typeof value.stdout_tail === "string") {
    summary.stdout_tail = value.stdout_tail.slice(0, 2_000);
  }
  if (typeof value.stderr_tail === "string") {
    summary.stderr_tail = value.stderr_tail.slice(0, 2_000);
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

export async function createLocalTask<K extends LocalActionKind>(
  deviceId: string,
  actionKind: K,
  payload: LocalActionPayloadByKind[NoInfer<K>],
): Promise<CreatedLocalTask> {
  // Refuse the shapes the device cannot run before spending a rate-limit slot
  // on a task that is certain to come back as a bare "执行失败" (contract §4).
  if (actionKind === "shell.run") {
    const command = (payload as { command?: unknown }).command;
    if (typeof command === "string" && isUnsupportedShellCommand(command)) {
      throw new LocalTaskApiError("command_unsupported", 400);
    }
  }
  const response = await request(
    `/v1/devices/${encodeURIComponent(deviceId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        action_kind: actionKind,
        action_payload: payload,
      }),
    },
  );
  if (!isObject(response)) throw new LocalTaskApiError("invalid_response", 200);
  const taskId = stringField(response.task_id) || stringField(response.taskId);
  if (!taskId) throw new LocalTaskApiError("invalid_response", 200);
  const hint =
    stringField(response.code) ||
    stringField(response.error_code) ||
    stringField(response.warning) ||
    stringField(response.error) ||
    stringField(response.detail);
  return {
    taskId,
    offline:
      response.device_offline === true ||
      response.offline === true ||
      hint === "device_offline",
  };
}

export async function getLocalTask(taskId: string): Promise<LocalTask> {
  const response = await request(
    `/v1/devices/tasks/${encodeURIComponent(taskId)}`,
  );
  const raw = isObject(response) && isObject(response.task) ? response.task : response;
  if (!isObject(raw) || !isStatus(raw.status)) {
    throw new LocalTaskApiError("invalid_response", 200);
  }
  const rawActionKind = raw.action_kind ?? raw.actionKind;
  const actionKind = isActionKind(rawActionKind) ? rawActionKind : undefined;
  const resultSummary = sanitizeLocalTaskSummary(
    raw.result_summary ?? raw.resultSummary,
    actionKind,
  );
  const rawDenyReason = raw.deny_reason ?? raw.denyReason;
  return {
    status: raw.status,
    ...(actionKind ? { actionKind } : {}),
    ...(resultSummary ? { resultSummary } : {}),
    ...(isDenyReason(rawDenyReason) ? { denyReason: rawDenyReason } : {}),
  };
}

export async function cancelLocalTask(taskId: string): Promise<void> {
  await request(`/v1/devices/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

const TERMINAL_STATUSES: ReadonlySet<LocalTaskStatus> = new Set([
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
]);

export const LOCAL_TASK_POLL_DELAYS_MS = [1_000, 2_000, 5_000] as const;

interface VisibilityDocument {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface WatchLocalTaskOptions {
  /** Test seam; production callers should omit all options. */
  getTask?: (taskId: string) => Promise<LocalTask>;
  visibilityDocument?: VisibilityDocument | null;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

export function watchLocalTask(
  taskId: string,
  onUpdate: (task: LocalTask) => void,
  options: WatchLocalTaskOptions = {},
): () => void {
  const getTask = options.getTask || getLocalTask;
  const visibilityDocument =
    options.visibilityDocument === undefined
      ? typeof document === "undefined"
        ? null
        : document
      : options.visibilityDocument;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let polling = false;
  let delayIndex = 0;

  const clearScheduled = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearScheduled();
    visibilityDocument?.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const schedule = () => {
    if (stopped || visibilityDocument?.hidden) return;
    const delay = LOCAL_TASK_POLL_DELAYS_MS[Math.min(delayIndex, 2)];
    delayIndex += 1;
    timer = setTimer(() => {
      timer = null;
      void poll();
    }, delay);
  };

  const poll = async () => {
    if (stopped || polling || visibilityDocument?.hidden) return;
    polling = true;
    try {
      const task = await getTask(taskId);
      if (stopped) return;
      onUpdate(task);
      if (TERMINAL_STATUSES.has(task.status)) {
        stop();
        return;
      }
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      polling = false;
    }
    schedule();
  };

  function onVisibilityChange() {
    if (visibilityDocument?.hidden) {
      clearScheduled();
    } else if (!stopped && !polling && timer === null) {
      void poll();
    }
  }

  visibilityDocument?.addEventListener("visibilitychange", onVisibilityChange);
  if (!visibilityDocument?.hidden) void poll();
  return stop;
}
