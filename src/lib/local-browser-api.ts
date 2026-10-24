"use client";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import { mcpGatewayDetail } from "./mcp-api";

export interface LocalBrowserDevice { id: string; name: string; browser: string; online: boolean; last_seen_at: string | null; revoked_at?: string | null }
export interface LocalBrowserPreferences { preferred_device_id: string | null; allow_cross_browser_tasks: boolean }
export interface LocalBrowserSession { id: string; device_id: string; task_id?: string; goal: string; state: "pending_consent" | "active" | "paused" | "stopped" | "denied" | "expired"; origins: string[]; created_at: string; expires_at: string }
export interface LocalBrowserEvent { id: string; session_id: string; action: string; status: string; created_at: string; detail?: Record<string, unknown> }
export interface LocalBrowserDevices { items: LocalBrowserDevice[]; preferences: LocalBrowserPreferences; extension_download_url: string | null }

/** Same bearer transport as MCP, with bounded requests and caller cancellation. No device credentials reach the website. */
async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("请先登录");
  const response = await fetch(`${GATEWAY_BASE}/v1/local-browser${path}`, {
    method, credentials: "include", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(mcpGatewayDetail(data) || `HTTP ${response.status}`);
  return data as T;
}

export const localBrowserApi = {
  devices: (signal?: AbortSignal) => request<LocalBrowserDevices>("/devices", "GET", undefined, signal),
  pair: (signal?: AbortSignal) => request<{ code: string; expires_at: string }>("/pairings", "POST", {}, signal),
  preferences: (value: LocalBrowserPreferences, signal?: AbortSignal) => request<LocalBrowserPreferences>("/preferences", "PATCH", value, signal),
  revoke: (id: string, signal?: AbortSignal) => request<{ ok: true }>(`/devices/${encodeURIComponent(id)}`, "DELETE", undefined, signal),
  sessions: (signal?: AbortSignal) => request<{ items: LocalBrowserSession[] }>("/sessions", "GET", undefined, signal),
  events: (id: string, signal?: AbortSignal) => request<{ items: LocalBrowserEvent[] }>(`/sessions/${encodeURIComponent(id)}/events`, "GET", undefined, signal),
  control: (id: string, action: "stop" | "takeover", signal?: AbortSignal) => request<{ session: LocalBrowserSession }>(`/sessions/${encodeURIComponent(id)}/control`, "POST", { action }, signal),
};

/** Fetch authenticated bytes; never put a bearer token in a download URL. */
export async function downloadLocalBrowserExtension(signal?: AbortSignal): Promise<Blob> {
  const token = await accessToken();
  if (!token) throw new Error("请先登录");
  const response = await fetch(`${GATEWAY_BASE}/v1/local-browser/extension.zip`, {
    credentials: "include", headers: { Authorization: `Bearer ${token}` },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(mcpGatewayDetail(await response.json().catch(() => ({}))) || `HTTP ${response.status}`);
  return response.blob();
}
