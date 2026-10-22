// 「通话检测」里的连接测试：`callsApi.testToken()` 拿 `diag-` 频道凭证 → 独立诊断引擎入会 →
// 发布音频约 5 秒、每秒读一次统计 → 离开 → 好/一般/差 + 原始数字。
// 依赖全部注入（凭证、引擎、时钟），纯逻辑，便于单测；无论成功、失败还是中途关闭面板，都会离开频道并销毁实例。
import type { RtcCredentials } from "../../../../lib/im/call-types";
import type { CallStats, NetLevel } from "../engine";
import { combineLevels, levelFromStats, qualityFromLevel } from "./health";
import type { ConnectionTestNumbers } from "./report";

/** 发布音频并采样的时长（任务书：5 秒）。 */
export const TEST_DURATION_MS = 5000;
export const TEST_SAMPLE_MS = 1000;
export const TEST_JOIN_TIMEOUT_MS = 15000;
/** 入会耗时：3 秒内不扣分，3–8 秒最多「一般」，8 秒以上「差」。 */
export const JOIN_FAIR_MS = 3000;
export const JOIN_POOR_MS = 8000;

export interface DiagnosticsEngineLike {
  join(rtc: RtcCredentials, opts?: { displayName?: string; micDeviceId?: string | null }): Promise<void>;
  getStats(): Promise<CallStats>;
  leave(): Promise<void>;
}

export type ConnectionTestStage = "token" | "engine" | "joining" | "measuring" | "leaving";

export type ConnectionTestErrorCode =
  | "rate_limited"
  | "artc_not_configured"
  | "not_signed_in"
  | "network"
  | "unsupported"
  | "sdk_unavailable"
  | "join_failed"
  | "join_timeout"
  | "in_call_unavailable"
  | "aborted"
  | "failed";

export interface ConnectionTestProgress {
  stage: ConnectionTestStage;
  /** measuring 阶段剩余毫秒。 */
  remainingMs?: number;
}

export interface ConnectionTestDeps {
  testToken(): Promise<{ rtc: RtcCredentials }>;
  createEngine(): Promise<DiagnosticsEngineLike>;
  sleep(ms: number): Promise<void>;
  now(): number;
  micDeviceId?: string | null;
  displayName?: string;
  durationMs?: number;
  sampleEveryMs?: number;
  joinTimeoutMs?: number;
  signal?: AbortSignal;
  onProgress?(progress: ConnectionTestProgress): void;
}

export interface ConnectionTestResult {
  grade: "good" | "fair" | "poor" | "failed";
  level: NetLevel;
  numbers: ConnectionTestNumbers | null;
  error: ConnectionTestErrorCode | null;
}

class TestAborted extends Error {
  constructor() {
    super("aborted");
    this.name = "TestAborted";
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function finiteValues(samples: CallStats[], key: keyof CallStats): number[] {
  return samples
    .map((sample) => sample?.[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
}

/** 多次采样合成一份：时延与码率取中位数（抗单次抖动），丢包取最大（不掩盖问题）；全取不到的项为 null。 */
export function summarizeSamples(samples: CallStats[]): CallStats {
  const maxOrNull = (values: number[]) => (values.length ? Math.max(...values) : null);
  return {
    rttMs: median(finiteValues(samples, "rttMs")),
    upLossPct: maxOrNull(finiteValues(samples, "upLossPct")),
    downLossPct: maxOrNull(finiteValues(samples, "downLossPct")),
    upKbps: median(finiteValues(samples, "upKbps")),
    downKbps: median(finiteValues(samples, "downKbps")),
  };
}

export function joinLevel(joinMs: number | null): NetLevel {
  if (joinMs === null || !Number.isFinite(joinMs) || joinMs < 0) return 0;
  if (joinMs < JOIN_FAIR_MS) return 5;
  if (joinMs < JOIN_POOR_MS) return 3;
  return 2;
}

/** 统计（丢包/时延）与入会耗时取较差者 → 好/一般/差。 */
export function gradeConnection(numbers: ConnectionTestNumbers): { grade: "good" | "fair" | "poor"; level: NetLevel } {
  const level = combineLevels(levelFromStats(numbers), joinLevel(numbers.joinMs));
  const quality = qualityFromLevel(level);
  if (quality === "good") return { grade: "good", level };
  if (quality === "fair") return { grade: "fair", level };
  if (quality === "poor") return { grade: "poor", level };
  // 统计与入会耗时都未知：连上了但没有任何数字，不冒充「好」。
  return { grade: "fair", level: 3 };
}

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

/** 把各阶段的异常归成固定的几种原因（文案见 `connectionTestErrorText`）。 */
export function connectionTestErrorCode(error: unknown, stage: ConnectionTestStage): ConnectionTestErrorCode {
  const e = (error ?? {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (e.name === "AbortError" || e.name === "TestAborted") return "aborted";
  if (typeof e.status === "number") {
    if (code === "rate_limited" || e.status === 429) return "rate_limited";
    if (code === "artc_not_configured") return "artc_not_configured";
    if (e.status === 401) return "not_signed_in";
    if (e.status === 0) return "network";
    return "failed";
  }
  if (/multi[_ -]?instance|createInstance/i.test(message)) return "in_call_unavailable";
  if (/unsupported|not[_ ]supported/i.test(message)) return "unsupported";
  if (message === "join_timeout") return "join_timeout";
  if (stage === "engine" || /sdk|load|script|import/i.test(message)) return "sdk_unavailable";
  if (stage === "joining") return "join_failed";
  return "failed";
}

export function connectionTestErrorText(code: ConnectionTestErrorCode): string | null {
  switch (code) {
    case "rate_limited":
      return "测试太频繁了，请稍后再试。";
    case "artc_not_configured":
      return "通话服务暂未开通，暂时无法测试。";
    case "not_signed_in":
      return "请先登录再测试。";
    case "network":
      return "网络连接中断，请检查网络后再试。";
    case "unsupported":
      return "这个浏览器不支持通话。";
    case "sdk_unavailable":
      return "通话组件加载失败，请检查网络后再试。";
    case "join_failed":
      return "没能连上通话服务器，请检查网络或防火墙设置。";
    case "join_timeout":
      return "连接通话服务器超时，请检查网络或防火墙设置。";
    case "in_call_unavailable":
      return "通话中无法做连接测试，挂断后再试。";
    case "aborted":
      return null;
    default:
      return "连接测试失败，请稍后再试。";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("join_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export async function runConnectionTest(deps: ConnectionTestDeps): Promise<ConnectionTestResult> {
  const duration = Math.max(0, deps.durationMs ?? TEST_DURATION_MS);
  const every = Math.max(1, deps.sampleEveryMs ?? TEST_SAMPLE_MS);
  const checkAbort = () => {
    if (deps.signal?.aborted) throw new TestAborted();
  };
  let stage: ConnectionTestStage = "token";
  let engine: DiagnosticsEngineLike | null = null;
  try {
    checkAbort();
    deps.onProgress?.({ stage: "token" });
    const { rtc } = await deps.testToken();
    checkAbort();
    stage = "engine";
    deps.onProgress?.({ stage: "engine" });
    engine = await deps.createEngine();
    checkAbort();
    stage = "joining";
    deps.onProgress?.({ stage: "joining" });
    const started = deps.now();
    await withTimeout(
      engine.join(rtc, { displayName: deps.displayName, micDeviceId: deps.micDeviceId ?? null }),
      deps.joinTimeoutMs ?? TEST_JOIN_TIMEOUT_MS,
    );
    const joinMs = Math.max(0, deps.now() - started);
    checkAbort();
    stage = "measuring";
    const samples: CallStats[] = [];
    for (let elapsed = 0; elapsed < duration; elapsed += every) {
      deps.onProgress?.({ stage: "measuring", remainingMs: duration - elapsed });
      await deps.sleep(Math.min(every, duration - elapsed));
      checkAbort();
      try {
        samples.push(await engine.getStats());
      } catch {
        // 这一次取不到就跳过，不编造
      }
    }
    const numbers: ConnectionTestNumbers = { ...summarizeSamples(samples), joinMs };
    const { grade, level } = gradeConnection(numbers);
    return { grade, level, numbers, error: null };
  } catch (error) {
    const code = deps.signal?.aborted ? "aborted" : connectionTestErrorCode(error, stage);
    return { grade: "failed", level: 0, numbers: null, error: code };
  } finally {
    deps.onProgress?.({ stage: "leaving" });
    if (engine) {
      try {
        await engine.leave();
      } catch {
        // 已经离开
      }
    }
  }
}
