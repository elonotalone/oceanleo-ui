// Forward targets and the two requests behind them (contract §2.3 / §2.2).
// - Tasks: the same reads My tasks uses (`GET /v1/agent/tasks` + `GET /v1/app-sessions`, merged by
//   `mergeHistoryEntries`), only the caller's own agent tasks (rows shared with them are left out).
// - Chats: LeoChat conversations (`GET /v1/im/conversations`, all cursor pages), not dissolved, not the source.
// - Sessions: `GET /v1/projects` then `GET /v1/projects/{id}/sessions` per caller project,
//   sessions the caller may write in. A server without sessions simply contributes none.
import { imFetch, ImApiError } from "../../lib/im/client";
import { fetchConversations } from "../../lib/im/inbox-api";
import type { ImConversationSummary } from "../../lib/im/types";
import { listTasks } from "../../lib/agent";
import { listAppSessions } from "../../lib/app-session";
import { historyEntrySharedBy, isShellTask, mergeHistoryEntries, type HistoryListEntry } from "../history-model";
import type { ChatBundle } from "./index";

export interface ForwardTaskRow {
  taskId: string;
  /** Raw task title (may still be the server's first cut of a message). */
  title: string;
}

export interface ForwardChatRow {
  id: string;
  title: string;
  kind: "chat" | "session";
  /** Project name of a session. */
  project?: string;
}

export type ForwardFailure = "too_large" | "not_member" | "unavailable" | "failed";

export function forwardClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `fwd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Typed failure of a bundle / quote request, for the inline line under the picker. */
export function forwardFailureOf(error: unknown): ForwardFailure {
  if (!(error instanceof ImApiError)) return "failed";
  const code = error.code || "";
  if (error.status === 413 || code.endsWith("too_large")) return "too_large";
  if (code === "not_member" || code === "cannot_write" || code === "forbidden" || error.status === 403) return "not_member";
  if (error.status === 0 || error.status === 404 || error.status === 405 || error.status === 501 || error.status === 503 ||
    code === "unavailable" || code === "not_available" || code === "network") return "unavailable";
  return "failed";
}

/** Task rows from My tasks entries: own agent tasks only, newest first, one row per task. */
export function forwardTaskRows(entries: readonly HistoryListEntry[]): ForwardTaskRow[] {
  const rows: ForwardTaskRow[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (historyEntrySharedBy(entry)) continue;
    const taskId = entry.kind === "task" ? entry.task.id : entry.session.task_id || "";
    if (!taskId || seen.has(taskId)) continue;
    if (entry.kind === "task" && isShellTask(entry.task)) continue;
    seen.add(taskId);
    const title = entry.kind === "task" ? entry.task.title : entry.session.title;
    rows.push({ taskId, title: String(title || "").trim() });
  }
  return rows;
}

export async function loadForwardTasks(q = ""): Promise<ForwardTaskRow[]> {
  const [tasks, sessions] = await Promise.all([
    listTasks(100, undefined, false, "all", "all", { q }),
    listAppSessions({ limit: 100, includeArchived: true, surface: "all", projectScope: "all", q }),
  ]);
  if (!tasks.ok && !sessions.ok) throw new ImApiError(tasks.status || 0, "unavailable", tasks.error || "");
  const taskItems = tasks.ok ? tasks.data?.items ?? [] : [];
  const sessionItems = (sessions.ok ? sessions.data?.items ?? [] : [])
    .filter((session) => Boolean(session.task_id && session.first_output_at) || taskItems.some((task) => task.session_id === session.id));
  return forwardTaskRows(mergeHistoryEntries(sessionItems, taskItems, { sessionApiFailed: !sessions.ok }));
}

/** LeoChat conversations the caller can post in (dissolved groups and the source chat left out). */
export function forwardChatRows(items: readonly ImConversationSummary[], excludeId: string): ForwardChatRow[] {
  const rows: ForwardChatRow[] = [];
  for (const item of items) {
    if (!item?.id || item.id === excludeId || item.dissolved) continue;
    if (item.kind === "project" || item.kind === "task") continue;
    const title = (item.remark || item.title || item.peer?.display_name || "").trim();
    rows.push({ id: item.id, title, kind: "chat" });
  }
  return rows;
}

interface SessionRow {
  id?: unknown;
  title?: unknown;
  can_write?: unknown;
  project?: { id?: unknown; name?: unknown } | null;
}

export function forwardSessionRows(sessions: readonly SessionRow[], projectName: string, excludeId: string): ForwardChatRow[] {
  const rows: ForwardChatRow[] = [];
  for (const session of sessions) {
    const id = typeof session?.id === "string" ? session.id : "";
    if (!id || id === excludeId || session.can_write === false) continue;
    const project = typeof session.project?.name === "string" && session.project.name ? session.project.name : projectName;
    rows.push({ id, title: typeof session.title === "string" ? session.title.trim() : "", kind: "session", project });
  }
  return rows;
}

async function loadSessions(excludeId: string): Promise<ForwardChatRow[]> {
  let projects: Array<{ id: string; name: string }> = [];
  try {
    const listed = await imFetch<{ items?: unknown }>("/v1/projects");
    const items = Array.isArray(listed?.items) ? listed.items : [];
    projects = items.flatMap((raw) => {
      const row = raw as { id?: unknown; name?: unknown; kind?: unknown };
      if (typeof row?.id !== "string" || !row.id || row.kind === "website") return [];
      return [{ id: row.id, name: typeof row.name === "string" ? row.name : "" }];
    });
  } catch {
    return [];
  }
  const lists: ForwardChatRow[][] = [];
  // Bound concurrent project reads without excluding older projects.
  for (let offset = 0; offset < projects.length; offset += 4) {
    lists.push(...await Promise.all(projects.slice(offset, offset + 4).map(async (project) => {
      try {
        const answer = await imFetch<{ sessions?: SessionRow[] }>(`/v1/projects/${encodeURIComponent(project.id)}/sessions`);
        return forwardSessionRows(Array.isArray(answer?.sessions) ? answer.sessions : [], project.name, excludeId);
      } catch {
        return [];
      }
    })));
  }
  return lists.flat();
}

export async function loadForwardChats(excludeId: string, q = ""): Promise<ForwardChatRow[]> {
  const chats = (async () => {
    const items: ImConversationSummary[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const page = await fetchConversations("all", cursor, q);
      items.push(...(page?.items ?? []));
      cursor = page?.next_cursor || null;
      if (cursor && seen.has(cursor)) throw new ImApiError(502, "invalid_cursor", "");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return forwardChatRows(items, excludeId);
  })();
  const [chatRows, sessionRows] = await Promise.all([chats, loadSessions(excludeId)]);
  const needle = q.trim().toLocaleLowerCase();
  return [...sessionRows, ...chatRows].filter((row) => !needle || `${row.title} ${row.project || ""}`.toLocaleLowerCase().includes(needle));
}

function bundleOf(raw: unknown): ChatBundle {
  const value = (raw as { bundle?: unknown } | null)?.bundle as Partial<ChatBundle> | undefined;
  if (!value || typeof value.id !== "string" || typeof value.text !== "string" || typeof value.messages !== "number") {
    throw new ImApiError(502, "invalid", "");
  }
  return {
    id: value.id,
    title: typeof value.title === "string" ? value.title : "",
    messages: value.messages,
    chars: typeof value.chars === "number" ? value.chars : value.text.length,
    mode: value.mode === "file" ? "file" : "inline",
    text: value.text,
    attachment: value.mode === "file" && value.attachment && typeof value.attachment === "object" ? value.attachment : null,
  };
}

/** `POST /v1/im/conversations/{id}/bundles`. */
export async function createChatBundle(conversationId: string, messageIds: readonly string[], clientId: string): Promise<ChatBundle> {
  const answer = await imFetch<unknown>(`/v1/im/conversations/${encodeURIComponent(conversationId)}/bundles`, {
    method: "POST",
    json: { message_ids: [...messageIds], client_id: clientId },
  });
  return bundleOf(answer);
}

/** `POST /v1/im/conversations/{target}/quote`: the quote card is posted at once. */
export async function postQuoteCard(targetId: string, sourceConversationId: string, messageIds: readonly string[], clientId: string): Promise<void> {
  await imFetch<unknown>(`/v1/im/conversations/${encodeURIComponent(targetId)}/quote`, {
    method: "POST",
    json: { source_conversation_id: sourceConversationId, message_ids: [...messageIds], client_id: clientId },
  });
}
