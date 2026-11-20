import type { AcpView, AvailableCommand } from "../../acp/types";
import { request } from "../../lib/acp-frames-api";

/**
 * The page believes a turn is open while the gateway's task state (computed from the stored frames) says idle: the
 * page missed rows and must read them again. `waiting_user` agrees with an open turn; without a snapshot nothing is decided.
 */
export function pageBehindGateway(activity: { activity_state?: string } | null | undefined, view: Pick<AcpView, "open">): boolean {
  return Boolean(view.open && activity?.activity_state === "idle");
}

/**
 * After a Stop and a catch-up the gateway still says idle while the page shows these turns open: nothing is running,
 * so the page closes exactly these turns (open at the Stop). No stop reason is invented for them.
 */
export function endTurns<V extends Pick<AcpView, "turns" | "open">>(view: V, rowIds: readonly number[]): V {
  if (!rowIds.length || !view.turns.some((turn) => turn.open && rowIds.includes(turn.rowId))) return view;
  const turns = view.turns.map((turn) => turn.open && rowIds.includes(turn.rowId) ? { ...turn, open: false, queued: false } : turn);
  return { ...view, turns, open: turns.some((turn) => turn.open) };
}

export function sessionCanFork(capabilities: Record<string, unknown>): boolean {
  return Object.hasOwn(capabilities, "fork") && capabilities.fork !== false && capabilities.fork != null;
}

export function matchingCommands(commands: readonly AvailableCommand[], input: string): AvailableCommand[] {
  if (!/^\/[^\s]*$/.test(input)) return [];
  const query = input.slice(1).toLowerCase();
  return commands.filter((command) => typeof command.name === "string" && command.name &&
    !/\s/.test(command.name) && command.name.toLowerCase().startsWith(query));
}

export function contextPercent(used: number, size: number): number | null {
  return Number.isFinite(used) && Number.isFinite(size) && used >= 0 && size > 0
    ? Math.min(100, Math.round(used / size * 100)) : null;
}

export function forkConversation(taskId: string): Promise<{ task_id: string }> {
  return request(`/v1/tasks/${encodeURIComponent(taskId)}/fork`, {
    method: "POST", body: JSON.stringify({ request_id: crypto.randomUUID() }),
  });
}
