/**
 * Explicit execution choice; private to the signed-in account, never a global mount.
 *
 * `driver: "cloud"` (paired computers only) means the OceanLeo cloud assistant
 * drives that computer over its device link: the decision loop runs in the
 * cloud, every tool runs on the computer (device-link protocol §12.5). It is
 * never a separate choice: the picker sets it per computer from what the
 * gateway reports (`GET /v1/devices/cloud-agent`), and it is sent only when
 * set, because a gateway that predates the cloud assistant rejects unknown
 * target fields. No driver means today's on-device loop.
 */
export type ExecutionTarget = { kind: "cloud" } | { kind: "computer" | "device"; id: string; name: string; driver?: "cloud" };
export const EXECUTION_TARGET_EVENT = "oceanleo:execution-target";
const PREFIX = "oceanleo.execution-target.v1:";
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeExecutionTarget(value: unknown): ExecutionTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.kind === "cloud") return { kind: "cloud" };
  if ((item.kind !== "computer" && item.kind !== "device") || typeof item.id !== "string" ||
      !ID.test(item.id) || typeof item.name !== "string") return null;
  const target: { kind: "computer" | "device"; id: string; name: string } = { kind: item.kind, id: item.id, name: item.name.slice(0, 120) };
  return item.kind === "device" && item.driver === "cloud" ? { ...target, driver: "cloud" } : target;
}
export function readExecutionTarget(userId: string | null): ExecutionTarget {
  if (!userId || typeof window === "undefined") return { kind: "cloud" };
  try { return normalizeExecutionTarget(JSON.parse(window.localStorage.getItem(PREFIX + userId) || "null")) ?? { kind: "cloud" }; }
  catch { return { kind: "cloud" }; }
}
export function writeExecutionTarget(userId: string, target: ExecutionTarget): void {
  const clean = normalizeExecutionTarget(target);
  if (!userId || !clean || typeof window === "undefined") return;
  try { window.localStorage.setItem(PREFIX + userId, JSON.stringify(clean)); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(EXECUTION_TARGET_EVENT, { detail: { userId, target: clean } }));
}
export function executionTargetRequestFields(target: ExecutionTarget): {
  execution_target: { kind: ExecutionTarget["kind"]; id?: string; driver?: "cloud" }; computer_id: string;
} {
  return { execution_target: target.kind === "cloud" ? { kind: "cloud" } : {
      kind: target.kind, id: target.id,
      // Only an explicit cloud driver travels; the server default is the on-device loop.
      ...(target.kind === "device" && target.driver === "cloud" ? { driver: "cloud" as const } : {}),
    },
    // Suppress stale legacy mounts for an explicit default-cloud/local choice.
    computer_id: target.kind === "computer" ? target.id : "" };
}

/**
 * One row of `GET /v1/devices/cloud-agent` (device-link protocol §12.4): the
 * computer's "允许云端助手使用这台电脑" state as its link mirrors it. Display
 * and routing only; the computer itself decides every session and call.
 */
export interface CloudAgentAvailability {
  deviceId: string;
  /** True only while the link is online and the computer's local envelope fits now. */
  available: boolean;
  /** First failing check (`link_lost`, `signed_out`, `local_exec_disabled`, `cleanup_required`, `cloud_agent_disabled`, `envelope_expired`, `ai_busy`). */
  reason: string | null;
  /** When the computer's permission ends, epoch milliseconds. */
  until: number | null;
}

/** Epoch milliseconds from epoch seconds (the link's `until`), epoch milliseconds or ISO-8601 text. */
export function epochMs(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? (value < 1e11 ? value * 1000 : value) : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The `{devices:[…]}` body of `GET /v1/devices/cloud-agent`; malformed rows are dropped. */
export function parseCloudAgentAvailability(value: unknown): Map<string, CloudAgentAvailability> {
  const rows = record(value).devices;
  const out = new Map<string, CloudAgentAvailability>();
  for (const raw of Array.isArray(rows) ? rows.slice(0, 200) : []) {
    const row = record(raw);
    if (typeof row.device_id !== "string" || !ID.test(row.device_id) || typeof row.available !== "boolean" || out.has(row.device_id)) continue;
    out.set(row.device_id, {
      deviceId: row.device_id,
      available: row.available,
      reason: typeof row.reason === "string" && CODE.test(row.reason) ? row.reason : null,
      until: epochMs(row.until),
    });
  }
  return out;
}

/** The fields of a `GET /v1/devices` row the mode decision reads. */
export interface ComputerPresence { online?: boolean; availability?: unknown; local_exec_enabled?: boolean }

/**
 * How a task on this computer runs right now.
 * - `cloud`: the cloud assistant may use it (shown as "云端助手可用至 18:00").
 * - `device`: today's on-device loop, which needs the person at the computer
 *   to confirm steps ("需要你在电脑前确认").
 * - `null`: nothing known about the cloud assistant (a gateway without the
 *   route, or no row for this computer): show and send exactly today's choice.
 */
export function computerRunMode(
  device: ComputerPresence | null | undefined,
  cloud: CloudAgentAvailability | null | undefined,
  now = Date.now(),
): "cloud" | "device" | null {
  if (!cloud) return null;
  const reachable = !device || (device.online !== false && (device.availability === undefined || device.availability === "online") &&
    device.local_exec_enabled !== false);
  return cloud.available && reachable && (cloud.until === null || cloud.until > now) ? "cloud" : "device";
}

/**
 * The same computer target with the driver its current mode implies. Returns
 * the very same object when nothing changes, so callers can skip writes.
 */
export function withRunMode(target: ExecutionTarget, mode: "cloud" | "device" | null): ExecutionTarget {
  if (target.kind !== "device") return target;
  const wanted = mode === "cloud" ? "cloud" : undefined;
  if (target.driver === wanted) return target;
  return wanted ? { kind: "device", id: target.id, name: target.name, driver: wanted } : { kind: "device", id: target.id, name: target.name };
}
