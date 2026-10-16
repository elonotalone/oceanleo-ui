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

/** Past-sessions: pixel runner while a turn is live; green only for unseen completions. */
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

function openTurn(messages: AgentDialogMessage[]): AgentDialogMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "user") return null;
    if (message.kind === "turn") {
      if (message.stop) return null;
      for (let prior = index - 1; prior >= 0; prior -= 1) {
        const prev = messages[prior];
        if (prev.kind === "user") return prev.replay !== true ? message : null;
      }
      return message;
    }
  }
  return null;
}

/** Last unstamped turn already spoke and is not waiting on a tool or a prompt. */
export function turnLooksSettled(messages: AgentDialogMessage[]): boolean {
  const turn = openTurn(messages);
  if (!turn || turn.kind !== "turn") return false;
  let spoke = false;
  for (const item of turn.items) {
    if (item.kind === "assistant" && item.text.trim()) spoke = true;
    if (item.kind === "tool" && (item.tool.status === "pending" || item.tool.status === "in_progress")) {
      return false;
    }
    if (item.kind === "permission" && !item.chosen) return false;
    if (item.kind === "question" && !item.submitted) return false;
  }
  return spoke;
}

/** Thoughts or in-flight tools still need Stop. Finished text with a missing done does not. */
export function turnStillRunning(messages: AgentDialogMessage[]): boolean {
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
