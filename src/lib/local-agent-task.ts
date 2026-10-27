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
/**
 * What the user reads when a task aimed at a paired computer is refused, or
 * its receipt is lost. Chinese source text: every surface renders it through
 * `tt`, and `i18n/ui/messages/local-agent-copy.ts` translates every entry into
 * all 17 locales (typecheck fails when a locale misses one). `agent.ts` keeps
 * the upper-cased wire code in `error` for other callers, so a local-agent
 * code must never reach the screen without passing through this table.
 *
 * The switch name and the page name quote the desktop app's own labels
 * (`oceanleo-app` tray + security page), so the user can find them.
 */
export const LOCAL_AGENT_COPY = {
  localExecDisabled: "所选电脑没有开启本机执行，任务没有开始，也没有转到云端。请在那台电脑的 OceanLeo「设备与授权」里打开「允许云端下发本机任务」后重新发送，或把执行位置改成云端。",
  localAgentUnavailable: "所选电脑上的 OceanLeo 本地 AI 还没有就绪，任务没有开始，也没有转到云端。请在那台电脑上打开并登录 OceanLeo，半分钟后重新发送，或把执行位置改成云端。",
  deviceOffline: "所选电脑离线或没有登录，任务没有开始，也没有转到云端。请在那台电脑上打开并登录 OceanLeo 后重新发送，或把执行位置改成云端。",
  deviceNotFound: "找不到所选电脑，它可能已被移除或撤销连接。请在「我的设备」核对后重新选择执行位置。",
  invalidTarget: "所选执行位置无效，任务没有开始。请重新选择执行位置后再发送。",
  modeUnsupported: "这种任务模式不能交给电脑执行，任务没有开始。请改用云端，或换成普通任务后重新发送。",
  targetMismatch: "这项任务已经绑定另一台电脑。要换执行位置，请新建任务。",
  stillRunning: "这项任务还没有结束。请等它结束，或先停止它，再继续发送。",
  attachmentsUnsupported: "交给电脑的任务暂不支持附件，任务没有开始。请先把文件放进那台电脑已授权的文件夹，再在任务里写明文件位置。",
  payloadTooLarge: "任务内容太长，电脑无法接收，任务没有开始。请缩短后重新发送。",
  payloadInvalid: "任务内容无法交给电脑，任务没有开始。请修改后重新发送。",
  serviceUnavailable: "电脑任务服务暂时不可用，任务没有开始，也没有转到云端。请稍后重新发送。",
  quotaUnfinished: "你的电脑上未完成的任务已达到上限，这项任务没有开始。请等它们结束或先停止，再重新发送。",
  taskNotFound: "找不到这项任务，它可能已被删除。请刷新页面后再试。",
  unknownRefusal: "任务没有开始，也没有转到云端。请稍后重新发送，或把执行位置改成云端。",
  dispatchUnconfirmed: "没有收到电脑的回执：这项任务可能已经交给电脑。下面显示的是它的实际状态；确认它没有开始之前，请不要再次发送。",
  receiptLost: "没有收到电脑的回执：任务可能已经交给电脑。请先到「我的任务」核对，确认它没有开始，再重新发送。",
  localExecOff: "本机执行未开启",
  localExecOffHint: "这台电脑没有开启本机执行，交给它的任务不会运行。请在这台电脑的 OceanLeo「设备与授权」里打开「允许云端下发本机任务」，或改用云端。",
} as const;
export type LocalAgentCopyKey = keyof typeof LOCAL_AGENT_COPY;

/** Wire codes on the local-task paths (`device_agent_v1`, task_service, device_task_target). */
const CODE_COPY: Record<string, LocalAgentCopyKey> = {
  LOCAL_EXEC_DISABLED: "localExecDisabled",
  LOCAL_AGENT_UNAVAILABLE: "localAgentUnavailable",
  DEVICE_SIGNED_OUT_OR_OFFLINE: "deviceOffline",
  DEVICE_OFFLINE: "deviceOffline",
  DEVICE_NOT_FOUND: "deviceNotFound",
  INVALID_EXECUTION_TARGET: "invalidTarget",
  EXECUTION_TARGET_MISMATCH: "targetMismatch",
  LOCAL_AGENT_STILL_RUNNING: "stillRunning",
  LOCAL_AGENT_ATTACHMENTS_UNSUPPORTED: "attachmentsUnsupported",
  LOCAL_AGENT_PAYLOAD_TOO_LARGE: "payloadTooLarge",
  LOCAL_AGENT_PAYLOAD_INVALID: "payloadInvalid",
  PAYLOAD_INVALID: "payloadInvalid",
  LOCAL_AGENT_SCHEMA_MISSING: "serviceUnavailable",
  LOCAL_AGENT_STORAGE_UNAVAILABLE: "serviceUnavailable",
  DEVICE_SERVICE_UNAVAILABLE: "serviceUnavailable",
  QUOTA_UNFINISHED_TASKS: "quotaUnfinished",
  TASK_NOT_FOUND: "taskNotFound",
  LOCAL_AGENT_DISPATCH_UNCONFIRMED: "dispatchUnconfirmed",
};
/** Plain-string details the gateway sends on the same paths; replaced, never shown raw. */
const TEXT_COPY: Record<string, LocalAgentCopyKey> = {
  "所选电脑未登录或已离线，任务没有改到其他设备执行。": "deviceOffline",
  "此任务已绑定本地电脑；更换执行位置请新建任务。": "targetMismatch",
  "此模式不能执行本地任务，请使用任务模式。": "modeUnsupported",
  "本地电脑暂不支持此任务模式，请使用单人任务。": "modeUnsupported",
  "请先将附件放到电脑的授权目录，再发起本地任务。": "attachmentsUnsupported",
  "task is still running": "stillRunning",
  "task not found": "taskNotFound",
};
/**
 * Refusals that prove nothing was handed to the computer for a new task: the
 * gateway refuses before creating the task, or marks it failed when enqueue
 * itself refuses (no device run row, no message). Only these allow a caller to
 * discard the draft it created for that task.
 */
const DEFINITE_REFUSALS = new Set<LocalAgentCopyKey>([
  "localExecDisabled", "localAgentUnavailable", "deviceOffline", "deviceNotFound", "invalidTarget",
  "modeUnsupported", "attachmentsUnsupported", "payloadTooLarge", "payloadInvalid", "serviceUnavailable",
  "quotaUnfinished",
]);
const RAW_CODE = /^[A-Z][A-Z0-9_]{1,95}$/;

function copyKeyFor(error: string | null | undefined): LocalAgentCopyKey | null {
  if (typeof error !== "string") return null;
  const text = error.trim();
  return TEXT_COPY[text] ?? CODE_COPY[text.toUpperCase()] ?? null;
}

/** The sentence for a known local-task code or gateway string; null for anything else. */
export function localAgentRefusalText(error: string | null | undefined): string | null {
  const key = copyKeyFor(error);
  return key ? LOCAL_AGENT_COPY[key] : null;
}
export function localAgentRefusalCodes(): string[] { return Object.keys(CODE_COPY); }

export type LocalAgentFailure =
  /** The gateway refused. `definite` = provably nothing was handed to the computer. */
  | { kind: "refused"; text: string; definite: boolean }
  /** The handoff may be committed: show this same task, never dispatch a second one. */
  | { kind: "unconfirmed"; text: string; taskId: string }
  /** No receipt and no task identity: the user has to check before sending again. */
  | { kind: "receipt_lost"; text: string };

/**
 * Classify a failed create/follow-up. `local` = the request was aimed at a
 * paired computer (a known local code is recognised either way). Returns null
 * when this is not a local-task failure, so the caller keeps its own copy.
 */
export function localAgentFailure(
  result: { status?: number; error?: string; detail?: { code?: string; task_id?: string } },
  local: boolean,
): LocalAgentFailure | null {
  if (result.status === 401) return null;
  const code = String(result.detail?.code || result.error || "").trim();
  const key = copyKeyFor(code) ?? copyKeyFor(result.error);
  if (key === "dispatchUnconfirmed") {
    const taskId = result.detail?.task_id;
    return typeof taskId === "string" && ID.test(taskId)
      ? {kind: "unconfirmed", text: LOCAL_AGENT_COPY.dispatchUnconfirmed, taskId}
      : {kind: "receipt_lost", text: LOCAL_AGENT_COPY.receiptLost};
  }
  if (key) return {kind: "refused", text: LOCAL_AGENT_COPY[key], definite: DEFINITE_REFUSALS.has(key)};
  if (!local) return null;
  const status = result.status ?? 0;
  if (status === 0 || status >= 500) return {kind: "receipt_lost", text: LOCAL_AGENT_COPY.receiptLost};
  return RAW_CODE.test(code) ? {kind: "refused", text: LOCAL_AGENT_COPY.unknownRefusal, definite: false} : null;
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
