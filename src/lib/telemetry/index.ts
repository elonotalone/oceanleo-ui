// ============================================================================
// 遥测管道的核心 —— 事件形状、脱敏、环形缓冲、可插拔 sink
// ----------------------------------------------------------------------------
// 这一波（W09）只建管道，不建后端。理由：`web-vitals` / Sentry / OpenTelemetry
// 在四仓 17 份 package.json 里**一个都不存在**，所以「chunk 加载失败」这类故障
// 在生产上根本没有信号，只能等用户截图。先让信号存在、且有统一形状；
// **接到哪儿是下一波的决定**。
//
// 依赖方向（不许反过来）：
//
//     index.ts  ← errors.ts
//               ← vitals.ts
//
// `index.ts` **不 import 任何兄弟文件**。这不是洁癖：`tests/helpers/module-bench.mjs`
// 对循环依赖是直接抛错的（`data:` 模块表达不了环），barrel 式的
// `export * from "./errors"` 会让三份测试在加载期就炸掉。
// 消费方按需直接引 `./telemetry/errors`、`./telemetry/vitals`。
// ============================================================================

/** 事件形状的版本号。改形状必须进版本，读端（W10 的回归闸）才认得出。 */
export const TELEMETRY_SCHEMA = 1;

export type TelemetrySeverity = "info" | "warn" | "error";

/**
 * 事件来源。三个错误来源（错误边界 / chunk / 自动保存）与一个读数来源（vitals）
 * 共用同一个形状——任务书要的「三个来源的事件形状一致」就是这条。
 */
export type TelemetrySource =
  | "vitals"
  | "error-boundary"
  | "chunk"
  | "autosave";

/** detail 只收标量。对象会把用户内容整棵带进来，脱敏也就无从谈起。 */
export type TelemetryDetailValue = string | number | boolean;

export interface TelemetryEvent {
  readonly schema: typeof TELEMETRY_SCHEMA;
  readonly id: string;
  /** `Date.now()`。用挂钟而不是 `performance.now()`：跨页面会话要能对齐。 */
  readonly ts: number;
  readonly source: TelemetrySource;
  /** 点分小写，例如 `chunk.retry` / `vitals.INP` / `boundary.catch`。 */
  readonly name: string;
  readonly severity: TelemetrySeverity;
  /** 数值读数（vitals 的毫秒/分值、重试次数……）。无则省略。 */
  readonly value?: number;
  readonly detail: Readonly<Record<string, TelemetryDetailValue>>;
}

export interface TelemetrySink {
  readonly id: string;
  /**
   * 会把事件送出本机的 sink。**默认一律不投递**（见 `forwardSampleRate`）。
   * 本波不注册任何 remote sink，这个标记是给下一波接后端时用的闸。
   */
  readonly remote?: boolean;
  receive(event: TelemetryEvent): void;
}

export interface TelemetryConfig {
  /** 环形缓冲容量。 */
  bufferCapacity: number;
  /** 本地缓冲采样率。默认 1 = 100% 采。 */
  bufferSampleRate: number;
  /** remote sink 的采样率。**默认 0 = 一个字节都不外发。** */
  forwardSampleRate: number;
  /** `console` sink 从哪一档起打印。默认只打 `error`，免得刷屏。 */
  consoleSeverity: TelemetrySeverity | "off";
}

const DEFAULT_CONFIG: TelemetryConfig = {
  bufferCapacity: 128,
  bufferSampleRate: 1,
  forwardSampleRate: 0,
  consoleSeverity: "error",
};

let config: TelemetryConfig = { ...DEFAULT_CONFIG };

// ----------------------------------------------------------------------------
// 脱敏
// ----------------------------------------------------------------------------

/**
 * 一条 detail 字符串里可能夹带用户内容的形状。命中就整段换成 `REDACTED`，
 * **不做部分保留**——「保留前几个字符」在文件名上等于没脱敏。
 *
 * 覆盖：带扩展名的文件名（`季度汇报-v3.xlsx`）、路径（`/Users/…`、`C:\…`）、
 * URL、`blob:`/`data:` 句柄、邮箱。
 */
const USER_CONTENT_PATTERNS: readonly RegExp[] = [
  /[\w\u4e00-\u9fff][^\s/\\:]*\.[A-Za-z0-9]{1,8}(?![\w.])/u,
  /[/\\][^\s]*[/\\]/u,
  /\b[a-z][a-z0-9+.-]*:\/\//iu,
  /\b(?:blob|data|filesystem):/iu,
  /[^\s@]+@[^\s@]+\.[^\s@]+/u,
];

export const REDACTED = "«redacted»";

/** detail 字符串的长度上限。超了截断——长字符串本身就是文档正文的形状。 */
const MAX_DETAIL_LENGTH = 120;

/**
 * 单个 detail 值的脱敏。字符串走模式匹配 + 截断，数字挡住非有限值，布尔原样。
 *
 * 这是**最后一道**闸，不是唯一一道：错误来源那边压根不把 `error.message` 放进事件
 * （见 `errors.ts` 的 `describeError`）。两道都在，是因为 detail 是开放的，
 * 将来谁加一个字段都得先过这里。
 */
export function redactValue(value: TelemetryDetailValue): TelemetryDetailValue {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  for (const pattern of USER_CONTENT_PATTERNS) {
    if (pattern.test(value)) return REDACTED;
  }
  return value.length > MAX_DETAIL_LENGTH
    ? `${value.slice(0, MAX_DETAIL_LENGTH)}…`
    : value;
}

export function redactDetail(
  detail: Readonly<Record<string, TelemetryDetailValue>>,
): Record<string, TelemetryDetailValue> {
  const safe: Record<string, TelemetryDetailValue> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (value === undefined || value === null) continue;
    safe[key] = redactValue(value);
  }
  return safe;
}

// ----------------------------------------------------------------------------
// 环形缓冲
// ----------------------------------------------------------------------------

let buffer: TelemetryEvent[] = [];

/** 缓冲快照。W10 的离线回归闸读的就是这个。 */
export function telemetrySnapshot(): readonly TelemetryEvent[] {
  return buffer.slice();
}

export function clearTelemetry(): void {
  buffer = [];
}

// ----------------------------------------------------------------------------
// sink 注册
// ----------------------------------------------------------------------------

const sinks = new Map<string, TelemetrySink>();

/** @returns 注销函数。 */
export function registerTelemetrySink(sink: TelemetrySink): () => void {
  sinks.set(sink.id, sink);
  return () => {
    if (sinks.get(sink.id) === sink) sinks.delete(sink.id);
  };
}

export function registeredTelemetrySinks(): readonly string[] {
  return [...sinks.keys()];
}

export function configureTelemetry(next: Partial<TelemetryConfig>): void {
  config = { ...config, ...next };
}

export function telemetryConfig(): Readonly<TelemetryConfig> {
  return config;
}

/** 测试与 `W10` 的闸用：把管道恢复到出厂状态。 */
export function resetTelemetry(): void {
  config = { ...DEFAULT_CONFIG };
  sinks.clear();
  buffer = [];
  eventSeq = 0;
}

// ----------------------------------------------------------------------------
// 发射
// ----------------------------------------------------------------------------

let eventSeq = 0;

/**
 * 事件 id。刻意**不用** `crypto.randomUUID()`：它在非安全上下文里不存在，
 * 而遥测绝不该因为自己取不到 id 就把调用方带崩。序号 + 随机后缀足够去重。
 */
function nextEventId(): string {
  eventSeq += 1;
  return `${eventSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const SEVERITY_RANK: Record<TelemetrySeverity, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

function consoleAllows(severity: TelemetrySeverity): boolean {
  if (config.consoleSeverity === "off") return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[config.consoleSeverity];
}

export interface TelemetryInput {
  source: TelemetrySource;
  name: string;
  severity?: TelemetrySeverity;
  value?: number;
  detail?: Readonly<Record<string, TelemetryDetailValue>>;
}

/**
 * 唯一的入口。三个错误来源与 vitals 都从这里走，所以形状不可能分叉。
 *
 * **永不抛**：遥测炸掉调用方是最没道理的一种崩溃。
 */
export function emitTelemetry(input: TelemetryInput): TelemetryEvent {
  const event: TelemetryEvent = Object.freeze({
    schema: TELEMETRY_SCHEMA,
    id: nextEventId(),
    ts: Date.now(),
    source: input.source,
    name: input.name,
    severity: input.severity ?? "info",
    ...(input.value === undefined || !Number.isFinite(input.value)
      ? {}
      : { value: input.value }),
    detail: Object.freeze(redactDetail(input.detail ?? {})),
  });

  if (Math.random() < config.bufferSampleRate) {
    buffer.push(event);
    if (buffer.length > config.bufferCapacity) {
      buffer.splice(0, buffer.length - config.bufferCapacity);
    }
  }

  if (consoleAllows(event.severity)) {
    const line = `[telemetry:${event.source}] ${event.name}`;
    if (event.severity === "error") console.error(line, event);
    else if (event.severity === "warn") console.warn(line, event);
    else console.info(line, event);
  }

  for (const sink of sinks.values()) {
    if (sink.remote && !(Math.random() < config.forwardSampleRate)) continue;
    try {
      sink.receive(event);
    } catch {
      // sink 自己炸了不该反噬被观测的代码。
    }
  }

  return event;
}
