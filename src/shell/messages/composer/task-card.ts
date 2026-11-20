// Task card in a project session (session / sites wave 2026-11-21, contract §2.2).
// The composer's attach menu lists the caller's own tasks (the same list My Tasks reads) and posts
// `POST /v1/im/conversations/{id}/task-card`; a message that is nothing but links to tasks is posted as cards.
// The server decides whether the sender may show the task; the card grants no access.
import { listTasks, type AgentTask } from "../../../lib/agent";
import { imFetch } from "../../../lib/im/client";
import type { ImMessage } from "../../../lib/im/types";
import { parseTaskLink } from "../../../lib/task-link";

export interface TaskCardChoice {
  id: string;
  title: string;
  /** Project name when the task lives in a project. */
  project: string | null;
}

export type TaskCardFetcher = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

/** My Tasks' list read (`GET /v1/agent/tasks`, every surface and project), newest first. */
export async function loadTaskCardChoices(options: { signal?: AbortSignal } = {}): Promise<TaskCardChoice[]> {
  const result = await listTasks(100, undefined, false, "all", "all", { signal: options.signal });
  if (!result.ok) throw new Error(result.error || "task_list_failed");
  return taskCardChoices(result.data?.items ?? []);
}

export function taskCardChoices(items: readonly AgentTask[]): TaskCardChoice[] {
  return items
    .filter((task) => Boolean(task?.id))
    .map((task) => ({ id: task.id, title: (task.title || "").trim(), project: task.project?.name?.trim() || null }));
}

/** Case-insensitive title / project match; an empty query keeps everything. */
export function filterTaskCardChoices(choices: readonly TaskCardChoice[], query: string): TaskCardChoice[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...choices];
  return choices.filter((choice) => choice.title.toLowerCase().includes(q) || (choice.project ?? "").toLowerCase().includes(q));
}

/**
 * The task ids when the whole message is one or more task links separated by white space
 * (`/tasks/<id>` or `/history?task=<id>` on an OceanLeo portal origin); otherwise null.
 */
export function taskIdsFromLinkOnlyText(text: string, currentOrigin?: string): string[] | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const ids: string[] = [];
  for (const part of parts) {
    const link = currentOrigin === undefined ? parseTaskLink(part) : parseTaskLink(part, currentOrigin);
    if (!link) return null;
    if (!ids.includes(link.taskId)) ids.push(link.taskId);
  }
  return ids;
}

function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Post one task card into a session; answers the stored message. */
export async function postTaskCard(
  conversationId: string,
  taskId: string,
  fetcher: TaskCardFetcher = imFetch,
): Promise<ImMessage> {
  const response = await fetcher<{ message: ImMessage }>(
    `/v1/im/conversations/${encodeURIComponent(conversationId)}/task-card`,
    { method: "POST", json: { task_id: taskId, client_id: newClientId() } },
  );
  return response.message;
}
