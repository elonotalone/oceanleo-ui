"use client";

import { cacheUser, onUserScopedClear } from "../../lib/user-scoped-cache";
import { ensurePendingSaved, markPendingRetry, observePendingReceipt, pendingForMessage, settlePending } from "./pending-send";

export const ACP_SEND_DEADLINE_MS = 150_000;
export const ACP_ATTACHMENT_DEADLINE_MS = 150_000;
export const ACP_CREATE_DEADLINE_MS = 20_000;
export const ACP_REQUEST_ATTEMPTS = 3;
export const ACP_REQUEST_TIMEOUT_ERROR = "等待发送结果超时，请重发。";
const inFlight = new Map<string, Promise<unknown>>();
const controllers = new Set<AbortController>();
onUserScopedClear(() => { for (const controller of controllers) controller.abort(); inFlight.clear(); });

function aborted(): Error { return Object.assign(new Error("Aborted"), { name: "AbortError" }); }
function retryable(error: unknown, networkOnly: boolean): boolean {
  const status = (error as { status?: number })?.status;
  if ((error as Error)?.name === "AbortError") return false;
  if (networkOnly) return (error as { retryable?: boolean })?.retryable !== false && (status === 0 || (status === undefined && error instanceof TypeError));
  return status === undefined || status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Only idempotent task creation and message sending use this policy. */
export function reliableRequest<T>(
  key: string,
  clientMessageId: string,
  run: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; retry?: "network-once"; signal?: AbortSignal; receipt?: (rowId: number | null) => T },
): Promise<T> {
  const scopedKey = `${cacheUser()}:${key}:${clientMessageId}`;
  const existing = inFlight.get(scopedKey);
  if (existing) return existing as Promise<T>;
  const promise = deliver();
  inFlight.set(scopedKey, promise);
  void promise.finally(() => { if (inFlight.get(scopedKey) === promise) inFlight.delete(scopedKey); }).catch(() => undefined);
  return promise;

  async function deliver(): Promise<T> {
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) controller.abort();
    let received = false;
    let receivedValue: T;
    let receive: ((value: T) => void) | undefined;
    const unwatch = options.receipt ? observePendingReceipt(clientMessageId, (rowId) => {
      received = true;
      receivedValue = options.receipt!(rowId);
      receive?.(receivedValue);
    }) : () => undefined;
    try {
      ensurePendingSaved(clientMessageId);
      const networkOnly = options.retry === "network-once";
      const attempts = networkOnly ? 2 : ACP_REQUEST_ATTEMPTS;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (received) return receivedValue!;
        if (controller.signal.aborted) throw aborted();
        if (attempt) markPendingRetry(clientMessageId);
        const attemptController = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        try {
          const interrupted = new Promise<T>((resolve, reject) => {
            receive = resolve;
            onAbort = () => reject(aborted());
            controller.signal.addEventListener("abort", onAbort, { once: true });
            timer = setTimeout(() => reject(Object.assign(new Error(ACP_REQUEST_TIMEOUT_ERROR), { status: 0, retryable: false })), options.timeoutMs);
          });
          // Promise.race also bounds transports that ignore AbortSignal, including a stalled body/auth read.
          return await Promise.race([run(attemptController.signal), interrupted]);
        } catch (error) {
          if (received) return receivedValue!;
          if (controller.signal.aborted) throw aborted();
          if (attempt + 1 === attempts || !retryable(error, networkOnly)) throw error;
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          if (onAbort) controller.signal.removeEventListener("abort", onAbort);
          attemptController.abort();
          receive = undefined;
        }
      }
      throw new Error(ACP_REQUEST_TIMEOUT_ERROR);
    } catch (error) {
      const entry = pendingForMessage(clientMessageId);
      if (entry && !controller.signal.aborted) settlePending(entry.id, { error });
      throw error;
    } finally {
      unwatch();
      controllers.delete(controller);
      options.signal?.removeEventListener("abort", cancel);
    }
  }
}
