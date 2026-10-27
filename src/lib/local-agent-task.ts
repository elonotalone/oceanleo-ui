import { htmlLang, normalizeLocale } from "../i18n/config";
import { epochMs, type CloudAgentAvailability, type CloudLiveSession } from "./execution-target";

/** Authoritative executor state; a requested stop is not a completed stop. */
export interface LocalAgentRun {
  runId: string;
  deviceId: string;
  state: string;
  desiredState: "run" | "pause" | "stop";
  revision: number;
  reportSeq: number;
  /**
   * Cloud-assistant runs only (device-link protocol §13): the loop runs in the
   * cloud and every tool on this computer. Absent on on-device runs and on
   * gateways that predate the cloud assistant; those keep today's UI.
   */
  driver?: "cloud";
  sessionId?: string;
  owner?: "ai" | "human";
  health?: LocalAgentHealth;
}
/** `plan.local_run.health` (bridge doc §17.9 kinds). Unknown kinds are kept as sent. */
export interface LocalAgentHealth { kind: string; since: number | null; lastContactAt: number | null; }
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
/** Session ids are `cas_` + a ULID today; anything URL-safe is accepted so a format change cannot hide the screen. */
const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const HEALTH_KIND = /^[a-z][a-z_]{0,39}$/;
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
  const run: LocalAgentRun = {runId: row.run_id, deviceId: row.device_id, state: row.state,
    desiredState: row.desired_state as LocalAgentRun["desiredState"], revision: Number(row.control_revision), reportSeq: Number(row.report_seq)};
  if (row.driver !== "cloud") return run;
  const health = record(row.health);
  return {...run, driver: "cloud",
    ...(typeof row.session_id === "string" && SESSION_ID.test(row.session_id) ? {sessionId: row.session_id} : {}),
    ...(row.owner === "ai" || row.owner === "human" ? {owner: row.owner} : {}),
    ...(typeof health.kind === "string" && HEALTH_KIND.test(health.kind)
      ? {health: {kind: health.kind, since: epochMs(health.since), lastContactAt: epochMs(health.last_contact_at)}} : {})};
}
export function taskLocalAgentState(task: {engine?: string | null; plan?: unknown}): {local: boolean; run: LocalAgentRun | null} {
  const plan = record(task.plan);
  return {local: task.engine === "local" || plan.local_run != null, run: parseLocalAgentRun(plan.local_run)};
}
export function newerLocalAgentRun(current: LocalAgentRun | null, next: LocalAgentRun | null): LocalAgentRun | null {
  if (!current || !next || current.runId !== next.runId) return next;
  if (next.revision !== current.revision) return next.revision < current.revision ? current : next;
  if (next.reportSeq !== current.reportSeq) return next.reportSeq < current.reportSeq ? current : next;
  // Equal counters. Cloud runs bump report_seq on every projection write
  // (device-link protocol §16 D13), so a different live view here is the newer
  // read of the same write and must still reach the screen.
  return next.state === current.state && next.desiredState === current.desiredState && sameCloudView(current, next) ? current : next;
}
function sameCloudView(a: LocalAgentRun, b: LocalAgentRun): boolean {
  return a.driver === b.driver && a.sessionId === b.sessionId && a.owner === b.owner && a.health?.kind === b.health?.kind &&
    a.health?.since === b.health?.since && a.health?.lastContactAt === b.health?.lastContactAt;
}
/** Not finished on the computer yet: the task page keeps reading it even when the task row is not `running`. */
export function localAgentRunLive(run: LocalAgentRun | null): boolean {
  return run !== null && !terminal.has(run.state);
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
  // History (C11-FW): deleting a computer task whose stop the computer has not confirmed yet.
  deleteStopPending: "这项任务还在电脑上运行，已请求电脑停止。电脑确认停止后，请再删除一次。",
} as const;
export type LocalAgentCopyKey = keyof typeof LOCAL_AGENT_COPY;

/**
 * Everything the web says about the cloud assistant using the user's computer
 * (device-link protocol `oceanleo-app/docs/react-client-rebuild/device-link/protocol.md`
 * §12–§13; texts from the bridge doc §17.9, which wins where the two differ).
 * Chinese source text rendered through `tt`; `i18n/ui/messages/cloud-agent-copy.ts`
 * translates every entry into the 16 other locales (typecheck fails on a gap).
 *
 * - `health*` are the fixed texts the gateway stores in `device_status`
 *   notices (no clock times, so a stored notice never goes stale); `live*`
 *   are the task-page templates filled with the viewer's own clock.
 * - `refused*` adapt the §17.9 reason texts to a refused create: a task that
 *   was refused must say it did not start and did not move to the cloud.
 * - The switch name quotes the desktop app's own label (`device_link/surfaces.rs`).
 */
export const CLOUD_AGENT_COPY = {
  // Target picker: one entry per computer (protocol §12.4).
  cloudUntil: "云端助手可用至 {time}",
  cloudAvailable: "云端助手可用",
  needsYou: "需要你在电脑前确认",
  cloudHint: "任务由 OceanLeo 云端助手使用这台电脑完成：思考在云端，每一步操作都在这台电脑上执行，你不在电脑前也能继续。",
  needsYouHint: "任务会由这台电脑上的本机 AI 执行，操作需要你在电脑前确认。要在离开电脑时也能继续，请在那台电脑的 OceanLeo 里打开「允许云端助手使用这台电脑」。",
  aiBusy: "这台电脑上还有一个 AI 操作没结束，请稍等。",
  // `POST /v1/agent/tasks` with `driver:"cloud"` refused (protocol §12.5).
  refusedDisabled: "这台电脑还没有允许云端助手，任务没有开始，也没有改到云端。请在那台电脑的 OceanLeo 里打开「允许云端助手使用这台电脑」后重新发送，或重新选择执行位置。",
  refusedExpired: "电脑上允许云端助手的时间已到，任务没有开始，也没有改到云端。请在那台电脑上续期后重新发送，或重新选择执行位置。",
  refusedBusy: "这台电脑上还有一个 AI 任务没结束，这项任务没有开始。请等它结束或先停止它，再重新发送。",
  refusedCleanup: "电脑上有一个中断的命令还没确认清理干净，任务没有开始。请在电脑上处理后重新发送。",
  refusedScope: "这项任务需要的权限超出了你在电脑上允许云端助手的范围，任务没有开始。请在电脑上调整后重新发送，或重新选择执行位置。",
  refusedUnavailable: "这台电脑现在不能使用云端助手，任务没有开始，也没有改到云端。请稍后重新发送，或重新选择执行位置。",
  dispatchFailed: "任务没有成功交给所选电脑，任务没有开始，也没有转到云端。请重新发送。",
  // Task page block for a cloud-assistant run.
  statusRunning: "云端助手正在使用你的电脑",
  statusConnecting: "正在连接你的电脑…",
  statusPaused: "任务已暂停；继续后 AI 会先重新查看屏幕。",
  subtitle: "由 OceanLeo 云端助手执行：思考在云端，每一步操作都在你的电脑上完成。关闭此页面不会停止任务。",
  ownerAi: "AI 正在操作",
  takeOver: "接管电脑",
  handBack: "交还给 AI",
  screenAlt: "电脑屏幕的最新画面",
  screenCaption: "最新画面 {time} · 只在服务器内存里，只有你能看到",
  // Health (bridge §17.9): the fixed notice texts, then the live-line templates.
  healthOk: "电脑已恢复，AI 会先重新查看屏幕再继续。",
  healthOffline: "你的电脑没有回应，可能已离线或休眠。",
  healthAsleep: "你的电脑已休眠，醒来后任务继续。",
  healthLocked: "电脑已锁屏，图形操作暂停；命令仍在运行。",
  healthHung: "你的电脑卡住了：当前这一步一直没有完成。",
  healthSignedOut: "你的电脑上已退出 OceanLeo 账号，任务已暂停。",
  healthCleanup: "电脑上有一个中断的命令还没确认清理干净；在电脑上处理后才能继续运行命令。",
  healthEnvelope: "电脑上允许云端助手的时间已到，需要在电脑上续期。",
  healthConfirm: "这一步需要你在电脑前确认。",
  healthHuman: "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。",
  healthOther: "你的电脑暂时不能执行操作，AI 正在等待。",
  liveOffline: "你的电脑 {duration}没有回应，可能已离线或休眠 · 上次联系 {time}",
  liveAsleep: "你的电脑已休眠 · 上次联系 {time}",
  liveHung: "你的电脑卡住了：这一步已经 {duration}没有完成",
  // Remote desktop opened from the task page (接管电脑).
  bannerAi: "AI 正在操作这台电脑；你一操作，AI 就会停手。",
  bannerResuming: "正在交还给 AI，它会先重新查看屏幕。",
  yourComputer: "你的电脑",
  // C11-FW. The `local_exec_disabled` notice kind (C11 contract §3; `paused` and
  // `ai_busy` reuse statusPaused / aiBusy), and the last contact under a notice.
  healthLocalExec: "电脑上的本机执行已关闭，任务在等待；在电脑上打开「允许云端下发本机任务」后继续。",
  noticeLastContact: "上次联系 {time}",
  // Remote desktop opened from 我的设备 on a session without a task to hand
  // back to (developer sessions): no 交还给 AI there, so no instruction to click it.
  bannerHuman: "你正在控制电脑，AI 已暂停。",
  // Consent for 接管电脑 and the remote desktop (C11 contract §2). The option is
  // the desktop app's own label in the envelope window (E, device_link/surfaces.rs).
  waitConsent: "等待电脑前有人同意这次远程控制…",
  takeOverAsk: "接管需要电脑前有人同意。",
  takeOverAskHint: "要在不在电脑前时也能直接接管，请在那台电脑的「允许云端助手使用这台电脑」里打开「授权期间允许我从手机/网页直接查看和接管这台电脑」。",
  // The remote desktop restored without a click (reload, back/forward): it asks
  // nothing of the computer until 连接 is clicked (W, 2026-10-27).
  remoteIdle: "尚未连接。点「连接」向这台电脑发出远程控制请求。",
} as const;
export type CloudAgentCopyKey = keyof typeof CLOUD_AGENT_COPY;

type CloudRefusalKey = Extract<CloudAgentCopyKey,
  "refusedDisabled" | "refusedExpired" | "refusedBusy" | "refusedCleanup" | "refusedScope" | "refusedUnavailable" | "dispatchFailed">;
type RefusalKey = LocalAgentCopyKey | CloudRefusalKey;
function refusalText(key: RefusalKey): string {
  return key in LOCAL_AGENT_COPY ? LOCAL_AGENT_COPY[key as LocalAgentCopyKey] : CLOUD_AGENT_COPY[key as CloudRefusalKey];
}

/** Wire codes on the local-task paths (`device_agent_v1`, task_service, device_task_target, the cloud driver). */
const CODE_COPY: Record<string, RefusalKey> = {
  LOCAL_EXEC_DISABLED: "localExecDisabled",
  LOCAL_AGENT_UNAVAILABLE: "localAgentUnavailable",
  DEVICE_SIGNED_OUT_OR_OFFLINE: "deviceOffline",
  DEVICE_OFFLINE: "deviceOffline",
  DEVICE_NOT_FOUND: "deviceNotFound",
  INVALID_EXECUTION_TARGET: "invalidTarget",
  LOCAL_AGENT_MODE_UNSUPPORTED: "modeUnsupported",
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
  // driver:"cloud" (protocol §12.5); `reason` picks the sentence, see CLOUD_REASON.
  CLOUD_AGENT_UNAVAILABLE: "refusedUnavailable",
  CLOUD_AGENT_DISPATCH_UNCONFIRMED: "dispatchUnconfirmed",
  // The handoff provably did not happen (the gateway read back no run).
  CLOUD_AGENT_DISPATCH_FAILED: "dispatchFailed",
  LOCAL_AGENT_DISPATCH_FAILED: "dispatchFailed",
};
/** `cloud_agent_unavailable.reason` (protocol §12.4/§12.5) → the sentence for that reason. */
const CLOUD_REASON: Record<string, RefusalKey> = {
  cloud_agent_disabled: "refusedDisabled",
  envelope_expired: "refusedExpired",
  ai_busy: "refusedBusy",
  cleanup_required: "refusedCleanup",
  outside_envelope: "refusedScope",
  local_exec_disabled: "localExecDisabled",
  link_lost: "deviceOffline",
  signed_out: "deviceOffline",
};
/** Plain-string details the gateway sends on the same paths; replaced, never shown raw. */
const TEXT_COPY: Record<string, RefusalKey> = {
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
const DEFINITE_REFUSALS = new Set<RefusalKey>([
  "localExecDisabled", "localAgentUnavailable", "deviceOffline", "deviceNotFound", "invalidTarget",
  "modeUnsupported", "attachmentsUnsupported", "payloadTooLarge", "payloadInvalid", "serviceUnavailable",
  "quotaUnfinished",
  "refusedDisabled", "refusedExpired", "refusedBusy", "refusedCleanup", "refusedScope", "refusedUnavailable", "dispatchFailed",
]);
const RAW_CODE = /^[A-Z][A-Z0-9_]{1,95}$/;

/** Own entries only: a server string such as "constructor" must not hit Object.prototype. */
function own(table: Record<string, RefusalKey>, key: string): RefusalKey | null {
  return Object.hasOwn(table, key) ? table[key] : null;
}
function copyKeyFor(error: string | null | undefined): RefusalKey | null {
  if (typeof error !== "string") return null;
  const text = error.trim();
  return own(TEXT_COPY, text) ?? own(CODE_COPY, text.toUpperCase());
}

/** The sentence for a known local-task code or gateway string; null for anything else. */
export function localAgentRefusalText(error: string | null | undefined): string | null {
  const key = copyKeyFor(error);
  return key ? refusalText(key) : null;
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
  result: { status?: number; error?: string; detail?: { code?: string; task_id?: string; reason?: string } },
  local: boolean,
): LocalAgentFailure | null {
  if (result.status === 401) return null;
  const code = String(result.detail?.code || result.error || "").trim();
  let key = copyKeyFor(code) ?? copyKeyFor(result.error);
  if (key === "refusedUnavailable") key = own(CLOUD_REASON, String(result.detail?.reason || "")) ?? key;
  if (key === "dispatchUnconfirmed") {
    const taskId = result.detail?.task_id;
    return typeof taskId === "string" && ID.test(taskId)
      ? {kind: "unconfirmed", text: LOCAL_AGENT_COPY.dispatchUnconfirmed, taskId}
      : {kind: "receipt_lost", text: LOCAL_AGENT_COPY.receiptLost};
  }
  if (key) return {kind: "refused", text: refusalText(key), definite: DEFINITE_REFUSALS.has(key)};
  if (!local) return null;
  const status = result.status ?? 0;
  if (status === 0 || status >= 500) return {kind: "receipt_lost", text: LOCAL_AGENT_COPY.receiptLost};
  return RAW_CODE.test(code) ? {kind: "refused", text: LOCAL_AGENT_COPY.unknownRefusal, definite: false} : null;
}

/**
 * What History (我的任务) says when deleting or loading a task fails: a
 * sentence, never a raw code. Deleting a computer task asks the computer to
 * stop it first; until the computer confirms, the gateway answers 409
 * `local_agent_stop_pending`. `fallback` is the caller's own Chinese sentence
 * for anything else that is only a code.
 */
export function taskRequestFailureText(
  result: {status?: number; error?: string; detail?: {code?: string}},
  fallback: string,
): string {
  const code = String(result.detail?.code || "").trim().toUpperCase();
  const error = typeof result.error === "string" ? result.error.trim() : "";
  if (code === "LOCAL_AGENT_STOP_PENDING" || error.toUpperCase() === "LOCAL_AGENT_STOP_PENDING") return LOCAL_AGENT_COPY.deleteStopPending;
  if (code === "TASK_NOT_FOUND" || own(TEXT_COPY, error) === "taskNotFound") return LOCAL_AGENT_COPY.taskNotFound;
  // Codes, bare HTTP statuses and the gateway's English task strings are not sentences for this page.
  if (!error || RAW_CODE.test(error) || /^HTTP \d{3}$/.test(error) || own(TEXT_COPY, error)) return fallback;
  return error;
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

// --------------------------------------------------------------------------
// Cloud-assistant runs: what the task page, the remote desktop and the
// transcript say. Pure; components pass their `tt` and the current time.
// --------------------------------------------------------------------------

/** `tt` from `useUI()`; kept structural so this module stays free of React. */
export type CloudAgentTranslate = (zh: string, vars?: Record<string, string | number>) => string;

/** Fresher numbers from the session route (protocol §12.1), when the page has them. */
export interface CloudAgentLive { lastContactAt?: number | null; currentElapsedMs?: number | null }

/**
 * Every `device_status` notice kind (C11 contract §3; protocol §13, bridge doc
 * §17.9): the ten health kinds of protocol §8.3, plus `paused`, `ai_busy` and
 * `local_exec_disabled` written by the cloud loop while a run has no session.
 * Each maps to one fixed sentence, translated in every locale.
 */
const HEALTH_TEXT: Record<string, CloudAgentCopyKey> = {
  ok: "healthOk", offline: "healthOffline", asleep: "healthAsleep", screen_locked: "healthLocked", hung: "healthHung",
  signed_out: "healthSignedOut", cleanup_required: "healthCleanup", envelope_expired: "healthEnvelope",
  needs_local_confirm: "healthConfirm", human_in_control: "healthHuman",
  paused: "statusPaused", ai_busy: "aiBusy", local_exec_disabled: "healthLocalExec",
};
/** The kinds above, for callers and tests that must cover all of them. */
export function deviceStatusKinds(): string[] { return Object.keys(HEALTH_TEXT); }
/** Waiting on a person or another AI: a state, not a fault. */
const PAUSE_KINDS = new Set(["needs_local_confirm", "human_in_control", "paused", "ai_busy"]);
/** The computer is not answering: the useful time is when it last did. */
const CONTACT_KINDS = new Set(["offline", "asleep"]);

/**
 * The text of a `device_status` notice (protocol §13): the bridge doc's fixed
 * sentence for a known kind (what the gateway stores), else the stored text.
 */
export function deviceStatusNoticeText(kind: unknown, stored: unknown): string {
  const key = typeof kind === "string" && Object.hasOwn(HEALTH_TEXT, kind) ? HEALTH_TEXT[kind] : undefined;
  if (key) return CLOUD_AGENT_COPY[key];
  return typeof stored === "string" && stored.trim() ? stored.trim().slice(0, 500) : CLOUD_AGENT_COPY.healthOther;
}
/**
 * What a `device_status` notice reads in the viewer's language. A known kind
 * is its translated fixed sentence. For a kind this build does not know, the
 * stored text is shown only when it is translated or the UI is Chinese;
 * everyone else reads the generic translated sentence, never untranslated
 * Chinese or a raw code. (`tt` returns its input when nothing is translated,
 * so a translated `healthOther` means a non-Chinese UI.)
 */
export function deviceStatusNoticeLine(kind: unknown, stored: unknown, tt: CloudAgentTranslate): string {
  const key = typeof kind === "string" && Object.hasOwn(HEALTH_TEXT, kind) ? HEALTH_TEXT[kind] : undefined;
  if (key) return tt(CLOUD_AGENT_COPY[key]);
  const generic = tt(CLOUD_AGENT_COPY.healthOther);
  const text = typeof stored === "string" ? stored.trim().slice(0, 500) : "";
  if (!text) return generic;
  const translated = tt(text);
  if (translated !== text) return translated;
  return generic === CLOUD_AGENT_COPY.healthOther ? text : generic;
}
/**
 * The time under a `device_status` notice, from its structured fields in the
 * viewer's own clock and time zone (the stored text has no times, bridge §17.9):
 * "上次联系 08:41" while the computer does not answer, else when the state began.
 */
export function deviceStatusNoticeTime(kind: unknown, health: unknown, tt: CloudAgentTranslate, now = Date.now()): string | null {
  const row = record(health);
  if (typeof kind === "string" && CONTACT_KINDS.has(kind)) {
    const contact = epochMs(row.last_contact_at);
    if (contact) return tt(CLOUD_AGENT_COPY.noticeLastContact, {time: formatClock(contact, now)});
  }
  const since = epochMs(row.since);
  return since ? formatClock(since, now) : null;
}
/** `ok` reads as recovered, pauses and waits as a state, everything else as a problem. */
export function cloudHealthTone(kind: unknown): "ok" | "pause" | "stuck" {
  return kind === "ok" ? "ok" : typeof kind === "string" && PAUSE_KINDS.has(kind) ? "pause" : "stuck";
}

/** The viewer's UI language for dates (the shell sets `<html lang>`). */
function dateLocale(): string {
  return htmlLang(normalizeLocale(typeof document === "undefined" ? undefined : document.documentElement?.lang));
}
/** A wall-clock time in the viewer's time zone: "08:41" today, with the date otherwise. */
export function formatClock(ms: number, now = Date.now()): string {
  const date = new Date(ms);
  const sameDay = date.toDateString() === new Date(now).toDateString();
  try {
    return new Intl.DateTimeFormat(dateLocale(), sameDay
      ? {hour: "2-digit", minute: "2-digit"}
      : {month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"}).format(date);
  } catch {
    return date.toISOString().slice(sameDay ? 11 : 5, 16).replace("T", " ");
  }
}
/** "18 秒" / "2 分钟" / "3 小时", through the shared unit translations. */
export function formatSpan(ms: number, tt: CloudAgentTranslate): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return tt("{n} 秒", {n: seconds});
  if (seconds < 3600) return tt("{n} 分钟", {n: Math.floor(seconds / 60)});
  return tt("{n} 小时", {n: Math.floor(seconds / 3600)});
}

/**
 * The live health line (bridge §17.9 client column), e.g. "你的电脑 2 分钟没有
 * 回应，可能已离线或休眠 · 上次联系 08:41". Null while the computer answers.
 */
export function cloudHealthLine(health: LocalAgentHealth | undefined, tt: CloudAgentTranslate, now: number,
  live: CloudAgentLive = {}): string | null {
  if (!health || health.kind === "ok") return null;
  const contact = Math.max(health.lastContactAt ?? 0, live.lastContactAt ?? 0) || null;
  if (health.kind === "offline") {
    return contact ? tt(CLOUD_AGENT_COPY.liveOffline, {duration: formatSpan(now - contact, tt), time: formatClock(contact, now)})
      : tt(CLOUD_AGENT_COPY.healthOffline);
  }
  if (health.kind === "asleep") {
    return contact ? tt(CLOUD_AGENT_COPY.liveAsleep, {time: formatClock(contact, now)}) : tt(CLOUD_AGENT_COPY.healthAsleep);
  }
  if (health.kind === "hung") {
    const elapsed = live.currentElapsedMs ?? (health.since ? now - health.since : null);
    return elapsed !== null && elapsed > 0 ? tt(CLOUD_AGENT_COPY.liveHung, {duration: formatSpan(elapsed, tt)})
      : tt(CLOUD_AGENT_COPY.healthHung);
  }
  return tt(deviceStatusNoticeText(health.kind, null));
}

function humanInControl(run: LocalAgentRun): boolean {
  return run.owner === "human" || run.health?.kind === "human_in_control";
}

/** The main status line of a cloud-assistant run. Intents are never shown as done. */
export function cloudRunStatus(run: LocalAgentRun, tt: CloudAgentTranslate, now: number, live?: CloudAgentLive): string {
  if (terminal.has(run.state) || run.desiredState === "stop" || (run.desiredState === "pause" && run.state !== "paused")) {
    return tt(localAgentStateText(run));
  }
  const health = cloudHealthLine(run.health, tt, now, live);
  if (health) return health;
  if (run.state === "paused") return tt(run.desiredState === "run" ? CLOUD_AGENT_COPY.bannerResuming : CLOUD_AGENT_COPY.statusPaused);
  if (run.state === "awaiting_approval") return tt(CLOUD_AGENT_COPY.healthConfirm);
  if (run.state === "queued" || run.state === "claimed") return tt(CLOUD_AGENT_COPY.statusConnecting);
  return tt(CLOUD_AGENT_COPY.statusRunning);
}

/** "AI 正在操作" while the AI holds the computer; a person in control is already said by the health line. */
export function cloudOwnerLine(run: LocalAgentRun): string | null {
  return run.driver === "cloud" && run.owner === "ai" && localAgentRunLive(run) && run.desiredState !== "stop" &&
    !humanInControl(run) ? CLOUD_AGENT_COPY.ownerAi : null;
}

export type CloudRunAction = "pause" | "resume" | "handBack" | "takeOver" | "stop";
/**
 * Controls for a live cloud-assistant run. Each is one revision-fenced control
 * request (`resume` for both 交还给 AI and 让 AI 重新观察并继续), never retried.
 * - A person holds the computer: 交还给 AI.
 * - Paused by the owner: 让 AI 重新观察并继续 (hidden while a resume is pending).
 * - The AI is working: 暂停.
 * - Always: 接管电脑 (pause, then the remote desktop) and 停止.
 */
export function cloudRunActions(run: LocalAgentRun | null): CloudRunAction[] {
  if (!run || run.driver !== "cloud" || terminal.has(run.state) || run.desiredState === "stop") return [];
  const actions: CloudRunAction[] = [];
  if (humanInControl(run)) {
    if (localAgentCanControl(run, "resume")) actions.push("handBack");
  } else if (run.state === "paused") {
    if (run.desiredState !== "run") actions.push("resume");
  } else if (localAgentCanControl(run, "pause")) actions.push("pause");
  actions.push("takeOver", "stop");
  return actions;
}

/**
 * What the remote desktop opened from a task says about the AI on that
 * computer; null when no cloud-assistant run is live. `handBack` = show 交还给 AI.
 */
export function remoteDesktopAgentBanner(run: LocalAgentRun | null): {text: string; handBack: boolean} | null {
  if (!run || run.driver !== "cloud" || terminal.has(run.state) || run.desiredState === "stop") return null;
  if (humanInControl(run)) return {text: CLOUD_AGENT_COPY.healthHuman, handBack: localAgentCanControl(run, "resume")};
  if (run.state === "paused") {
    return run.desiredState === "run" ? {text: CLOUD_AGENT_COPY.bannerResuming, handBack: false}
      : {text: CLOUD_AGENT_COPY.statusPaused, handBack: true};
  }
  if (run.state === "awaiting_approval") return {text: CLOUD_AGENT_COPY.healthConfirm, handBack: false};
  if (run.health && run.health.kind !== "ok") return {text: deviceStatusNoticeText(run.health.kind, null), handBack: false};
  if (run.state === "queued" || run.state === "claimed") return {text: CLOUD_AGENT_COPY.statusConnecting, handBack: false};
  return {text: CLOUD_AGENT_COPY.bannerAi, handBack: false};
}

/**
 * The same banner for the remote desktop opened from 我的设备, found through
 * the computer's `live_session` (C11 contract §4). With the task's projection
 * of that same session it is exactly the task page's banner, 交还给 AI
 * included. Without one (a developer session has no task; or the projection
 * is not read yet) it only says who is in control and never offers 交还给 AI,
 * which needs the run's control revision.
 */
export function deviceAgentBanner(live: CloudLiveSession | null, run: LocalAgentRun | null): {text: string; handBack: boolean} | null {
  if (!live) return null;
  if (run?.driver === "cloud" && (!run.sessionId || run.sessionId === live.sessionId)) return remoteDesktopAgentBanner(run);
  if (live.owner === "human") return {text: CLOUD_AGENT_COPY.bannerHuman, handBack: false};
  if (live.state === "paused") return {text: CLOUD_AGENT_COPY.statusPaused, handBack: false};
  if (live.state === "stuck") return {text: CLOUD_AGENT_COPY.healthOther, handBack: false};
  if (live.state === "offered") return {text: CLOUD_AGENT_COPY.statusConnecting, handBack: false};
  return {text: CLOUD_AGENT_COPY.bannerAi, handBack: false};
}

/** How the owner's remote-desktop request reaches this computer (C11 contract §2). */
export type RemoteConsent = "direct" | "ask";
/**
 * - `direct`: the computer's envelope lets its owner take over without a
 *   dialog (`remote_takeover`, until the envelope's `until`), or this browser
 *   already holds a standing grant (永久同意) on that computer.
 * - `ask`: someone at the computer has to click 同意本次 (also when this
 *   browser's grants cannot be read: the line then sets the safe expectation).
 * - null: the gateway does not report `remote_takeover` (older gateways, or no
 *   availability route), or this browser's grant is still being read
 *   (`standingGrant` undefined): today's wording, no line that could flicker.
 */
export function remoteConsent(row: Pick<CloudAgentAvailability, "remoteTakeover" | "until"> | null | undefined,
  standingGrant: boolean | null | undefined, now = Date.now()): RemoteConsent | null {
  if (!row || row.remoteTakeover === null) return null;
  if (row.remoteTakeover && (row.until === null || row.until > now)) return "direct";
  if (standingGrant === undefined) return null;
  return standingGrant ? "direct" : "ask";
}
