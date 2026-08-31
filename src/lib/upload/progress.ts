"use client";

// ============================================================================
// 上传进度 —— 读数、时间估算、以及「谁在传这个 File」的进度总线
// ----------------------------------------------------------------------------
// 为什么是 XMLHttpRequest 而不是 fetch（W08 P1 的选型，这一条是本文件存在的理由）
//
// `fetch` 想报上传进度，唯一的办法是把 `body` 传成 `ReadableStream` 并带
// `duplex: "half"`。那是 request streaming，落地情况是：Chromium 系要 HTTP/2 以上
// 才允许，Safari 与 Firefox 至今不支持——**在不支持的浏览器上它不是「没有进度」，
// 是整个请求直接抛 TypeError**。也就是说选 fetch 等于用「大文件根本传不上去」
// 换「进度条好看一点」。
//
// `XMLHttpRequest.upload.onprogress` 反过来：它没有 stream 那套语义，但
// **每一个装得上这个产品的浏览器都有它**，且 `lengthComputable` 明确告诉你
// total 靠不靠得住。上传进度这件事上 XHR 不是遗产，是唯一可用的那条路。
//
// 代价写清楚：XHR 拿不到 `AbortSignal` 之外的流式响应，所以本文件只用它传
// **上传**这一段（PUT 到对象存储 / POST multipart 到网关），响应体照旧当整段读。
// 需要流式**下载**的地方不要来用这里。
// ============================================================================

/** 一次上传在某一刻的读数。UI 拿到的就是这个形状。 */
export interface UploadProgressSnapshot {
  /** 已送出的字节数。**单调不减**（见 `createProgressTracker`）。 */
  loaded: number;
  /** 总字节数；`lengthComputable` 为假时是 0。 */
  total: number;
  /** 0..1。`total` 为 0 时恒为 0（不要拿它当「已完成」判据，看 `done`）。 */
  ratio: number;
  /** 从第一次报数到现在。 */
  elapsedMs: number;
  /**
   * 剩余时间估算，毫秒。**估不出来时是 `null`，不是 0** ——
   * 纯百分比在大文件上体感很差（P1 点名的就是这条），但假的剩余时间比没有更糟：
   * 样本不够时宁可不显示。
   */
  remainingMs: number | null;
  /** 平滑后的吞吐，字节/秒。样本不够时是 0。 */
  bytesPerSecond: number;
  done: boolean;
  failed: boolean;
}

export type UploadProgressListener = (snapshot: UploadProgressSnapshot) => void;

/**
 * 吞吐平滑系数。新样本占三成：太大则 ETA 随网络抖动上下乱跳，
 * 太小则从慢启动里恢复得太慢，用户会看着「剩余 4 分钟」一动不动。
 */
const THROUGHPUT_SMOOTHING = 0.3;

/** 攒够这么久才敢给第一个 ETA。慢启动阶段的吞吐没有代表性。 */
const MIN_ELAPSED_FOR_ETA_MS = 700;

/**
 * 一次上传的报数器。**它的职责只有两件：把 loaded 钉成单调不减，把 ETA 算出来。**
 *
 * 单调不减不是洁癖：XHR 在重试内部请求时会把 `loaded` 归零重来，进度条当场倒退，
 * 用户看到的是「刚才传到 80%，现在又 12%」。这里把倒退吃掉。
 *
 * @param total 总字节；未知传 0。
 * @param now 取时刻的函数，测试注入假时钟用。
 */
export function createProgressTracker(
  total: number,
  now: () => number = () => Date.now(),
) {
  const startedAt = now();
  let highWaterLoaded = 0;
  let lastSampleAt = startedAt;
  let lastSampleLoaded = 0;
  let smoothedBytesPerSecond = 0;
  let settled = false;

  function snapshot(loaded: number, done: boolean, failed: boolean): UploadProgressSnapshot {
    const elapsedMs = Math.max(0, now() - startedAt);
    const ratio = total > 0 ? Math.min(1, loaded / total) : 0;
    const remaining = total > 0 ? Math.max(0, total - loaded) : 0;
    const canEstimate =
      !done &&
      !failed &&
      total > 0 &&
      remaining > 0 &&
      smoothedBytesPerSecond > 0 &&
      elapsedMs >= MIN_ELAPSED_FOR_ETA_MS;
    return {
      loaded,
      total,
      ratio,
      elapsedMs,
      remainingMs: canEstimate
        ? Math.round((remaining / smoothedBytesPerSecond) * 1000)
        : null,
      bytesPerSecond: Math.round(smoothedBytesPerSecond),
      done,
      failed,
    };
  }

  return {
    /** 报一次进度。返回本次读数；`loaded` 已被钉成单调不减。 */
    report(loaded: number): UploadProgressSnapshot {
      const capped = total > 0 ? Math.min(loaded, total) : loaded;
      highWaterLoaded = Math.max(highWaterLoaded, Math.max(0, capped));
      const at = now();
      const deltaMs = at - lastSampleAt;
      const deltaBytes = highWaterLoaded - lastSampleLoaded;
      // 只在真的过了时间、也真的多送了字节时更新吞吐。同一毫秒内的连续回调
      // （XHR 在快网上很常见）会算出无穷大的速度，ETA 会瞬间变 0。
      if (deltaMs > 0 && deltaBytes > 0) {
        const instant = (deltaBytes / deltaMs) * 1000;
        smoothedBytesPerSecond =
          smoothedBytesPerSecond === 0
            ? instant
            : smoothedBytesPerSecond * (1 - THROUGHPUT_SMOOTHING) +
              instant * THROUGHPUT_SMOOTHING;
        lastSampleAt = at;
        lastSampleLoaded = highWaterLoaded;
      }
      return snapshot(highWaterLoaded, false, false);
    },

    /**
     * 传完了。读数补到 `total`（XHR 不保证最后一个 progress 事件正好落在 100%），
     * 之后再 `report` 一律无效——失败之后还继续报数是 P5 点名要挡的那条。
     */
    finish(): UploadProgressSnapshot {
      settled = true;
      highWaterLoaded = total > 0 ? total : highWaterLoaded;
      return snapshot(highWaterLoaded, true, false);
    },

    /** 失败了。停在当前读数，不归零（用户想知道断在哪儿）。 */
    fail(): UploadProgressSnapshot {
      settled = true;
      return snapshot(highWaterLoaded, false, true);
    },

    get settled(): boolean {
      return settled;
    },
  };
}

// ── 进度总线 ────────────────────────────────────────────────────────────────
// 三个消费点里有两个（`InputCard` / `LeoComposer`）按契约**不负责上传**
// （见它们文件头「本组件不负责上传」），业务层拿走 File 自己传。它们因此没有任何
// 办法从返回值里看到进度。
//
// 总线解决的就是这个：`uploadFile` 按 **File 对象身份** 发布进度，组件订阅它刚交出去
// 的那几个 File。谁传的、传去哪儿、业务层怎么组织状态，一概不需要知道；
// 组件也不必新增一个「请把进度回传给我」的 prop 去逼 31 个站改调用。
//
// 用 WeakMap 挂键：File 被业务丢掉之后这里不留引用，不会因为「传过一次」把文件
// 留在内存里。

const progressListeners = new WeakMap<File, Set<UploadProgressListener>>();
const progressLatest = new WeakMap<File, UploadProgressSnapshot>();

/** 发布一次进度。只有 `uploadFile` 该调它。 */
export function publishUploadProgress(
  file: File,
  snapshot: UploadProgressSnapshot,
): void {
  progressLatest.set(file, snapshot);
  const listeners = progressListeners.get(file);
  if (!listeners) return;
  for (const listener of [...listeners]) {
    // 一个订阅者抛异常不该让其余订阅者收不到，也不该把上传本身带崩。
    try {
      listener(snapshot);
    } catch {
      /* 订阅者自己的问题，不影响上传 */
    }
  }
}

/**
 * 订阅某个 File 的上传进度。返回退订函数。
 *
 * 订阅时若已有读数会**立刻**回放一次——组件挂载晚于上传开始是常态
 * （业务往往先 `uploadFile` 再 setState 触发渲染）。
 */
export function subscribeUploadProgress(
  file: File,
  listener: UploadProgressListener,
): () => void {
  let listeners = progressListeners.get(file);
  if (!listeners) {
    listeners = new Set();
    progressListeners.set(file, listeners);
  }
  listeners.add(listener);
  const latest = progressLatest.get(file);
  if (latest) {
    try {
      listener(latest);
    } catch {
      /* 同上 */
    }
  }
  return () => {
    const current = progressListeners.get(file);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) progressListeners.delete(file);
  };
}

/** 当前已知读数；从没报过则 `null`。 */
export function latestUploadProgress(file: File): UploadProgressSnapshot | null {
  return progressLatest.get(file) ?? null;
}

// ── 显示用格式化 ────────────────────────────────────────────────────────────
// 放在这里而不是各组件里，是为了让三个消费点显示**同一套字**：
// 「4.2 MB / 18.6 MB」在一个地方叫这个名，在另一个地方就不该叫「4.2M/18.6M」。

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * 字节数 → 人读的字符串。
 * 1024 进制（与操作系统的显示口径一致，用户拿文件属性对得上）。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // B 不带小数（「512.0 B」很蠢）；1 位小数够了，2 位在进度条上跳得眼花。
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/**
 * 毫秒 → 「1:05」这样的短时长。
 * 小时以上给「1:05:30」。1 秒以内给「0:01」而不是「0:00」——
 * 显示 0 会让人以为卡住了。
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 百分比整数。`total` 未知时给 0。 */
export function progressPercent(snapshot: UploadProgressSnapshot): number {
  return Math.round(snapshot.ratio * 100);
}

// ── XHR 上传 ────────────────────────────────────────────────────────────────

export interface XhrUploadOptions {
  url: string;
  method: "POST" | "PUT";
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  /** 每次进度回调。`total` 为 0 表示 `lengthComputable` 为假。 */
  onProgress?: (loaded: number, total: number) => void;
  /** 外部取消。取消后 promise 以 `aborted: true` 结束，不抛。 */
  signal?: AbortSignal;
}

export interface XhrUploadResult {
  ok: boolean;
  status: number;
  responseText: string;
  aborted: boolean;
  /** 传输层失败（连不上、被墙、CORS）。HTTP 错误码不算，那种 `ok:false` + status。 */
  networkError: boolean;
}

/** `XMLHttpRequest` 在不在（SSR 与 node 测试环境里没有）。 */
export function xhrUploadAvailable(): boolean {
  return typeof XMLHttpRequest !== "undefined";
}

/**
 * 带上传进度的一次请求。
 *
 * 不抛：所有失败都落成 `XhrUploadResult`，调用方按字段判。这与 `database.ts` 的
 * `Result<T>` 口径一致——那一层从不靠 try/catch 表达「网关说不行」。
 */
export function xhrUpload(options: XhrUploadOptions): Promise<XhrUploadResult> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    let finished = false;

    const settle = (result: XhrUploadResult) => {
      if (finished) return;
      finished = true;
      if (options.signal) options.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = () => {
      try {
        request.abort();
      } catch {
        /* 已经结束了 */
      }
      settle({
        ok: false,
        status: 0,
        responseText: "",
        aborted: true,
        networkError: false,
      });
    };

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }

    request.open(options.method, options.url, true);
    for (const [name, value] of Object.entries(options.headers || {})) {
      request.setRequestHeader(name, value);
    }

    if (options.onProgress) {
      const onProgress = options.onProgress;
      request.upload.onprogress = (event: ProgressEvent) => {
        onProgress(event.loaded, event.lengthComputable ? event.total : 0);
      };
    }

    request.onload = () => {
      settle({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        responseText: request.responseText || "",
        aborted: false,
        networkError: false,
      });
    };
    request.onerror = () => {
      settle({
        ok: false,
        status: 0,
        responseText: "",
        aborted: false,
        networkError: true,
      });
    };
    request.ontimeout = () => {
      settle({
        ok: false,
        status: 0,
        responseText: "",
        aborted: false,
        networkError: true,
      });
    };
    request.onabort = () => {
      settle({
        ok: false,
        status: 0,
        responseText: "",
        aborted: true,
        networkError: false,
      });
    };

    request.send(options.body);
  });
}
