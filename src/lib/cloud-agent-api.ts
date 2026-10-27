"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { computerRunMode, epochMs, parseCloudAgentAvailability, type CloudAgentAvailability, type ExecutionTarget } from "./execution-target";

/**
 * The owner-only HTTP routes of the cloud assistant (device-link protocol
 * `oceanleo-app/docs/react-client-rebuild/device-link/protocol.md` §12).
 * Bearer token only (no cookies), never cached: session data and screen
 * images are private and live only in the gateway's memory (§14).
 */

const DEVICE_ID = /^[A-Za-z0-9_-]{1,100}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
/** Device blobs are ≤2 MB (protocol §3.2); anything larger is not a frame we asked for. */
const MAX_IMAGE_BYTES = 2_500_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** `signed_out`: no session token; `failed`: the request never got an answer. */
type Fetched = { kind: "signed_out" } | { kind: "failed" } | { kind: "response"; response: Response };

async function get(path: string, accept: string, signal?: AbortSignal): Promise<Fetched> {
  const token = await accessToken().catch(() => null);
  if (!token) return { kind: "signed_out" };
  if (signal?.aborted) return { kind: "failed" };
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: accept },
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    return { kind: "response", response };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * `GET /v1/devices/cloud-agent` (§12.4).
 * - `ok`: one row per paired computer.
 * - `absent`: an unsupported route or unavailable account; never a cloud driver.
 *   The reason distinguishes gateway compatibility from account permission.
 * - `error`: a transient/invalid answer; a send is still re-checked by preflight.
 */
export type CloudAgentAvailabilityResult =
  | { kind: "ok"; devices: Map<string, CloudAgentAvailability> }
  | { kind: "absent"; reason?: "signed_out" | "unauthorized" | "forbidden" | "unsupported"; status?: number }
  | { kind: "error"; status?: number };

export async function listCloudAgentAvailability(signal?: AbortSignal): Promise<CloudAgentAvailabilityResult> {
  const fetched = await get("/v1/devices/cloud-agent", "application/json", signal);
  if (fetched.kind === "signed_out") return { kind: "absent", reason: "signed_out" };
  if (fetched.kind === "failed") return { kind: "error" };
  const { response } = fetched;
  if (response.status === 401) return { kind: "absent", reason: "unauthorized", status: response.status };
  if (response.status === 403) return { kind: "absent", reason: "forbidden", status: response.status };
  if ([404, 405, 501].includes(response.status)) return { kind: "absent", reason: "unsupported", status: response.status };
  if (!response.ok) return { kind: "error", status: response.status };
  const body = await response.json().catch(() => null);
  return Array.isArray(record(body).devices) ? { kind: "ok", devices: parseCloudAgentAvailability(body) } : { kind: "error" };
}

/**
 * Right before a task is sent with `driver:"cloud"`: the route must confirm
 * that this computer still allows the cloud assistant. Null = confirmed, or
 * no cloud driver to confirm. Otherwise the send stops here with the same
 * shape the gateway uses (`cloud_agent_unavailable` + `reason`, protocol
 * §12.5): nothing was sent, and it never turns into an on-device run.
 */
export async function cloudDriverPreflight(target: ExecutionTarget, signal?: AbortSignal):
  Promise<{ code: "CLOUD_AGENT_UNAVAILABLE"; reason: string | null } | null> {
  if (target.kind !== "device" || target.driver !== "cloud") return null;
  const result = await listCloudAgentAvailability(signal);
  const entry = result.kind === "ok" ? result.devices.get(target.id) : undefined;
  if (entry && computerRunMode(null, entry) === "cloud") return null;
  return { code: "CLOUD_AGENT_UNAVAILABLE", reason: entry && !entry.available ? entry.reason : null };
}

/** The live session as the hub sees it (§12.1). */
export interface AgentSessionView {
  sessionId: string;
  /** `offered` | `running` | `paused` | `stuck` | `ended`. */
  state: string | null;
  reason: string | null;
  owner: "ai" | "human" | null;
  link: "online" | "offline" | null;
  lastContactAt: number | null;
  /** The unresolved call, if any; `elapsedMs` feeds "这一步已经 3 分钟没有完成". */
  current: { seq: number; method: string; elapsedMs: number } | null;
  /** The newest screen image the hub holds; `at` changes when a new one arrives. */
  observation: { width: number; height: number; at: number | null } | null;
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/** The §12.1 body; null when it is about another session. */
export function parseAgentSession(value: unknown, sessionId: string): AgentSessionView | null {
  const row = record(value);
  if (typeof row.session_id === "string" && row.session_id !== sessionId) return null;
  const current = record(row.current);
  const latest = record(row.latest_observation);
  return {
    sessionId,
    state: typeof row.state === "string" && CODE.test(row.state) ? row.state : null,
    reason: typeof row.reason === "string" && CODE.test(row.reason) ? row.reason : null,
    owner: row.owner === "ai" || row.owner === "human" ? row.owner : null,
    link: row.link === "online" || row.link === "offline" ? row.link : null,
    lastContactAt: epochMs(row.last_contact_at),
    current: Number.isSafeInteger(current.seq) && typeof current.method === "string" && typeof current.elapsed_ms === "number" &&
      Number.isFinite(current.elapsed_ms) && current.elapsed_ms >= 0
      ? { seq: Number(current.seq), method: current.method.slice(0, 64), elapsedMs: current.elapsed_ms } : null,
    observation: latest.available === true && positive(latest.width) && positive(latest.height)
      ? { width: latest.width, height: latest.height, at: epochMs(latest.at) } : null,
  };
}

function sessionPath(deviceId: string, sessionId: string): string | null {
  if (!DEVICE_ID.test(deviceId) || !SESSION_ID.test(sessionId)) return null;
  return `/v1/devices/${encodeURIComponent(deviceId)}/agent-sessions/${encodeURIComponent(sessionId)}`;
}

/** `gone`: 404 `session_unknown` (ended, replaced, or not the caller's). */
export type AgentSessionResult = { kind: "ok"; session: AgentSessionView } | { kind: "gone" } | { kind: "error" };

export async function getAgentSession(deviceId: string, sessionId: string, signal?: AbortSignal): Promise<AgentSessionResult> {
  const path = sessionPath(deviceId, sessionId);
  if (!path) return { kind: "gone" };
  const fetched = await get(path, "application/json", signal);
  if (fetched.kind !== "response") return { kind: "error" };
  const { response } = fetched;
  if (response.status === 404) return { kind: "gone" };
  if (!response.ok) return { kind: "error" };
  const session = parseAgentSession(await response.json().catch(() => null), sessionId);
  return session ? { kind: "ok", session } : { kind: "error" };
}

/**
 * `GET …/observation` (§12.2): the newest JPEG/PNG of the session straight
 * from the gateway's memory. The caller keeps it only as an in-memory object
 * URL and revokes it when replaced; nothing is written anywhere.
 */
export type AgentObservationResult = { kind: "image"; image: Blob } | { kind: "none" } | { kind: "gone" } | { kind: "error" };

export async function getAgentObservation(deviceId: string, sessionId: string, signal?: AbortSignal): Promise<AgentObservationResult> {
  const path = sessionPath(deviceId, sessionId);
  if (!path) return { kind: "gone" };
  const fetched = await get(`${path}/observation`, "image/jpeg, image/png", signal);
  if (fetched.kind !== "response") return { kind: "error" };
  const { response } = fetched;
  if (response.status === 204) return { kind: "none" };
  if (response.status === 404) return { kind: "gone" };
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) return { kind: "error" };
  const image = await response.blob().catch(() => null);
  return image && image.size > 0 && image.size <= MAX_IMAGE_BYTES ? { kind: "image", image } : { kind: "error" };
}
