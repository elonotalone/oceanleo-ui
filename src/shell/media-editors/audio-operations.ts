export interface AudioSampleBlock {
  sampleRate: number;
  channels: Float32Array[];
}

interface AudioRegion {
  start?: number;
  end?: number;
}

export type AudioEditOperation =
  | { type: "crop"; start: number; end: number }
  | { type: "delete"; start: number; end: number }
  | ({
      type: "fade";
      edge: "in" | "out";
      duration: number;
    } & AudioRegion)
  | ({ type: "gain"; multiplier: number } & AudioRegion)
  | ({
      type: "effects";
      speed: number;
      lowGainDb: number;
      midGainDb: number;
      highGainDb: number;
    } & AudioRegion);

function finite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function validRegion(value: AudioRegion): boolean {
  return (
    (value.start === undefined && value.end === undefined) ||
    (Number.isFinite(value.start) &&
      Number.isFinite(value.end) &&
      Number(value.start) >= 0 &&
      Number(value.end) > Number(value.start))
  );
}

export function isAudioEditOperation(value: unknown): value is AudioEditOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const operation = value as AudioEditOperation;
  if (operation.type === "crop" || operation.type === "delete") {
    return validRegion(operation) && operation.start !== undefined;
  }
  if (operation.type === "fade") {
    return (
      validRegion(operation) &&
      (operation.edge === "in" || operation.edge === "out") &&
      Number.isFinite(operation.duration) &&
      operation.duration >= 0 &&
      operation.duration <= 60
    );
  }
  if (operation.type === "gain") {
    return (
      validRegion(operation) &&
      Number.isFinite(operation.multiplier) &&
      operation.multiplier >= 0 &&
      operation.multiplier <= 8
    );
  }
  return (
    operation.type === "effects" &&
    validRegion(operation) &&
    Number.isFinite(operation.speed) &&
    operation.speed >= 0.25 &&
    operation.speed <= 4 &&
    [operation.lowGainDb, operation.midGainDb, operation.highGainDb].every(
      (gain) => Number.isFinite(gain) && gain >= -24 && gain <= 24,
    )
  );
}

function cloneBlock(source: AudioSampleBlock): AudioSampleBlock {
  return {
    sampleRate: source.sampleRate,
    channels: source.channels.map((channel) => Float32Array.from(channel)),
  };
}

function sampleRange(
  source: AudioSampleBlock,
  operation: AudioRegion,
): { first: number; last: number } {
  const length = source.channels[0]?.length || 0;
  const first = Math.max(
    0,
    Math.min(
      Math.max(0, length - 1),
      Math.floor(finite(operation.start, 0) * source.sampleRate),
    ),
  );
  const last = Math.max(
    first,
    Math.min(
      length,
      Math.ceil(
        finite(operation.end, length / Math.max(1, source.sampleRate)) *
          source.sampleRate,
      ),
    ),
  );
  return { first, last };
}

function resampleLinear(source: Float32Array, speed: number): Float32Array {
  if (speed === 1 || source.length < 2) return Float32Array.from(source);
  const length = Math.max(1, Math.round(source.length / speed));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = Math.min(source.length - 1, index * speed);
    const left = Math.floor(position);
    const right = Math.min(source.length - 1, left + 1);
    const fraction = position - left;
    output[index] = source[left] * (1 - fraction) + source[right] * fraction;
  }
  return output;
}

type BiquadKind = "low-shelf" | "peaking" | "high-shelf";

/**
 * RBJ Audio EQ Cookbook biquad coefficients. This is the same stable
 * direct-form filter family used by Web Audio's BiquadFilterNode.
 */
function applyBiquad(
  samples: Float32Array,
  sampleRate: number,
  kind: BiquadKind,
  requestedFrequency: number,
  gainDb: number,
): Float32Array {
  if (gainDb === 0 || samples.length === 0) return Float32Array.from(samples);
  const frequency = Math.min(
    requestedFrequency,
    Math.max(10, sampleRate * 0.45),
  );
  const a = 10 ** (gainDb / 40);
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const q = 0.8;
  const alpha =
    kind === "peaking"
      ? sine / (2 * q)
      : (sine / 2) * Math.sqrt((a + 1 / a) * (1 / 0.8 - 1) + 2);
  const rootA = Math.sqrt(a);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  if (kind === "low-shelf") {
    b0 = a * ((a + 1) - (a - 1) * cosine + 2 * rootA * alpha);
    b1 = 2 * a * ((a - 1) - (a + 1) * cosine);
    b2 = a * ((a + 1) - (a - 1) * cosine - 2 * rootA * alpha);
    a0 = (a + 1) + (a - 1) * cosine + 2 * rootA * alpha;
    a1 = -2 * ((a - 1) + (a + 1) * cosine);
    a2 = (a + 1) + (a - 1) * cosine - 2 * rootA * alpha;
  } else if (kind === "high-shelf") {
    b0 = a * ((a + 1) + (a - 1) * cosine + 2 * rootA * alpha);
    b1 = -2 * a * ((a - 1) + (a + 1) * cosine);
    b2 = a * ((a + 1) + (a - 1) * cosine - 2 * rootA * alpha);
    a0 = (a + 1) - (a - 1) * cosine + 2 * rootA * alpha;
    a1 = 2 * ((a - 1) - (a + 1) * cosine);
    a2 = (a + 1) - (a - 1) * cosine - 2 * rootA * alpha;
  } else {
    b0 = 1 + alpha * a;
    b1 = -2 * cosine;
    b2 = 1 - alpha * a;
    a0 = 1 + alpha / a;
    a1 = -2 * cosine;
    a2 = 1 - alpha / a;
  }
  b0 /= a0;
  b1 /= a0;
  b2 /= a0;
  a1 /= a0;
  a2 /= a0;
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const x0 = samples[index];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[index] = Math.max(-8, Math.min(8, y0));
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function applyEq(
  samples: Float32Array,
  sampleRate: number,
  lowGainDb: number,
  midGainDb: number,
  highGainDb: number,
): Float32Array {
  const low = applyBiquad(samples, sampleRate, "low-shelf", 200, lowGainDb);
  const mid = applyBiquad(low, sampleRate, "peaking", 1_000, midGainDb);
  return applyBiquad(mid, sampleRate, "high-shelf", 5_000, highGainDb);
}

function replaceRange(
  source: Float32Array,
  first: number,
  last: number,
  replacement: Float32Array,
): Float32Array {
  const output = new Float32Array(
    first + replacement.length + (source.length - last),
  );
  output.set(source.subarray(0, first), 0);
  output.set(replacement, first);
  output.set(source.subarray(last), first + replacement.length);
  return output;
}

export function applyAudioSampleOperation(
  source: AudioSampleBlock,
  operation: AudioEditOperation,
): AudioSampleBlock {
  if (!isAudioEditOperation(operation)) {
    throw new Error("音频操作参数无效");
  }
  const { first, last } = sampleRange(source, operation);
  if (operation.type === "crop") {
    return {
      sampleRate: source.sampleRate,
      channels: source.channels.map((channel) =>
        Float32Array.from(channel.subarray(first, Math.max(first + 1, last))),
      ),
    };
  }
  if (operation.type === "delete") {
    const replacement =
      first === 0 && last >= (source.channels[0]?.length || 0)
        ? new Float32Array(1)
        : new Float32Array();
    return {
      sampleRate: source.sampleRate,
      channels: source.channels.map((channel) =>
        replaceRange(channel, first, last, replacement),
      ),
    };
  }
  const next = cloneBlock(source);
  if (operation.type === "gain") {
    for (const samples of next.channels) {
      for (let index = first; index < last; index += 1) {
        samples[index] *= operation.multiplier;
      }
    }
    return next;
  }
  if (operation.type === "fade") {
    const frames = Math.max(
      1,
      Math.min(
        last - first,
        Math.round(operation.duration * source.sampleRate),
      ),
    );
    for (const samples of next.channels) {
      for (let index = 0; index < frames; index += 1) {
        const envelope = frames === 1 ? 1 : index / (frames - 1);
        const target =
          operation.edge === "in" ? first + index : last - 1 - index;
        samples[target] *= envelope;
      }
    }
    return next;
  }
  return {
    sampleRate: source.sampleRate,
    channels: source.channels.map((channel) => {
      const region = channel.subarray(first, last);
      const equalized = applyEq(
        region,
        source.sampleRate,
        operation.lowGainDb,
        operation.midGainDb,
        operation.highGainDb,
      );
      return replaceRange(
        channel,
        first,
        last,
        resampleLinear(equalized, operation.speed),
      );
    }),
  };
}
