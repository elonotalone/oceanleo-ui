import type { Computer, MoneyAmount } from "./cloud-computer-api";
import type { ServerPageClient } from "./server-page-api";

// Checked by tsc: these response fixtures follow the backend RESULT contracts.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Result<K extends keyof ServerPageClient> = Awaited<ReturnType<ServerPageClient[K]>>;
type Policy = {enabled: boolean; time_utc: string; retention_days: number};
type Failure = {code: string; message: string; missing_action?: string; policy_hint?: unknown};
type SnapshotView = {
  items: {id: string; disk_id: string; kind: "auto" | "manual"; size_gb: number | null; created_at: string | null; status: string; note: string}[];
  policy: Policy; monthly_cost: MoneyAmount | null; policy_choice: Policy | null; policy_error: Failure | null;
  billing_unavailable_reason: string | null;
  operation: {operation_name: string | null; operation_stage: string | null; operation_active: boolean | null; operation_error: string | null};
};
type RulesView = {rules: {id: string; direction: "in" | "out"; protocol: string; port_range: string; source: string; policy: "accept" | "drop"; description: string}[]; shared: boolean};
type NodeView = {version: string; latest_version: string; needs_upgrade: boolean; auto_upgrade: boolean; auto_upgrade_available: boolean; caps: string[]};
// D11: provider fields and older node facts use explicit nulls, not empty strings.
export const partialOverview: Result<"getOverview"> = {
  source: "aliyun", managed: true, region_id: null, zone_id: null, instance_type: null,
  vcpu: null, memory_gb: null, public_ip: null, private_ip: null, os_name: null,
  disks: [{disk_id: "disk-owned", kind: "system", size_gb: null, category: null}],
  created_at: null, expires_at: null, billing_mode: null, cloud_status: null, security_group_ids: [],
  node: {version: "old", os: null, os_version: null, arch: null, hostname: null, kernel: null, cpus: null, mem_bytes: null},
};
export const partialEvents: Result<"getSystemEvents"> = {items: [{id: null, type: null, status: null, at: null, text: "Cloud event"}]};
export const snapshotWithoutTime: Result<"getSnapshots">["items"][number] = {
  id: "s", disk_id: "d", kind: "manual", size_gb: null, created_at: null, status: "unknown", note: "",
};
export type ServerPageResponseContract = [
  Assert<Equal<Result<"getSnapshots">, SnapshotView>>,
  Assert<Equal<Result<"setSnapshotPolicy">, SnapshotView>>,
  Assert<Equal<Result<"createSnapshot">, {items: {id: string; disk_id: string}[]}>>,
  Assert<Equal<Result<"deleteSnapshot">, {ok: true}>>,
  Assert<Equal<Result<"rollback">, Computer>>,
  Assert<Equal<Result<"reinstall">, Computer & {node_status: "awaiting_enrolment"}>>,
  Assert<Equal<Result<"getRules">, RulesView>>,
  Assert<Equal<Result<"addRule">, RulesView>>,
  Assert<Equal<Result<"deleteRule">, RulesView>>,
  Assert<Equal<Result<"getNode">, NodeView>>,
  Assert<Equal<Result<"setAutoUpgrade">, NodeView>>,
];
