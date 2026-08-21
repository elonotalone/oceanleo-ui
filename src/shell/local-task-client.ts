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
  /**
   * A-24：用户点过中止，那台电脑还没回话。**它不是「已取消」**——
   * 一条已经在跑的命令，网关下发中止不等于它停得下来。把这两件事画成同一个状态，
   * 就是让用户以为命令停了而它其实还在写文件。
   */
  "canceling",
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
  /**
   * A-24：**请求**与**结果**是两个事实。它有值而状态却不是 `cancelled`，
   * 说明中止来晚了 —— 这一步照样做完了，界面必须这么说。
   */
  cancelRequestedAt?: string;
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

/**
 * Protocol §4.1, mirroring the gateway's `_is_absolute_path`: POSIX absolute,
 * a Windows drive path, or a UNC share. A bare `C:data` is drive-relative and
 * therefore does not count.
 */
export function isAbsoluteLocalPath(value: string): boolean {
  const path = value.trim();
  if (!path) return false;
  return (
    path.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(path)
  );
}

export async function createLocalTask<K extends LocalActionKind>(
  deviceId: string,
  actionKind: K,
  payload: LocalActionPayloadByKind[NoInfer<K>],
): Promise<CreatedLocalTask> {
  // Protocol §4.1: every `path`/`cwd` is absolute on the device. Catching it
  // here keeps a doomed task from spending one of the hourly creation slots,
  // and names the refusal with the code the gateway itself would have used.
  for (const field of ["path", "cwd"] as const) {
    const value = (payload as Record<string, unknown>)[field];
    if (typeof value === "string" && !isAbsoluteLocalPath(value)) {
      throw new LocalTaskApiError("payload_path_not_absolute", 400);
    }
  }
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

/**
 * The gateway answers `GET /tasks/{id}` and `POST /tasks/{id}/cancel` with the
 * very same `_public_task` projection, so they get the very same parser. A
 * second, thinner parser for the cancel answer is how the two drifted apart
 * once already: the abort reply came back with only three fields, and every
 * host that listened to it lost the audit fingerprint (`taskId`/`actionKind`/
 * `target`/`command`) the moment the user pressed the button.
 */
function parseTask(response: unknown): LocalTask {
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
  const cancelRequestedAt = stringField(
    raw.cancel_requested_at ?? raw.cancelRequestedAt,
  );
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
    ...(cancelRequestedAt ? { cancelRequestedAt } : {}),
    ...requestEcho(raw.action_payload ?? raw.actionPayload),
  };
}

export async function getLocalTask(taskId: string): Promise<LocalTask> {
  return parseTask(
    await request(`/v1/devices/tasks/${encodeURIComponent(taskId)}`),
  );
}

/**
 * A-24：这个调用的答案**不是**「已取消」。
 *
 * 它以前回 `void`，界面于是自己把状态写成 `cancelled` —— 而网关对一条已经在那台
 * 电脑手上的任务只能记下「用户要求中止」。两者的差别不是措辞：用户会据此以为
 * 命令停了、文件没被写。所以这里把网关的真实答复原样交回去，由界面照着说。
 */
export async function cancelLocalTask(taskId: string): Promise<LocalTask> {
  return parseTask(
    await request(`/v1/devices/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: "POST",
    }),
  );
}

/**
 * A-24：**按钮只在网关真的会受理的状态上出现。**
 *
 * 这三个状态逐字对应网关 `cancel_device_task` 的两个分支（`queued` 走真停，
 * `claimed`/`running` 走「已请求中止」），别的一律 409 `illegal_transition`。
 * 这张表是「不许只把按钮点亮而后端不认」这条红线在代码里的落点：想给哪个状态
 * 加按钮，先去网关那一路把它加上，否则用户按下去只会拿到一句拒绝。
 *
 * `canceling` **不在**表里，但它不是「不能按」而是「已经按过了」——
 * 网关对它是幂等的（原样回一份 `_public_task`），界面按已请求处理，不再重发。
 */
export const LOCAL_TASK_CANCELLABLE_STATUSES: ReadonlySet<LocalTaskStatus> =
  new Set(["queued", "claimed", "running"]);

export function localTaskCanBeCancelled(status: LocalTaskStatus): boolean {
  return LOCAL_TASK_CANCELLABLE_STATUSES.has(status);
}

/**
 * 状态到了这里就不会再变了。`canceling` **不在**表里：它正是在等那台电脑回话，
 * 把它当终态就等于停在「已请求中止」，永远看不到最后到底停没停下来。
 */
export const LOCAL_TASK_TERMINAL_STATUSES: ReadonlySet<LocalTaskStatus> = new Set([
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
]);

const TERMINAL_STATUSES = LOCAL_TASK_TERMINAL_STATUSES;

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

export interface LocalActionEffect {
  /** 会改动那台电脑吗。协议 §4.1 只有三个动作是 true。 */
  changesDevice: boolean;
  /** 选中这个动作时先给一句话：它会做什么、改不改东西。 */
  summary: string;
}

/**
 * 每个动作**自己**声明它会不会改动那台电脑，以及一句话的影响。
 *
 * 为什么要有这张表：产品面对「会改东西的动作」处处都要另眼相待（预告块的警示色、
 * 按钮从「发起」变成「确认并发起」、同意窗口的那句话）。这些判断以前散在两处：
 * 一个只有动作名的集合，和组件里另写一份提示文案。两份各自演化就会出现
 * 「按钮警示了、提示文案却说只读」这种自相矛盾的界面。现在只有这一张表。
 */
export const LOCAL_ACTION_EFFECTS: Record<LocalActionKind, LocalActionEffect> = {
  "fs.list": {
    changesDevice: false,
    summary: "看看这个目录里有什么。只读，不会改动那台电脑。",
  },
  "fs.read_summary": {
    changesDevice: false,
    summary:
      "看一个文件的结构：类型、大小，表格再看列名与行数。只读，不会改动那台电脑。",
  },
  "file.write": {
    changesDevice: true,
    summary: "把一段文本整份写进一个文件。会改动那台电脑：原内容被覆盖，且不自动备份。",
  },
  "python.run": {
    changesDevice: true,
    summary:
      "用那台电脑自带的 Python 跑一段脚本处理已授权目录里的文件。会改动那台电脑：脚本能写文件、删文件。",
  },
  "shell.run": {
    changesDevice: true,
    summary:
      "执行一条命令（不经过 shell，没有管道与重定向）。会改动那台电脑，而且每次都要在那台电脑上确认。",
  },
  "app.open": {
    changesDevice: false,
    summary: "让那台电脑用默认程序打开一个文件或应用。不改文件内容。",
  },
};

/**
 * Protocol §4.1 marks `file.write` / `python.run` / `shell.run` as the actions
 * that change the machine. Derived from the table above so the set and the
 * per-action copy can never disagree.
 */
export const LOCAL_ACTIONS_THAT_CHANGE_THE_DEVICE: ReadonlySet<LocalActionKind> =
  new Set(
    LOCAL_ACTION_KINDS.filter((kind) => LOCAL_ACTION_EFFECTS[kind].changesDevice),
  );

export function localActionChangesDevice(actionKind: LocalActionKind): boolean {
  return LOCAL_ACTION_EFFECTS[actionKind]?.changesDevice ?? false;
}

/**
 * 台账里那一行的状态。`undefined` 是「刚下单、还没有第一次轮询回来」，
 * 它也要有话说 —— 一行没有状态的记录看起来就像丢了。
 */
export function localTaskStatusText(
  status: LocalTaskStatus | undefined,
  queuedOffline = false,
): string {
  if (!status) return queuedOffline ? "已排队（设备离线）" : "已排队";
  switch (status) {
    case "queued":
      return queuedOffline ? "排队中（设备离线，上线后继续）" : "排队中";
    case "claimed":
      return "设备已领取";
    case "running":
      return "正在那台电脑上执行";
    case "canceling":
      return "已请求中止，等那台电脑回话";
    case "succeeded":
      return "已完成";
    case "failed":
      return "执行失败";
    case "denied":
      return "被拒绝";
    case "expired":
      return "已过期";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

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
  // 「会不会改动那台电脑」只有一个出处：`LOCAL_ACTION_EFFECTS`。
  const base = {
    actionKind,
    changesDevice: localActionChangesDevice(actionKind),
    scopeNote,
  };

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
/**
 * A-24：点过中止、结局却不是「已取消」⇒ 中止到得太晚。不说这一句，那次点击
 * 在界面上就消失了，用户会以为它生效过 —— 一次 `file.write` 的差别就是
 * 「文件没被动」和「文件已经被整份覆盖」。
 *
 * 进度块与历史台账都要说这句话，所以它只有一份。
 */
export function localCancelArrivedTooLateNote(
  task: LocalTask,
  deviceName = "这台电脑",
): string {
  if (!task.cancelRequestedAt) return "";
  if (task.status === "cancelled" || task.status === "canceling") return "";
  if (!LOCAL_TASK_TERMINAL_STATUSES.has(task.status)) return "";
  return `你点过中止，但${deviceName}收到时这一步已经做完了。`;
}

export function localActionOutcomeText(
  task: LocalTask,
  deviceName = "这台电脑",
): string {
  const outcome = finishedOutcomeText(task, deviceName);
  const tooLate = localCancelArrivedTooLateNote(task, deviceName);
  if (tooLate && outcome) return `${outcome}（${tooLate}）`;
  return outcome;
}

function finishedOutcomeText(task: LocalTask, deviceName: string): string {
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
