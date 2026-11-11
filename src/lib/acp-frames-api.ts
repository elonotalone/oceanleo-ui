"use client";

// The page side of the single conversation path for computer tasks (thin-gateway
// wave 2026-11-07, contract §2.4). The gateway stores every JSON-RPC line once
// (`acp_frames`) and this module only reads those rows and posts the user's own
// actions. Nothing is queued, retried or resent here: a failed call throws the
// gateway's answer as it came; a dropped socket is `disconnected` until the plain
// backoff reconnects it from the last row it delivered.

import type { AcpFrameRow } from "../acp";
import type { AgentAttachment } from "./agent";
import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";

export type { AcpFrameRow };

export type AcpFramesState = "connecting" | "connected" | "disconnected";
/** The agent link as the gateway reports it on the frames socket. */
export type AcpLinkState = "attached" | "detached" | "exited" | "error" | "dropped";

/** A JSON-RPC error object exactly as the gateway relayed it (HTTP 409 from `send`). */
export type AcpRpcError = { code?: number | string; message?: string; data?: unknown };

/**
 * A refused route call. `code` / `message` / `data` are the gateway's JSON-RPC
 * error verbatim when it sent one (a 409 from `send`: the program refused a
 * setting and no prompt went out); otherwise `message` is the body as it came.
 */
export class AcpSendError extends Error {
  readonly status: number;
  readonly code: number | string | null;
  readonly data: unknown;
  readonly payload: unknown;

  constructor(status: number, message: string, rpc: AcpRpcError | null, payload: unknown) {
    super(message);
    this.name = "AcpSendError";
    this.status = status;
    this.code = rpc?.code ?? null;
    this.data = rpc?.data;
    this.payload = payload;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function routeError(status: number, payload: unknown): AcpSendError {
  const body = record(payload);
  const detail = body?.detail;
  const rpc = record(body?.error) ?? record(record(detail)?.error) ?? record(detail);
  const message = typeof rpc?.message === "string" && rpc.message ? rpc.message
    : typeof detail === "string" && detail ? detail
      : typeof payload === "string" && payload ? payload
        : `HTTP ${status}`;
  return new AcpSendError(status, message, rpc as AcpRpcError | null, payload);
}

/**
 * The program itself refused (a `session/set_*` answered with an error, so no
 * prompt went out): its error is already a row of the task (`{"error":…}` body,
 * HTTP 409). Any other failure is the gateway's, with no row behind it.
 */
export function refusedByAgent(error: unknown): boolean {
  return error instanceof AcpSendError && error.status === 409 && record(record(error.payload)?.error) !== null;
}

/** The text a refusal is shown with: the error's own message, then its `data` (never reworded). */
export function acpErrorText(error: unknown): string {
  if (error instanceof AcpSendError) {
    const data = error.data;
    const extra = data === undefined || data === null ? "" : typeof data === "string" ? data : JSON.stringify(data);
    return [error.message, extra].filter(Boolean).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

/** One gateway route call with the user's token; a refusal throws `AcpSendError` with the body as it came. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new AcpSendError(401, "未登录", null, null);
  let res: Response;
  try {
    res = await fetch(`${gatewayBase()}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch (caught) {
    throw new AcpSendError(0, caught instanceof Error ? caught.message : String(caught), null, null);
  }
  const text = await res.text();
  let payload: unknown = text;
  try { payload = text ? JSON.parse(text) : null; } catch { /* a non-JSON body stays text */ }
  if (!res.ok) throw routeError(res.status, payload);
  return payload as T;
}

function post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal });
}

const taskPath = (taskId: string, tail: string) => `/v1/tasks/${encodeURIComponent(taskId)}/${tail}`;

/** Rows after a row id, ascending (`GET /v1/tasks/{id}/frames`). */
export function getFrames(taskId: string, after = 0, limit = 500, options: { signal?: AbortSignal } = {}): Promise<AcpFrameRow[]> {
  const query = new URLSearchParams({ after: String(after), limit: String(limit) });
  return request<AcpFrameRow[]>(`${taskPath(taskId, "frames")}?${query}`, { signal: options.signal });
}

/** Cursor based history window (C9). Older gateways may return 404; callers fall back to frames. */
export type AcpHistoryWindow = {
  rows: AcpFrameRow[];
  turns: { start_id: number; end_id: number }[];
  oldest_id: number | null;
  newest_id: number | null;
  next_before: number | null;
  has_more: boolean;
  next_after?: number | null;
  has_more_after?: boolean;
  tail_id: number;
  capped: boolean;
  max_rows: number;
};

export function getHistoryWindow(taskId: string, options: { before?: number; after?: number; anchor?: number; turns?: number; signal?: AbortSignal } = {}): Promise<AcpHistoryWindow> {
  const query = new URLSearchParams();
  if (options.before != null) query.set("before", String(options.before));
  if (options.after != null) query.set("after", String(options.after));
  if (options.anchor != null) query.set("anchor", String(options.anchor));
  query.set("turns", String(options.turns ?? 8));
  return request<AcpHistoryWindow>(`${taskPath(taskId, "history")}?${query}`, { signal: options.signal });
}

/** Per-session choices sent with a message; the gateway applies them (session/set_*) before the prompt. */
export type AcpSessionChoices = {
  model?: string;
  mode?: string;
  config?: Record<string, string | boolean>;
};

export type AcpSendBody = AcpSessionChoices & {
  client_message_id: string;
  /** Required on a task's first message (the gateway starts the program); later messages may omit them. */
  program?: string;
  computer_id?: string;
  text: string;
  attachments?: AgentAttachment[];
};

/** The gateway's receipt; the user's row itself arrives on the frames socket. */
export type AcpSendResult = { row_id?: number; [key: string]: unknown };

export function send(taskId: string, body: AcpSendBody, options: { signal?: AbortSignal } = {}): Promise<AcpSendResult> {
  return post<AcpSendResult>(taskPath(taskId, "send"), body, options.signal);
}

/** `session/cancel`: the turn ends, the agent stays. */
export function stop(taskId: string): Promise<unknown> {
  return post(taskPath(taskId, "stop"));
}

/** `session/close`, then the computer ends the agent process. */
export function close(taskId: string): Promise<unknown> {
  return post(taskPath(taskId, "close"));
}

/** The JSON-RPC response to the agent's own request (permission, question). */
export function answer(taskId: string, requestId: number | string, result: unknown): Promise<unknown> {
  return post(taskPath(taskId, "answer"), { request_id: requestId, result });
}

/** Claude's per-task stop for one background task; 404 when the adapter has none. */
export function stopTask(taskId: string, taskRef: string): Promise<unknown> {
  return post(taskPath(taskId, "stop-task"), { task_ref: taskRef });
}

/** One program's models / modes / options as its last session reported them; `{}` until one did. */
export type AcpCatalog = {
  models?: {
    currentModelId?: string | null;
    availableModels?: { modelId: string; name?: string | null; description?: string | null }[] | null;
  } | null;
  modes?: {
    currentModeId?: string | null;
    availableModes?: { id: string; name?: string | null; description?: string | null }[] | null;
  } | null;
  configOptions?: Record<string, unknown>[] | null;
};

export function getCatalog(computerId: string, program: string, options: { signal?: AbortSignal } = {}): Promise<AcpCatalog> {
  return request<AcpCatalog>(
    `/v1/computers/${encodeURIComponent(computerId)}/programs/${encodeURIComponent(program)}/catalog`,
    { signal: options.signal },
  );
}

export type AcpFramesEvent =
  | { type: "rows"; rows: AcpFrameRow[] }
  | { type: "state"; state: AcpFramesState }
  | { type: "link"; link: AcpLinkState };

export interface AcpFrames {
  readonly state: AcpFramesState;
  /** Rows in commit order, socket state and agent link changes. */
  readonly rows$: { subscribe(listener: (event: AcpFramesEvent) => void): () => void };
  close(): void;
}

const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 10_000;

/** Bearer token in the query string, as the other task sockets. */
export async function framesWsUrl(taskId: string, after: number): Promise<string> {
  const token = await accessToken();
  if (!token) throw new AcpSendError(401, "未登录", null, null);
  const query = new URLSearchParams({ token, after: String(after) });
  return `${gatewayBase().replace(/^http/i, "ws")}${taskPath(taskId, "frames")}?${query}`;
}

function frameRow(value: unknown): AcpFrameRow | null {
  const row = record(value);
  if (!row || typeof row.id !== "number" || typeof row.raw !== "string") return null;
  if (row.direction !== "agent" && row.direction !== "client") return null;
  return row as unknown as AcpFrameRow;
}

/**
 * The task's frames socket (`WS /v1/tasks/{id}/frames`): the backlog after
 * `after`, then each committed row. A drop sets `disconnected` and reconnects
 * after 1 s, doubling to 10 s, from the last row delivered. It never sends anything.
 */
export function openFrames(taskId: string, after = 0): AcpFrames {
  const listeners = new Set<(event: AcpFramesEvent) => void>();
  let state: AcpFramesState = "connecting";
  let cursor = after;
  let socket: WebSocket | null = null;
  let closed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = RETRY_FIRST_MS;

  const emit = (event: AcpFramesEvent) => { for (const listener of [...listeners]) listener(event); };
  const setState = (next: AcpFramesState) => {
    if (state === next) return;
    state = next;
    emit({ type: "state", state });
  };
  const retry = () => {
    if (closed || timer !== null) return;
    const wait = delay;
    delay = Math.min(delay * 2, RETRY_MAX_MS);
    timer = setTimeout(() => { timer = null; void connect(); }, wait);
  };
  const dropped = (current: number) => {
    if (current !== generation || closed) return;
    socket = null;
    setState("disconnected");
    retry();
  };
  const connect = async () => {
    if (closed) return;
    setState("connecting");
    const current = ++generation;
    let url: string;
    try { url = await framesWsUrl(taskId, cursor); } catch { dropped(current); return; }
    if (current !== generation || closed) return;
    let next: WebSocket;
    try { next = new WebSocket(url); } catch { dropped(current); return; }
    socket = next;
    next.onopen = () => {
      if (current !== generation || closed) { next.close(); return; }
      delay = RETRY_FIRST_MS;
      setState("connected");
    };
    next.onmessage = (event) => {
      if (current !== generation || closed) return;
      let message: Record<string, unknown> | null = null;
      try { message = record(JSON.parse(String(event.data))); } catch { return; }
      if (!message) return;
      const row = frameRow(message.row);
      if (row) {
        // Rows come in commit order; one already delivered (id at or below the cursor) is not a new row.
        if (row.id <= cursor) return;
        cursor = row.id;
        emit({ type: "rows", rows: [row] });
        return;
      }
      if (typeof message.link === "string") emit({ type: "link", link: message.link as AcpLinkState });
    };
    next.onerror = () => { if (current === generation && !closed) next.close(); };
    next.onclose = () => dropped(current);
  };
  void connect();
  return {
    get state() { return state; },
    rows$: {
      subscribe(listener) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    },
    close() {
      closed = true;
      generation += 1;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const current = socket;
      socket = null;
      listeners.clear();
      current?.close();
    },
  };
}
