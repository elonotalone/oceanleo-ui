import type { AgentApiResult } from "./agent";
import { taskRequestFailureText } from "./local-agent-task";

/** Covers authentication, transport and response parsing, including stalled clients. */
export const HISTORY_LIST_TIMEOUT_MS = 12_000;

/** A truncated/malformed success body must be surfaced as a failed list. */
export function validHistoryListRows(rows: unknown): rows is Array<{ id: string }> {
  return Array.isArray(rows) && rows.every((row) => row && typeof row === "object" &&
    typeof row.id === "string" && row.id.trim().length > 0);
}

export class HistoryListRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "HistoryListRequestError";
    this.status = status;
    this.code = code;
  }
}

/** A deadline also settles readers whose transport/auth ignores AbortSignal. */
export function boundedHistoryListRequest<T>(
  read: (signal: AbortSignal) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs : HISTORY_LIST_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      done();
    };
    const abort = () => {
      finish(() => reject(new HistoryListRequestError("加载已取消", 0, "history_list_aborted")));
      controller.abort();
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      finish(() => reject(new HistoryListRequestError("加载超时，请重试。", 408, "history_list_timeout")));
      controller.abort();
    }, timeoutMs);
    Promise.resolve().then(() => read(controller.signal)).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

/** Each My Tasks source settles independently; one failure never becomes an empty success. */
export async function readHistoryListSource<T>(
  read: (signal: AbortSignal) => Promise<AgentApiResult<{ items: T[] }>>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AgentApiResult<{ items: T[] }>> {
  try {
    const result = await boundedHistoryListRequest(read, options);
    if (result.ok && !validHistoryListRows(result.data?.items)) {
      return { ok: false, status: 502, error: "加载失败" };
    }
    return result;
  } catch (error) {
    return {
      ok: false,
      status: error instanceof HistoryListRequestError ? error.status : 0,
      error: error instanceof Error ? error.message : "加载失败",
    };
  }
}

/** ETags are optional: old gateways keep returning ordinary successful lists. */
export function createConditionalHistoryListReader() {
  const snapshots = new Map<string, { etag: string; items: unknown[] }>();
  let epoch = 0;
  return {
    clear() { epoch += 1; snapshots.clear(); },
    async read<T>(key: string, read: (signal: AbortSignal, headers?: Record<string, string>) =>
      Promise<AgentApiResult<{ items: T[] }>>, options: { signal?: AbortSignal } = {}) {
      const generation = epoch;
      const cached = snapshots.get(key);
      return readHistoryListSource<T>(async (signal) => {
        const result = await read(signal, cached ? { "If-None-Match": cached.etag } : undefined);
        if (signal.aborted || generation !== epoch) return { ok: false, status: 0, error: "加载已取消" };
        if (result.status === 304) {
          return cached ? { ok: true, data: { items: cached.items as T[] } }
            : { ok: false, status: 502, error: "加载失败" };
        }
        if (result.ok && validHistoryListRows(result.data?.items)) {
          if (result.etag) snapshots.set(key, { etag: result.etag, items: result.data!.items });
          else snapshots.delete(key);
        } else snapshots.delete(key);
        return result;
      }, options);
    },
  };
}

/** First-read retries are quiet and bounded; successful lists retain their normal poll cadence. */
export function historyInitialRetryDelayMs(failures: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(4, Math.max(0, failures)));
}

/** Transport details belong to diagnostics, not a user's failed list action. */
export function historyActionFailureText(result: { status?: number; error?: string }, fallback: string): string {
  if (result.status === 0 || result.status === 408 || result.status === 504 ||
      /network|fetch|timeout|timed.?out|网络|超时|加载已取消/i.test(result.error || "")) return fallback;
  return taskRequestFailureText(result, fallback);
}
