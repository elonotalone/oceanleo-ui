import type { AcpView, AvailableCommand } from "../../acp/types";
import type { PendingSend } from "./pending-send";
import { request } from "../../lib/acp-frames-api";

/** A receipt may beat the socket; don't start another prompt until its turn is visible. */
export function nextHeldMessage(
  entries: readonly PendingSend[], view: Pick<AcpView, "open" | "exited">,
  ready: boolean, receiptVisible: (entry: PendingSend) => boolean,
): PendingSend | null {
  if (!ready || view.open || view.exited) return null;
  const pending = entries.filter((entry) => !receiptVisible(entry));
  if (pending.some((entry) => ["sending", "retrying", "accepted", "queued", "failed"].includes(entry.status))) return null;
  return pending.find((entry) => entry.status === "held") ?? null;
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
