"use client";

import { GATEWAY_BASE } from "./auth/config";
import { accessToken } from "./auth/client";

export interface LeoRealtimeContext {
  page?: "home" | "task" | "shell" | "other";
  task_id?: string;
  computer_id?: string;
  shell_session_id?: string;
}

export interface LeoRealtimeAudioContract {
  codec: "pcm_s16le";
  input_sample_rate_hz: number;
  output_sample_rate_hz: number;
  channels: 1;
  max_chunk_ms: number;
}

export interface LeoRealtimeSession {
  session_id: string;
  leo_session_id?: string;
  ready: boolean;
  code?: string;
  message?: string;
  edition: "cn" | "global";
  provider?: string;
  model?: string;
  audio: LeoRealtimeAudioContract;
  stream_path: string;
  bill: LeoRealtimeBill;
}

export interface LeoRealtimeBill {
  currency: string;
  raw_usage?: unknown;
  gross?: number;
  discount?: number;
  net?: number;
  status?: string;
  tariff_snapshot?: unknown;
  connected_seconds?: number;
  reserve_nano?: number;
  currently_held_nano?: number;
  unresolved_held_nano?: number;
  pending_release_nano?: number;
  settled_nano?: number;
  refunded_nano?: number;
  pending_reconciliation?: boolean;
  admitted?: boolean;
  available_credits?: number;
  reserved_credits?: number;
}

export type LeoRealtimeServerEvent =
  | { type: "session.ready" }
  | { type: "audio.output"; audio: string }
  | { type: "text.delta"; text?: string; delta?: string }
  | { type: "transcript"; text?: string; role?: string }
  | { type: "transcript.final"; text?: string; role?: "user" | "assistant" | "leo"; item_id?: string }
  | { type: "usage.settled"; provider_event_id?: string; bill?: { gross?: number; discount?: number; net?: number; currency?: string } }
  | { type: "speech.started" }
  | { type: "response.started"; response_id?: string }
  | { type: "response.finished"; response_id?: string }
  | { type: "session.closed"; reason?: string }
  | { type: "error"; code?: string; message?: string };

export const START_LEO_REALTIME_EVENT = "oceanleo:start-realtime-call";
export const LEO_TRANSCRIPT_UPDATED_EVENT = "oceanleo:leo-transcript-updated";

export function realtimeSessionRequestBody(sessionId: string, context?: LeoRealtimeContext) {
  return { session_id: sessionId, ...(context ? { context } : {}) };
}

export interface LeoRealtimeClientDeps {
  getToken?: () => Promise<string | null>;
  gatewayBase?: string;
  fetch?: typeof fetch;
  createSocket?: (url: string) => WebSocket;
  origin?: string;
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export async function createLeoRealtimeSession(
  sessionId: string,
  context?: LeoRealtimeContext,
  signal?: AbortSignal,
  deps: Pick<LeoRealtimeClientDeps, "getToken" | "gatewayBase" | "fetch"> = {},
): Promise<LeoRealtimeSession> {
  const token = await (deps.getToken ?? accessToken)();
  if (!token) throw new Error("unauthorized");
  const base = (deps.gatewayBase ?? GATEWAY_BASE ?? "").replace(/\/+$/, "");
  const response = await (deps.fetch ?? fetch)(`${base}/v1/leo/realtime/sessions`, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(realtimeSessionRequestBody(sessionId, context)),
  });
  const payload = await response.json().catch(() => ({})) as Partial<LeoRealtimeSession> & { detail?: { code?: string; message?: string } | string };
  if (!response.ok) {
    const detail = typeof payload.detail === "object" ? payload.detail : undefined;
    throw new Error(detail?.code || (typeof payload.detail === "string" ? payload.detail : "realtime_unavailable"));
  }
  if (!payload.ready) throw new Error(payload.code || "realtime_unavailable");
  if (!payload.session_id || !payload.audio || !payload.stream_path || !payload.audio.input_sample_rate_hz) throw new Error("realtime_contract_invalid");
  return payload as LeoRealtimeSession;
}

export async function closeLeoRealtimeSession(sessionId: string): Promise<void> {
  const token = await accessToken();
  if (!token) return;
  const base = (GATEWAY_BASE || "").replace(/\/+$/, "");
  await fetch(`${base}/v1/leo/realtime/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  });
}

const pendingRealtimeMessages = new WeakMap<WebSocket, string[]>();

export function takeRealtimeMessages(socket: WebSocket): string[] {
  const queued = pendingRealtimeMessages.get(socket) ?? [];
  pendingRealtimeMessages.set(socket, []);
  return queued;
}

export async function realtimeSocket(session: LeoRealtimeSession, signal?: AbortSignal, deps: LeoRealtimeClientDeps = {}): Promise<WebSocket> {
  if (signal?.aborted) throw new Error("call_cancelled");
  const token = await (deps.getToken ?? accessToken)();
  if (signal?.aborted) throw new Error("call_cancelled");
  if (!token) throw new Error("unauthorized");
  const base = deps.gatewayBase ?? GATEWAY_BASE;
  const streamUrl = new URL(session.stream_path, base || deps.origin || window.location.origin);
  streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
  const socket = (deps.createSocket ?? ((url) => new WebSocket(url)))(streamUrl.toString());
  const queued: string[] = [];
  pendingRealtimeMessages.set(socket, queued);
  await new Promise<void>((resolve, reject) => {
    let authenticatedReady = false;
    const setTimer = deps.setTimer ?? globalThis.setTimeout;
    const clearTimer = deps.clearTimer ?? globalThis.clearTimeout;
    let timeout: ReturnType<typeof setTimeout>;
    const finish = (error?: Error) => {
      clearTimer(timeout);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    };
    timeout = setTimer(() => {
      finish(new Error("realtime_socket_timeout"));
      socket.close(1000, "provider readiness timeout");
    }, 30_000);
    const onAbort = () => {
      finish(new Error("call_cancelled"));
      socket.close(1000, "call cancelled");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    socket.onopen = () => {
      if (signal?.aborted) return onAbort();
      socket.send(JSON.stringify({ type: "auth", token }));
    };
    socket.onmessage = (event) => {
      const text = String(event.data);
      queued.push(text);
      let message: { type?: string; code?: string; message?: string };
      try { message = JSON.parse(text) as typeof message; } catch { return; }
      if (message.type === "session.ready" && !authenticatedReady) {
        authenticatedReady = true;
        finish();
      } else if (message.type === "error" && !authenticatedReady) {
        finish(new Error(message.code || "realtime_unavailable"));
      }
    };
    socket.onerror = () => {
      finish(new Error("realtime_socket_failed"));
    };
    socket.onclose = (event) => {
      if (!authenticatedReady) finish(new Error(event.code === 4401 ? "unauthorized" : "realtime_socket_closed"));
    };
  });
  return socket;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
