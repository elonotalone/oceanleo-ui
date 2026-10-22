// 来电铃声：Web Audio 现场合成一段简短的双音铃（任务书 P3：不引入音频文件）。纯 TS + 依赖注入，测试用假 AudioContext。
//
// 节奏：两声「嘟」（每声 0.38 秒，两个正弦音 C5 + E5 叠加，起落各 30 毫秒防爆音），间隔 0.12 秒，每 2.4 秒一轮。
// 调度：按 AudioContext 时钟预排未来 3 秒，计时器每秒补排一次——后台标签页计时器被节流到 1 秒也不断音。
// 自动播放：浏览器在用户没和页面交互过时会让 AudioContext 停在 suspended；start() 此时返回 "blocked"，
// 由界面给出可见提示，用户点一下再 unlock()（必须在点击处理里同步调用，才算用户手势）。

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(target: unknown): unknown;
  disconnect?(): void;
}

export interface OscillatorLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface GainLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  close(): Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
}

export interface RingtoneDeps {
  createContext(): AudioContextLike | null;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  wait(ms: number): Promise<void>;
}

export type RingStartResult = "playing" | "blocked" | "unsupported";

export const RING_TONES_HZ = [523.25, 659.25] as const;
export const RING_BURSTS = [
  { at: 0, duration: 0.38 },
  { at: 0.5, duration: 0.38 },
] as const;
export const RING_PERIOD_S = 2.4;
export const RING_GAIN = 0.12;
const RAMP_S = 0.03;
const LOOKAHEAD_S = 3;
const TICK_MS = 1000;
/** resume() 在没有用户手势时可能永远不 resolve；最多等这么久就判「被拦」。 */
const RESUME_WAIT_MS = 400;

export interface Ringtone {
  start(): Promise<RingStartResult>;
  /** 用户点了「开启铃声」：在点击处理里调用；成功后接着响。 */
  unlock(): Promise<RingStartResult>;
  stop(): void;
  playing(): boolean;
}

export function createRingtone(deps: RingtoneDeps): Ringtone {
  let ctx: AudioContextLike | null = null;
  let timer: unknown = null;
  let nextAt = 0;
  let active = false;
  /** stop() 之后到达的 start/unlock 结果作废。 */
  let generation = 0;

  function burst(at: number, duration: number): void {
    if (!ctx) return;
    for (const hz of RING_TONES_HZ) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(RING_GAIN / RING_TONES_HZ.length, at + RAMP_S);
      gain.gain.setValueAtTime(RING_GAIN / RING_TONES_HZ.length, at + duration - RAMP_S);
      gain.gain.linearRampToValueAtTime(0, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    }
  }

  function scheduleAhead(): void {
    if (!ctx || !active) return;
    const horizon = ctx.currentTime + LOOKAHEAD_S;
    // 标签页被冻结过一阵再醒来：别把错过的几轮一口气补响。
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    while (nextAt < horizon) {
      for (const b of RING_BURSTS) burst(nextAt + b.at, b.duration);
      nextAt += RING_PERIOD_S;
    }
  }

  function begin(): RingStartResult {
    if (!ctx) return "unsupported";
    active = true;
    nextAt = ctx.currentTime + 0.05;
    scheduleAhead();
    timer = deps.setInterval(scheduleAhead, TICK_MS);
    return "playing";
  }

  function ensureContext(): AudioContextLike | null {
    if (ctx) return ctx;
    try {
      ctx = deps.createContext();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  return {
    async start() {
      if (active) return "playing";
      const mine = ++generation;
      const context = ensureContext();
      if (!context) return "unsupported";
      if (context.state !== "running") {
        try {
          await Promise.race([context.resume(), deps.wait(RESUME_WAIT_MS)]);
        } catch {
          /* 被拦：下面按状态判 */
        }
      }
      if (mine !== generation) return "blocked";
      if (context.state !== "running") return "blocked";
      return begin();
    },
    async unlock() {
      if (active) return "playing";
      const mine = ++generation;
      const context = ensureContext();
      if (!context) return "unsupported";
      try {
        // 同步发起 resume（还在点击处理的调用栈里），再等它落定；个别浏览器拦下时 resume 永不落定，最多等 1.6 秒。
        await Promise.race([context.resume(), deps.wait(RESUME_WAIT_MS * 4)]);
      } catch {
        return "blocked";
      }
      if (mine !== generation) return "blocked";
      if (context.state !== "running") return "blocked";
      return begin();
    },
    stop() {
      generation += 1;
      active = false;
      if (timer !== null) deps.clearInterval(timer);
      timer = null;
      const context = ctx;
      ctx = null;
      // 关掉上下文 = 已排好的振荡器全部停掉。
      if (context) void context.close().catch(() => undefined);
    },
    playing() {
      return active;
    },
  };
}

/** 浏览器里的默认依赖。没有 Web Audio 的环境返回 null 上下文（start → "unsupported"）。 */
export function browserRingtoneDeps(): RingtoneDeps {
  return {
    createContext() {
      if (typeof window === "undefined") return null;
      const Ctor =
        (window as unknown as { AudioContext?: new () => AudioContextLike }).AudioContext ??
        (window as unknown as { webkitAudioContext?: new () => AudioContextLike }).webkitAudioContext;
      return Ctor ? new Ctor() : null;
    },
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
