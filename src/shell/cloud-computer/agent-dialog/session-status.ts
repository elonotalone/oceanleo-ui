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
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "user") return false;
    if (message.kind === "turn") {
      if (message.stop) return false;
      for (let prior = index - 1; prior >= 0; prior -= 1) {
        const prev = messages[prior];
        if (prev.kind === "user") return prev.replay !== true;
      }
      return true;
    }
  }
  return false;
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
