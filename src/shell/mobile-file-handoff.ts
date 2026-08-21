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
 * 文案的翻译口
 * ------------------------------------------------------------------ */

/**
 * 这一屏每一句话的翻译口，形状与 `useUI()` 的 `tt` 相同（`src/i18n/ui/useUI.ts`：
 * 中文原文即 key，未命中就回退中文原文）。
 *
 * 为什么要当参数传进来：这个模块里出文案的全是纯函数，不是组件，取不到 hook。
 * 不传就落回中文原文 —— 中文站因此逐字不变，而手机上那一屏由
 * `LocalFileHandoffLauncher` 把 `useUI()` 传下来，日语用户看到的是日语。
 */
export type HandoffTranslate = (zh: string) => string;

const KEEP_ZH: HandoffTranslate = (zh) => zh;

/**
 * 译文里的 `{device}`、`{path}` 这些位由这里填，不交给 `tt` 自己的插值：
 * `tt` 在这个模块里的合同只有「查表」一件，把填空押在它身上，一个只查表的实现
 * 就会让用户看见 `发送到{device}` 这种半成品。
 *
 * 填空放在取译文之后，因此「设备名在句子里的位置」由每种语言的译文自己决定。
 */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

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
  const reported = Array.isArray(raw);
  const folders = reported
    ? raw.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const rawSource = device.granted_roots_source ?? device.grantedRootsSource;
  const source: HandoffFolderSource = !reported
    ? // 那一栏根本不是一份列表 —— 无论它自称什么来源，我们**没读到**任何目录。
      // 信了它的自称就会对用户说「这台电脑一个文件夹都没授权」，而事实只是我们没读懂。
      "none"
    : isFolderSource(rawSource)
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
  deviceName?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  if (folders.folders.length === 0) {
    return folders.source === "heartbeat"
      ? fill(tt("{device}上还没有授权任何文件夹。先在那台电脑上授权一个，这里才会出现落点。"), {
          device,
        })
      : fill(
          tt(
            "{device}还没上报它授权了哪些文件夹。先在那台电脑上授权一个文件夹，或把它上面的客户端升到新版。",
          ),
          { device },
        );
  }
  return folders.source === "history"
    ? fill(
        tt(
          "{device}上的客户端还报不了授权目录，这里列的是它以前成功写入过的文件夹。要发到别的文件夹，请先在那台电脑上授权。",
        ),
        { device },
      )
    : fill(tt("只能发到{device}上已经授权的文件夹。要多一个落点，请在那台电脑上授权。"), {
        device,
      });
}

/* ------------------------------------------------------------------ *
 * 目标路径
 * ------------------------------------------------------------------ */

/**
 * 手机相册给的文件名是不可信输入。它只能是一个**名字**：
 * 带上路径分隔符或 `..` 就能从授权目录里走出去，那正是这个模块存在的意义要防的事。
 */
export function handoffFileName(
  name: string,
  fallback?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const base = String(name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f]/g, "")
    .trim();
  // 兜底名字会成为那台电脑上真实的文件名，所以它也要跟界面同一种语言 ——
  // 日语用户的下载目录里不该多出一个叫「手机文件」的文件。
  if (!base || base === "." || base === "..") return fallback || tt("手机文件");
  return base.slice(0, 120);
}

export function handoffTargetPath(
  folder: string,
  name: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  return joinLocalPath(folder, handoffFileName(name, undefined, tt));
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
  tt?: HandoffTranslate;
}): HandoffPlanResult {
  const tt = options.tt || KEEP_ZH;
  const deviceName = options.deviceName || tt("这台电脑");
  const bytes = options.media.bytes;
  if (!options.folder) {
    return {
      ok: false,
      reason: "no_folder",
      message: fill(tt("还没选落点。只能发到{device}上已经授权的文件夹。"), {
        device: deviceName,
      }),
    };
  }
  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      reason: "empty_file",
      message: tt("这个文件是空的，没有内容可以发。"),
    };
  }
  if (bytes.length > HANDOFF_MAX_TOTAL_BYTES) {
    const megabytes = Math.floor(HANDOFF_MAX_TOTAL_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: "too_large",
      message: fill(tt("这个文件有 {size}，一次最多只能发 {max} MB。"), {
        size: formatBytes(bytes.length, tt),
        max: megabytes,
      }),
    };
  }
  const path = handoffTargetPath(options.folder, options.media.name, tt);
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
      message: fill(
        tt("{device}现在离线。这个文件要分 {parts} 次送，中途它必须一直在线 —— 等它上线再发。"),
        { device: deviceName, parts: partCount },
      ),
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

export function formatBytes(value: number, tt: HandoffTranslate = KEEP_ZH): string {
  // KB / MB 是国际单位，17 种语言都照写；只有「字节」这个词要跟界面同一种语言。
  if (value < 1024) return fill(tt("{size} 字节"), { size: value });
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
  /** 界面的翻译口。不传就落回中文原文。 */
  tt?: HandoffTranslate;
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
  const tt = options.tt || KEEP_ZH;
  const deviceName = options.deviceName || tt("这台电脑");
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
          message: handoffFailureMessage(
            outcome.denyReason || outcome.status,
            deviceName,
            {},
            tt,
          ),
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
      return failureFromError(error, deviceName, 0, 1, tt);
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
      return failureFromError(error, deviceName, part.part_index - 1, totalParts, tt);
    }
    let outcome: LocalTask;
    try {
      outcome = await awaitPart(created.taskId);
    } catch (error) {
      return failureFromError(error, deviceName, part.part_index - 1, totalParts, tt);
    }
    if (outcome.status !== "succeeded") {
      const code = outcome.denyReason || outcome.status;
      return {
        ok: false,
        code,
        message: handoffFailureMessage(
          code,
          deviceName,
          { landedParts: part.part_index - 1, totalParts },
          tt,
        ),
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
  tt: HandoffTranslate = KEEP_ZH,
): HandoffFailure {
  const code =
    error instanceof LocalTaskApiError ? error.code : "network_error";
  const limit = error instanceof LocalTaskApiError ? error.limit : undefined;
  return {
    ok: false,
    code,
    message: handoffFailureMessage(
      code,
      deviceName,
      { limit, landedParts, totalParts },
      tt,
    ),
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
  deviceName?: string,
  context: { limit?: number; landedParts?: number; totalParts?: number } = {},
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  const partial =
    (context.landedParts ?? 0) > 0 && (context.totalParts ?? 0) > 1
      ? fill(
          tt("已经送到 {landed}/{total} 片，{device}上现在是一个不完整的文件，重发会从头覆盖它。"),
          { landed: context.landedParts!, total: context.totalParts!, device },
        )
      : "";
  const base = handoffFailureBase(code, device, context.limit, tt);
  return partial ? `${base}${partial}` : base;
}

function handoffFailureBase(
  code: string,
  device: string,
  limit: number | undefined,
  tt: HandoffTranslate,
): string {
  switch (code) {
    case "grant_missing":
      return fill(
        tt("{device}还没授权「写入与新建文件」。要在那台电脑上授权之后才能收东西。"),
        { device },
      );
    case "path_outside_grant":
      return fill(
        tt("这个文件夹不在{device}已授权的范围内。请换一个落点，或者在那台电脑上授权它。"),
        { device },
      );
    case "device_offline":
      return fill(tt("{device}现在离线。等它上线再发。"), { device });
    case "payload_too_large":
      return limit
        ? fill(tt("这个文件太大，一片最多 {size}。"), {
            size: formatBytes(Math.floor((limit / 4) * 3), tt),
          })
        : tt("这个文件太大，送不过去。");
    case "handoff_part_out_of_order":
    case "handoff_part_not_landed":
    case "handoff_offset_mismatch":
      return fill(
        tt(
          "传输中断了：{device}收到的片对不上号，已经停下来，不会留下一个错乱的文件。请重新发一次。",
        ),
        { device },
      );
    case "network_error":
      return tt("网络断了，这一片没送出去。恢复后重新发一次。");
    case "unauthorized":
      return tt("登录后才能把文件发到你的电脑上。");
    case "failed":
      return fill(
        tt("{device}写这个文件时失败了。失败原因的全文在那台电脑的「本地审计」里。"),
        { device },
      );
    case "expired":
      return fill(tt("等了 24 小时{device}也没上线，这次发送已经过期。"), { device });
    case "cancelled":
      return tt("已取消，文件没有写到那台电脑上。");
    default:
      // 协议 §7 那张表由 `api/device-error-copy.ts` 独家持有（设备页与这一屏共用
      // 同一句），它今天还是中文硬编，而那不是这个模块能改的文件 ——
      // 见 `signals/W07-signal.md`：额度、撤销、真机拒绝这几个码到这一屏仍是中文。
      return deviceErrorCopy(code, { deviceName: device, limit });
  }
}

/** 进度条旁边那一句。单片时不报「1/1 片」，那只会让人困惑。 */
export function handoffProgressText(
  progress: HandoffProgress,
  deviceName?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  if (progress.phase === "queued") {
    return fill(tt("已排队，等{device}上线后自动写入。"), { device });
  }
  if (progress.phase === "done") return tt("已送达。");
  if (progress.totalParts <= 1) return fill(tt("正在发送到{device}…"), { device });
  return fill(tt("正在发送 {sent}/{total} 片…"), {
    sent: progress.sentParts + 1,
    total: progress.totalParts,
  });
}

/** 送达之后那一句：说清文件到底躺在哪。 */
export function handoffSuccessText(
  result: HandoffSuccess,
  deviceName?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  return result.queued
    ? fill(tt("已排队，等{device}上线后会写入 {path}。"), { device, path: result.path })
    : fill(tt("已落到 {path}。"), { path: result.path });
}

/** 送达按钮上那一句。设备名嵌在句子里，位置由各语言的译文自己决定。 */
export function handoffSendLabel(
  deviceName?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  return fill(tt("发送到{device}"), { device });
}

/**
 * 那台电脑离线时，按钮上方提前说清「小文件照旧、大文件得等」。
 *
 * 提前说是有代价差别的：让用户选完一张 8 MB 的照片、等到分片那一刻才被拒，
 * 比一开始就告诉他要糟得多。
 */
export function handoffOfflineNotice(
  deviceName?: string,
  tt: HandoffTranslate = KEEP_ZH,
): string {
  const device = deviceName || tt("这台电脑");
  return fill(
    tt("{device}现在离线。小文件会排队等它上线；大文件要分几次送，得等它上线后再发。"),
    { device },
  );
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
