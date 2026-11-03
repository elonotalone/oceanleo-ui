"use client";

import { websiteRequest } from "./website-runtime";

export type WebsiteConnectorProvider = "ours" | "on_behalf" | "own_account";
export type WebsiteConnectorStatus = "not_connected" | "connected" | "error";

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
  actions?: string[];
}

export interface WebsiteConnectorSlot extends WebsiteConnectorDetails {
  slot: string;
  status: WebsiteConnectorStatus;
  status_detail: string;
  status_detail_zh?: string;
  vault_refs: string[];
  selection_source: "default" | "saved";
  updated_at?: string | null;
  change_id?: string | null;
  task_id?: string | null;
}

export interface WebsiteConnectorPreset {
  id: string;
  label: string;
  label_zh?: string;
  selections: Record<string, string>;
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
  get: (id: string, signal?: AbortSignal) =>
    websiteRequest<WebsiteConnectorsSnapshot>(id, "/connectors", { signal }),
  select: (id: string, slot: string, connectorId: string) =>
    websiteRequest<WebsiteConnectorMutation>(id, "/connectors/" + encodeURIComponent(slot), {
      method: "PUT", body: JSON.stringify({ connector_id: connectorId }),
    }),
  preset: (id: string, presetId: string) =>
    websiteRequest<WebsiteConnectorMutation>(id, "/connectors/preset", {
      method: "POST", body: JSON.stringify({ preset_id: presetId }),
    }),
};

export type WebsiteConnectorsApi = typeof websiteConnectorsApi;
