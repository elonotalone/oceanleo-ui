"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { authed, type AgentApiResult } from "./agent";

export interface CloudBrowserSession {
  id: string;
  task_id?: string | null;
  app_session_id?: string | null;
  status: string;
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
  width?: number;
  height?: number;
  byteLength?: number;
  capturedAtMs?: number;
  streamId?: string;
  generation?: number;
  tabId?: string;
  runtimeId?: string;
  incarnation?: number;
  kind?: "bootstrap" | "screencast" | string;
}

export interface CloudBrowserTicket {
  ticket: string;
  expires_in: number;
  protocol_version?: number;
  session_id?: string;
  runtime_id?: string;
  incarnation?: number;
}

const base = "/v1/browser";

export function listCloudBrowsers(limit = 50, taskId?: string) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (taskId) query.set("task_id", taskId);
  return authed<{ items: CloudBrowserSession[] }>(
    `${base}/sessions?${query.toString()}`,
  );
}

export function createCloudBrowser(url: string, taskId?: string) {
  return authed<{ session: CloudBrowserSession }>(`${base}/sessions`, {
    method: "POST",
    body: JSON.stringify({
      url,
      task_id: taskId || null,
    }),
  });
}

export function listCloudBrowserEvents(sessionId: string, limit = 200) {
  return authed<{ items: CloudBrowserEvent[] }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/events?limit=${limit}`,
  );
}

export function resumeCloudBrowser(sessionId: string) {
  return authed<{ session_id: string; status: string }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/resume`,
    { method: "POST" },
  );
}

export function hibernateCloudBrowser(sessionId: string) {
  return authed<{ session_id: string; status: string }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/hibernate`,
    { method: "POST" },
  );
}

export function deleteCloudBrowser(sessionId: string) {
  return authed<{ session_id: string; deleted: boolean }>(
    `${base}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export function createCloudBrowserTicket(sessionId: string) {
  return authed<CloudBrowserTicket>(
    `${base}/sessions/${encodeURIComponent(sessionId)}/live-ticket`,
    { method: "POST" },
  );
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
