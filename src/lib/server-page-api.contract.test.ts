import type { Computer, MoneyAmount } from "./cloud-computer-api";
import type { ServerPageClient } from "./server-page-api";

// Checked by tsc: these response fixtures follow the backend RESULT contracts.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type Result<K extends keyof ServerPageClient> = Awaited<ReturnType<ServerPageClient[K]>>;
type Policy = {enabled: boolean; time_utc: string; retention_days: number};
type Failure = {code: string; message: string; missing_action?: string; policy_hint?: unknown};
type SnapshotView = {
  items: {id: string; disk_id: string; kind: "auto" | "manual"; size_gb: number | null; created_at: string; status: string; note: string}[];
  policy: Policy; monthly_cost: MoneyAmount | null; policy_choice: Policy | null; policy_error: Failure | null;
  billing_unavailable_reason: string | null;
  operation: {operation_name: string | null; operation_stage: string | null; operation_active: boolean | null; operation_error: string | null};
};
type RulesView = {rules: {id: string; direction: "in" | "out"; protocol: string; port_range: string; source: string; policy: "accept" | "drop"; description: string}[]; shared: boolean};
type NodeView = {version: string; latest_version: string | null; needs_upgrade: boolean; auto_upgrade: boolean; auto_upgrade_available: boolean; caps: string[]};
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
