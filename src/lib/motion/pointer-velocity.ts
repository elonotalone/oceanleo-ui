/**
 * 指针速度追踪：滑动窗口取最近 ~50ms 的位移/时间。
 * 规范见 `docs/architecture/motion-system.md` §规范二。
 *
 * 为什么不是「最后两个点相减」：指针事件的间隔在 4ms 到 30ms 之间跳，
 * 最后一段常常是手指离开前的一次微小回缩，直接相减会得到一个方向相反、
 * 数量级失真的速度——甩出去的条会往回弹。取窗口两端相减就没有这个问题。
 *
 * 与 `spring.ts` 一样：本文件不出现任何 DOM API，只吃调用方喂进来的数值。
 */

/** 窗口长度。太短抗不住抖动，太长会把「先慢后快」的甩动算成中速。 */
const WINDOW_MS = 50;
/** 窗口内至少留两个样本，否则手指停顿后立刻松手会算不出速度。 */
const MIN_SAMPLES = 2;
/**
 * 速度上限（px/s）。触控板的一次意外跳变能报出上万，弹簧吃进去会飞出屏幕。
 * 6000 px/s 已经比人手能做到的最快甩动更快。
 */
const MAX_SPEED = 6000;

interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface PointerVelocityTracker {
  sample(x: number, y: number, timeStamp: number): void;
  velocity(): { x: number; y: number };
  reset(): void;
}

function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, value));
}

export function createPointerVelocityTracker(): PointerVelocityTracker {
  let samples: Sample[] = [];

  return {
    sample(x, y, timeStamp) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const t = Number.isFinite(timeStamp) ? timeStamp : 0;
      const last = samples[samples.length - 1];
      // 时间倒流意味着换了一个时钟源（例如混用 event.timeStamp 与
      // performance.now()）。丢掉旧窗口比拿两个时钟相减要诚实。
      if (last && t < last.t) samples = [];
      samples.push({ x, y, t });
      const cutoff = t - WINDOW_MS;
      while (samples.length > MIN_SAMPLES && samples[0].t < cutoff) {
        samples.shift();
      }
    },
    velocity() {
      if (samples.length < MIN_SAMPLES) return { x: 0, y: 0 };
      const first = samples[0];
      const last = samples[samples.length - 1];
      const elapsed = last.t - first.t;
      if (elapsed <= 0) return { x: 0, y: 0 };
      return {
        x: clampSpeed(((last.x - first.x) / elapsed) * 1000),
        y: clampSpeed(((last.y - first.y) / elapsed) * 1000),
      };
    },
    reset() {
      samples = [];
    },
  };
}
