/** Authoritative executor state; a requested stop is not a completed stop. */
export interface LocalAgentRun {
  runId: string;
  deviceId: string;
  state: string;
  desiredState: "run" | "pause" | "stop";
  revision: number;
  reportSeq: number;
}
export type LocalAgentControl = "pause" | "resume" | "stop";
export interface LocalTaskArtifact { artifactId: string; revisionId: string; title: string; }
export function localTaskArtifacts(plan: unknown): LocalTaskArtifact[] {
  const rows = record(plan).local_artifacts;
  const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows.slice(0, 100) : []).flatMap(value => {
    const row = record(value);
    if (row.source !== "local_private_artifact" || typeof row.artifactId !== "string" || !uuid.test(row.artifactId) ||
      typeof row.revisionId !== "string" || !uuid.test(row.revisionId)) return [];
    const key = `${row.artifactId}:${row.revisionId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{artifactId: row.artifactId, revisionId: row.revisionId, title: typeof row.title === "string" ? row.title.slice(0, 300) : ""}];
  });
}
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const states = new Set(["queued", "claimed", "running", "paused", "awaiting_approval", "succeeded", "failed", "denied", "cancelled", "interrupted", "expired"]);
const terminal = new Set(["succeeded", "failed", "denied", "cancelled", "interrupted", "expired"]);
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function parseLocalAgentRun(value: unknown): LocalAgentRun | null {
  const row = record(value);
  if (typeof row.run_id !== "string" || !ID.test(row.run_id) || typeof row.device_id !== "string" || !ID.test(row.device_id) ||
      typeof row.state !== "string" || !states.has(row.state) || !["run", "pause", "stop"].includes(String(row.desired_state)) ||
      !Number.isSafeInteger(row.control_revision) || Number(row.control_revision) < 0 ||
      !Number.isSafeInteger(row.report_seq) || Number(row.report_seq) < 0) return null;
  return {runId: row.run_id, deviceId: row.device_id, state: row.state,
    desiredState: row.desired_state as LocalAgentRun["desiredState"], revision: Number(row.control_revision), reportSeq: Number(row.report_seq)};
}
export function taskLocalAgentState(task: {engine?: string | null; plan?: unknown}): {local: boolean; run: LocalAgentRun | null} {
  const plan = record(task.plan);
  return {local: task.engine === "local" || plan.local_run != null, run: parseLocalAgentRun(plan.local_run)};
}
export function newerLocalAgentRun(current: LocalAgentRun | null, next: LocalAgentRun | null): LocalAgentRun | null {
  if (!current || !next || current.runId !== next.runId) return next;
  return next.revision < current.revision || (next.revision === current.revision && next.reportSeq <= current.reportSeq &&
    (next.reportSeq < current.reportSeq || (next.state === current.state && next.desiredState === current.desiredState))) ? current : next;
}
export function localAgentCanControl(run: LocalAgentRun | null, action: LocalAgentControl): boolean {
  if (!run || terminal.has(run.state) || run.desiredState === "stop") return false;
  if (action === "stop") return true;
  // Human takeover pauses locally without changing the server's run intent.
  if (action === "resume") return run.state === "paused";
  return run.state !== "paused" && run.desiredState === "run";
}
export function localAgentStateText(run: LocalAgentRun | null): string {
  if (!run) return "电脑执行状态暂不可用，正在重新核对；不会自动重跑。";
  if (!terminal.has(run.state)) {
    if (run.desiredState === "stop") return "正在请求电脑停止，等待执行端确认";
    if (run.desiredState === "pause" && run.state !== "paused") return "正在请求暂停，等待电脑确认";
    if (run.desiredState === "run" && run.state === "paused") return "AI 已暂停；需释放人工控制并明确继续，重新观察后执行";
  }
  return ({queued: "等待电脑领取", claimed: "电脑已领取", running: "电脑上的 AI 正在执行", paused: "AI 已暂停",
    awaiting_approval: "等待电脑上的权限确认", succeeded: "电脑任务已完成", failed: "电脑任务失败", denied: "电脑拒绝执行",
    cancelled: "电脑已确认停止", interrupted: "任务已中断，请核对本机执行状态；未自动重跑", expired: "任务已过期"} as Record<string, string>)[run.state];
}
