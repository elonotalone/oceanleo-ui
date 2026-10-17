/** Probe of whether this ACP session is working. Absence of a reading is not idle. */

export type OccupancyMode = "uncertain" | "working" | "idle";

export const OCCUPANCY_STALE_MS = 6_000;
export const OCCUPANCY_POLL_MS = 2_000;

const WORKING_HINTS = new Set(["turn_start", "delta", "thought", "tool"]);
const IDLE_ERRORS = new Set([
  "acp_exited",
  "acp_start_failed",
  "acp_unavailable",
  "program_missing",
  "missing_program",
  "runtime_missing",
  "not_logged_in",
  "node_error",
  "dialog_unreachable",
  "dialog_detached",
]);

/** Patch occupancy.busy from a session frame that is not the open view. */
export function occupancyBusyAfterFrame(
  busy: readonly string[] | null | undefined,
  frame: { t?: unknown; acp_session?: unknown; code?: unknown },
): string[] | null {
  const session = typeof frame.acp_session === "string" ? frame.acp_session : "";
  if (!session) return null;
  const kind = String(frame.t || "");
  const current = [...(busy ?? [])];
  if (WORKING_HINTS.has(kind)) return [...new Set([...current, session])];
  if (kind === "done" || (kind === "error" && IDLE_ERRORS.has(String(frame.code || "")))) {
    return current.filter((id) => id !== session);
  }
  return null;
}

export function occupancyFresh(input: {
  linkUp: boolean;
  occupancyAt: number | null | undefined;
  now?: number;
  staleMs?: number;
}): boolean {
  if (!input.linkUp) return false;
  if (input.occupancyAt == null) return false;
  const now = input.now ?? Date.now();
  return now - input.occupancyAt <= (input.staleMs ?? OCCUPANCY_STALE_MS);
}

/** Grey disabled Send, red Stop, or black Send. Pending send without a busy reading stays uncertain. */
export function composerOccupancy(input: {
  linkUp: boolean;
  occupancyAt: number | null | undefined;
  occupancyBusy?: readonly string[] | null;
  sessionId: string;
  pendingAt?: number | null;
  pendingSession?: string | null;
  now?: number;
  staleMs?: number;
  offline?: boolean;
  sessionLoading?: boolean;
  /** Open thought/tool/turn on this view. Occupancy empty is not idle then. */
  localRunning?: boolean;
}): OccupancyMode {
  if (input.offline) return "uncertain";
  if (input.localRunning) return "working";
  if (!occupancyFresh(input)) return "uncertain";
  const sessionId = input.sessionId.trim();
  if (sessionId && (input.occupancyBusy ?? []).includes(sessionId)) return "working";
  if (input.sessionLoading) return "uncertain";
  if (input.pendingAt != null && (input.pendingSession || "") === sessionId) return "uncertain";
  return "idle";
}

/** Pixel runner only while occupancy is a confirmed working reading. */
export function confirmedBusySessions(
  occupancyBusy: readonly string[] | null | undefined,
  fresh: boolean,
): string[] {
  return fresh ? [...(occupancyBusy ?? [])] : [];
}

export function blankOccupancy(): {
  occupancyLink: boolean;
  occupancyAt: number | null;
  occupancyBusy: string[];
  occupancyPendingAt: number | null;
  occupancyPendingSession: string | null;
} {
  return {
    occupancyLink: false,
    occupancyAt: null,
    occupancyBusy: [],
    occupancyPendingAt: null,
    occupancyPendingSession: null,
  };
}
