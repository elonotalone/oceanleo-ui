"use client";
import { cloudComputerRequest, type Computer } from "./cloud-computer-api";
import { boundedHistoryListRequest, HistoryListRequestError, validHistoryListRows } from "./history-list-api";
import type { ExecutionTarget } from "./execution-target";
import { cacheUser, onUserScopedClear, readUserJson, writeUserJson } from "./user-scoped-cache";
export type ComputerTaskSession = {
  id: string; task_id: string; computer_id: string; computer_name: string;
  kind: "acp" | "cli" | "terminal";
  program: "oceanleo" | "cursor" | "claude" | "codex" | "hermes" | null;
  native_session_id: string | null; created_at: string; updated_at: string;
};
export type CreateComputerTaskSessionInput = Pick<ComputerTaskSession, "kind"> & {
  program?: ComputerTaskSession["program"]; task_id?: string; native_session_id?: string;
  title?: string; request_id: string; project_id?: string;
};
type Options = { signal?: AbortSignal };
export async function createComputerTaskSession(computerId: string, input: CreateComputerTaskSessionInput, options: Options = {}) {
  const result = await cloudComputerRequest<{task_id: string; session: ComputerTaskSession}>(`/v1/computers/${encodeURIComponent(computerId)}/task-sessions`, {method:"POST", body:JSON.stringify(input), ...options});
  if (result?.session?.id) rememberComputerTaskSession(result.session);
  return result;
}
/**
 * Concurrent reads of the same task's list share one request (no duplicate
 * fetch). Only a young request is shared: one that hangs never blocks a retry.
 */
const SHARE_IN_FLIGHT_MS = 5_000;
const sessionListsInFlight = new Map<string, {at: number; request: Promise<{sessions: ComputerTaskSession[]}>}>();
export function listComputerTaskSessions(taskId: string, options: Options & { timeoutMs?: number } = {}) {
  const path = `/v1/computer-task-sessions?${new URLSearchParams({task_id:taskId})}`;
  const read = () => boundedHistoryListRequest(
    (signal) => cloudComputerRequest<{sessions: ComputerTaskSession[]}>(path, { signal }),
    options,
  ).then((result) => {
    if (!validHistoryListRows(result?.sessions)) {
      throw new HistoryListRequestError("加载失败", 502, "history_list_invalid_response");
    }
    for (const session of result.sessions) rememberComputerTaskSession(session);
    rememberTaskSessionList(taskId, result.sessions);
    return result;
  });
  if (options.signal) return read();
  const shared = sessionListsInFlight.get(taskId);
  if (shared && Date.now() - shared.at < SHARE_IN_FLIGHT_MS) return shared.request;
  const request = read().finally(() => { if (sessionListsInFlight.get(taskId)?.request === request) sessionListsInFlight.delete(taskId); });
  sessionListsInFlight.set(taskId, {at: Date.now(), request});
  return request;
}

// Rows this tab already holds. A page that opens a session it was just handed
// (home → `/tasks/<id>?computerSession=<cts>`, or a session created in place)
// shows it at once and reads the list and the computer in parallel instead of
// waiting for the list first. In memory only: a reload reads the gateway.
const knownSessions = new Map<string, ComputerTaskSession>();
export function rememberComputerTaskSession(session: ComputerTaskSession): void {
  if (!session?.id) return;
  const known = knownSessions.get(session.id);
  // A native id once bound is never dropped by an older copy of the row.
  knownSessions.set(session.id, known?.native_session_id && !session.native_session_id ? {...session, native_session_id: known.native_session_id} : session);
}
export function knownComputerTaskSession(id: string): ComputerTaskSession | null {
  return (id && knownSessions.get(id)) || null;
}

// The last list read per task (this tab): reopening a task picks its conversation
// from it at once while the list is read again (2026-10-31 task switch speed).
const MAX_TASK_SESSION_LISTS = 100;
const taskSessionLists = new Map<string, ComputerTaskSession[]>();
function rememberTaskSessionList(taskId: string, sessions: ComputerTaskSession[]): void {
  // Only for a known signed-in user (user-scoped cache; dropped on sign-out).
  if (!cacheUser()) return;
  taskSessionLists.delete(taskId);
  taskSessionLists.set(taskId, sessions);
  if (taskSessionLists.size > MAX_TASK_SESSION_LISTS) {
    const oldest = taskSessionLists.keys().next().value;
    if (oldest !== undefined) taskSessionLists.delete(oldest);
  }
}
/** The task's session list as last read in this tab (null = never read here). */
export function knownComputerTaskSessions(taskId: string): ComputerTaskSession[] | null {
  return (taskId && cacheUser() && taskSessionLists.get(taskId)) || null;
}

/** A computer read within this long counts as known (its online state is refreshed anyway). */
const KNOWN_COMPUTER_MS = 60_000;
const knownComputers = new Map<string, {computer: Computer; at: number}>();
const computerWatchers = new Map<string, Set<(computer: Computer) => void>>();
const computersInFlight = new Map<string, {at: number; request: Promise<Computer>}>();
/** Record a computer row read anywhere in this tab (pages share it instead of re-reading). */
export function rememberComputer(computer: Computer): void {
  if (!computer?.id) return;
  knownComputers.set(computer.id, {computer, at: Date.now()});
  persistComputer(computer);
  for (const watcher of computerWatchers.get(computer.id) ?? []) watcher(computer);
}
export function knownComputer(id: string): Computer | null {
  const known = id ? knownComputers.get(id) : undefined;
  return known && Date.now() - known.at <= KNOWN_COMPUTER_MS ? known.computer : null;
}
/** The fields a page needs to connect before the fresh row is in (no addresses / billing). */
const PERSISTED_COMPUTER_FIELDS = ["id", "name", "source", "status", "edition", "node_online", "node_os", "confirmed_at", "created_at", "updated_at"] as const;
function persistComputer(computer: Computer): void {
  const row: Record<string, unknown> = {};
  for (const field of PERSISTED_COMPUTER_FIELDS) if (computer[field] !== undefined) row[field] = computer[field];
  writeUserJson(`computer:${computer.id}`, row);
}
/**
 * The last row this browser read for the signed-in user, however old (memory,
 * else localStorage). Optimistic: a page connects on its last known online state
 * while the fresh read runs, and the fresh row replaces it (2026-10-31 model pill).
 */
export function lastKnownComputer(id: string): Computer | null {
  if (!id || !cacheUser()) return null;
  const known = knownComputers.get(id);
  if (known) return known.computer;
  const saved = readUserJson<Computer>(`computer:${id}`);
  return saved && saved.id === id ? saved : null;
}
onUserScopedClear(() => {
  knownSessions.clear();
  taskSessionLists.clear();
  knownComputers.clear();
});
/** Read one computer (concurrent reads share one request) and remember it. */
export function loadComputer(id: string): Promise<Computer> {
  const shared = computersInFlight.get(id);
  if (shared && Date.now() - shared.at < SHARE_IN_FLIGHT_MS) return shared.request;
  const request = cloudComputerRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}`).then((computer) => {
    rememberComputer(computer);
    return computer;
  }).finally(() => { if (computersInFlight.get(id)?.request === request) computersInFlight.delete(id); });
  computersInFlight.set(id, {at: Date.now(), request});
  return request;
}
/** Called with every newer read of this computer; returns the unsubscribe. */
export function watchComputer(id: string, onChange: (computer: Computer) => void): () => void {
  let watchers = computerWatchers.get(id);
  if (!watchers) computerWatchers.set(id, watchers = new Set());
  watchers.add(onChange);
  return () => {
    watchers!.delete(onChange);
    if (!watchers!.size && computerWatchers.get(id) === watchers) computerWatchers.delete(id);
  };
}
export async function bindComputerTaskSession(id: string, nativeSessionId: string, options: Options = {}) {
  const result = await cloudComputerRequest<{session: ComputerTaskSession}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}`, {method:"PATCH",body:JSON.stringify({native_session_id:nativeSessionId}),...options});
  if (result?.session?.id) rememberComputerTaskSession(result.session);
  return result;
}

/** Most recently touched session of a task (computer tasks open on it by default). */
export function latestComputerTaskSession(sessions: readonly ComputerTaskSession[]): ComputerTaskSession | null {
  let latest: ComputerTaskSession | null = null;
  for (const session of sessions) {
    if (!latest || Date.parse(session.updated_at || session.created_at || "") > Date.parse(latest.updated_at || latest.created_at || "")) latest = session;
  }
  return latest;
}
/** The one session a task already has for this computer + kind + program, newest first. */
export function findComputerTaskSession(sessions: readonly ComputerTaskSession[], match: { computerId: string; kind: ComputerTaskSession["kind"]; program: ComputerTaskSession["program"] }): ComputerTaskSession | null {
  return latestComputerTaskSession(sessions.filter((session) => session.computer_id === match.computerId &&
    session.kind === match.kind && (match.kind === "terminal" || session.program === match.program)));
}
/**
 * The computer a `mode="computer"` task belongs to. The task detail API does not
 * return `computer_id` and such a task's plan carries no execution target, so
 * its own sessions are the source of truth (never "cloud").
 */
export function computerTaskSessionsTarget(sessions: readonly ComputerTaskSession[]): ExecutionTarget | null {
  const session = latestComputerTaskSession(sessions);
  return session ? { kind: "computer", id: session.computer_id, name: session.computer_name || session.computer_id } : null;
}
