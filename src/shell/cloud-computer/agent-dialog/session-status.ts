import type { AgentDialogMessage } from "./types";

export const INTERRUPTED_STOPS = new Set([
  "cancelled",
  "canceled",
  "stopped",
  "error",
  "max_tokens",
  "max_turn_requests",
]);
const INTERRUPTED_ERRORS = new Set([
  "acp_exited", "acp_start_failed", "acp_unavailable", "program_missing", "missing_program",
  "runtime_missing", "not_logged_in", "node_error", "dialog_unreachable",
]);

export type SessionListStatus = "running" | "interrupted" | "unread";

/** Past-sessions: pixel runner only while occupancy confirmed this session working. */
export function sessionListStatus(
  sessionId: string,
  busySessions?: readonly string[],
  interruptedSessions?: readonly string[],
  unreadSessions?: readonly string[],
): SessionListStatus | null {
  if (busySessions?.includes(sessionId)) return "running";
  if (interruptedSessions?.includes(sessionId)) return "interrupted";
  if (unreadSessions?.includes(sessionId)) return "unread";
  return null;
}

export function isCompletedStop(stop: string): boolean {
  return Boolean(stop) && !INTERRUPTED_STOPS.has(stop);
}

/** Latest live turn has not been stamped with a stop reason. Replay has no done. */
export function hasOpenTurn(messages: AgentDialogMessage[]): boolean {
  return openTurn(messages) !== null;
}

function latestTurn(messages: AgentDialogMessage[]): AgentDialogMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "user") return null;
    if (message.kind === "turn") return message;
  }
  return null;
}

function openTurn(messages: AgentDialogMessage[]): AgentDialogMessage | null {
  const turn = latestTurn(messages);
  if (!turn || turn.kind !== "turn" || turn.stop) return null;
  for (let prior = messages.length - 1; prior >= 0; prior -= 1) {
    const prev = messages[prior];
    if (prev === turn) continue;
    if (prev.kind === "user") return prev.replay !== true ? turn : null;
  }
  return turn;
}

/** A tool/permission/question still needs the adapter. Occupancy idle does not override this. */
export function turnHasUnfinishedWork(messages: AgentDialogMessage[]): boolean {
  const turn = latestTurn(messages);
  if (!turn || turn.kind !== "turn") return false;
  // Stop already landed. Leftover in_progress rows must not trap Send after abort.
  if (INTERRUPTED_STOPS.has(turn.stop)) return false;
  for (const item of turn.items) {
    if (item.kind === "tool" && (item.tool.status === "pending" || item.tool.status === "in_progress")) {
      return true;
    }
    if (item.kind === "permission" && !item.chosen) return true;
    if (item.kind === "question" && !item.submitted) return true;
  }
  return false;
}

/** Last unstamped turn already spoke and is not waiting on a tool or a prompt. */
export function turnLooksSettled(messages: AgentDialogMessage[]): boolean {
  const turn = openTurn(messages);
  if (!turn || turn.kind !== "turn") return false;
  let spoke = false;
  for (const item of turn.items) {
    if (item.kind === "assistant" && item.text.trim()) spoke = true;
    if (item.kind === "thought") return false;
    if (item.kind === "tool" && (item.tool.status === "pending" || item.tool.status === "in_progress")) {
      return false;
    }
    if (item.kind === "permission" && !item.chosen) return false;
    if (item.kind === "question" && !item.submitted) return false;
  }
  return spoke;
}

/** Thoughts, unfinished tools, or an unstamped turn that has not finished speaking still need Stop. */
export function turnStillRunning(messages: AgentDialogMessage[]): boolean {
  if (turnHasUnfinishedWork(messages)) return true;
  return hasOpenTurn(messages) && !turnLooksSettled(messages);
}

/** Only known outcomes count; unopened history rows have no inferred status. */
export function sessionInterrupted(messages: AgentDialogMessage[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "user") return false;
    if (message.kind === "turn") return INTERRUPTED_STOPS.has(message.stop);
    if (message.kind === "notice" && INTERRUPTED_ERRORS.has(message.code)) return true;
  }
  return false;
}
