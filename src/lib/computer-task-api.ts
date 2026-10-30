"use client";
import { cloudComputerRequest } from "./cloud-computer-api";
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
export function createComputerTaskSession(computerId: string, input: CreateComputerTaskSessionInput, options: Options = {}) {
  return cloudComputerRequest<{task_id: string; session: ComputerTaskSession}>(`/v1/computers/${encodeURIComponent(computerId)}/task-sessions`, {method:"POST", body:JSON.stringify(input), ...options});
}
export function listComputerTaskSessions(taskId: string, options: Options = {}) {
  return cloudComputerRequest<{sessions: ComputerTaskSession[]}>(`/v1/computer-task-sessions?${new URLSearchParams({task_id:taskId})}`, options);
}
export function getComputerTaskTranscript(id: string, options: Options & {before?: number; limit?: number} = {}) {
  const {before, limit, ...requestOptions} = options;
  const query = new URLSearchParams();
  if (before !== undefined) query.set("before", String(before));
  if (limit !== undefined) query.set("limit", String(limit));
  return cloudComputerRequest<{next_before?: number|null; has_older?: boolean; session: ComputerTaskSession; frames: Record<string,unknown>[]; saved_at: string|null; sync_status: ComputerTaskSession["sync_status"]}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}/transcript${query.size ? `?${query}` : ""}`, requestOptions);
}
export function bindComputerTaskSession(id: string, nativeSessionId: string, options: Options = {}) {
  return cloudComputerRequest<{session: ComputerTaskSession}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}`, {method:"PATCH",body:JSON.stringify({native_session_id:nativeSessionId}),...options});
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
 * Home → task handoff for a native chat: the first message typed before the
 * conversation existed. The task page that opens `?computerSession=<id>` sends
 * it once that conversation is connected; {@link takePendingNativePrompt} removes
 * the entry before returning it, so it is handed out exactly once.
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
