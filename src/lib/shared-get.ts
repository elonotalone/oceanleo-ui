"use client";

// Share only reads still in flight. Authorization is part of the key; nothing
// survives a settled request or crosses signed-in users.
type Read = { promise: Promise<Response>; controller: AbortController; users: number; at: number };
const reads = new Map<string, Read>();
const MAX_SHARE_MS = 10_000;

/** Each reader owns its response body and cancellation, including timed reads. */
export function sharedGatewayFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if ((init.method || "GET").toUpperCase() !== "GET" || init.body || init.keepalive) return fetch(url, init);
  const signal = init.signal;
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  const headers = [...new Headers(init.headers).entries()].sort(([a], [b]) => a.localeCompare(b));
  const key = JSON.stringify([url, headers, init.credentials, init.cache, init.mode, init.redirect, init.integrity, init.referrer, init.referrerPolicy]);
  let read = reads.get(key);
  if (!read || Date.now() - read.at >= MAX_SHARE_MS) {
    const controller = new AbortController();
    const promise = Promise.resolve().then(async () => {
      const response = await fetch(url, { ...init, signal: controller.signal });
      // Keep the read shared until its body arrives, and keep cancellation
      // effective while a large JSON response is still downloading.
      if (typeof response.arrayBuffer !== "function") return response;
      const bytes = await response.arrayBuffer();
      return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    });
    const owned: Read = { controller, users: 0, at: Date.now(), promise };
    owned.promise = promise.finally(() => {
      if (reads.get(key) === owned) reads.delete(key);
    });
    read = owned;
    reads.set(key, owned);
  }
  const owned = read;
  owned.users += 1;
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => {
      if (done) return false;
      done = true;
      signal?.removeEventListener("abort", abort);
      owned.users -= 1;
      return true;
    };
    const abort = () => {
      if (!finish()) return;
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (!owned.users) {
        if (reads.get(key) === owned) reads.delete(key);
        owned.controller.abort();
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    owned.promise.then((response) => {
      if (!finish()) return;
      try { resolve(typeof response.clone === "function" ? response.clone() : response); }
      catch (error) { reject(error); }
    }, (error: unknown) => { if (finish()) reject(error); });
  });
}
