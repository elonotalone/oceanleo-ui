import type { AgentDialogMessage } from "./types";

export const INTERRUPTED_STOPS = new Set([
  "cancelled",
  "canceled",
  "stopped",
  "stopping",
  "error",
  "max_tokens",
  "max_turn_requests",
]);
const INTERRUPTED_ERRORS = new Set([
  "acp_exited", "acp_start_failed", "acp_unavailable", "program_missing", "missing_program",
  "runtime_missing", "not_logged_in", "node_error", "dialog_unreachable", "invalid_argument",
]);

export type SessionListStatus = "running" | "interrupted" | "unread";

const ANON = "*";

function toolBlob(tool: { title?: string; content?: { type: string; text?: string; output?: string }[] }): string {
  const parts = [tool.title || ""];
  for (const block of tool.content ?? []) {
    if (block.type === "content") parts.push(block.text || "");
    if (block.type === "terminal") parts.push(block.output || "");
  }
  return parts.join("\n");
}

function startedBackgroundIds(text: string): string[] {
  if (!/running in background|run_in_background|background with id|moved to background/i.test(text)) return [];
  const ids = [...text.matchAll(/(?:background with id|running in background with id)[:\s]+([A-Za-z0-9_-]{4,})/gi)].map((match) => match[1]);
  return ids.length ? ids : [ANON];
}

function finishedBackgroundIds(text: string): string[] {
  const ids = [
    ...[...text.matchAll(/<task-id>\s*([A-Za-z0-9_-]{4,})\s*<\/task-id>/gi)].map((match) => match[1]),
    ...[...text.matchAll(/(?:background with id|running in background with id)[:\s]+([A-Za-z0-9_-]{4,})/gi)].map((match) => match[1]),
  ];
  if (/task-notification|background command[\s\S]{0,160}?(?:completed|finished|stopped)/i.test(text)) ids.push(ANON);
  return ids;
}

/** Last turn parked a background command that will wake this chat. */
export function sessionWaitingWake(messages: AgentDialogMessage[]): boolean {
  let lastTurn = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "notice" && INTERRUPTED_ERRORS.has(message.code)) return false;
    if (message.kind !== "turn") continue;
    if (INTERRUPTED_STOPS.has(message.stop)) return false;
    lastTurn = index;
    break;
  }
  if (lastTurn < 0) return false;
  const turn = messages[lastTurn];
  if (turn.kind !== "turn") return false;
  const pending = new Set<string>();
  for (const item of turn.items) {
    if (item.kind !== "tool") continue;
    for (const id of startedBackgroundIds(toolBlob(item.tool))) pending.add(id);
  }
  if (!pending.size) return false;
  for (let index = lastTurn + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.kind === "user") {
      for (const id of finishedBackgroundIds(message.text || "")) pending.delete(id);
    }
  }
  return pending.size > 0;
}

/** Past-sessions: pixel runner only while occupancy confirmed this session working. */
export function sessionListStatus(
  sessionId: string,
  busySessions?: readonly string[],
  interruptedSessions?: readonly string[],
  unreadSessions?: readonly string[],
  waitingSessions?: readonly string[],
): SessionListStatus | null {
  if (busySessions?.includes(sessionId)) return "running";
  if (waitingSessions?.includes(sessionId)) return "running";
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
  // Live stream after a replayed user still needs Stop. History replay never arms.
  if (turn.live) return turn;
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

/** Cursor cancelled one HTTP/2 attempt. The turn is still live. */
export function isRetriableStreamCancelText(text: string | null | undefined): boolean {
  const raw = String(text || "");
  if (!raw) return false;
  const low = raw.toLowerCase();
  return (
    low.includes("retriableerror") ||
    low.includes("http/2 stream closed") ||
    /error code cancel\s*\(0x8\)/.test(low)
  );
}

/** Open turn, unfinished tool, or thought still needs Stop. Occupancy empty is not idle. */
export function turnStillRunning(messages: AgentDialogMessage[]): boolean {
  if (turnHasUnfinishedWork(messages)) return true;
  return hasOpenTurn(messages);
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
