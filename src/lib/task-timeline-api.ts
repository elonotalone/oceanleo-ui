"use client";

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";
import { cloudComputerRequest } from "./cloud-computer-api";

export type TaskProgram = "claude" | "codex" | "cursor" | "hermes" | "oceanleo";
export type TaskTimelineFrame = Record<string, unknown>;
export type TaskTimelineEntry = {
  cursor: string;
  source: "native" | "leo";
  program: TaskProgram;
  session_id: string | null;
  created_at: string;
  frame?: TaskTimelineFrame;
  message?: Record<string, unknown>;
};
export type TaskSessionSummary = { id: string; program: TaskProgram | null; run_status: string; created_at: string };
export type TaskRequest = { id: string; kind: "permission" | "question"; [key: string]: unknown };
export type TaskState = {
  status: "idle" | "working" | "waiting_user" | "queued" | "stopping" | "stopped" | "failed" | "offline";
  program: TaskProgram | null;
  session_id: string | null;
  since: string | null;
  last_output_at: string | null;
  request: TaskRequest | null;
  queued: { client_message_id: string; program: TaskProgram; created_at: string; text?: string; attachments?: unknown[] }[];
  reason: string | null;
  pending_stop: boolean;
  computer: { id: string | null; online: boolean };
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
  client_message_id?: string;
};
export type TaskCommandResponse = { accepted?: boolean; delivery?: "started" | "injected" | "queued"; session_id?: string; entry_cursor?: string; task_id?: string; state?: TaskState; ok?: boolean };

export function getTaskTimeline(taskId: string, options: { before?: string; limit?: number; signal?: AbortSignal } = {}): Promise<TimelinePage> {
  const query = new URLSearchParams();
  if (options.before) query.set("before", options.before);
  if (options.limit !== undefined) query.set("limit", String(Math.max(1, Math.min(500, options.limit))));
  return cloudComputerRequest<TimelinePage>(`/v1/tasks/${encodeURIComponent(taskId)}/timeline${query.size ? `?${query}` : ""}`, { signal: options.signal });
}

export type TaskLiveEvent =
  | { type: "entries"; entries: TaskTimelineEntry[] }
  | { type: "state"; state: TaskState }
  | { type: "reset" }
  | { type: "ping" };

/** Auth matches agent-dialog: bearer token in the WebSocket query string. */
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
      schedule();
      return;
    }
    socket = next;
    next.onopen = () => {
      if (current !== generation || closed) return next.close();
      reconnectDelay = 1_000;
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
    };
    next.onclose = (event) => {
      if (current !== generation || closed) return;
      socket = null;
      reportError(event);
      schedule();
    };
  };
  void connect();
  return {
    close: () => {
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
