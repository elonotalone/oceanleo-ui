// 字幕上行的 PCM 处理（合同 §3.1 / §3.6）：任意采样率的 Float32 单声道 → 16 kHz s16le 单声道，按 100 ms 一帧。
// 纯函数，不碰浏览器 API；采集（AudioWorklet）在 capture.ts，这里只做重采样与分帧，单测直接跑真实现。
// 16 位小端转换复用 src/lib/realtime-audio.ts（只 import，不改它）。
import { floatToPcm16LE, pcmSamplesPerFrame } from "../../../../lib/realtime-audio";

/** 服务端识别要的采样率（`ready.sample_rate` 没给时用它）。 */
export const CAPTIONS_SAMPLE_RATE = 16_000;
/** 每帧时长：合同 §3.1 允许 40–200 ms，这里取 100 ms（16 kHz 下 1600 个采样、3200 字节）。 */
export const CAPTIONS_FRAME_MS = 100;
export const CAPTIONS_FRAME_MS_MIN = 40;
export const CAPTIONS_FRAME_MS_MAX = 200;

const MIN_RATE = 8_000;
const MAX_RATE = 384_000;

function assertRate(rate: number, label: string): void {
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) throw new RangeError(`invalid_${label}_rate`);
}

/** 一帧多少个采样（合同 §3.1：40–200 ms）。 */
export function captionsFrameSamples(sampleRate: number = CAPTIONS_SAMPLE_RATE, frameMs: number = CAPTIONS_FRAME_MS): number {
  if (!Number.isFinite(frameMs) || frameMs < CAPTIONS_FRAME_MS_MIN || frameMs > CAPTIONS_FRAME_MS_MAX) {
    throw new RangeError("invalid_pcm_frame_shape");
  }
  return pcmSamplesPerFrame(sampleRate, frameMs);
}

export interface Resampler {
  readonly inputRate: number;
  readonly outputRate: number;
  /** 喂一段输入，吐出这段能算出的输出（跨段保留状态，块边界不丢不重）。 */
  push(input: Float32Array): Float32Array;
  reset(): void;
}

function finiteSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * 流式重采样。
 * - 降采样（48k/44.1k → 16k）：按输出采样覆盖的输入区间做面积平均（盒式低通 + 抽取），
 *   比直接抽点少混叠；非整数倍率（44.1k）用小数覆盖权重，长时间运行不漂移（每个输出窗独立计量）。
 * - 升采样（8k → 16k）：线性插值。
 * - 同采样率：原样复制。
 */
export function createResampler(inputRate: number, outputRate: number): Resampler {
  assertRate(inputRate, "input");
  assertRate(outputRate, "output");
  const step = inputRate / outputRate; // 每个输出采样对应多少个输入采样

  if (inputRate === outputRate) {
    return {
      inputRate,
      outputRate,
      push: (input) => {
        const out = new Float32Array(input.length);
        for (let i = 0; i < input.length; i += 1) out[i] = finiteSample(input[i]);
        return out;
      },
      reset: () => undefined,
    };
  }

  if (step > 1) {
    let acc = 0;
    let remaining = step;
    return {
      inputRate,
      outputRate,
      push(input) {
        const out = new Float32Array(Math.ceil((input.length + step) / step) + 1);
        let n = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = finiteSample(input[i]);
          let cover = 1;
          while (cover > 0) {
            const take = cover < remaining ? cover : remaining;
            acc += x * take;
            remaining -= take;
            cover -= take;
            if (remaining <= 1e-9) {
              out[n] = acc / step;
              n += 1;
              acc = 0;
              remaining = step;
            }
          }
        }
        return out.slice(0, n);
      },
      reset() {
        acc = 0;
        remaining = step;
      },
    };
  }

  let prev = 0;
  let primed = false;
  let pos = 0; // 下一个输出点落在 prev→当前输入 之间的位置（0–1）
  return {
    inputRate,
    outputRate,
    push(input) {
      const out = new Float32Array(Math.ceil(input.length / step) + 2);
      let n = 0;
      for (let i = 0; i < input.length; i += 1) {
        const x = finiteSample(input[i]);
        if (!primed) {
          prev = x;
          primed = true;
          continue;
        }
        while (pos < 1) {
          out[n] = prev + (x - prev) * pos;
          n += 1;
          pos += step;
        }
        pos -= 1;
        prev = x;
      }
      return out.slice(0, n);
    },
    reset() {
      prev = 0;
      primed = false;
      pos = 0;
    },
  };
}

export interface PcmFramer {
  readonly frameSamples: number;
  /** 攒够一帧就吐一帧 s16le（每帧都是新的 Uint8Array，可直接交给 WebSocket）。 */
  push(samples: Float32Array): Uint8Array[];
  /** 丢掉不满一帧的尾巴（静音/重连时用，免得把旧声音拼到新的一段前面）。 */
  reset(): void;
  pendingSamples(): number;
}

export function createPcmFramer(frameSamples: number): PcmFramer {
  if (!Number.isInteger(frameSamples) || frameSamples <= 0) throw new RangeError("invalid_frame_samples");
  const buffer = new Float32Array(frameSamples);
  let fill = 0;
  return {
    frameSamples,
    push(samples) {
      const frames: Uint8Array[] = [];
      let i = 0;
      while (i < samples.length) {
        const take = Math.min(frameSamples - fill, samples.length - i);
        buffer.set(samples.subarray(i, i + take), fill);
        fill += take;
        i += take;
        if (fill === frameSamples) {
          frames.push(floatToPcm16LE(buffer));
          fill = 0;
        }
      }
      return frames;
    },
    reset() {
      fill = 0;
    },
    pendingSamples: () => fill,
  };
}

export interface CaptionsPcmPipeline {
  readonly inputRate: number;
  readonly outputRate: number;
  readonly frameSamples: number;
  readonly frameBytes: number;
  push(input: Float32Array): Uint8Array[];
  reset(): void;
}

/** 采集端采样率 → 服务端采样率，按 frameMs 分帧（默认 16 kHz、100 ms）。 */
export function createCaptionsPcmPipeline(
  inputRate: number,
  outputRate: number = CAPTIONS_SAMPLE_RATE,
  frameMs: number = CAPTIONS_FRAME_MS,
): CaptionsPcmPipeline {
  const resampler = createResampler(inputRate, outputRate);
  const framer = createPcmFramer(captionsFrameSamples(outputRate, frameMs));
  return {
    inputRate,
    outputRate,
    frameSamples: framer.frameSamples,
    frameBytes: framer.frameSamples * 2,
    push: (input) => framer.push(resampler.push(input)),
    reset() {
      resampler.reset();
      framer.reset();
    },
  };
}

/** 多声道 → 单声道（逐采样平均）。单声道原样返回。 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map((channel) => channel.length));
  const out = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i += 1) out[i] += finiteSample(channel[i]);
  }
  for (let i = 0; i < length; i += 1) out[i] /= channels.length;
  return out;
}
