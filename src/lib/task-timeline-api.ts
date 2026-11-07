"use client";

// Types read by task-timeline/map.ts for oceanleo-app mobile; the web task page reads ACP frames instead.

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";
import { cloudComputerRequest } from "./cloud-computer-api";
import type { AgentAttachment } from "./agent";

export type TaskProgram = "claude" | "codex" | "cursor" | "hermes" | "oceanleo";
export type TaskTimelineFrame = Record<string, unknown>;
export type TaskTimelineEntry = {
  cursor: string;
  source: "native" | "leo";
  program: TaskProgram;
  session_id: string | null;
  created_at: string;
  /** Number range assigned by the session archive writer (null on legacy rows). */
  no_from?: number | null;
  no_to?: number | null;
  frame?: TaskTimelineFrame;
  message?: Record<string, unknown>;
};
export type TaskTimelineLiveFrame = {
  session_id: string;
  program: TaskProgram;
  no: number;
  frame: TaskTimelineFrame;
  at: string;
};
export type TaskLocalMessageInput = {
  clientMessageId: string;
  text: string;
  attachments: AgentAttachment[];
  program: TaskProgram;
};
export type TaskSessionSummary = { id: string; program: TaskProgram | null; run_status: string; created_at: string };
export type TaskRequest = { id: string; kind: "permission" | "question"; [key: string]: unknown };
export type TaskState = {
  status: "idle" | "working" | "waiting_user" | "queued" | "stopping" | "stopped" | "failed" | "offline" | "saving_delayed";
  program: TaskProgram | null;
  session_id: string | null;
  since: string | null;
  last_output_at: string | null;
  request: TaskRequest | null;
  queued: { client_message_id: string; program: TaskProgram; created_at: string; text?: string; attachments?: unknown[] }[];
  reason: string | null;
  pending_stop: boolean;
  computer: { id: string | null; online: boolean };
  /** True while the gateway is streaming but has not durably saved the tail. */
  saving_delayed?: boolean;
};
export type TimelinePage = {
  task_id: string;
  entries: TaskTimelineEntry[];
  has_older: boolean;
  next_before: string | null;
  state: TaskState;
  sessions: TaskSessionSummary[];
};
export type TaskMessageInput = {
  program: TaskProgram;
  computer_id?: string;
  text: string;
  attachments?: unknown[];
  model?: string;
  mode?: string;
  effort?: string;
  fast?: boolean;
  client_message_id?: string;
  /** Stable tab/window id used to route agent UI actions. */
  client_window?: string;
};
export type TaskCommandResponse = { accepted?: boolean; delivery?: "started" | "injected" | "queued"; session_id?: string; entry_cursor?: string; task_id?: string; state?: TaskState; ok?: boolean };

export type TaskTimelineReadOptions = {
  before?: string;
  /** Preferred paging unit. The gateway caps this at 100 turns. */
  turns?: number;
  /** Legacy fallback only; retained for callers that used frame paging. */
  limit?: number;
  signal?: AbortSignal;
};

function timelineReadPath(taskId: string, options: TaskTimelineReadOptions): string {
  const query = new URLSearchParams();
  if (options.before) query.set("before", options.before);
  if (options.turns !== undefined) query.set("turns", String(Math.max(1, Math.min(100, Math.floor(options.turns)))));
  if (options.limit !== undefined) query.set("limit", String(Math.max(1, Math.min(500, Math.floor(options.limit)))));
  return `/v1/tasks/${encodeURIComponent(taskId)}/timeline${query.size ? `?${query}` : ""}`;
}

/** Read a turn page, falling back silently for gateways predating C1. */
export async function getTaskTimeline(taskId: string, options: TaskTimelineReadOptions = {}): Promise<TimelinePage> {
  try {
    return await cloudComputerRequest<TimelinePage>(timelineReadPath(taskId, options), { signal: options.signal });
  } catch (error) {
    if (options.turns === undefined || !error || typeof error !== "object" || !([400, 422] as number[]).includes((error as { status?: unknown }).status as number)) {
      throw error;
    }
    return cloudComputerRequest<TimelinePage>(timelineReadPath(taskId, {
      before: options.before,
      limit: options.limit ?? 200,
      signal: options.signal,
    }), { signal: options.signal });
  }
}

export type TaskLiveEvent =
  | { type: "entries"; entries: TaskTimelineEntry[] }
  | ({ type: "live" } & TaskTimelineLiveFrame)
  | { type: "state"; state: TaskState }
  | { type: "error"; code?: string; message?: string; detail?: unknown }
  | { type: "reset" }
  | { type: "ping" };

export type TaskTimelineLiveStatus = "connecting" | "connected" | "reconnecting";

/** Auth matches task timeline: bearer token in the WebSocket query string. */
export async function taskTimelineWsUrl(taskId: string, after?: string): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("未登录");
  const base = gatewayBase().replace(/^http/i, "ws");
  const query = new URLSearchParams({ token });
  if (after) query.set("after", after);
  return `${base}/v1/tasks/${encodeURIComponent(taskId)}/live?${query}`;
}

export type TaskTimelineLiveConnection = { close: () => void };

/**
 * Keep the live tail attached to the server cursor. The gateway only emits
 * committed entries, so reconnecting with the last received cursor is enough
 * to recover a dropped connection without replaying or losing a frame.
 */
export function openTaskTimeline(
  taskId: string,
  after: string | undefined,
  onEvent: (event: TaskLiveEvent) => void,
  onError?: (error: Event) => void,
  onOpen?: () => void,
  onStatus?: (status: TaskTimelineLiveStatus) => void,
): TaskTimelineLiveConnection {
  let socket: WebSocket | null = null;
  let closed = false;
  let generation = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;
  let cursor = after;

  const reportError = (error?: Event) => {
    if (!closed) onError?.(error ?? (typeof Event === "function" ? new Event("error") : ({ type: "error" } as Event)));
  };
  const schedule = () => {
    if (closed || reconnectTimer !== null) return;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };
  const connect = async () => {
    if (closed) return;
    const current = ++generation;
    let url: string;
    try {
      url = await taskTimelineWsUrl(taskId, cursor);
    } catch (error) {
      if (current !== generation || closed) return;
      reportError(typeof Event !== "undefined" && error instanceof Event ? error : undefined);
      onStatus?.("reconnecting");
      schedule();
      return;
    }
    if (current !== generation || closed) return;
    let next: WebSocket;
    try {
      next = new WebSocket(url);
    } catch (error) {
      if (current !== generation || closed) return;
      reportError(typeof Event !== "undefined" && error instanceof Event ? error : undefined);
      onStatus?.("reconnecting");
      schedule();
      return;
    }
    socket = next;
    next.onopen = () => {
      if (current !== generation || closed) return next.close();
      reconnectDelay = 1_000;
      onStatus?.("connected");
      onOpen?.();
    };
    next.onmessage = (event) => {
      if (current !== generation || closed) return;
      try {
        const parsed = JSON.parse(String(event.data)) as TaskLiveEvent;
        if (parsed?.type === "entries" && Array.isArray(parsed.entries)) {
          for (const entry of parsed.entries) if (typeof entry?.cursor === "string") cursor = entry.cursor;
        }
        onEvent(parsed);
      } catch {
        // A malformed frame cannot advance the cursor. The next reconnect will
        // request the last valid cursor and the server will replay the gap.
      }
    };
    next.onerror = (event) => {
      if (current !== generation || closed) return;
      reportError(event);
      onStatus?.("reconnecting");
    };
    next.onclose = (event) => {
      if (current !== generation || closed) return;
      socket = null;
      reportError(event);
      onStatus?.("reconnecting");
      schedule();
    };
  };
  // The link is back (browser `online`): retry now instead of waiting out the doubled backoff
  // (an 8 s drop left the reconnecting notice up ~7.5 s after recovery).
  const reconnectNow = () => {
    if (closed || reconnectTimer === null) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectDelay = 1_000;
    void connect();
  };
  const onlineTarget = typeof window !== "undefined" && typeof window.addEventListener === "function" ? window : null;
  onlineTarget?.addEventListener("online", reconnectNow);
  onStatus?.("connecting");
  void connect();
  return {
    close: () => {
      onlineTarget?.removeEventListener("online", reconnectNow);
      closed = true;
      generation += 1;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      const current = socket;
      socket = null;
      current?.close();
    },
  };
}

export function sendTaskMessage(taskId: string, input: TaskMessageInput, options: { signal?: AbortSignal } = {}) {
  return cloudComputerRequest<TaskCommandResponse>(`/v1/tasks/${encodeURIComponent(taskId)}/messages`, { method: "POST", body: JSON.stringify(input), signal: options.signal });
}
export function createTask(input: TaskMessageInput & { title?: string }, options: { signal?: AbortSignal } = {}) {
  return cloudComputerRequest<TaskCommandResponse>("/v1/tasks", { method: "POST", body: JSON.stringify(input), signal: options.signal });
}
export function stopTask(taskId: string, options: { signal?: AbortSignal } = {}) {
  return cloudComputerRequest<{ state: TaskState }>(`/v1/tasks/${encodeURIComponent(taskId)}/stop`, { method: "POST", signal: options.signal });
}
export function answerTaskRequest(taskId: string, requestId: string, answer: { option_id?: string; answers?: Record<string, string> }, options: { signal?: AbortSignal } = {}) {
  return cloudComputerRequest<{ ok: true }>(`/v1/tasks/${encodeURIComponent(taskId)}/requests/${encodeURIComponent(requestId)}`, { method: "POST", body: JSON.stringify(answer), signal: options.signal });
}
export function removeQueued(taskId: string, clientMessageId: string, options: { signal?: AbortSignal } = {}) {
  return cloudComputerRequest<{ ok: true }>(`/v1/tasks/${encodeURIComponent(taskId)}/queue/${encodeURIComponent(clientMessageId)}`, { method: "DELETE", signal: options.signal });
}
