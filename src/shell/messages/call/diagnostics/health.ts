// 网络健康度：把通话统计（丢包、往返时延、码率）换算成 NetLevel 与 好/一般/差，并判定「持续变差」。
// 纯函数模块（无 React、无浏览器 API），时间一律由调用方传入，便于单测。
import type { CallStats, NetLevel } from "../engine";

export type NetworkQuality = "unknown" | "good" | "fair" | "poor";
export type NetworkSuggestion = "audio_only" | "check_network" | null;

/** 采样间隔：每 2 秒取一次 `getStats()`（任务书 P2）。 */
export const HEALTH_POLL_MS = 2000;
/** 连续差满 6 秒（≥4 次采样）才算「持续变差」，偶发一次抖动不打扰人。 */
export const SUSTAIN_POOR_MS = 6000;
/** 持续变差之后要连续不差满 6 秒才解除，避免图标闪烁。 */
export const RECOVER_MS = 6000;

/**
 * 丢包率（%，取上下行较大者）分档：<2 很好，<5 好，<10 一般，<20 差，其余很差。
 * 语音有前向纠错与丢包隐藏，5% 以内基本无感；10% 以上明显断续，算「差」。
 */
export const LOSS_STEPS: readonly number[] = [2, 5, 10, 20];
/** 往返时延（ms）分档：<150 很好，<300 好，<500 一般，<1000 差，其余很差（就近接入点正常在 150 以内）。 */
export const RTT_STEPS: readonly number[] = [150, 300, 500, 1000];
/**
 * 码率只是弱信号，最多把等级压到「一般」，单靠码率不会判成「差」：
 * 统计里的码率是整条传输（音频 + 画面）的字节差；静止或遮住的摄像头、静止的共享屏幕、开了 DTX 的静音，
 * 码率本来就低，不能据此提示网络差。
 * - 发摄像头时上行低于 150 kbps → 一般；
 * - 正在收画面时下行低于 100 kbps → 一般（也可能是对方上行差）。
 */
export const CAMERA_UP_KBPS_FAIR = 150;
export const VIDEO_DOWN_KBPS_FAIR = 100;

export interface HealthContext {
  /** 自己在发摄像头。 */
  sendingCamera?: boolean;
  /** 正在收至少一路画面（未开仅语音且有人开摄像头/共享）。 */
  receivingVideo?: boolean;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** 数值越小越好的指标：按升序阈值分档。 */
function levelLowerIsBetter(value: number, steps: readonly number[]): NetLevel {
  if (value < steps[0]) return 5;
  if (value < steps[1]) return 4;
  if (value < steps[2]) return 3;
  if (value < steps[3]) return 2;
  return 1;
}

export function lossLevel(lossPct: number): NetLevel {
  return levelLowerIsBetter(lossPct, LOSS_STEPS);
}

export function rttLevel(rttMs: number): NetLevel {
  return levelLowerIsBetter(rttMs, RTT_STEPS);
}

/**
 * 统计 → 等级（各项取最差）。丢包与往返时延都取不到 → 0（未知），绝不拿缺省值冒充「好」；
 * 码率只能在已知等级上往「一般」压（见上面的说明），单独的码率不足以定级。
 */
export function levelFromStats(stats: CallStats | null | undefined, ctx: HealthContext = {}): NetLevel {
  if (!stats) return 0;
  const levels: NetLevel[] = [];
  const losses = [stats.upLossPct, stats.downLossPct].filter(finite);
  if (losses.length) levels.push(lossLevel(Math.max(...losses)));
  if (finite(stats.rttMs)) levels.push(rttLevel(stats.rttMs));
  if (!levels.length) return 0;
  if (ctx.sendingCamera && finite(stats.upKbps) && stats.upKbps < CAMERA_UP_KBPS_FAIR) levels.push(3);
  if (ctx.receivingVideo && finite(stats.downKbps) && stats.downKbps < VIDEO_DOWN_KBPS_FAIR) levels.push(3);
  return Math.min(...levels) as NetLevel;
}

/** 两个来源（统计推算、SDK 网络质量）取较差者；0 表示该来源未知，不参与。 */
export function combineLevels(...levels: Array<NetLevel | null | undefined>): NetLevel {
  const known = levels.filter((level): level is NetLevel => typeof level === "number" && level > 0);
  if (!known.length) return 0;
  return Math.min(...known) as NetLevel;
}

export function qualityFromLevel(level: NetLevel): NetworkQuality {
  if (level <= 0) return "unknown";
  if (level >= 4) return "good";
  if (level === 3) return "fair";
  return "poor";
}

/** `NetworkBars` 的可读名（中文原文即词典 key）。 */
export function netLevelLabel(level: NetLevel): string {
  switch (level) {
    case 5:
      return "网络：很好";
    case 4:
      return "网络：好";
    case 3:
      return "网络：一般";
    case 2:
      return "网络：差";
    case 1:
      return "网络：很差";
    default:
      return "网络：未知";
  }
}

/** 好/一般/差 的短名（检测面板与诊断信息用）。 */
export function qualityLabel(quality: NetworkQuality): string {
  switch (quality) {
    case "good":
      return "好";
    case "fair":
      return "一般";
    case "poor":
      return "差";
    default:
      return "未知";
  }
}

export interface HealthState {
  level: NetLevel;
  quality: NetworkQuality;
  stats: CallStats | null;
  /** 当前这段「差」从何时开始（ms）；不差时为 null。 */
  poorSince: number | null;
  /** 当前这段「不差」从何时开始（ms）；差或未知时为 null。 */
  okSince: number | null;
  sustainedPoor: boolean;
  updatedAt: number | null;
}

export function initialHealthState(): HealthState {
  return {
    level: 0,
    quality: "unknown",
    stats: null,
    poorSince: null,
    okSince: null,
    sustainedPoor: false,
    updatedAt: null,
  };
}

export interface HealthSample {
  /** 本次 `getStats()` 结果；取失败为 null。 */
  stats: CallStats | null;
  /** SDK 网络质量推出的等级（引擎的 `me.network`），0 未知。 */
  sdkLevel?: NetLevel;
  ctx?: HealthContext;
}

/**
 * 喂一次采样，返回新状态（不改入参）。
 * - 差：开始/延续「差」段；满 `SUSTAIN_POOR_MS` → 持续变差。
 * - 一般/好：开始/延续「不差」段；已处于持续变差时，满 `RECOVER_MS` 才解除。
 * - 未知（统计与 SDK 都取不到）：不延长任何一段，也不解除已有判定。
 */
export function reduceHealth(prev: HealthState, sample: HealthSample, now: number): HealthState {
  const statsLevel = levelFromStats(sample.stats, sample.ctx);
  const level = combineLevels(statsLevel, sample.sdkLevel ?? 0);
  const quality = qualityFromLevel(level);
  const next: HealthState = {
    ...prev,
    level,
    quality,
    stats: sample.stats ?? prev.stats,
    updatedAt: now,
  };
  if (quality === "poor") {
    next.okSince = null;
    next.poorSince = prev.poorSince ?? now;
    if (now - next.poorSince >= SUSTAIN_POOR_MS) next.sustainedPoor = true;
    return next;
  }
  if (quality === "unknown") {
    return next;
  }
  next.poorSince = null;
  next.okSince = prev.okSince ?? now;
  if (prev.sustainedPoor && now - next.okSince >= RECOVER_MS) next.sustainedPoor = false;
  return next;
}

/** 持续变差时给什么建议：没开仅语音 → 切换为仅语音；已经是仅语音 → 检查网络。 */
export function suggestionFor(state: Pick<HealthState, "sustainedPoor">, audioOnly: boolean): NetworkSuggestion {
  if (!state.sustainedPoor) return null;
  return audioOnly ? "check_network" : "audio_only";
}

export interface NetworkHealth {
  /** 当前等级（0 未知）。 */
  level: NetLevel;
  quality: NetworkQuality;
  /** 持续变差（连续 ≥6 秒为差）。 */
  sustainedPoor: boolean;
  /** 持续变差且未开仅语音时建议切换为仅语音。 */
  suggestAudioOnly: boolean;
  suggestion: NetworkSuggestion;
  /** 最近一次统计原始数字（取不到的字段为 null）。 */
  stats: CallStats | null;
  updatedAt: number | null;
}

export function healthView(state: HealthState, audioOnly: boolean): NetworkHealth {
  const suggestion = suggestionFor(state, audioOnly);
  return {
    level: state.level,
    quality: state.quality,
    sustainedPoor: state.sustainedPoor,
    suggestAudioOnly: suggestion === "audio_only",
    suggestion,
    stats: state.stats,
    updatedAt: state.updatedAt,
  };
}

/** 统计数字的可读格式（诊断信息与检测面板共用）；null → 「—」。 */
export function formatStat(value: number | null | undefined, unit: "ms" | "%" | "kbps"): string {
  if (!finite(value)) return "—";
  if (unit === "%") return `${Math.round(value * 10) / 10}%`;
  return `${Math.round(value)} ${unit}`;
}
