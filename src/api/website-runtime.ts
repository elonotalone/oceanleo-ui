"use client";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type WebsiteRuntimeState = "stopped" | "installing" | "starting" | "running" | "crashed" | "sleeping";
export interface WebsiteRuntime {
  state: WebsiteRuntimeState; preview_url: string | null; node_id?: string | null;
  commit?: string | null; manifest_source?: "file" | "detected";
  manifest?: Record<string, unknown> | null; started_at?: string | null;
  last_error?: string | null; memory_mib?: number;
}
export interface WebsiteLogLine { ts: string; stream: "install" | "stdout" | "stderr" | "system"; text: string }
export interface WebsiteLogs { lines: WebsiteLogLine[]; cursor: string | null }

/** Authenticated gateway calls only. Preview origins never receive this token. */
export async function websiteRequest<T>(projectId: string, suffix: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(GATEWAY_BASE + "/v1/website-projects/" + encodeURIComponent(projectId) + suffix, {
    ...init, credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json() as Promise<T>;
}
export const websiteRuntimeApi = {
  get: (id: string, signal?: AbortSignal) => websiteRequest<WebsiteRuntime>(id, "/runtime", { signal }),
  logs: (id: string, since: string | null, signal?: AbortSignal) => websiteRequest<WebsiteLogs>(id,
    "/runtime/logs?" + new URLSearchParams({ ...(since ? { since } : {}), limit: "200" }), { signal }),
  action: (id: string, action: "start" | "stop" | "restart", signal?: AbortSignal) =>
    websiteRequest<unknown>(id, "/runtime/" + action, { method: "POST", signal }),
  fix: (id: string, prompt?: string) => websiteRequest<{ task_id: string }>(id, "/runtime/fix", {
    method: "POST", ...(prompt ? { body: JSON.stringify({ prompt }) } : {}),
  }),
};
export type WebsiteRuntimeApi = typeof websiteRuntimeApi;
