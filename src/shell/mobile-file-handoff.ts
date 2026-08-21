"use client";

/**
 * 手机上拍的照片、录的音，直接落进那台电脑的授权目录。
 *
 * 这是手机端存在的理由本身 —— 浏览器做不到的那件事。今天这条链的每一段都已经在了
 * （配对、授权、审计、`file.write`），**只差没有一个界面能把手机上的一个文件送过去**。
 * 这个模块就是那一段，它只负责三件用户看得见的事：
 *
 * 1. **落点只能从那台电脑已授权的目录里选。** 不给手敲绝对路径的口子 —— 那不是省事，
 *    那是绕过授权：设备侧会当场把它拒成 `path_outside_grant`，等于先请用户瞄准一个
 *    没人授权的文件夹，再当着他的面拒绝他。
 * 2. **一张照片要么完整落地，要么一片都不落。** 一张 4 MB 的照片转成 base64 是 5.5 MB，
 *    一条任务行装不下，所以按序分片；网关会拒绝跳片、拒绝前一片没落地、拒绝偏移对不上。
 *    半张照片顶着正确的文件名躺在别人电脑上，比发送失败糟糕得多。
 * 3. **失败要说人话。** 「这台电脑离线」「这个文件夹没授权」「这张照片太大」是三件
 *    完全不同的事，用户要做的动作也完全不同。
 *
 * 浏览器里这个模块不做任何事：没有原生宿主就没有可选的东西，也就没有入口。
 */

import { deviceErrorCopy } from "../api/device-error-copy";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import {
  LocalTaskApiError,
  joinLocalPath,
  watchLocalTask,
  type LocalTask,
  type WatchLocalTaskOptions,
} from "./local-task-client";
import { detectNativeHost, pickNativeMedia, type NativeMedia } from "./mobile-bridge";

/* ------------------------------------------------------------------ *
 * 分片尺寸
 * ------------------------------------------------------------------ */

/**
 * 一片最多这么多 base64 字符，**必须与网关的 `MAX_FILE_WRITE_B64_CHARS` 相等**。
 * 大了会被网关拒（白白花掉用户每小时的下单额度），小了是白白多切几片。
 */
export const HANDOFF_MAX_PART_B64_CHARS = 1024 * 1024;

/**
 * 一片的原始字节数。取 3 的倍数是有原因的：base64 每 3 字节编成 4 字符，
 * 切在 3 的倍数上，每一片编出来正好 1048576 个字符、不带填充符，
 * 「一片多大」这件事在手机和网关两边算出来是同一个数。
 */
export const HANDOFF_PART_BYTES = 768 * 1024;

/** 网关的 `MAX_HANDOFF_PARTS`。32 片 × 768 KB ≈ 24 MB。 */
export const HANDOFF_MAX_PARTS = 32;

/** 超过这个大小就没法送了，界面要在用户等待之前就说清楚。 */
export const HANDOFF_MAX_TOTAL_BYTES = HANDOFF_PART_BYTES * HANDOFF_MAX_PARTS;

/* ------------------------------------------------------------------ *
 * 落点：只认那台电脑自己报上来的授权目录
 * ------------------------------------------------------------------ */

/**
 * 这份目录列表有多可信。三种来源对用户是三句不同的话，不能混成一句。
 *
 * - `heartbeat`：那台电脑自己报的，这是真列表。
 * - `history`：那台电脑上的客户端还太旧、报不了目录，只能退回到「它确实成功写入过的
 *   目录」。写入成功意味着当时过了设备侧的授权判定 —— 只会比真列表少，不会多。
 * - `none`：什么都不知道。必须照实说，而不是给一个看起来坏掉的空列表。
 */
export type HandoffFolderSource = "heartbeat" | "history" | "none";

export interface HandoffFolders {
  folders: string[];
  source: HandoffFolderSource;
  reportedAt?: string;
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

function isFolderSource(value: unknown): value is HandoffFolderSource {
  return value === "heartbeat" || value === "history" || value === "none";
}

/**
 * 从 `GET /v1/devices?folders=true` 的一行设备里读出落点列表。
 *
 * 读不懂就当「什么都不知道」，**绝不回退成「随便哪个目录都行」**。
 */
export function parseHandoffFolders(device: unknown): HandoffFolders {
  if (!isObject(device)) return { folders: [], source: "none" };
  const raw = device.granted_roots ?? device.grantedRoots;
  const folders = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const rawSource = device.granted_roots_source ?? device.grantedRootsSource;
  const source: HandoffFolderSource = isFolderSource(rawSource)
    ? rawSource
    : folders.length > 0
      ? "heartbeat"
      : "none";
  const reportedAt = stringField(
    device.granted_roots_reported_at ?? device.grantedRootsReportedAt,
  );
  return {
    folders,
    // 一份空的「写入历史」不是一个答案，它就是不知道。而一份空的**心跳**上报是
    // 答案：那台电脑说它一个文件夹都没授权，这两句话对用户不一样。
    source: folders.length === 0 && source === "history" ? "none" : source,
    ...(reportedAt ? { reportedAt } : {}),
  };
}

/** 落点列表下面那一句解释。空列表尤其需要它，否则用户只看到一个空框。 */
export function handoffFolderNote(
  folders: HandoffFolders,
  deviceName = "这台电脑",
): string {
  if (folders.folders.length === 0) {
    return folders.source === "heartbeat"
      ? `${deviceName}上还没有授权任何文件夹。先在那台电脑上授权一个，这里才会出现落点。`
      : `${deviceName}还没上报它授权了哪些文件夹。先在那台电脑上授权一个文件夹，或把它上面的客户端升到新版。`;
  }
  return folders.source === "history"
    ? `${deviceName}上的客户端还报不了授权目录，这里列的是它以前成功写入过的文件夹。要发到别的文件夹，请先在那台电脑上授权。`
    : `只能发到${deviceName}上已经授权的文件夹。要多一个落点，请在那台电脑上授权。`;
}

/* ------------------------------------------------------------------ *
 * 目标路径
 * ------------------------------------------------------------------ */

/**
 * 手机相册给的文件名是不可信输入。它只能是一个**名字**：
 * 带上路径分隔符或 `..` 就能从授权目录里走出去，那正是这个模块存在的意义要防的事。
 */
export function handoffFileName(name: string, fallback = "手机文件"): string {
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  if (!base || base === "." || base === "..") return fallback;
  return base.slice(0, 120);
}

export function handoffTargetPath(folder: string, name: string): string {
  return joinLocalPath(folder, handoffFileName(name));
}

/* ------------------------------------------------------------------ *
 * 切片
 * ------------------------------------------------------------------ */

const BASE64_BLOCK = 0x8000;

/** `Uint8Array` → base64，不依赖 `Buffer`（手机上的 webview 没有它）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_BLOCK) {
    const block = bytes.subarray(offset, offset + BASE64_BLOCK);
    binary += String.fromCharCode(...block);
  }
  return btoa(binary);
}

export interface HandoffPart {
  path: string;
  content_b64: string;
  part_index: number;
  part_count: number;
  bytes_before: number;
}

export interface HandoffPlan {
  path: string;
  totalBytes: number;
  /** 单片时这里是空数组：一片就不该带分片字段，网关也不认多余字段。 */
  parts: HandoffPart[];
  /** 单片直发的载荷；多片时为 `undefined`。 */
  single?: { path: string; content_b64: string };
  partCount: number;
}

export type HandoffRefusalReason =
  | "too_large"
  | "empty_file"
  | "no_folder"
  | "offline_multipart";

export interface HandoffRefusal {
  ok: false;
  reason: HandoffRefusalReason;
  message: string;
}

export type HandoffPlanResult = ({ ok: true } & HandoffPlan) | HandoffRefusal;

/**
 * 把一个文件切成网关收得下的若干片。
 *
 * `bytes_before` 是「这一片写之前，文件里已经有多少字节」。它不是装饰：网关拿它跟
 * **那台电脑上一片回执里的真实字节数**对，对不上就停 —— 这一条就是「旧客户端把追加
 * 做成覆盖」时唯一会响的警报。
 */
export function planFileHandoff(options: {
  media: Pick<NativeMedia, "name" | "bytes">;
  folder: string;
  deviceName?: string;
  deviceOnline?: boolean;
}): HandoffPlanResult {
  const deviceName = options.deviceName || "这台电脑";
  const bytes = options.media.bytes;
  if (!options.folder) {
    return {
      ok: false,
      reason: "no_folder",
      message: `还没选落点。只能发到${deviceName}上已经授权的文件夹。`,
    };
  }
  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      reason: "empty_file",
      message: "这个文件是空的，没有内容可以发。",
    };
  }
  if (bytes.length > HANDOFF_MAX_TOTAL_BYTES) {
    const megabytes = Math.floor(HANDOFF_MAX_TOTAL_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: "too_large",
      message: `这个文件有 ${formatBytes(bytes.length)}，一次最多只能发 ${megabytes} MB。`,
    };
  }
  const path = handoffTargetPath(options.folder, options.media.name);
  const partCount = Math.ceil(bytes.length / HANDOFF_PART_BYTES);
  if (partCount === 1) {
    return {
      ok: true,
      path,
      totalBytes: bytes.length,
      partCount: 1,
      parts: [],
      single: { path, content_b64: bytesToBase64(bytes) },
    };
  }
  // 离线时多片直接不发。第 1 片会排队、等它上线后落地，然后整条链停在那里 ——
  // 结果是那台电脑上多出一个名字对、内容只有开头一角的文件。宁可现在说清楚。
  if (options.deviceOnline === false) {
    return {
      ok: false,
      reason: "offline_multipart",
      message: `${deviceName}现在离线。这个文件要分 ${partCount} 次送，中途它必须一直在线 —— 等它上线再发。`,
    };
  }
  const parts: HandoffPart[] = [];
  for (let index = 0; index < partCount; index += 1) {
    const start = index * HANDOFF_PART_BYTES;
    const slice = bytes.subarray(start, start + HANDOFF_PART_BYTES);
    parts.push({
      path,
      content_b64: bytesToBase64(slice),
      part_index: index + 1,
      part_count: partCount,
      bytes_before: start,
    });
  }
  return { ok: true, path, totalBytes: bytes.length, partCount, parts };
}

/** base64 字符数 → 原始字节数。进度条在回执缺 `bytes` 时靠它兜底。 */
export function base64ByteLength(value: string): number {
  if (!value) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} 字节`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * 送达
 * ------------------------------------------------------------------ */

export interface HandoffProgress {
  /** 已经落到那台电脑上的片数。 */
  sentParts: number;
  totalParts: number;
  bytesLanded: number;
  totalBytes: number;
  /** `queued` 只在那台电脑离线、单片排队时出现。 */
  phase: "sending" | "queued" | "done";
}

export interface HandoffSuccess {
  ok: true;
  path: string;
  bytes: number;
  /** 那台电脑离线，任务在排队等它上线 —— **不是**已经写进去了。 */
  queued: boolean;
}

export interface HandoffFailure {
  ok: false;
  /** 协议码、我这一路的拒绝码，或 `network_error`。 */
  code: string;
  message: string;
  /** 已经落地的片数：多片中途失败时，那台电脑上是一个不完整的文件。 */
  landedParts: number;
  totalParts: number;
}

export type HandoffResult = HandoffSuccess | HandoffFailure;

interface CreatedPart {
  taskId: string;
  offline: boolean;
}

export interface SendFileHandoffOptions {
  deviceId: string;
  deviceName?: string;
  deviceOnline?: boolean;
  plan: HandoffPlan;
  onProgress?: (progress: HandoffProgress) => void;
  /** 测试缝；生产调用一个都不传。 */
  createPart?: (
    deviceId: string,
    payload: Record<string, unknown>,
    afterTaskId: string | null,
  ) => Promise<CreatedPart>;
  awaitPart?: (taskId: string) => Promise<LocalTask>;
  watchOptions?: WatchLocalTaskOptions;
}

async function gatewayRequest(path: string, init: RequestInit): Promise<unknown> {
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
      },
      cache: "no-store",
    });
  } catch {
    throw new LocalTaskApiError("network_error", 0);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isObject(payload) && isObject(payload.detail) ? payload.detail : null;
    const code =
      (detail && stringField(detail.code)) ||
      (isObject(payload) ? stringField(payload.code) : undefined) ||
      (response.status === 401 ? "unauthorized" : `http_${response.status}`);
    const limit =
      detail && typeof detail.limit === "number" ? detail.limit : undefined;
    throw new LocalTaskApiError(code, response.status, limit);
  }
  return payload;
}

/**
 * 下发一片。
 *
 * 走自己的请求而不是 `createLocalTask`：那个函数是别人的面，它的载荷类型里没有分片
 * 字段、也不带 `after_task_id`，而 `after_task_id` 正是网关用来核对「上一片真的落地了、
 * 而且大小对得上」的凭据 —— 顺序由客户端自己声明，就等于让有 bug 的客户端随便跳片。
 */
async function createHandoffPart(
  deviceId: string,
  payload: Record<string, unknown>,
  afterTaskId: string | null,
): Promise<CreatedPart> {
  const response = await gatewayRequest(
    `/v1/devices/${encodeURIComponent(deviceId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify({
        action_kind: "file.write",
        action_payload: payload,
        ...(afterTaskId ? { after_task_id: afterTaskId } : {}),
      }),
    },
  );
  if (!isObject(response)) throw new LocalTaskApiError("invalid_response", 200);
  const taskId = stringField(response.task_id);
  if (!taskId) throw new LocalTaskApiError("invalid_response", 200);
  return { taskId, offline: response.device_offline === true };
}

const TERMINAL: ReadonlySet<string> = new Set([
  "succeeded",
  "failed",
  "denied",
  "expired",
  "cancelled",
]);

function awaitPartOutcome(
  taskId: string,
  options: WatchLocalTaskOptions = {},
): Promise<LocalTask> {
  return new Promise<LocalTask>((resolve, reject) => {
    let settled = false;
    const stop = watchLocalTask(
      taskId,
      (task) => {
        if (settled || !TERMINAL.has(task.status)) return;
        settled = true;
        stop();
        resolve(task);
      },
      {
        ...options,
        onError: (error) => {
          if (settled) return;
          settled = true;
          stop();
          reject(error);
        },
      },
    );
  });
}

/**
 * 按序把每一片送到那台电脑上，等它落地了再送下一片。
 *
 * 为什么不并发：网关要求第 n 片报出第 n-1 片的 `task_id` 与落地字节数，而那个字节数
 * 只有那台电脑写完才知道。并发发出去的片，网关会一条条拒掉。
 */
export async function sendFileHandoff(
  options: SendFileHandoffOptions,
): Promise<HandoffResult> {
  const deviceName = options.deviceName || "这台电脑";
  const createPart = options.createPart || createHandoffPart;
  const awaitPart =
    options.awaitPart || ((taskId: string) => awaitPartOutcome(taskId, options.watchOptions));
  const { plan } = options;
  const totalParts = plan.partCount;
  const report = (progress: HandoffProgress) => options.onProgress?.(progress);

  if (plan.single) {
    try {
      const created = await createPart(options.deviceId, { ...plan.single }, null);
      if (created.offline || options.deviceOnline === false) {
        report({
          sentParts: 0,
          totalParts: 1,
          bytesLanded: 0,
          totalBytes: plan.totalBytes,
          phase: "queued",
        });
        return { ok: true, path: plan.path, bytes: plan.totalBytes, queued: true };
      }
      report({
        sentParts: 0,
        totalParts: 1,
        bytesLanded: 0,
        totalBytes: plan.totalBytes,
        phase: "sending",
      });
      const outcome = await awaitPart(created.taskId);
      if (outcome.status !== "succeeded") {
        return {
          ok: false,
          code: outcome.denyReason || outcome.status,
          message: handoffFailureMessage(outcome.denyReason || outcome.status, deviceName),
          landedParts: 0,
          totalParts: 1,
        };
      }
      report({
        sentParts: 1,
        totalParts: 1,
        bytesLanded: plan.totalBytes,
        totalBytes: plan.totalBytes,
        phase: "done",
      });
      return { ok: true, path: plan.path, bytes: plan.totalBytes, queued: false };
    } catch (error) {
      return failureFromError(error, deviceName, 0, 1);
    }
  }

  let previousTaskId: string | null = null;
  let bytesLanded = 0;
  for (const part of plan.parts) {
    report({
      sentParts: part.part_index - 1,
      totalParts,
      bytesLanded,
      totalBytes: plan.totalBytes,
      phase: "sending",
    });
    let created: CreatedPart;
    try {
      // `bytes_before` 送的是**我们算出来的**偏移，不是那台电脑刚回的字节数。
      // 回声一遍它自己的数字，网关那条对账就永远对得上 —— 而那条对账正是用来
      // 抓「那台电脑其实在覆盖而不是追加」的唯一一条。
      created = await createPart(options.deviceId, { ...part }, previousTaskId);
    } catch (error) {
      return failureFromError(error, deviceName, part.part_index - 1, totalParts);
    }
    let outcome: LocalTask;
    try {
      outcome = await awaitPart(created.taskId);
    } catch (error) {
      return failureFromError(error, deviceName, part.part_index - 1, totalParts);
    }
    if (outcome.status !== "succeeded") {
      const code = outcome.denyReason || outcome.status;
      return {
        ok: false,
        code,
        message: handoffFailureMessage(code, deviceName, {
          landedParts: part.part_index - 1,
          totalParts,
        }),
        landedParts: part.part_index - 1,
        totalParts,
      };
    }
    // 下一片的偏移用**那台电脑回执里的真实字节数**，不用我们自己算的。算出来的数字
    // 只能证明我们以为写了多少；回执里的数字才是文件现在真的有多长。
    const landed = outcome.resultSummary?.bytes;
    bytesLanded =
      typeof landed === "number" && Number.isFinite(landed)
        ? landed
        : part.bytes_before + base64ByteLength(part.content_b64);
    previousTaskId = created.taskId;
    report({
      sentParts: part.part_index,
      totalParts,
      bytesLanded,
      totalBytes: plan.totalBytes,
      phase: part.part_index === totalParts ? "done" : "sending",
    });
  }
  return { ok: true, path: plan.path, bytes: bytesLanded, queued: false };
}

function failureFromError(
  error: unknown,
  deviceName: string,
  landedParts: number,
  totalParts: number,
): HandoffFailure {
  const code =
    error instanceof LocalTaskApiError ? error.code : "network_error";
  const limit = error instanceof LocalTaskApiError ? error.limit : undefined;
  return {
    ok: false,
    code,
    message: handoffFailureMessage(code, deviceName, {
      limit,
      landedParts,
      totalParts,
    }),
    landedParts,
    totalParts,
  };
}

/* ------------------------------------------------------------------ *
 * 失败态文案
 * ------------------------------------------------------------------ */

/**
 * 每一种失败都要说清**用户现在该做什么**。
 *
 * 「这台电脑离线」要等，「这个文件夹没授权」要去那台电脑上授权，「太大了」要换个
 * 文件 —— 三件事的下一步动作完全不同，收成一句「发送失败」等于什么都没说。
 */
export function handoffFailureMessage(
  code: string,
  deviceName = "这台电脑",
  context: { limit?: number; landedParts?: number; totalParts?: number } = {},
): string {
  const partial =
    (context.landedParts ?? 0) > 0 && (context.totalParts ?? 0) > 1
      ? `已经送到 ${context.landedParts}/${context.totalParts} 片，${deviceName}上现在是一个不完整的文件，重发会从头覆盖它。`
      : "";
  const base = handoffFailureBase(code, deviceName, context.limit);
  return partial ? `${base}${partial}` : base;
}

function handoffFailureBase(
  code: string,
  deviceName: string,
  limit: number | undefined,
): string {
  switch (code) {
    case "grant_missing":
      return `${deviceName}还没授权「写入与新建文件」。要在那台电脑上授权之后才能收东西。`;
    case "path_outside_grant":
      return `这个文件夹不在${deviceName}已授权的范围内。请换一个落点，或者在那台电脑上授权它。`;
    case "device_offline":
      return `${deviceName}现在离线。等它上线再发。`;
    case "payload_too_large":
      return limit
        ? `这个文件太大，一片最多 ${formatBytes(Math.floor((limit / 4) * 3))}。`
        : "这个文件太大，送不过去。";
    case "handoff_part_out_of_order":
    case "handoff_part_not_landed":
    case "handoff_offset_mismatch":
      return `传输中断了：${deviceName}收到的片对不上号，已经停下来，不会留下一个错乱的文件。请重新发一次。`;
    case "network_error":
      return "网络断了，这一片没送出去。恢复后重新发一次。";
    case "unauthorized":
      return "登录后才能把文件发到你的电脑上。";
    case "failed":
      return `${deviceName}写这个文件时失败了。失败原因的全文在那台电脑的「本地审计」里。`;
    case "expired":
      return `等了 24 小时${deviceName}也没上线，这次发送已经过期。`;
    case "cancelled":
      return "已取消，文件没有写到那台电脑上。";
    default:
      return deviceErrorCopy(code, { deviceName, limit });
  }
}

/** 进度条旁边那一句。单片时不报「1/1 片」，那只会让人困惑。 */
export function handoffProgressText(
  progress: HandoffProgress,
  deviceName = "这台电脑",
): string {
  if (progress.phase === "queued") {
    return `已排队，等${deviceName}上线后自动写入。`;
  }
  if (progress.phase === "done") return "已送达。";
  if (progress.totalParts <= 1) return `正在发送到${deviceName}…`;
  return `正在发送 ${progress.sentParts + 1}/${progress.totalParts} 片…`;
}

/** 送达之后那一句：说清文件到底躺在哪。 */
export function handoffSuccessText(
  result: HandoffSuccess,
  deviceName = "这台电脑",
): string {
  return result.queued
    ? `已排队，等${deviceName}上线后会写入 ${result.path}。`
    : `已落到 ${result.path}。`;
}

/* ------------------------------------------------------------------ *
 * 入口条件
 * ------------------------------------------------------------------ */

/**
 * 浏览器里这件事根本不存在，所以入口也不该存在。
 *
 * 这跟「按钮点了没反应」不是一回事：一个在浏览器里渲染出来的「发送到这台电脑」，
 * 承诺的是浏览器做不到的事。
 */
export function canHandOffFiles(windowRef?: Window & typeof globalThis): boolean {
  return detectNativeHost(windowRef) !== null;
}

/** 选料 → 计划 → 送达里的第一步。浏览器里、用户取消时都回 `null`。 */
export async function pickFileForHandoff(): Promise<NativeMedia | null> {
  return pickNativeMedia();
}
