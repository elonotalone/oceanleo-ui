"use client";

import { cloudComputerRequest, type Computer, type MoneyAmount } from "./cloud-computer-api";

export type MetricRange = "1h" | "6h" | "24h" | "7d";
export type CloudMetric = "cpu" | "memory" | "disk" | "net_in" | "net_out";
export type ServerOverview = {
  source: "aliyun" | "byo"; managed: boolean;
  region_id: string | null; zone_id: string | null; instance_type: string | null;
  vcpu: number | null; memory_gb: number | null; public_ip: string | null; private_ip: string | null;
  os_name: string | null; disks: {disk_id: string; kind: "system" | "data"; size_gb: number; category: string}[] | null;
  created_at: string | null; expires_at: string | null; billing_mode: string | null;
  cloud_status: string | null; security_group_ids: string[] | null;
  node: {version: string; os: string; os_version: string; arch: string; hostname: string; kernel: string; cpus: number; mem_bytes: number} | null;
};
export type MetricPoint = {
  t: string; cpu_percent: number | null; mem_used_bytes: number | null; mem_total_bytes: number | null;
  net_rx_bps: number | null; net_tx_bps: number | null;
  disks: {mount: string; used_bytes: number; total_bytes: number}[];
};
export type NodeMetrics = {source: "node"; points: MetricPoint[]; latest: MetricPoint | null; needs_node_upgrade: boolean};
export type CloudMonitoring = {metric: CloudMetric; unit: string; source: "cloud"; points: {t: string; v: number}[]};
export type CustomInfo = {source: "device"; reported_at: string | null; items: {key: string; label: string; value: string}[]};
export type ServerNode = {version: string; latest_version: string | null; needs_upgrade: boolean; auto_upgrade: boolean; auto_upgrade_available: boolean; caps: string[]};
export type SnapshotPolicy = {enabled: boolean; time_utc: string; retention_days: number};
export type RescueFailure = {code: string; message: string; missing_action?: string; policy_hint?: unknown};
export type RescueOperation = {operation_name: string | null; operation_stage: string | null; operation_active: boolean | null; operation_error: string | null};
export type Snapshot = {id: string; disk_id: string; kind: "auto" | "manual"; size_gb: number | null; created_at: string; status: string; note: string};
export type Snapshots = {items: Snapshot[]; policy: SnapshotPolicy; monthly_cost: MoneyAmount | null; policy_choice: SnapshotPolicy | null; policy_error: RescueFailure | null; billing_unavailable_reason: string | null; operation: RescueOperation};
export type ReinstallResult = Computer & {node_status: "awaiting_enrolment"};
export type SecurityRule = {id: string; direction: "in" | "out"; protocol: string; port_range: string; source: string; policy: "accept" | "drop"; description: string};
export type SecurityRules = {rules: SecurityRule[]; shared: boolean};
export type RuleInput = Omit<SecurityRule, "id"> & {confirmed?: boolean; dedicated_group_confirmed?: boolean};
export type Diagnosis = {
  state: "ok" | "node_offline" | "os_down" | "stopped" | "unpaid" | "expired" | "network_blocked" | "disk_full" | "unknown";
  findings: {code: string; text: string}[];
  suggested: {action: string; text: string; needs_confirmation: boolean}[];
};
export type SystemEvents = {items: {id: string; type: string; status: string; at: string; text: string}[]};
export type UsageLimit = {monthly_limit: MoneyAmount | null; on_reach: "stop" | "notify"; used: MoneyAmount; reached: boolean};
export type LimitInput = Pick<UsageLimit, "monthly_limit" | "on_reach">;

/** All ids are encoded as path segments; owner authorization stays with the gateway. */
export function createServerPageApi(request: typeof cloudComputerRequest = cloudComputerRequest) {
  const path = (id: string, suffix: string) => `/v1/computers/${encodeURIComponent(id)}${suffix}`;
  const send = <T>(id: string, suffix: string, method: string, body?: unknown) => request<T>(path(id, suffix), {
    method, ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  return {
    getOverview: (id: string) => request<ServerOverview>(path(id, "/cloud/overview")),
    getMetrics: (id: string, range: MetricRange) => request<NodeMetrics>(path(id, `/metrics?range=${range}`)),
    getCloudMonitor: (id: string, metric: CloudMetric, range: MetricRange) => request<CloudMonitoring>(path(id, `/cloud/monitor?metric=${metric}&range=${range}`)),
    getSystemEvents: (id: string) => request<SystemEvents>(path(id, "/cloud/system-events")),
    getCustomInfo: (id: string) => request<CustomInfo>(path(id, "/custom-info")),
    getNode: (id: string) => request<ServerNode>(path(id, "/node")),
    setAutoUpgrade: (id: string, enabled: boolean) => send<ServerNode>(id, "/node/auto-upgrade", "PUT", {enabled}),
    reboot: (id: string, force: boolean) => send<Computer>(id, "/reboot", "POST", {force}),
    getSnapshots: (id: string) => request<Snapshots>(path(id, "/snapshots")),
    createSnapshot: (id: string, note: string) => send<{items: {id: string; disk_id: string}[]}>(id, "/snapshots", "POST", {note}),
    deleteSnapshot: (id: string, snapshotId: string, confirmed = false) => send<{ok: true}>(id, `/snapshots/${encodeURIComponent(snapshotId)}`, "DELETE", {confirmed}),
    setSnapshotPolicy: (id: string, policy: SnapshotPolicy) => send<Snapshots>(id, "/snapshots/policy", "PUT", policy),
    rollback: (id: string, snapshotId: string, confirmed: boolean) => send<Computer>(id, `/snapshots/${encodeURIComponent(snapshotId)}/rollback`, "POST", {confirmed}),
    reinstall: (id: string, confirmed: boolean) => send<ReinstallResult>(id, "/reinstall", "POST", {confirmed, keep_data_disks: true}),
    diagnose: (id: string) => send<Diagnosis>(id, "/rescue/diagnose", "POST"),
    getRules: (id: string) => request<SecurityRules>(path(id, "/security-group")),
    addRule: (id: string, rule: RuleInput) => send<SecurityRules>(id, "/security-group/rules", "POST", rule),
    deleteRule: (id: string, ruleId: string, confirmed = false, dedicatedGroupConfirmed = false) => send<SecurityRules>(id, `/security-group/rules/${encodeURIComponent(ruleId)}`, "DELETE", {confirmed, dedicated_group_confirmed: dedicatedGroupConfirmed}),
    getUsageLimit: (id: string) => request<UsageLimit>(path(id, "/usage-limit")),
    setUsageLimit: (id: string, limit: LimitInput) => send<UsageLimit>(id, "/usage-limit", "PUT", limit),
  };
}
export const serverPageApi = createServerPageApi();
export type ServerPageClient = ReturnType<typeof createServerPageApi>;
