"use client";

export const HISTORY_CHANGED_EVENT = "oceanleo:history-changed";

export function notifyHistoryChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  }
}

/**
 * A conversation on screen just moved (a native frame, a Leo reply, a user
 * send). My Tasks bumps that row locally at once instead of waiting for the
 * next poll; the server's `last_activity_at` (migration 0313) catches up on
 * the following list refresh. Detail: {@link HistoryActivityDetail}.
 */
export const HISTORY_ACTIVITY_EVENT = "oceanleo:history-activity";
/** Streamed output bumps a row at most this often; user input always does. */
export const HISTORY_ACTIVITY_THROTTLE_MS = 5_000;

export interface HistoryActivityDetail {
  taskId?: string;
  sessionId?: string;
  /** The user spoke: also moves the row within the working group. */
  user?: boolean;
  /** ISO time of the activity. */
  at: string;
}

const lastNotified = new Map<string, number>();

export function notifyHistoryActivity(input: {
  taskId?: string | null;
  sessionId?: string | null;
  user?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const taskId = input.taskId || undefined;
  const sessionId = input.sessionId || undefined;
  const key = taskId || sessionId;
  if (!key) return;
  const now = Date.now();
  if (!input.user && now - (lastNotified.get(key) ?? 0) < HISTORY_ACTIVITY_THROTTLE_MS) return;
  if (lastNotified.size > 200) lastNotified.clear();
  lastNotified.set(key, now);
  const detail: HistoryActivityDetail = {
    taskId,
    sessionId,
    ...(input.user ? { user: true } : {}),
    at: new Date(now).toISOString(),
  };
  window.dispatchEvent(new CustomEvent<HistoryActivityDetail>(HISTORY_ACTIVITY_EVENT, { detail }));
}
