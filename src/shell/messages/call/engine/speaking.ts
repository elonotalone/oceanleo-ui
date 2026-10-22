// 说话检测（纯函数）：SDK `audioVolume` 每 ~300 ms 给一次每人音量（0–100，见 sdk.ts），
// 这里做指数平滑 + 双阈值 + 拖尾，得到「在说话」与平滑后的电平。时间由参数注入。

export interface SpeakingConfig {
  /** 平滑后电平 ≥ 这个值开始算说话。 */
  onThreshold: number;
  /** 说话中，平滑后电平 ≥ 这个值都算「还在说」。 */
  offThreshold: number;
  /** 低于 offThreshold 持续这么久才算停（避免字间停顿闪烁）。 */
  holdMs: number;
  /** 上升 / 下降时的平滑系数（0–1，越大越跟手）。 */
  attack: number;
  release: number;
}

// 阈值按 SDK 电平口径（频域均值，0–100，静音约 0–3）估的，V02 用真实语音假麦克风核对后可调。
// 300 ms 一次采样时：停说后约 1 s 熄灭（下降平滑 2–3 拍 + 0.5 s 拖尾），字间停顿（≤0.5 s）不会熄。
export const SPEAKING_DEFAULTS: SpeakingConfig = { onThreshold: 12, offThreshold: 6, holdMs: 500, attack: 0.6, release: 0.5 };

export interface SpeakerState {
  /** 平滑后的电平（0–100）。 */
  level: number;
  speaking: boolean;
  speakingSince: number | null;
  lastSpokeAt: number | null;
  lastLoudAt: number | null;
}

export const QUIET_SPEAKER: SpeakerState = { level: 0, speaking: false, speakingSince: null, lastSpokeAt: null, lastLoudAt: null };

export function updateSpeaker(
  previous: SpeakerState,
  rawVolume: number,
  now: number,
  config: SpeakingConfig = SPEAKING_DEFAULTS,
): SpeakerState {
  const raw = Number.isFinite(rawVolume) ? Math.min(100, Math.max(0, rawVolume)) : 0;
  const alpha = raw > previous.level ? config.attack : config.release;
  const level = previous.level + alpha * (raw - previous.level);
  let { speaking, speakingSince, lastSpokeAt, lastLoudAt } = previous;
  if (speaking) {
    if (level >= config.offThreshold) {
      lastLoudAt = now;
    } else if (lastLoudAt === null || now - lastLoudAt >= config.holdMs) {
      speaking = false;
      speakingSince = null;
    }
  } else if (level >= config.onThreshold) {
    speaking = true;
    speakingSince = now;
    lastLoudAt = now;
  }
  if (speaking) lastSpokeAt = now;
  return { level, speaking, speakingSince, lastSpokeAt, lastLoudAt };
}

/** 给界面的 0–1 电平（两位小数；正常说话大约 0.3–1）。 */
export function viewLevel(state: SpeakerState | undefined): number {
  if (!state) return 0;
  return Math.round(Math.min(1, Math.max(0, state.level / 40)) * 100) / 100;
}

/** 停止说话（静音、离开、掉线时用）：保留 lastSpokeAt。 */
export function silence(state: SpeakerState | undefined): SpeakerState {
  if (!state) return QUIET_SPEAKER;
  return { ...state, level: 0, speaking: false, speakingSince: null };
}
