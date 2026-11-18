import { authed } from "../agent";
import { GATEWAY_BASE } from "../auth/config";

export class BayApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "BayApiError";
    this.status = status;
    this.code = code;
  }
}

function errorFrom(status: number, detail: unknown, fallback?: string): BayApiError {
  if (typeof detail === "string" && detail) return new BayApiError(detail, status);
  const d = (detail && typeof detail === "object" ? detail : null) as { message?: unknown; code?: unknown } | null;
  const message = typeof d?.message === "string" && d.message ? d.message : fallback || "请求失败，请稍后再试。";
  return new BayApiError(message, status, typeof d?.code === "string" ? d.code : null);
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
}

function abortError(cause?: unknown): Error {
  if (cause instanceof Error && cause.name === "AbortError") return cause;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await authed<T>(path, init);
  if (!result.ok) throw errorFrom(result.status ?? 0, result.detail, result.error);
  return result.data as T;
}

export const BAY_GET_TIMEOUT_MS = 10_000;

/** Bound auth lookup, fetch and body decoding, even if a transport ignores abort. */
export async function bayGet<T>(path: string, opts?: { anonymous?: boolean; signal?: AbortSignal }): Promise<T> {
  if (opts?.signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const stopped = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(abortError()); };
    opts?.signal?.addEventListener("abort", cancel, { once: true });
    if (opts?.signal?.aborted) { cancel(); return; }
    timer = setTimeout(() => {
      controller.abort();
      reject(new BayApiError("网络错误，请稍后再试。", 0, "timeout"));
    }, BAY_GET_TIMEOUT_MS);
  });
  try {
    return await Promise.race([stopped, get<T>(path, { ...opts, signal: controller.signal })]);
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", cancel);
  }
}

async function get<T>(path: string, opts?: { anonymous?: boolean; signal?: AbortSignal }): Promise<T> {
  if (!opts?.anonymous) return call<T>(path, { signal: opts?.signal });
  const result = await authed<T>(path, { signal: opts.signal });
  if (isAbortError(null, opts.signal)) throw abortError();
  if (result.ok) return result.data as T;
  if (result.status !== 401) throw errorFrom(result.status ?? 0, result.detail, result.error);
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, { signal: opts.signal, cache: "no-store", credentials: "include" });
  } catch (error) {
    if (isAbortError(error, opts.signal)) throw abortError(error);
    throw new BayApiError("网络错误，请稍后再试。", 0);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw errorFrom(res.status, (data as { detail?: unknown } | null)?.detail);
  return data as T;
}

export function bayPost<T>(path: string, body?: unknown): Promise<T> {
  return call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function bayPatch<T>(path: string, body?: unknown): Promise<T> {
  return call<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });
}

export function bayDelete<T>(path: string): Promise<T> {
  return call<T>(path, { method: "DELETE" });
}
