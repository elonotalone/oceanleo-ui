"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { authed, type AgentApiResult } from "./agent";

export interface CloudBrowserSession {
  id: string;
  task_id?: string | null;
  app_session_id?: string | null;
  status: string;
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
  title?: string;
  sensitive?: boolean;
  has_screenshot?: boolean;
  created_at?: string;
}

const base = "/v1/browser";

export function listCloudBrowsers(limit = 50) {
  return authed<{ items: CloudBrowserSession[] }>(
    `${base}/sessions?limit=${limit}`,
  );
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
  return authed<{ ticket: string; expires_in: number }>(
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
