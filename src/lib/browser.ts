"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { authed, type AgentApiResult } from "./agent";

export interface CloudBrowserSession {
  id: string;
  session_version: number;
  runtime_id: string;
  incarnation: number;
  task_id?: string | null;
  app_session_id?: string | null;
  title?: string | null;
  title_source?: string | null;
  status: string;
  protocol_version?: 2 | 3 | null;
  runtime_version?: string | null;
  stream_id?: string | null;
  stream_generation?: number | null;
  window_id?: string | null;
  snapshot_generation?: number | null;
  binary_frames?: boolean | null;
  runtime_state?: string | null;
  live_state?: string | null;
  failure_reason?: string | null;
  last_url?: string;
  last_title?: string;
  sensitive_active?: boolean;
  warm_until?: string | null;
  last_event_at?: string | null;
  created_at: string;
  updated_at?: string;
  latest_event?: CloudBrowserEvent | null;
  latest_checkpoint?: CloudBrowserCheckpoint | null;
}

export interface CloudBrowserEvent {
  id: number;
  sequence_no?: number;
  action?: string;
  url?: string;
  display_url?: string;
  title?: string;
  tab_id?: string | null;
  tab_title?: string | null;
  reason?: string | null;
  captured_at?: string;
  sensitive?: boolean;
  has_screenshot?: boolean;
  created_at?: string;
}

export type CloudBrowserCheckpointState =
  | "ready"
  | "warm"
  | "hibernated"
  | "restoring"
  | "restored"
  | "failed";

/**
 * Durable, restorable browser state. A checkpoint is deliberately not a
 * screenshot: generation plus the exact session/runtime pins identify the
 * browser state that the gateway can restore.
 */
export interface CloudBrowserCheckpoint {
  id: string;
  session_id: string;
  generation: number;
  created_at: string;
  page_title: string;
  page_url: string;
  state: CloudBrowserCheckpointState;
  session_version: number;
  runtime_version: string;
  failure_reason?: string | null;
}

export type CloudBrowserTransportState =
  | "idle"
  | "ticketing"
  | "ws_connecting"
  | "authenticated"
  | "awaiting_first_frame"
  | "streaming"
  | "reconnecting"
  | "failed"
  | "closed";

export type CloudBrowserTabState =
  | "opening"
  | "loading"
  | "ready"
  | "crashed"
  | "closing"
  | "closed";

export interface CloudBrowserTab {
  id: string;
  title: string;
  displayUrl: string;
  faviconUrl?: string;
  status: CloudBrowserTabState;
  openerTabId?: string | null;
}

export interface CloudBrowserControlLease {
  leaseId: string;
  epoch: number;
  holderKind: "agent" | "human" | "free";
  holderId?: string;
  connectionId?: string;
  expiresAt?: string;
  privacyMode?: boolean;
}

export interface CloudBrowserFrameMeta {
  sequence?: number;
  actionSequence?: number;
  width?: number;
  height?: number;
  byteLength?: number;
  capturedAtMs?: number;
  streamId?: string;
  generation?: number;
  windowId?: string;
  runtimeId?: string;
  runtimeVersion?: string;
  sessionVersion?: number;
  incarnation?: number;
  connectionId?: string;
  nonce?: string;
  codec?: "image/jpeg" | string;
  source?: "native-chrome-window" | string;
  paintState?: "real" | string;
  nativeChromeWindow?: boolean;
}

export interface CloudBrowserFrameContractV3 {
  transport: "adjacent-binary";
  codec: "image/jpeg";
  source: "native-chrome-window";
  max_frame_bytes: number;
  max_width: number;
  max_height: number;
}

export interface CloudBrowserCapabilitiesV3 {
  page_bookmark: boolean;
  session_checkpoint: boolean;
  clipboard: boolean;
  ime_composition: boolean;
  viewport_resize: boolean;
}

export interface CloudBrowserTicket {
  ticket: string;
  ticket_nonce: string;
  expires_at: string;
  expires_in: number;
  protocol_version: 3;
  owner_principal: string;
  session_id: string;
  runtime_id: string;
  incarnation: number;
  session_version: number;
  binary_frames: true;
}

const base = "/v1/browser";
const browseBase = "/v1/browse";
const MAX_BROWSER_ID_LENGTH = 160;
const MAX_OPERATION_ID_LENGTH = 160;
export const MAX_CLOUD_BROWSER_SESSION_TITLE_LENGTH = 160;

export interface CloudBrowserFencedLifecycleBody {
  expected_session_version: number;
  runtime_id: string;
  incarnation: number;
  operation_id: string;
}

export interface CloudBrowserResumeBody
  extends CloudBrowserFencedLifecycleBody {
  snapshot_generation?: number;
  initial_url: "";
}

export interface CloudBrowserLifecycleResponse {
  session_id: string;
  status: string;
  session_version?: number;
  runtime_id?: string;
  incarnation?: number;
  snapshot_generation?: number;
}

export interface CloudBrowserResumeOptions {
  snapshotGeneration?: number;
  operationId?: string;
}

export type CloudBrowserApiRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<AgentApiResult<T>>;

export type CloudBrowserRuntimeFenceRule =
  | "active"
  | "active-or-absent";

type PreparedCloudBrowserOperation = {
  session: CloudBrowserSession;
  operationId: string;
};

let operationIdSerial = 0;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedIdentifier(
  value: unknown,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_BROWSER_ID_LENGTH &&
    (allowEmpty || value.length > 0) &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function optionalBoundedString(
  value: unknown,
  maximum = MAX_BROWSER_ID_LENGTH,
): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" &&
      value.length <= maximum &&
      !/[\u0000-\u001f\u007f]/.test(value))
  );
}

function safeInteger(
  value: unknown,
  minimum: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
  );
}

function optionalGeneration(value: unknown): boolean {
  return value === undefined || value === null || safeInteger(value, 0);
}

function validOperationId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_OPERATION_ID_LENGTH &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  );
}

export function createCloudBrowserOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    try {
      const value = cryptoApi.randomUUID();
      if (validOperationId(value)) return value;
    } catch {
      // Fall through to getRandomValues or the bounded local fallback.
    }
  }
  if (typeof cryptoApi?.getRandomValues === "function") {
    try {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      const value = `browser-${[...bytes]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")}`;
      if (validOperationId(value)) return value;
    } catch {
      // Fall through to the bounded monotonic fallback.
    }
  }
  operationIdSerial = (operationIdSerial + 1) % Number.MAX_SAFE_INTEGER;
  return [
    "browser",
    Date.now().toString(36),
    operationIdSerial.toString(36),
    Math.random().toString(36).slice(2, 14),
  ].join("-");
}

export function validateCloudBrowserSessionFence(
  value: unknown,
  expectedSessionId: string,
  runtimeRule: CloudBrowserRuntimeFenceRule = "active-or-absent",
): CloudBrowserSession | null {
  const session = recordValue(value);
  if (
    !session ||
    !boundedIdentifier(expectedSessionId) ||
    session.id !== expectedSessionId ||
    !safeInteger(session.session_version, 1) ||
    !boundedIdentifier(session.runtime_id, true) ||
    !safeInteger(session.incarnation, 0) ||
    (session.protocol_version !== undefined &&
      session.protocol_version !== null &&
      session.protocol_version !== 2 &&
      session.protocol_version !== 3) ||
    !optionalBoundedString(session.runtime_version) ||
    !optionalBoundedString(session.stream_id) ||
    !optionalGeneration(session.stream_generation) ||
    !optionalBoundedString(session.window_id) ||
    !optionalGeneration(session.snapshot_generation) ||
    (session.binary_frames !== undefined &&
      session.binary_frames !== null &&
      session.binary_frames !== true)
  ) {
    return null;
  }
  const activeRuntime =
    session.runtime_id.length > 0 && session.incarnation > 0;
  // Hibernation removes the runtime ID but deliberately preserves the last
  // positive incarnation as the restore CAS fence.
  const absentRuntime = session.runtime_id === "";
  if (
    (runtimeRule === "active" && !activeRuntime) ||
    (runtimeRule === "active-or-absent" &&
      !activeRuntime &&
      !absentRuntime)
  ) {
    return null;
  }
  return session as unknown as CloudBrowserSession;
}

function failedResult<T>(
  result: AgentApiResult<unknown>,
): AgentApiResult<T> {
  return {
    ok: false,
    error: result.error,
    status: result.status,
    ...(result.detail ? { detail: result.detail } : {}),
    ...(result.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds }),
  };
}

async function prepareCloudBrowserOperation(
  request: CloudBrowserApiRequest,
  sessionId: string,
  runtimeRule: CloudBrowserRuntimeFenceRule,
  operationId?: string,
  requireOperationId = false,
): Promise<AgentApiResult<PreparedCloudBrowserOperation>> {
  if (!boundedIdentifier(sessionId)) {
    return {
      ok: false,
      error: "无效的云浏览器会话标识",
      status: 400,
    };
  }
  const resolvedOperationId = requireOperationId
    ? operationId || createCloudBrowserOperationId()
    : "";
  if (requireOperationId && !validOperationId(resolvedOperationId)) {
    return {
      ok: false,
      error: "无效的云浏览器操作标识",
      status: 400,
    };
  }
  const fresh = await request<{ session: unknown }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}`,
  );
  if (!fresh.ok) return failedResult(fresh);
  const session = validateCloudBrowserSessionFence(
    fresh.data?.session,
    sessionId,
    runtimeRule,
  );
  if (!session) {
    return {
      ok: false,
      error: "云浏览器会话缺少有效的 v3 CAS/runtime fence",
      status: 502,
    };
  }
  return {
    ok: true,
    data: { session, operationId: resolvedOperationId },
  };
}

export async function listCloudBrowsers(limit = 50, taskId?: string) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (taskId) query.set("task_id", taskId);
  const result = await authed<{ items: unknown[] }>(
    `${base}/sessions?${query.toString()}`,
  );
  if (!result.ok) return failedResult<{ items: CloudBrowserSession[] }>(result);
  if (!Array.isArray(result.data?.items)) {
    return {
      ok: false,
      error: "云浏览器会话列表不符合 v3 fence 契约",
      status: 502,
    };
  }
  const items: CloudBrowserSession[] = [];
  for (const value of result.data.items) {
    const id = recordValue(value)?.id;
    const session =
      typeof id === "string"
        ? validateCloudBrowserSessionFence(value, id)
        : null;
    if (!session) {
      return {
        ok: false,
        error: "云浏览器会话列表不符合 v3 fence 契约",
        status: 502,
      };
    }
    items.push(session);
  }
  return { ok: true, data: { items } };
}

export async function createCloudBrowser(url: string, taskId?: string) {
  const result = await authed<{ session: unknown }>(`${base}/sessions`, {
    method: "POST",
    body: JSON.stringify({
      url,
      task_id: taskId || null,
    }),
  });
  if (!result.ok) {
    return failedResult<{ session: CloudBrowserSession }>(result);
  }
  const id = recordValue(result.data?.session)?.id;
  const session =
    typeof id === "string"
      ? validateCloudBrowserSessionFence(result.data?.session, id)
      : null;
  if (!session) {
    return {
      ok: false,
      error: "新建云浏览器会话不符合 v3 fence 契约",
      status: 502,
    };
  }
  return { ok: true, data: { session } };
}

export async function renameCloudBrowserSession(
  sessionId: string,
  title: string,
  request: CloudBrowserApiRequest = authed,
): Promise<AgentApiResult<{ session: CloudBrowserSession }>> {
  if (!boundedIdentifier(sessionId)) {
    return {
      ok: false,
      error: "无效的云浏览器会话标识",
      status: 400,
    };
  }
  const normalizedTitle = title.trim();
  if (
    !normalizedTitle ||
    normalizedTitle.length > MAX_CLOUD_BROWSER_SESSION_TITLE_LENGTH
  ) {
    return {
      ok: false,
      error: "会话名称必须为 1 至 160 个字符",
      status: 400,
    };
  }
  const result = await request<{ session: unknown }>(
    `${browseBase}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title: normalizedTitle }),
    },
  );
  if (!result.ok) {
    return failedResult<{ session: CloudBrowserSession }>(result);
  }
  const returnedId = recordValue(result.data?.session)?.id;
  const session =
    returnedId === sessionId
      ? validateCloudBrowserSessionFence(result.data?.session, sessionId)
      : null;
  if (!session) {
    return {
      ok: false,
      error: "更新后的云浏览器会话不符合 v3 fence 契约",
      status: 502,
    };
  }
  return { ok: true, data: { session } };
}

export function listCloudBrowserEvents(sessionId: string, limit = 200) {
  return authed<{ items: CloudBrowserEvent[] }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/events?limit=${limit}`,
  );
}

export function listCloudBrowserCheckpoints(sessionId: string, limit = 50) {
  const query = new URLSearchParams({ limit: String(limit) });
  return authed<{ items: CloudBrowserCheckpoint[] }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/checkpoints?${query.toString()}`,
  );
}

export function createCloudBrowserLifecycleClient(
  request: CloudBrowserApiRequest = authed,
) {
  async function getSession(
    sessionId: string,
  ): Promise<AgentApiResult<{ session: CloudBrowserSession }>> {
    const prepared = await prepareCloudBrowserOperation(
      request,
      sessionId,
      "active-or-absent",
    );
    if (!prepared.ok || !prepared.data) return failedResult(prepared);
    return {
      ok: true,
      data: { session: prepared.data.session },
    };
  }

  async function createTicket(
    sessionId: string,
  ): Promise<AgentApiResult<CloudBrowserTicket>> {
    const prepared = await prepareCloudBrowserOperation(
      request,
      sessionId,
      "active",
    );
    if (!prepared.ok || !prepared.data) return failedResult(prepared);
    const { session } = prepared.data;
    return request<CloudBrowserTicket>(
      `${base}/sessions/${encodeURIComponent(sessionId)}/live-ticket`,
      {
        method: "POST",
        body: JSON.stringify({
          protocol_version: 3,
          expected_session_version: session.session_version,
          runtime_id: session.runtime_id,
          incarnation: session.incarnation,
        }),
      },
    );
  }

  async function resume(
    sessionId: string,
    options: CloudBrowserResumeOptions = {},
  ): Promise<AgentApiResult<CloudBrowserLifecycleResponse>> {
    if (
      options.snapshotGeneration !== undefined &&
      !safeInteger(options.snapshotGeneration, 1)
    ) {
      return {
        ok: false,
        error: "无效的会话快照代数",
        status: 400,
      };
    }
    const prepared = await prepareCloudBrowserOperation(
      request,
      sessionId,
      "active-or-absent",
      options.operationId,
      true,
    );
    if (!prepared.ok || !prepared.data) return failedResult(prepared);
    const { session, operationId } = prepared.data;
    const body: CloudBrowserResumeBody = {
      expected_session_version: session.session_version,
      runtime_id: session.runtime_id,
      incarnation: session.incarnation,
      operation_id: operationId,
      ...(options.snapshotGeneration === undefined
        ? {}
        : { snapshot_generation: options.snapshotGeneration }),
      initial_url: "",
    };
    return request<CloudBrowserLifecycleResponse>(
      `${base}/sessions/${encodeURIComponent(sessionId)}/resume`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async function restoreCheckpoint(
    sessionId: string,
    checkpoint: Pick<CloudBrowserCheckpoint, "generation">,
    operationId?: string,
  ): Promise<AgentApiResult<CloudBrowserLifecycleResponse>> {
    // The checkpoint identifies historical state only. The current session
    // GET inside resume supplies the sole CAS/runtime fence.
    return resume(sessionId, {
      snapshotGeneration: checkpoint.generation,
      operationId,
    });
  }

  async function hibernate(
    sessionId: string,
    operationId?: string,
  ): Promise<AgentApiResult<CloudBrowserLifecycleResponse>> {
    const prepared = await prepareCloudBrowserOperation(
      request,
      sessionId,
      "active",
      operationId,
      true,
    );
    if (!prepared.ok || !prepared.data) return failedResult(prepared);
    const { session, operationId: resolvedOperationId } = prepared.data;
    const body: CloudBrowserFencedLifecycleBody = {
      expected_session_version: session.session_version,
      runtime_id: session.runtime_id,
      incarnation: session.incarnation,
      operation_id: resolvedOperationId,
    };
    return request<CloudBrowserLifecycleResponse>(
      `${base}/sessions/${encodeURIComponent(sessionId)}/hibernate`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  async function remove(
    sessionId: string,
  ): Promise<
    AgentApiResult<{ session_id: string; deleted: boolean }>
  > {
    const prepared = await prepareCloudBrowserOperation(
      request,
      sessionId,
      "active-or-absent",
    );
    if (!prepared.ok || !prepared.data) return failedResult(prepared);
    const { session } = prepared.data;
    const query = new URLSearchParams({
      expected_session_version: String(session.session_version),
      runtime_id: session.runtime_id,
      incarnation: String(session.incarnation),
    });
    return request<{ session_id: string; deleted: boolean }>(
      `${base}/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`,
      { method: "DELETE" },
    );
  }

  return {
    getSession,
    createTicket,
    resume,
    restoreCheckpoint,
    hibernate,
    remove,
  };
}

const cloudBrowserLifecycleClient =
  createCloudBrowserLifecycleClient();

export function getCloudBrowserSession(sessionId: string) {
  return cloudBrowserLifecycleClient.getSession(sessionId);
}

export function restoreCloudBrowserCheckpoint(
  sessionId: string,
  checkpoint: Pick<CloudBrowserCheckpoint, "generation">,
  operationId?: string,
) {
  return cloudBrowserLifecycleClient.restoreCheckpoint(
    sessionId,
    checkpoint,
    operationId,
  );
}

export function resumeCloudBrowser(
  sessionId: string,
  options: CloudBrowserResumeOptions = {},
) {
  return cloudBrowserLifecycleClient.resume(sessionId, options);
}

export function hibernateCloudBrowser(
  sessionId: string,
  operationId?: string,
) {
  return cloudBrowserLifecycleClient.hibernate(
    sessionId,
    operationId,
  );
}

export function deleteCloudBrowser(sessionId: string) {
  return cloudBrowserLifecycleClient.remove(sessionId);
}

export function createCloudBrowserTicket(sessionId: string) {
  return cloudBrowserLifecycleClient.createTicket(sessionId);
}

export async function cloudBrowserScreenshot(
  eventId: number,
): Promise<AgentApiResult<Blob>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  try {
    const response = await fetch(
      `${GATEWAY_BASE}${base}/events/${eventId}/screenshot`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}`, status: response.status };
    }
    return { ok: true, data: await response.blob() };
  } catch {
    return { ok: false, error: "截图读取失败", status: 0 };
  }
}

export function cloudBrowserLiveUrl(sessionId: string): string {
  const root = GATEWAY_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  return `${root}${base}/sessions/${encodeURIComponent(sessionId)}/live`;
}
