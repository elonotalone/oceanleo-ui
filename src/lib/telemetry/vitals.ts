// ============================================================================
// 读数来源 —— Web Vitals（INP / LCP / CLS）+ Long Animation Frames
// ----------------------------------------------------------------------------
// 为什么这里**没有** `import "web-vitals"`
//
// 红线 6 授权了 `web-vitals`（约 2 KB）作为本波唯一的新运行时依赖，但
// `oceanleo-ui/package.json` 此刻正被另一份并发工程改着（新增 7 条 `exports`
// 子路径，未提交）。红线 3 要求 `git commit` 限定路径，而 git 没有非交互的分 hunk
// 提交 —— 提交 `package.json` 就等于把别人未完成的活一起交上去。
//
// 所以这里换一种接法：**模块由调用方注入**。
//
//     import * as webVitals from "web-vitals";
//     startWebVitals({ module: webVitals });
//
// 没注入就退到原生 `PerformanceObserver`。净效果是 31 个站**今天**就有 vitals 信号，
// 装不装 `web-vitals` 都不炸，也不会因为一个解析不到的裸包名让 `tsc --noEmit` 变红
// 或让 webpack 报 expression dependency。依赖那一行的请求写在
// `signals/W09-request.md`。
//
// 两条路的读数用 `detail.collector` 区分（`web-vitals` / `native`），
// **不许混着算**：原生回落的 INP 是「最长的一次 event duration」，
// 与 `web-vitals` 的 INP（分位数 + 交互分组）不是同一个量。
// ============================================================================

import { emitTelemetry, type TelemetryEvent } from "./index";

/** `web-vitals` 的 `Metric` 的子集。只要这三个字段，多的不管。 */
export interface VitalsMetric {
  readonly name: string;
  readonly value: number;
  readonly rating?: string;
}

type MetricHandler = (metric: VitalsMetric) => void;

/** `web-vitals` 的注入面。只用这三个，不碰它的其余导出。 */
export interface WebVitalsModule {
  onINP?: (handler: MetricHandler) => void;
  onLCP?: (handler: MetricHandler) => void;
  onCLS?: (handler: MetricHandler) => void;
}

export type VitalsCollector = "web-vitals" | "native";

function emitVital(
  metric: string,
  value: number,
  collector: VitalsCollector,
  rating?: string,
): TelemetryEvent | null {
  if (!Number.isFinite(value)) return null;
  return emitTelemetry({
    source: "vitals",
    name: `vitals.${metric}`,
    severity: "info",
    // 毫秒取整、CLS 这类无量纲分值保留三位。原始浮点没有信息量，只有噪声。
    value: metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value),
    detail: { collector, ...(rating ? { rating } : {}) },
  });
}

// ----------------------------------------------------------------------------
// 原生回落
// ----------------------------------------------------------------------------

interface LayoutShiftEntry extends PerformanceEntry {
  readonly value: number;
  readonly hadRecentInput: boolean;
}

interface LongAnimationFrameEntry extends PerformanceEntry {
  readonly blockingDuration?: number;
}

function observerSupports(type: string): boolean {
  if (typeof PerformanceObserver === "undefined") return false;
  const supported = PerformanceObserver.supportedEntryTypes;
  return Array.isArray(supported) && supported.includes(type);
}

/**
 * `PerformanceObserver` 的安全包装。观察器建不起来（浏览器不支持、
 * 或 `observe` 对某个 type 抛异常）时返回 `null`，绝不把调用方带崩。
 */
function observe(
  type: string,
  handler: (entries: PerformanceEntryList) => void,
  options: { buffered?: boolean; durationThreshold?: number } = {},
): PerformanceObserver | null {
  if (!observerSupports(type)) return null;
  try {
    const observer = new PerformanceObserver((list) => {
      try {
        handler(list.getEntries());
      } catch {
        // 观察器回调里抛出去会变成 unhandled error，反过来污染错误管道。
      }
    });
    observer.observe({ type, buffered: true, ...options } as PerformanceObserverInit);
    return observer;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// 入口
// ----------------------------------------------------------------------------

export interface StartVitalsOptions {
  /** 注入的 `web-vitals`。给了就用它收 INP/LCP/CLS，原生只负责 LoAF。 */
  module?: WebVitalsModule | null;
  /** Long Animation Frames 的上报阈值（毫秒）。默认 200ms —— 低于这个值人眼看不出卡。 */
  longFrameThresholdMs?: number;
}

/**
 * 开始收集。返回停止函数（组件卸载 / 路由离开时调）。
 *
 * LCP 与 CLS 只有在页面**隐藏或卸载**时才是最终值，所以原生回落这条路在
 * `visibilitychange → hidden` 上冲一次。`pagehide` 也挂着：iOS Safari 的
 * bfcache 走的是 `pagehide` 而不是 `visibilitychange`。
 */
export function startWebVitals(options: StartVitalsOptions = {}): () => void {
  if (typeof window === "undefined") return () => {};

  const threshold = options.longFrameThresholdMs ?? 200;
  const observers: PerformanceObserver[] = [];
  const teardown: Array<() => void> = [];
  const injected = options.module;

  // ---- INP / LCP / CLS ----
  if (injected?.onINP || injected?.onLCP || injected?.onCLS) {
    const bridge = (metric: VitalsMetric) => {
      emitVital(metric.name, metric.value, "web-vitals", metric.rating);
    };
    try {
      injected.onINP?.(bridge);
      injected.onLCP?.(bridge);
      injected.onCLS?.(bridge);
    } catch {
      // 注入的模块形状不对不该让整条管道停摆，LoAF 照收。
    }
  } else {
    let largestPaint = 0;
    let cumulativeShift = 0;
    let longestEvent = 0;

    const lcp = observe("largest-contentful-paint", (entries) => {
      for (const entry of entries) largestPaint = Math.max(largestPaint, entry.startTime);
    });
    if (lcp) observers.push(lcp);

    const cls = observe("layout-shift", (entries) => {
      for (const entry of entries as LayoutShiftEntry[]) {
        // 用户刚交互过引发的位移不算——那是他自己点出来的。
        if (!entry.hadRecentInput) cumulativeShift += entry.value;
      }
    });
    if (cls) observers.push(cls);

    // 原生 INP 的近似：最长的一次交互事件时长。
    // `durationThreshold: 16` 是规范允许的最小值，再低浏览器会夹回来。
    const inp = observe(
      "event",
      (entries) => {
        for (const entry of entries) longestEvent = Math.max(longestEvent, entry.duration);
      },
      { durationThreshold: 16 },
    );
    if (inp) observers.push(inp);

    let flushed = false;
    const flush = () => {
      if (flushed) return;
      flushed = true;
      if (largestPaint > 0) emitVital("LCP", largestPaint, "native");
      if (cumulativeShift > 0) emitVital("CLS", cumulativeShift, "native");
      if (longestEvent > 0) emitVital("INP", longestEvent, "native");
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    teardown.push(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    });
  }

  // ---- Long Animation Frames（有则用，无则跳过）----
  const loaf = observe("long-animation-frame", (entries) => {
    for (const entry of entries as LongAnimationFrameEntry[]) {
      if (entry.duration < threshold) continue;
      emitTelemetry({
        source: "vitals",
        name: "vitals.LoAF",
        severity: "warn",
        value: Math.round(entry.duration),
        detail: { collector: "native", blockingMs: Math.round(entry.blockingDuration ?? 0) },
      });
    }
  });
  if (loaf) observers.push(loaf);

  return () => {
    for (const observer of observers) {
      try {
        observer.disconnect();
      } catch {
        // 已断开的观察器再断一次会抛，无所谓。
      }
    }
    for (const stop of teardown) stop();
  };
}

/** 浏览器到底支持哪几档。测试与诊断用，不影响上报路径。 */
export function vitalsSupport(): Readonly<Record<string, boolean>> {
  return {
    lcp: observerSupports("largest-contentful-paint"),
    cls: observerSupports("layout-shift"),
    event: observerSupports("event"),
    loaf: observerSupports("long-animation-frame"),
  };
}
