"use client";
import { accessToken } from "../lib/auth/client";
import { gatewayBase } from "../lib/auth/config";

export type WebsiteRuntimeState = "stopped" | "installing" | "starting" | "running" | "crashed" | "sleeping";
export interface WebsiteRuntime {
  state: WebsiteRuntimeState; preview_url: string | null; node_id?: string | null;
  commit?: string | null; manifest_source?: "file" | "detected";
  manifest?: Record<string, unknown> | null; started_at?: string | null;
  last_error?: string | null; memory_mib?: number;
}
export interface WebsiteLogLine { ts: string; stream: "install" | "stdout" | "stderr" | "system"; text: string }
export interface WebsiteLogs { lines: WebsiteLogLine[]; cursor: string | null }

const REQUEST_ERROR_CODES = [
  "invalid_connector_request", "connector_environment_mismatch", "unknown_connector_slot", "selected_connector_unavailable",
  "connector_not_available_for_slot", "adapter_module_unavailable", "connector_migration_required",
  "connector_rate_or_quota_exceeded", "connector_owner_mismatch", "connector_persistence_unavailable",
  "connector_project_read_unavailable", "connector_change_update_unconfirmed", "connector_change_cancelled",
  "connector_change_settlement_unconfirmed", "connector_change_preparation_failed", "connector_task_creation_failed",
  "agent_task_creation_failed", "agent_task_dispatch_unconfirmed", "connector_response_unavailable",
  "connector_task_link_unconfirmed", "connector_action_unconfirmed", "connector_action_link_unconfirmed",
] as const;
export type WebsiteRequestErrorCode = typeof REQUEST_ERROR_CODES[number];
const SAFE_REQUEST_CODES = new Set<string>(REQUEST_ERROR_CODES);
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** Keep only closed application codes and UUID references; never retain provider details. */
export class WebsiteRequestError extends Error {
  readonly status: number;
  readonly code?: WebsiteRequestErrorCode;
  readonly change_id?: string;
  readonly task_id?: string;
  constructor(status: number, body?: unknown) {
    super("HTTP " + status);
    this.name = "WebsiteRequestError";
    this.status = status;
    const envelope = record(body);
    const receipt = record(envelope?.detail);
    if (typeof receipt?.code === "string" && SAFE_REQUEST_CODES.has(receipt.code)) {
      this.code = receipt.code as WebsiteRequestErrorCode;
      if (typeof receipt.change_id === "string" && RECEIPT_ID.test(receipt.change_id)) this.change_id = receipt.change_id;
      if (typeof receipt.task_id === "string" && RECEIPT_ID.test(receipt.task_id)) this.task_id = receipt.task_id;
    }
  }
}

/** Authenticated gateway calls only. Preview origins never receive this token. */
export async function websiteResponse(projectId: string, suffix: string, init: RequestInit = {}, accept = "application/json"): Promise<Response> {
  const token = await accessToken();
  const response = await fetch(gatewayBase() + "/v1/website-projects/" + encodeURIComponent(projectId) + suffix, {
    ...init, credentials: "include", cache: "no-store",
    headers: { Accept: accept, ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  if (!response.ok) {
    let body: unknown;
    try { body = await response.json(); } catch { /* An unreadable error body carries no safe receipt. */ }
    throw new WebsiteRequestError(response.status, body);
  }
  return response;
}

export async function websiteRequest<T>(projectId: string, suffix: string, init: RequestInit = {}): Promise<T> {
  const response = await websiteResponse(projectId, suffix, init);
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
  checkpoint: (id: string, reason: "leave" | "turn_end" | "on_demand" = "leave", message?: string) =>
    websiteRequest<unknown>(id, "/runtime/checkpoint", {
      method: "POST", keepalive: true, body: JSON.stringify({ reason, ...(message ? { message } : {}) }),
    }),
};
export type WebsiteRuntimeApi = typeof websiteRuntimeApi;
