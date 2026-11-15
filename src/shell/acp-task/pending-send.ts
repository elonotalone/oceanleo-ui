"use client";

// One outbox for home and task-page sends. Each message has its own user-scoped
// key: simultaneous tabs cannot overwrite one another's unsent messages.
import { useCallback, useSyncExternalStore } from "react";
import type { AcpSessionChoices } from "../../lib/acp-frames-api";
import type { AgentAttachment } from "../../lib/agent";
import type { ComputerTaskSession } from "../../lib/computer-task-api";
import { cacheUser, onUserScopedClear, readUserJson, writeUserJson } from "../../lib/user-scoped-cache";

export type PendingSendInput = {
  clientMessageId: string;
  computerId: string;
  projectId?: string;
  program: string;
  text: string;
  attachments: AgentAttachment[];
  choice: AcpSessionChoices;
  taskId?: string | null;
  afterRowId?: number;
};
export type PendingSendStatus = "sending" | "retrying" | "accepted" | "queued" | "failed";
export type PendingSend = Readonly<PendingSendInput & {
  id: string;
  taskId: string | null;
  session: ComputerTaskSession | null;
  rowId: number | null;
  status: PendingSendStatus;
  error: unknown;
  /** Only entries read from disk need a page to resume delivery. */
  restored?: boolean;
  acknowledged?: boolean;
}>;
export type PendingSettle = {
  taskId: string;
  session?: ComputerTaskSession | null;
  rowId?: number | null;
  queued?: boolean;
  duplicate?: boolean;
} | { error: unknown };

const NAME = "acp-outbox:";
export const PENDING_STORAGE_ERROR = "无法保留这条消息，请允许浏览器存储后重发。";
const entries = new Map<string, PendingSend>();
const listeners = new Set<() => void>();
const deliveryListeners = new Map<string, Set<(rowId: number | null) => void>>();
let owner = "";
let version = 0;
let listening = false;
let clearing = false;
const snapshots = new Map<string, { version: number; value: PendingSend[] }>();

function notify(): void {
  version += 1;
  snapshots.clear();
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function localPrefix(): string { return `oceanleo.uc:${cacheUser()}:${NAME}`; }
function removeSaved(id: string): void {
  try { window.localStorage.removeItem(`${localPrefix()}${id}`); } catch { /* inaccessible storage */ }
}
// Never persist URLs (signed capabilities), file bytes, auth or arbitrary errors.
function saved(entry: PendingSend): unknown {
  return {
    id: entry.id, clientMessageId: entry.clientMessageId, computerId: entry.computerId,
    projectId: entry.projectId, program: entry.program, text: entry.text,
    taskId: entry.taskId, afterRowId: entry.afterRowId, choice: entry.choice,
    session: entry.session ? {
      id: entry.session.id, task_id: entry.session.task_id, computer_id: entry.session.computer_id,
      computer_name: entry.session.computer_name, kind: entry.session.kind, program: entry.session.program,
      native_session_id: entry.session.native_session_id, created_at: entry.session.created_at, updated_at: entry.session.updated_at,
    } : null,
    attachments: entry.attachments.map(({ name, mime, media_type, artifact_id, revision_id }) =>
      ({ url: "", name, mime, media_type, artifact_id, revision_id })),
    status: entry.status, rowId: entry.rowId,
  };
}
function persist(entry: PendingSend): boolean {
  if (entry.acknowledged) return true;
  if (!cacheUser()) return false;
  writeUserJson(`${NAME}${entry.id}`, saved(entry));
  return readUserJson<PendingSend>(`${NAME}${entry.id}`)?.clientMessageId === entry.clientMessageId;
}
function receipt(entry: PendingSend, rowId = entry.rowId): void {
  removeSaved(entry.id);
  for (const listener of deliveryListeners.get(entry.clientMessageId) ?? []) listener(rowId);
}
function restore(value: unknown): PendingSend | null {
  const item = value as PendingSend | null;
  if (!item || typeof item.id !== "string" || typeof item.clientMessageId !== "string" ||
    typeof item.text !== "string" || typeof item.computerId !== "string" || typeof item.program !== "string" ||
    !Array.isArray(item.attachments) || !item.choice || typeof item.choice !== "object") return null;
  return { ...item, session: item.session?.task_id === item.taskId ? item.session : null, rowId: item.rowId ?? null, taskId: item.taskId || null,
    status: item.status === "failed" || !item.taskId ? "failed" : "sending",
    error: null, restored: true };
}
function hydrate(): void {
  const user = cacheUser();
  if (clearing) return;
  if (owner !== user) { entries.clear(); snapshots.clear(); owner = user; version += 1; }
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (!cacheUser() || !event.key?.startsWith(localPrefix())) return;
      const id = event.key.slice(localPrefix().length);
      if (event.newValue === null) {
        const current = entries.get(id);
        if (current) {
          entries.set(id, { ...current, status: "accepted", error: null, acknowledged: true });
          receipt(current);
        }
      } else {
        try {
          const entry = restore(JSON.parse(event.newValue));
          if (entry && !entries.has(id)) entries.set(id, entry);
        } catch { /* invalid local data */ }
      }
      notify();
    });
  }
  if (!user || typeof window === "undefined") return;
  try {
    const store = window.localStorage;
    const prefix = localPrefix();
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (entries.has(id)) continue;
      const entry = restore(readUserJson(`${NAME}${id}`));
      if (entry) { entries.set(id, entry); version += 1; snapshots.clear(); }
    }
  } catch { /* failure is reported before sending */ }
}
onUserScopedClear(() => {
  clearing = true;
  entries.clear();
  owner = "";
  notify();
  queueMicrotask(() => { clearing = false; notify(); });
});

export function putPending(input: PendingSendInput): string {
  hydrate();
  const existing = [...entries.values()].find((entry) => entry.clientMessageId === input.clientMessageId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const entry: PendingSend = { ...input, attachments: [...input.attachments], id,
    taskId: input.taskId ?? null, session: null, rowId: null, status: "sending", error: null };
  entries.set(id, entry);
  persist(entry);
  notify();
  return id;
}
export function pendingForMessage(clientMessageId: string): PendingSend | null {
  hydrate();
  return [...entries.values()].find((entry) => entry.clientMessageId === clientMessageId) ?? null;
}
/** Fail closed if the browser cannot keep this message before the request leaves. */
export function ensurePendingSaved(clientMessageId: string): void {
  const entry = pendingForMessage(clientMessageId);
  if (entry && !persist(entry)) throw new Error(PENDING_STORAGE_ERROR);
}
export function observePendingReceipt(clientMessageId: string, listener: (rowId: number | null) => void): () => void {
  const set = deliveryListeners.get(clientMessageId) ?? new Set();
  deliveryListeners.set(clientMessageId, set);
  set.add(listener);
  return () => { set.delete(listener); if (!set.size) deliveryListeners.delete(clientMessageId); };
}
export function markPendingRetry(clientMessageId: string): void {
  const current = pendingForMessage(clientMessageId);
  if (!current || current.status === "accepted" || current.rowId !== null) return;
  const entry: PendingSend = { ...current, status: "retrying", error: null };
  entries.set(entry.id, entry);
  persist(entry);
  notify();
}
export function settlePending(pendingId: string, outcome: PendingSettle): void {
  const current = readPending(pendingId);
  if (!current) return;
  // A late rejected POST cannot undo a stream acknowledgement.
  if ("error" in outcome && (current.acknowledged || current.status === "accepted")) return;
  const entry: PendingSend = "error" in outcome ? { ...current, status: "failed", error: outcome.error }
    : { ...current, taskId: outcome.taskId, session: outcome.session ?? current.session,
        rowId: outcome.rowId === undefined ? current.rowId : outcome.rowId,
        status: outcome.queued ? "queued" : "rowId" in outcome || "queued" in outcome || outcome.duplicate ? "accepted" : current.status,
        error: null };
  entries.set(pendingId, entry);
  if (!("error" in outcome) && (current.acknowledged || typeof outcome.rowId === "number" || outcome.duplicate)) {
    entries.set(pendingId, { ...entry, acknowledged: true });
    receipt(entry);
  } else persist(entry);
  notify();
}
export function retryPending(pendingId: string): void {
  const current = readPending(pendingId);
  if (!current) return;
  const entry: PendingSend = { ...current, status: "sending", rowId: null, error: null, restored: false };
  entries.set(pendingId, entry);
  persist(entry);
  notify();
}
/** The stream's own row is the strongest receipt; stop any pending retry too. */
export function forgetPending(pendingId: string): void {
  const current = readPending(pendingId);
  if (!current) return;
  receipt(current);
  entries.delete(pendingId);
  notify();
}
export function readPending(pendingId: string | null | undefined): PendingSend | null {
  hydrate();
  return pendingId ? entries.get(pendingId) ?? null : null;
}
export function usePending(pendingId: string | null | undefined): PendingSend | null {
  const read = useCallback(() => readPending(pendingId), [pendingId]);
  return useSyncExternalStore(subscribe, read, read);
}
export function usePendingMany(pendingIds: readonly string[]): PendingSend[] {
  const key = pendingIds.join("\u0000");
  const read = useCallback(() => {
    hydrate();
    const cached = snapshots.get(key);
    if (cached?.version === version) return cached.value;
    const value = pendingIds.flatMap((id) => entries.has(id) ? [entries.get(id)!] : []);
    snapshots.set(key, { version, value });
    return value;
  }, [key]);
  return useSyncExternalStore(subscribe, read, read);
}
/** Reopening a task (or home) discovers its disk outbox without a component-held list. */
export function useTaskPending(taskId: string | null | undefined, excludeId?: string | null, localIds: readonly string[] = []): PendingSend[] {
  const key = `task:${taskId || ""}:${excludeId || ""}:${localIds.join("|")}`;
  const read = useCallback(() => {
    hydrate();
    const cached = snapshots.get(key);
    if (cached?.version === version) return cached.value;
    const value = [...entries.values()].filter((entry) => entry.id !== excludeId && (entry.taskId === (taskId || null) || !taskId && localIds.includes(entry.id)));
    snapshots.set(key, { version, value });
    return value;
  }, [key]);
  return useSyncExternalStore(subscribe, read, read);
}
