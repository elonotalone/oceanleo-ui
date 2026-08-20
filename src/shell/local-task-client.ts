"use client";

import { isUnsupportedShellCommand } from "../api/device-error-copy";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export const LOCAL_ACTION_KINDS = [
  "fs.list",
  "fs.read_summary",
  "file.write",
  "python.run",
  "shell.run",
  "app.open",
] as const;

export type LocalActionKind = (typeof LOCAL_ACTION_KINDS)[number];

export interface LocalActionPayloadByKind {
  "fs.list": { path: string };
  "fs.read_summary": { path: string };
  "file.write": { path: string; content_b64: string };
  "python.run": { cwd: string; code: string };
  "shell.run": { cwd: string; command: string };
  "app.open": { path: string };
}

export type LocalActionPayload<K extends LocalActionKind> =
  LocalActionPayloadByKind[K];

export const LOCAL_TASK_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
] as const;

export type LocalTaskStatus = (typeof LOCAL_TASK_STATUSES)[number];

export type LocalTaskDenyReason =
  | "local_exec_disabled"
  | "grant_missing"
  | "path_outside_grant"
  | "confirm_timeout"
  | "user_denied"
  | "command_unsupported"
  | "revoked";

export interface LocalTaskSummaryFile {
  name: string;
  bytes: number;
  kind: string;
}

/** The complete browser-visible allowlist from protocol §5.3. */
export interface LocalTaskResultSummary {
  entries?: number;
  bytes?: number;
  columns?: string[];
  rows?: number;
  /** `fs.read_summary` only: `"file"` or `"directory"` (contract §2). */
  kind?: string;
  files?: LocalTaskSummaryFile[];
  exit_code?: number;
  output_bytes?: number;
  stdout_tail?: string;
  stderr_tail?: string;
}

export interface LocalTask {
  status: LocalTaskStatus;
  actionKind?: LocalActionKind;
  resultSummary?: LocalTaskResultSummary;
  denyReason?: LocalTaskDenyReason;
  /**
   * The audit fingerprint the gateway already returns in `_public_task` but the
   * browser used to throw away. Without it the action console can only show a
   * spinner, and "什么时候、对哪个路径、做了什么" would have to be guessed from
   * whatever the page happened to remember.
   */
  taskId?: string;
  createdAt?: string;
  claimedAt?: string;
  finishedAt?: string;
  /** `path` or `cwd` echoed from the request; never file contents. */
  target?: string;
  /** `shell.run` only: the command the user themselves submitted. */
  command?: string;
}

export interface CreatedLocalTask {
  taskId: string;
  offline: boolean;
}

export class LocalTaskApiError extends Error {
  readonly code: string;
  readonly status: number;
  /** Quota ceiling named by the server, when it names one. */
  readonly limit?: number;

  constructor(code: string, status: number, limit?: number) {
    super(code);
    this.name = "LocalTaskApiError";
    this.code = code;
    this.status = status;
    if (limit !== undefined) this.limit = limit;
  }
}

interface JsonObject {
  [key: string]: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function errorCode(payload: unknown, status: number): string {
  if (isObject(payload)) {
    const direct = stringField(payload.code) || stringField(payload.error_code);
    if (direct) return direct;
    // Contract §1.2b makes `detail` an object; a plain string is the older
    // shape and still has to resolve, or a stale gateway turns every refusal
    // into an unknown code.
    if (isObject(payload.detail)) {
      const nested =
        stringField(payload.detail.code) || stringField(payload.detail.error_code);
      if (nested) return nested;
    }
    if (typeof payload.detail === "string" && payload.detail) return payload.detail;
  }
  return status === 401 ? "unauthorized" : `http_${status}`;
}

function errorLimit(payload: unknown): number | undefined {
  if (!isObject(payload)) return undefined;
  const nested = isObject(payload.detail) ? payload.detail.limit : undefined;
  // Contract §1.2b puts the ceiling on `detail`; a top-level `limit` is only
  // tolerated so an older or proxied shape still reaches the same sentence.
  for (const candidate of [nested, payload.limit]) {
    const parsed = numberField(candidate);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await accessToken();
  if (!token) throw new LocalTaskApiError("unauthorized", 401);

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new LocalTaskApiError("network_error", 0);
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LocalTaskApiError(
      errorCode(payload, response.status),
      response.status,
      errorLimit(payload),
    );
  }
  return payload;
}

function isStatus(value: unknown): value is LocalTaskStatus {
  return LOCAL_TASK_STATUSES.some((status) => status === value);
}

function isActionKind(value: unknown): value is LocalActionKind {
  return LOCAL_ACTION_KINDS.some((actionKind) => actionKind === value);
}

function isDenyReason(value: unknown): value is LocalTaskDenyReason {
  return [
    "local_exec_disabled",
    "grant_missing",
    "path_outside_grant",
    "confirm_timeout",
    "user_denied",
    "command_unsupported",
    "revoked",
  ].some((reason) => reason === value);
}

/**
 * Drop every field that is not explicitly allowed by protocol §5.3. This is a
 * browser-side defence in depth; the server performs the authoritative filter.
 */
export function sanitizeLocalTaskSummary(
  value: unknown,
  actionKind?: LocalActionKind,
): LocalTaskResultSummary | undefined {
  if (!isObject(value)) return undefined;
  const summary: LocalTaskResultSummary = {};
  const entries = numberField(value.entries);
  const bytes = numberField(value.bytes);
  const rows = numberField(value.rows);
  const exitCode = numberField(value.exit_code);
  const outputBytes = numberField(value.output_bytes);
  if (actionKind === "shell.run") {
    if (exitCode !== undefined) summary.exit_code = exitCode;
    if (outputBytes !== undefined) summary.output_bytes = outputBytes;
    return Object.keys(summary).length > 0 ? summary : undefined;
  }
  if (entries !== undefined) summary.entries = entries;
  if (bytes !== undefined) summary.bytes = bytes;
  if (rows !== undefined) summary.rows = rows;
  if (actionKind === undefined || actionKind === "fs.read_summary") {
    const kind = stringField(value.kind);
    if (kind !== undefined) summary.kind = kind.slice(0, 64);
  }
  if (exitCode !== undefined) summary.exit_code = exitCode;
  if (outputBytes !== undefined) summary.output_bytes = outputBytes;

  if (Array.isArray(value.columns)) {
    summary.columns = value.columns.filter(
      (column): column is string => typeof column === "string",
    );
  }
  if (Array.isArray(value.files)) {
    summary.files = value.files.flatMap((file) => {
      if (!isObject(file)) return [];
      const name = stringField(file.name);
      const fileBytes = numberField(file.bytes);
      const kind = stringField(file.kind);
      return name && fileBytes !== undefined && kind
        ? [{ name, bytes: fileBytes, kind }]
        : [];
    });
  }
  if (typeof value.stdout_tail === "string") {
    summary.stdout_tail = value.stdout_tail.slice(0, 2_000);
  }
  if (typeof value.stderr_tail === "string") {
    summary.stderr_tail = value.stderr_tail.slice(0, 2_000);
  }
  return Object.keys(summary).length > 0 ? summary : undefined;
}

export async function createLocalTask<K extends LocalActionKind>(
  deviceId: string,
  actionKind: K,
  payload: LocalActionPayloadByKind[NoInfer<K>],
): Promise<CreatedLocalTask> {
  // Refuse the shapes the device cannot run before spending a rate-limit slot
  // on a task that is certain to come back as a bare "执行失败" (contract §4).
  if (actionKind === "shell.run") {
    const command = (payload as { command?: unknown }).command;
    if (typeof command === "string" && isUnsupportedShellCommand(command)) {
      throw new LocalTaskApiError("command_unsupported", 400);
    }
  }
  const response = await request(
    `/v1/devices/${encodeURIComponent(deviceId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        action_kind: actionKind,
        action_payload: payload,
      }),
    },
  );
  if (!isObject(response)) throw new LocalTaskApiError("invalid_response", 200);
  const taskId = stringField(response.task_id) || stringField(response.taskId);
  if (!taskId) throw new LocalTaskApiError("invalid_response", 200);
  const hint =
    stringField(response.code) ||
    stringField(response.error_code) ||
    stringField(response.warning) ||
    stringField(response.error) ||
    stringField(response.detail);
  return {
    taskId,
    offline:
      response.device_offline === true ||
      response.offline === true ||
      hint === "device_offline",
  };
}

const ECHO_MAX_CHARS = 512;

/**
 * The request echo the console is allowed to show. Only the fields the user
 * typed themselves may come back out: `content_b64` and `code` are deliberately
 * dropped, so a long write never turns the history into a wall of base64.
 */
function requestEcho(payload: unknown): { target?: string; command?: string } {
  if (!isObject(payload)) return {};
  const target = stringField(payload.path) || stringField(payload.cwd);
  const command = stringField(payload.command);
  return {
    ...(target ? { target: target.slice(0, ECHO_MAX_CHARS) } : {}),
    ...(command ? { command: command.slice(0, ECHO_MAX_CHARS) } : {}),
  };
}

export async function getLocalTask(taskId: string): Promise<LocalTask> {
  const response = await request(
    `/v1/devices/tasks/${encodeURIComponent(taskId)}`,
  );
  const raw = isObject(response) && isObject(response.task) ? response.task : response;
  if (!isObject(raw) || !isStatus(raw.status)) {
    throw new LocalTaskApiError("invalid_response", 200);
  }
  const rawActionKind = raw.action_kind ?? raw.actionKind;
  const actionKind = isActionKind(rawActionKind) ? rawActionKind : undefined;
  const resultSummary = sanitizeLocalTaskSummary(
    raw.result_summary ?? raw.resultSummary,
    actionKind,
  );
  const rawDenyReason = raw.deny_reason ?? raw.denyReason;
  const createdAt = stringField(raw.created_at ?? raw.createdAt);
  const claimedAt = stringField(raw.claimed_at ?? raw.claimedAt);
  const finishedAt = stringField(raw.finished_at ?? raw.finishedAt);
  return {
    status: raw.status,
    ...(actionKind ? { actionKind } : {}),
    ...(resultSummary ? { resultSummary } : {}),
    ...(isDenyReason(rawDenyReason) ? { denyReason: rawDenyReason } : {}),
    ...(stringField(raw.task_id ?? raw.taskId)
      ? { taskId: stringField(raw.task_id ?? raw.taskId) }
      : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(claimedAt ? { claimedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...requestEcho(raw.action_payload ?? raw.actionPayload),
  };
}

export async function cancelLocalTask(taskId: string): Promise<void> {
  await request(`/v1/devices/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  });
}

const TERMINAL_STATUSES: ReadonlySet<LocalTaskStatus> = new Set([
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
]);

export const LOCAL_TASK_POLL_DELAYS_MS = [1_000, 2_000, 5_000] as const;

interface VisibilityDocument {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface WatchLocalTaskOptions {
  /** Test seam; production callers should omit all options. */
  getTask?: (taskId: string) => Promise<LocalTask>;
  visibilityDocument?: VisibilityDocument | null;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onError?: (error: unknown) => void;
}

export function watchLocalTask(
  taskId: string,
  onUpdate: (task: LocalTask) => void,
  options: WatchLocalTaskOptions = {},
): () => void {
  const getTask = options.getTask || getLocalTask;
  const visibilityDocument =
    options.visibilityDocument === undefined
      ? typeof document === "undefined"
        ? null
        : document
      : options.visibilityDocument;
  const setTimer = options.setTimer || setTimeout;
  const clearTimer = options.clearTimer || clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let polling = false;
  let delayIndex = 0;

  const clearScheduled = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearScheduled();
    visibilityDocument?.removeEventListener("visibilitychange", onVisibilityChange);
  };

  const schedule = () => {
    if (stopped || visibilityDocument?.hidden) return;
    const delay = LOCAL_TASK_POLL_DELAYS_MS[Math.min(delayIndex, 2)];
    delayIndex += 1;
    timer = setTimer(() => {
      timer = null;
      void poll();
    }, delay);
  };

  const poll = async () => {
    if (stopped || polling || visibilityDocument?.hidden) return;
    polling = true;
    try {
      const task = await getTask(taskId);
      if (stopped) return;
      onUpdate(task);
      if (TERMINAL_STATUSES.has(task.status)) {
        stop();
        return;
      }
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      polling = false;
    }
    schedule();
  };

  function onVisibilityChange() {
    if (visibilityDocument?.hidden) {
      clearScheduled();
    } else if (!stopped && !polling && timer === null) {
      void poll();
    }
  }

  visibilityDocument?.addEventListener("visibilitychange", onVisibilityChange);
  if (!visibilityDocument?.hidden) void poll();
  return stop;
}

export interface StartedLocalAction extends CreatedLocalTask {
  /** Stops polling. The task itself keeps running; use `cancelLocalTask`. */
  stop: () => void;
}

export interface StartLocalActionOptions extends WatchLocalTaskOptions {
  /** Test seam; production callers should omit it. */
  createTask?: typeof createLocalTask;
}

/**
 * Create a task and immediately follow it. Both local surfaces (file tree and
 * action console) need exactly this pair, and forking it once more is how the
 * two would drift into different poll intervals and different error handling.
 */
export async function startLocalAction<K extends LocalActionKind>(
  deviceId: string,
  actionKind: K,
  payload: LocalActionPayloadByKind[NoInfer<K>],
  onUpdate: (task: LocalTask) => void,
  options: StartLocalActionOptions = {},
): Promise<StartedLocalAction> {
  const { createTask = createLocalTask, ...watchOptions } = options;
  const created = await createTask(deviceId, actionKind, payload);
  const stop = watchLocalTask(created.taskId, onUpdate, watchOptions);
  return { ...created, stop };
}

export const LOCAL_ACTION_LABELS: Record<LocalActionKind, string> = {
  "fs.list": "列文件清单",
  "fs.read_summary": "读结构摘要",
  "file.write": "写入文件",
  "python.run": "跑 Python 脚本",
  "shell.run": "执行命令",
  "app.open": "在那台电脑上打开",
};

/**
 * Protocol §4.1 marks `file.write` / `python.run` / `shell.run` as the actions
 * that change the machine. Everything the product face does differently for
 * them — the plan block, the consent sentence, the extra confirmation — hangs
 * off this one set, so the three can never drift apart.
 */
export const LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE: ReadonlySet<LocalActionKind> =
  new Set(["file.write", "python.run", "shell.run"]);

/** Windows paths keep `\`; everything else joins with `/`. */
export function localPathSeparator(path: string): "\\" | "/" {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\") ? "\\" : "/";
}

export function joinLocalPath(parent: string, name: string): string {
  const separator = localPathSeparator(parent);
  const base = parent.replace(/[\\/]+$/, "");
  return `${base || separator}${separator}${name}`;
}

/**
 * A child produced by walking the tree must still sit under the directory the
 * user authorised. The device rejects an escape as `path_outside_grant` anyway;
 * refusing here means we never spend a rate-limit slot on a doomed task, and a
 * crafted entry name (`..`) cannot walk the browser out of the granted root.
 */
export function isInsideLocalRoot(root: string, candidate: string): boolean {
  const separator = localPathSeparator(root);
  const normalize = (value: string) =>
    value.replace(/[\\/]+$/, "") || separator;
  const base = normalize(root);
  const target = normalize(candidate);
  if (target.split(/[\\/]/).some((segment) => segment === "..")) return false;
  if (target === base) return true;
  const prefix = base === separator ? base : `${base}${separator}`;
  return target.startsWith(prefix);
}

/** UTF-8 → base64 without assuming `Buffer`, for `file.write`'s payload. */
export function localTextToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export interface LocalActionFact {
  label: string;
  value: string;
}

/**
 * What a user is told *before* the action runs. The product promise is
 * "本机动作全程可见、可授权、可审计"，所以下发之前必须先把「要动什么、动完能不能
 * 撤回、需不需要在那台电脑上按确认」讲成人话 —— 一个只写着动作名的按钮做不到这件事。
 */
export interface LocalActionPlan {
  actionKind: LocalActionKind;
  title: string;
  /** True for exactly the three actions that can modify the machine. */
  changesDevice: boolean;
  facts: LocalActionFact[];
  /** Blast radius, including whether it can be undone. */
  impact: string;
  /** Set for every action that changes the machine; the consent-window rule. */
  consent?: string;
  /** What the user will be able to read once it finishes. */
  resultNote: string;
  /** Why a path can still be refused after all of the above. */
  scopeNote: string;
}

function textLines(value: string): number {
  return value.split("\n").length;
}

function planTarget(payload: Record<string, unknown>): string {
  const path = payload.path;
  const cwd = payload.cwd;
  if (typeof path === "string" && path) return path;
  if (typeof cwd === "string" && cwd) return cwd;
  return "（未填路径）";
}

export function describeLocalAction<K extends LocalActionKind>(
  actionKind: K,
  payload: Partial<LocalActionPayloadByKind[NoInfer<K>]>,
  deviceName = "这台电脑",
): LocalActionPlan {
  const fields = (payload ?? {}) as Record<string, unknown>;
  const target = planTarget(fields);
  const scopeNote = `路径必须在${deviceName}上已经授权过的目录里；不在范围内的会被它当场拒绝，不会被悄悄执行。`;
  const base = { actionKind, changesDevice: false, scopeNote };

  switch (actionKind) {
    case "fs.list":
      return {
        ...base,
        title: `列出「${target}」里的文件清单`,
        facts: [{ label: "目标目录", value: target }],
        impact: "只读取文件名、类型、大小；不读文件正文，不改动任何东西。",
        resultNote: "完成后这里会显示条目数，以及每个文件的名称、类型、字节数。",
      };
    case "fs.read_summary":
      return {
        ...base,
        title: `读「${target}」的结构摘要`,
        facts: [{ label: "目标", value: target }],
        impact:
          "只读结构：是文件还是文件夹、多少字节；CSV/TSV 再多列名与行数。文件正文不读、不上传。",
        resultNote: "完成后这里会显示类型与字节数；表格文件还会显示列名与行数。",
      };
    case "app.open":
      return {
        ...base,
        title: `在${deviceName}上打开「${target}」`,
        facts: [{ label: "要打开的东西", value: target }],
        impact: `会用${deviceName}上的默认程序把它打开，那台电脑的屏幕上会出现一个窗口；文件内容不会被修改。`,
        resultNote: "完成后这里会显示退出码；打开后的窗口在那台电脑上。",
      };
    case "file.write": {
      const content = typeof fields.content_b64 === "string" ? fields.content_b64 : "";
      return {
        ...base,
        changesDevice: true,
        title: `覆盖写入「${target}」`,
        facts: [
          { label: "目标文件", value: target },
          { label: "写入大小", value: `${content.length} 个 base64 字符` },
        ],
        impact:
          "这个文件的原有内容会被整份替换，且不会自动备份。除它以外的文件不受影响。",
        consent: `${deviceName}需要有「写入与新建文件」这一类授权；没有就会被拒绝，而不是先写了再问。`,
        resultNote: "完成后这里会显示实际写入的字节数。",
      };
    }
    case "python.run": {
      const code = typeof fields.code === "string" ? fields.code : "";
      return {
        ...base,
        changesDevice: true,
        title: `在「${target}」用${deviceName}自带的 Python 跑一段脚本`,
        facts: [
          { label: "工作目录", value: target },
          { label: "脚本长度", value: `${textLines(code)} 行 / ${code.length} 字符` },
        ],
        impact:
          "脚本能在已授权目录里读文件、写文件、删文件；它做过的改动没有一键撤销。",
        consent: `被判为高危的脚本会在${deviceName}上弹出确认窗口，90 秒内没有人按「允许」就自动拒绝。`,
        resultNote: "完成后这里会显示退出码，以及脚本自己打印的输出（末尾 2000 字）。",
      };
    }
    case "shell.run": {
      const command = typeof fields.command === "string" ? fields.command : "";
      return {
        ...base,
        changesDevice: true,
        title: `在「${target}」执行命令`,
        facts: [
          { label: "工作目录", value: target },
          { label: "命令原文", value: command || "（未填命令）" },
          { label: "实际执行的程序", value: command.trim().split(/\s+/)[0] || "（未填）" },
        ],
        impact:
          "命令以你在那台电脑上的身份运行，做过的改动没有一键撤销。它不经过 shell：管道、重定向、串联、反引号一律拒绝，不会「看着生效其实没生效」。",
        consent: `命令执行每次都要在${deviceName}上单独确认，不能一次授权长期生效。`,
        resultNote: `完成后这里只会显示退出码与输出字节数 —— 命令输出只留在${deviceName}上，全文要在客户端的「本地审计」里看。`,
      };
    }
    default:
      return {
        ...base,
        title: "未知动作",
        facts: [],
        impact: "这个动作不在协议表里，不会被下发。",
        resultNote: "不会有结果。",
      };
  }
}

/**
 * One readable line for a finished action. `failed` must never be a bare code:
 * the whole point of the console is that a user can tell what went wrong
 * without walking to the other computer.
 */
export function localActionOutcomeText(
  task: LocalTask,
  deviceName = "这台电脑",
): string {
  const summary = task.resultSummary;
  switch (task.status) {
    case "succeeded": {
      const parts: string[] = [];
      if (summary?.entries !== undefined) parts.push(`${summary.entries} 个条目`);
      if (summary?.kind !== undefined) {
        parts.push(summary.kind === "directory" ? "文件夹" : "文件");
      }
      if (summary?.bytes !== undefined) parts.push(`${summary.bytes} 字节`);
      if (summary?.rows !== undefined) parts.push(`${summary.rows} 行`);
      if (summary?.columns?.length) parts.push(`列：${summary.columns.join("、")}`);
      if (summary?.exit_code !== undefined) parts.push(`退出码 ${summary.exit_code}`);
      if (summary?.output_bytes !== undefined) {
        parts.push(`输出 ${summary.output_bytes} 字节（只在${deviceName}上）`);
      }
      return parts.length > 0 ? `完成：${parts.join(" · ")}` : "完成。";
    }
    case "failed": {
      const stderr = summary?.stderr_tail?.trim();
      const exitCode = summary?.exit_code;
      if (stderr) return `执行失败：${stderr.slice(-400)}`;
      if (exitCode !== undefined) {
        return `执行失败：退出码 ${exitCode}。失败原因的全文在${deviceName}的「本地审计」里。`;
      }
      return `执行失败。失败原因的全文在${deviceName}的「本地审计」里 —— 这一步的输出按协议不上传。`;
    }
    case "cancelled":
      return "已取消，没有在那台电脑上执行。";
    case "expired":
      return "等了 24 小时也没被领取，已过期。";
    case "denied":
      return "被那台电脑拒绝了。";
    default:
      return "";
  }
}
