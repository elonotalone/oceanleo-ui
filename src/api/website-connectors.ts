"use client";

import { websiteRequest, WebsiteRequestError } from "./website-runtime";
import { accessToken } from "../lib/auth/client";
import { gatewayBase } from "../lib/auth/config";

export type WebsiteConnectorProvider = "ours" | "on_behalf" | "own_account";
export type WebsiteConnectorStatus = "not_connected" | "not_ready" | "connected" | "error";
export type WebsiteConnectorEnvironment = "preview" | "production";

export interface WebsiteConnectorDetails {
  connector_id: string;
  label: string;
  label_zh?: string;
  provider_kind: WebsiteConnectorProvider;
  cost_basis: string;
  cost_basis_zh?: string;
  rate_source: string;
  rate_source_zh?: string;
  limits: string[];
  limits_zh?: string[];
  standard_interface: string[];
  panels: string[];
  agent_brief: string;
}

export interface WebsiteConnectorOption extends WebsiteConnectorDetails {
  slots: string[];
  available?: boolean;
  availability_code?: string;
  availability_reason?: string;
  availability_reason_zh?: string;
  actions?: string[];
}

export interface WebsiteConnectorSlot extends WebsiteConnectorDetails {
  slot: string;
  environment: WebsiteConnectorEnvironment;
  status: WebsiteConnectorStatus;
  status_detail: string;
  status_detail_zh?: string;
  vault_refs: string[];
  selection_source: "default" | "saved";
  updated_at?: string | null;
  change_id?: string | null;
  task_id?: string | null;
  /** Optional gateway facts; absence is not an empty schedule or a successful publish. */
  state_lines?: { label: string; label_zh?: string; value: string; value_zh?: string }[];
  last_publish_at?: string | null;
  schedules?: { cron: string; path: string }[];
}

export interface WebsiteConnectorPreset {
  id: string;
  label: string;
  label_zh?: string;
  selections: Record<string, string>;
  audience?: string; audience_zh?: string;
  can_run?: string; can_run_zh?: string;
  cannot_run?: string; cannot_run_zh?: string;
  billing?: string; billing_zh?: string;
  upgrade?: string; upgrade_zh?: string;
  available?: boolean;
  status?: "available" | "not_ready";
  status_detail?: string; status_detail_zh?: string;
  sample?: { tier_id: string; source: string; create_path: string } | null;
}

export interface WebsiteTierSample { project: { project_id: string; display_name?: string }; tier_id: string }
export class WebsiteTierSampleError extends Error {
  readonly project_id?: string;
  constructor(readonly status: number, body?: unknown) {
    super("Tier sample creation failed"); this.name = "WebsiteTierSampleError";
    const detail = (body as { detail?: { code?: unknown; project_id?: unknown } } | null)?.detail;
    if (detail?.code === "tier_sample_setup_unconfirmed" && typeof detail.project_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(detail.project_id)) this.project_id = detail.project_id;
  }
}
async function tierRequest(suffix: string, init: RequestInit = {}, sample = false): Promise<unknown> {
  const token = await accessToken();
  const response = await fetch(gatewayBase() + "/v1/website-projects" + suffix, {
    ...init, credentials: "include", cache: "no-store",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  let body: unknown;
  try { body = await response.json(); } catch { /* A missing body never means a successful creation. */ }
  if (!response.ok) throw sample ? new WebsiteTierSampleError(response.status, body) : new WebsiteRequestError(response.status);
  return body;
}

function checkedPresets(value: unknown): WebsiteConnectorPreset[] {
  if (!Array.isArray(value)) throw new WebsiteRequestError(502);
  for (const item of value) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.label !== "string" ||
      !item.selections || typeof item.selections !== "object" || Array.isArray(item.selections) ||
      !Object.values(item.selections).every(value => typeof value === "string")) throw new WebsiteRequestError(502);
    for (const field of ["audience", "can_run", "cannot_run", "billing", "upgrade", "status_detail", "label"]) {
      for (const key of [field, field + "_zh"]) if (item[key] != null && typeof item[key] !== "string") throw new WebsiteRequestError(502);
    }
    if ((item.available != null && typeof item.available !== "boolean") || (item.status != null && !["available", "not_ready"].includes(item.status)) ||
      (item.sample != null && (typeof item.sample !== "object" || typeof item.sample.tier_id !== "string"))) throw new WebsiteRequestError(502);
  }
  return value as WebsiteConnectorPreset[];
}

export interface WebsiteConnectorChange {
  id: string;
  kind: string;
  selections: Record<string, string>;
  status: "pending" | "queued" | "running" | "completed" | "failed";
  task_id: string | null;
  task_status: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteConnectorsSnapshot {
  project_id: string;
  environment: WebsiteConnectorEnvironment;
  slots: WebsiteConnectorSlot[];
  catalog: WebsiteConnectorOption[];
  presets: WebsiteConnectorPreset[];
  changes: WebsiteConnectorChange[];
  persistence: { available: boolean; migration: string };
}

export type WebsiteConnectorMutation = WebsiteConnectorsSnapshot & {
  change: WebsiteConnectorChange;
  task_id: string | null;
};

export const websiteConnectorsApi = {
  tiers: async (id: string, signal?: AbortSignal) => {
    const body = await tierRequest("/presets/tiers?" + new URLSearchParams({ project_id: id }), { signal }) as { presets?: WebsiteConnectorPreset[] } | null;
    return checkedPresets(body?.presets);
  },
  createSample: async (tierId: string, locale: "en" | "zh", signal?: AbortSignal): Promise<WebsiteTierSample> => {
    const body = await tierRequest("/from-tier/" + encodeURIComponent(tierId), { method: "POST", body: JSON.stringify({ locale }), signal }, true) as WebsiteTierSample | null;
    if (!body || typeof body.project?.project_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.project.project_id)) throw new WebsiteTierSampleError(502);
    return body;
  },
  get: (id: string, environment: WebsiteConnectorEnvironment, signal?: AbortSignal) =>
    websiteRequest<WebsiteConnectorsSnapshot>(id, "/connectors?" + new URLSearchParams({ environment }), { signal }),
  select: (id: string, slot: string, connectorId: string, environment: WebsiteConnectorEnvironment) =>
    websiteRequest<WebsiteConnectorMutation>(id, "/connectors/" + encodeURIComponent(slot) + "?" + new URLSearchParams({ environment }), {
      method: "PUT", body: JSON.stringify({ connector_id: connectorId }),
    }),
  preset: (id: string, presetId: string, environment: WebsiteConnectorEnvironment) =>
    websiteRequest<WebsiteConnectorMutation>(id, "/connectors/preset?" + new URLSearchParams({ environment }), {
      method: "POST", body: JSON.stringify({ preset_id: presetId }),
    }),
};

export type WebsiteConnectorsApi = Omit<typeof websiteConnectorsApi, "tiers" | "createSample"> & Partial<Pick<typeof websiteConnectorsApi, "tiers" | "createSample">>;
