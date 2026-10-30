"use client";
import { cloudComputerRequest, type Computer } from "./cloud-computer-api";
import type { ExecutionTarget } from "./execution-target";
export type ComputerTaskSession = {
  id: string; task_id: string; computer_id: string; computer_name: string;
  kind: "acp" | "cli" | "terminal";
  program: "oceanleo" | "cursor" | "claude" | "codex" | "hermes" | null;
  native_session_id: string | null; created_at: string; updated_at: string;
  saved_at?: string | null; sync_status: "saved" | "pending" | "error";
  /** Graphical sessions only; CLI/terminal stay "associated" (no observable agent turn). */
  run_status?: "associated" | "running" | "waiting_user" | "completed" | "failed" | "cancelled";
};
export type CreateComputerTaskSessionInput = Pick<ComputerTaskSession, "kind"> & {
  program?: ComputerTaskSession["program"]; task_id?: string; native_session_id?: string;
  title?: string; request_id: string;
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
export function listComputerTaskSessions(taskId: string, options: Options = {}) {
  const path = `/v1/computer-task-sessions?${new URLSearchParams({task_id:taskId})}`;
  if (options.signal) return cloudComputerRequest<{sessions: ComputerTaskSession[]}>(path, options);
  const shared = sessionListsInFlight.get(taskId);
  if (shared && Date.now() - shared.at < SHARE_IN_FLIGHT_MS) return shared.request;
  const request = cloudComputerRequest<{sessions: ComputerTaskSession[]}>(path).then((result) => {
    for (const session of result?.sessions ?? []) rememberComputerTaskSession(session);
    return result;
  }).finally(() => { if (sessionListsInFlight.get(taskId)?.request === request) sessionListsInFlight.delete(taskId); });
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

/** A computer read within this long counts as known (its online state is refreshed anyway). */
const KNOWN_COMPUTER_MS = 60_000;
const knownComputers = new Map<string, {computer: Computer; at: number}>();
const computerWatchers = new Map<string, Set<(computer: Computer) => void>>();
const computersInFlight = new Map<string, {at: number; request: Promise<Computer>}>();
/** Record a computer row read anywhere in this tab (pages share it instead of re-reading). */
export function rememberComputer(computer: Computer): void {
  if (!computer?.id) return;
  knownComputers.set(computer.id, {computer, at: Date.now()});
  for (const watcher of computerWatchers.get(computer.id) ?? []) watcher(computer);
}
export function knownComputer(id: string): Computer | null {
  const known = id ? knownComputers.get(id) : undefined;
  return known && Date.now() - known.at <= KNOWN_COMPUTER_MS ? known.computer : null;
}
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
export function getComputerTaskTranscript(id: string, options: Options & {before?: number; limit?: number} = {}) {
  const {before, limit, ...requestOptions} = options;
  const query = new URLSearchParams();
  if (before !== undefined) query.set("before", String(before));
  if (limit !== undefined) query.set("limit", String(limit));
  return cloudComputerRequest<{next_before?: number|null; has_older?: boolean; session: ComputerTaskSession; frames: Record<string,unknown>[]; saved_at: string|null; sync_status: ComputerTaskSession["sync_status"]}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}/transcript${query.size ? `?${query}` : ""}`, requestOptions);
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

const PENDING_PROMPT_PREFIX = "oceanleo.pending-native-prompt:";
const PENDING_PROMPT_TTL_MS = 10 * 60 * 1000;
/** Private-mode fallback only; sessionStorage is the shared handoff between pages. */
const pendingPrompts = new Map<string, string>();
/**
 * Cross-page handoff of a native chat's first message (the homepage now opens
 * native chats in place and no longer needs it; kept for links that still
 * carry one). The task page that opens `?computerSession=<id>` shows it as the
 * user's bubble at once and sends it once that conversation is connected;
 * {@link takePendingNativePrompt} removes the entry before returning it, so it
 * is handed out exactly once.
 */
export function stashPendingNativePrompt(sessionId: string, text: string): void {
  if (!sessionId || !text) return;
  const value = JSON.stringify({ text, queued_at: Date.now() });
  try { window.sessionStorage.setItem(PENDING_PROMPT_PREFIX + sessionId, value); }
  catch { pendingPrompts.set(sessionId, value); }
}
/** Whether a first prompt is waiting for this session (does not consume it). */
export function hasPendingNativePrompt(sessionId: string): boolean {
  if (!sessionId) return false;
  if (pendingPrompts.has(sessionId)) return true;
  try { return window.sessionStorage.getItem(PENDING_PROMPT_PREFIX + sessionId) !== null; } catch { return false; }
}
export function takePendingNativePrompt(sessionId: string): string | null {
  if (!sessionId) return null;
  let raw: string | null = pendingPrompts.get(sessionId) ?? null;
  pendingPrompts.delete(sessionId);
  try {
    raw ??= window.sessionStorage.getItem(PENDING_PROMPT_PREFIX + sessionId);
    window.sessionStorage.removeItem(PENDING_PROMPT_PREFIX + sessionId);
  } catch { /* private mode */ }
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw) as { text?: unknown; queued_at?: unknown };
    if (typeof entry.text !== "string" || !entry.text) return null;
    if (typeof entry.queued_at !== "number" || Date.now() - entry.queued_at > PENDING_PROMPT_TTL_MS) return null;
    return entry.text;
  } catch { return null; }
}
