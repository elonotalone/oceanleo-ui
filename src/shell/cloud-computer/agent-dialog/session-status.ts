import type { AgentDialogMessage } from "./types";

const INTERRUPTED_STOPS = new Set(["cancelled", "canceled", "stopped", "error", "max_tokens", "max_turn_requests"]);
const INTERRUPTED_ERRORS = new Set([
  "acp_exited", "acp_start_failed", "acp_unavailable", "program_missing", "missing_program",
  "runtime_missing", "not_logged_in", "node_error", "dialog_unreachable",
]);

export type SessionListStatus = "running" | "interrupted";

/** Past-sessions dots: a live idle process is not "in progress". */
export function sessionListStatus(
  sessionId: string,
  busySessions?: readonly string[],
  interruptedSessions?: readonly string[],
): SessionListStatus | null {
  if (busySessions?.includes(sessionId)) return "running";
  if (interruptedSessions?.includes(sessionId)) return "interrupted";
  return null;
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
