import type { WebsiteConnectorStatus, WebsiteConnectorsSnapshot } from "./website-connectors";

// D11: the real scheduler/FC probes return not_ready; keep it distinct from error.
export const unavailableStatus: WebsiteConnectorStatus = "not_ready";
export const unavailableSnapshot: WebsiteConnectorsSnapshot = {
  project_id: "00000000-0000-4000-8000-000000000008", environment: "preview",
  slots: [{
    slot: "scheduler", environment: "preview", connector_id: "ours_scheduler",
    label: "Scheduler", provider_kind: "ours", cost_basis: "Attributable usage at cost",
    rate_source: "Scheduler execution meter", limits: [], standard_interface: [], panels: [], agent_brief: "",
    status: "not_ready", status_detail: "Scheduled execution is not enabled", vault_refs: [],
    selection_source: "default", updated_at: null, change_id: null, task_id: null,
  }],
  catalog: [], presets: [], changes: [], persistence: {available: false, migration: "0524"},
};
