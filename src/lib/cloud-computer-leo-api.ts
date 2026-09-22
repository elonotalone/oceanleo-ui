"use client";

// Shell 右上角 OceanLeo agent 的 REST。回合由网关创建（合同 §2.3）；
// 这里拿 task_id 后用现有 getTask 轮询。通知与 agent.ts 的 authed() 同一套鉴权。

import { authed, getTask } from "./agent";
import type { AgentMessage, TaskDetail } from "./agent";

export type LeoMode = "local" | "remote";

export type LeoNote = {
  id: string;
  text: string;
  created_at: string;
};

export type LeoEvent = {
  kind: string;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type LeoState = {
  online: boolean;
  mode: LeoMode;
  task_id: string | null;
  notes: LeoNote[];
  prefs: Record<string, unknown>;
  running: string[];
  last_seen_at: string | null;
  events: LeoEvent[];
};

export type LeoWatch = {
  id: string;
  computer_id: string;
  kind: "process" | "dialog" | "session";
  program: string | null;
  shell_session_id: string | null;
  label: string | null;
  status: "armed" | "fired" | "cancelled";
  created_at: string;
  fired_at: string | null;
  last_seen_at: string | null;
};

export type LeoNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  meta?: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function leoPath(computerId: string, suffix: string): string {
  return `/v1/computers/${encodeURIComponent(computerId)}/leo${suffix}`;
}

export function getLeoState(computerId: string) {
  return authed<LeoState>(leoPath(computerId, "/state"));
}

export function putLeoState(
  computerId: string,
  body: { task_id?: string | null; prefs?: Record<string, unknown> },
) {
  return authed<LeoState>(leoPath(computerId, "/state"), {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function postLeoNote(computerId: string, text: string) {
  return authed<{ note: LeoNote }>(leoPath(computerId, "/notes"), {
    method: "POST",
    body: JSON.stringify({ text: text.slice(0, 500) }),
  });
}

export function deleteLeoNote(computerId: string, noteId: string) {
  return authed<{ ok: boolean }>(
    leoPath(computerId, `/notes/${encodeURIComponent(noteId)}`),
    { method: "DELETE" },
  );
}

export function postLeoTurn(
  computerId: string,
  body: {
    text: string;
    task_id?: string;
    shell_session_id?: string;
    terminal_tail?: string;
  },
) {
  const payload: {
    text: string;
    task_id?: string;
    shell_session_id?: string;
    terminal_tail?: string;
  } = { text: body.text.slice(0, 8000) };
  if (body.task_id) payload.task_id = body.task_id;
  if (body.shell_session_id) payload.shell_session_id = body.shell_session_id;
  if (body.terminal_tail != null) payload.terminal_tail = body.terminal_tail.slice(-4000);
  return authed<{ task_id: string; mode: LeoMode }>(leoPath(computerId, "/turn"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLeoWatches(computerId: string) {
  return authed<{ watches: LeoWatch[] }>(leoPath(computerId, "/watches"));
}

export function postLeoWatch(
  computerId: string,
  body: {
    kind: "process" | "dialog" | "session";
    program?: string;
    shell_session_id?: string;
    label?: string;
  },
) {
  return authed<{ watch: LeoWatch }>(leoPath(computerId, "/watches"), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteLeoWatch(computerId: string, watchId: string) {
  return authed<{ ok: boolean }>(
    leoPath(computerId, `/watches/${encodeURIComponent(watchId)}`),
    { method: "DELETE" },
  );
}

export function listLeoNotifications(kind: string) {
  const query = new URLSearchParams({
    unread_only: "true",
    kind,
    limit: "10",
  });
  return authed<{ items: LeoNotification[]; unread_count: number }>(
    `/v1/notifications?${query.toString()}`,
  );
}

export function markNotificationsRead(ids: string[]) {
  return authed<{ updated: number; unread_count: number }>("/v1/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
}

export { getTask };
export type { AgentMessage, TaskDetail };
