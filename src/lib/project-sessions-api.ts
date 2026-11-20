// Project sessions and the cards a session shows (session / sites wave 2026-11-21, contract §2.1 + §2.2).
// A session is a people conversation that exists only inside a project (`im_conversations.kind = "project"`);
// its messages, read state, realtime and calls use the ordinary `/v1/im/conversations/{id}/…` routes.
// Every call answers a `ProjectSessionsResult`: before the additive migration is applied the gateway answers a
// typed 503 (`sessions_unavailable`, `quote_unavailable`, …; an older gateway: 404 with no code), which comes back
// as `{ ok: false, unavailable: true }` so the UI can say "not available yet" instead of failing.
import { GATEWAY_BASE } from "./auth/config";
import { accessToken } from "./auth/client";
import type { ImMessage } from "./im/types";

export interface ProjectSession {
  id: string;
  title: string;
  project: { id: string; name: string };
  created_by: string | null;
  last_message_at: string | null;
  /** Locale-neutral text, or a structured `{label_key, text}` the UI translates. */
  last_preview: string | { label_key: string; text: string } | null;
  unread: number;
  members_count: number;
  can_write: boolean;
  can_manage: boolean;
}

export interface ProjectSessionsUnread {
  total: number;
  by_project: Record<string, number>;
}

export type ProjectSessionsFailure = {
  ok: false;
  /** 503 (any code) or a gateway without the route: the feature is not there yet. */
  unavailable: boolean;
  status: number;
  /** Server `code` (`not_member`, `quote_too_large`, …), `http_<status>`, `unauthorized` or `network`. */
  code: string;
  message: string;
};

export type ProjectSessionsResult<T> = { ok: true; data: T } | ProjectSessionsFailure;

/** Transport seam (tests, hosts with their own fetch). Answers status + parsed JSON body (null when none). */
export type ProjectSessionsTransport = (
  path: string,
  init: { method: string; json?: unknown },
) => Promise<{ status: number; body: unknown }>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Errors arrive as `{code, message}` at the top level or under FastAPI's `detail`. */
export function projectSessionsFailure(status: number, body: unknown): ProjectSessionsFailure {
  const top = record(body);
  const detail = top?.detail;
  const source = record(detail) ?? (typeof top?.code === "string" ? top : null);
  const code = typeof source?.code === "string" && source.code ? source.code : "";
  const message = typeof source?.message === "string" ? source.message : typeof detail === "string" ? detail : "";
  // 503 = the additive migration is not applied yet; a bare 404/405 = an older gateway without the route.
  const unavailable = status === 503 || (!code && (status === 404 || status === 405));
  return { ok: false, unavailable, status, code: code || (status ? `http_${status}` : "network"), message };
}

function apiUrl(path: string): string {
  return `${(GATEWAY_BASE || "").replace(/\/+$/, "")}${path}`;
}

export const gatewayTransport: ProjectSessionsTransport = async (path, init) => {
  const token = await accessToken();
  if (!token) return { status: 401, body: { code: "unauthorized", message: "" } };
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: init.method, headers, body });
  } catch {
    return { status: 0, body: { code: "network", message: "" } };
  }
  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
};

const enc = encodeURIComponent;

export function createProjectSessionsApi(transport: ProjectSessionsTransport = gatewayTransport) {
  async function call<T>(method: string, path: string, json?: unknown): Promise<ProjectSessionsResult<T>> {
    let answer: { status: number; body: unknown };
    try {
      answer = await transport(path, json === undefined ? { method } : { method, json });
    } catch {
      return projectSessionsFailure(0, null);
    }
    if (answer.status >= 200 && answer.status < 300) return { ok: true, data: answer.body as T };
    return projectSessionsFailure(answer.status, answer.body);
  }
  const session = (id: string) => `/v1/project-sessions/${enc(id)}`;
  return {
    /** Newest activity first. */
    listSessions: (projectId: string) => call<{ sessions: ProjectSession[] }>("GET", `/v1/projects/${enc(projectId)}/sessions`),
    createSession: (projectId: string, input: { title: string; client_id: string }) =>
      call<{ session: ProjectSession }>("POST", `/v1/projects/${enc(projectId)}/sessions`, input),
    /** Non-member: 404 `not_member`. */
    getSession: (id: string) => call<{ session: ProjectSession }>("GET", session(id)),
    renameSession: (id: string, title: string) => call<{ session: ProjectSession }>("PATCH", session(id), { title }),
    deleteSession: (id: string) => call<unknown>("DELETE", session(id)),
    unread: () => call<ProjectSessionsUnread>("GET", "/v1/project-sessions/unread"),
    /** Only in a session; the sender must be able to view the task. */
    postTaskCard: (conversationId: string, input: { task_id: string; client_id: string }) =>
      call<{ message: ImMessage }>("POST", `/v1/im/conversations/${enc(conversationId)}/task-card`, input),
    /** 1..500 messages; 413 `quote_too_large` above 500 messages or 40,000 chars. Target: a session or a chat. */
    postQuote: (targetId: string, input: { source_conversation_id: string; message_ids: string[]; client_id: string }) =>
      call<{ message: ImMessage }>("POST", `/v1/im/conversations/${enc(targetId)}/quote`, input),
  };
}

export type ProjectSessionsApi = ReturnType<typeof createProjectSessionsApi>;

export const projectSessionsApi: ProjectSessionsApi = createProjectSessionsApi();
