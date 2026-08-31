// ============================================================================
// 错误来源 —— 三个入口，一个形状
// ----------------------------------------------------------------------------
// 任务书要的三个来源：`componentDidCatch`、chunk 加载失败、自动保存进入 `error` 态。
// 它们走同一个 `reportError()`，所以事件形状不可能分叉：读端只要认一套。
//
// **`error.message` 一个字都不进事件。** 这不是保守，是必须：编辑器的错误消息里
// 经常直接嵌着素材文件名（「无法解析 季度汇报-v3.xlsx」）甚至文档片段。
// 事件里换成 `errorName`（构造函数名）+ `fingerprint`（不可逆哈希）——
// 分组、去重、算发生率都够用，而用户内容根本没有进入管道的那一步。
// `index.ts` 的 `redactValue()` 是第二道闸，管的是将来谁往 detail 里加字段。
// ============================================================================

import {
  emitTelemetry,
  type TelemetryDetailValue,
  type TelemetryEvent,
  type TelemetrySeverity,
} from "./index";

/**
 * 每一条错误事件都带的四个字段。三个来源共用，读端按这四个字段对齐。
 * 改这张表要同步改 `tests/telemetry-contract.test.mjs`。
 */
export const ERROR_EVENT_CORE_KEYS = [
  "errorName",
  "fingerprint",
  "surface",
  "recoverable",
] as const;

export interface ErrorDescription {
  /** `error.name`，例如 `ChunkLoadError` / `TypeError`。不含用户内容。 */
  readonly errorName: string;
  /** `name + message` 的 FNV-1a 32 位十六进制。不可逆，够用来分组。 */
  readonly fingerprint: string;
}

/**
 * FNV-1a 32 位。选它是因为**不需要依赖、不需要异步**：`crypto.subtle.digest`
 * 是 Promise 且只在安全上下文里有，而错误上报必须是同步且永不失败的。
 * 这里要的是分组键，不是密码学强度。
 */
function fingerprintOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function describeError(error: unknown): ErrorDescription {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      fingerprint: fingerprintOf(`${error.name}:${error.message}`),
    };
  }
  // 抛非 Error 的代码是有的（`throw "boom"`、reject 一个对象）。
  // 这里也不能把它 stringify 进事件——那正是用户内容最容易溜进来的口子。
  return {
    errorName: typeof error === "object" && error ? "ThrownObject" : "ThrownValue",
    fingerprint: fingerprintOf(Object.prototype.toString.call(error)),
  };
}

/** 三个来源共同的面（哪一块 UI 出的事）。 */
export type ErrorSurface = "workbench-route" | "workbench-shell" | "session";

interface ReportInput {
  source: "error-boundary" | "chunk" | "autosave";
  name: string;
  error: unknown;
  surface: ErrorSurface;
  /** 用户还有没有可走的下一步（有重试按钮、能切别的素材……）。 */
  recoverable: boolean;
  severity?: TelemetrySeverity;
  value?: number;
  detail?: Readonly<Record<string, TelemetryDetailValue>>;
}

function reportError(input: ReportInput): TelemetryEvent {
  const described = describeError(input.error);
  return emitTelemetry({
    source: input.source,
    name: input.name,
    severity: input.severity ?? "error",
    value: input.value,
    detail: {
      errorName: described.errorName,
      fingerprint: described.fingerprint,
      surface: input.surface,
      recoverable: input.recoverable,
      ...input.detail,
    },
  });
}

// ----------------------------------------------------------------------------
// 来源 1：React 错误边界
// ----------------------------------------------------------------------------

export interface BoundaryErrorInput {
  /** 边界的标识，例如 `workbench-route:image`。 */
  boundary: string;
  /** 崩的是哪条路由。`routeKey` 里带素材 id，所以只传路由类型。 */
  routeId: string;
  error: unknown;
  /** 崩了之后外壳还在不在（per-route 边界成立时为 true）。 */
  recoverable: boolean;
}

export function reportBoundaryError(input: BoundaryErrorInput): TelemetryEvent {
  return reportError({
    source: "error-boundary",
    name: "boundary.catch",
    error: input.error,
    surface: "workbench-route",
    recoverable: input.recoverable,
    detail: { boundary: input.boundary, routeId: input.routeId },
  });
}

// ----------------------------------------------------------------------------
// 来源 2：chunk 加载
// ----------------------------------------------------------------------------

/** 耗尽重试之后的两种结局。文案与动作都不同，所以必须分开。 */
export type ChunkFailureKind = "network" | "stale-version";

export interface ChunkRetryInput {
  routeId: string;
  /** 第几次重试（1 起）。 */
  attempt: number;
  /** 这次退避睡了多久（含抖动）。 */
  delayMs: number;
  cacheBusted: boolean;
  error: unknown;
}

/** 重试**发生**时打一条。`warn` 而不是 `error`：还有机会救回来。 */
export function reportChunkRetry(input: ChunkRetryInput): TelemetryEvent {
  return reportError({
    source: "chunk",
    name: "chunk.retry",
    error: input.error,
    surface: "workbench-route",
    recoverable: true,
    severity: "warn",
    value: input.attempt,
    detail: {
      routeId: input.routeId,
      delayMs: Math.round(input.delayMs),
      cacheBusted: input.cacheBusted,
    },
  });
}

export interface ChunkFailureInput {
  routeId: string;
  /** 一共试了几次（含首次）。 */
  attempts: number;
  kind: ChunkFailureKind;
  error: unknown;
}

/** 重试耗尽时打一条。 */
export function reportChunkFailure(input: ChunkFailureInput): TelemetryEvent {
  return reportError({
    source: "chunk",
    name: "chunk.failed",
    error: input.error,
    surface: "workbench-route",
    // 两种结局都给了用户下一步动作（重试 / 刷新），所以都算可恢复。
    recoverable: true,
    value: input.attempts,
    detail: { routeId: input.routeId, kind: input.kind },
  });
}

/** 重试之后救回来了。没有这条就看不出重试到底有没有用。 */
export function reportChunkRecovered(input: {
  routeId: string;
  attempts: number;
}): TelemetryEvent {
  return emitTelemetry({
    source: "chunk",
    name: "chunk.recovered",
    severity: "info",
    value: input.attempts,
    detail: { routeId: input.routeId },
  });
}

// ----------------------------------------------------------------------------
// 来源 3：自动保存
// ----------------------------------------------------------------------------

export interface AutosaveErrorInput {
  /** 出事的环节，例如 `save-snapshot` / `ensure-session`。 */
  stage: string;
  error: unknown;
  /** 还会不会自动再试。会 ⇒ 用户不必做什么。 */
  willRetry: boolean;
}

export function reportAutosaveError(input: AutosaveErrorInput): TelemetryEvent {
  return reportError({
    source: "autosave",
    name: "autosave.error",
    error: input.error,
    surface: "session",
    recoverable: input.willRetry,
    detail: { stage: input.stage },
  });
}
