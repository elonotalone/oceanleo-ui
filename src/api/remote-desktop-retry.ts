/**
 * Retry vocabulary shared by the remote desktop client and panel (dependency-free on purpose,
 * so panel tests that stub `./remote-desktop` still get the real helpers).
 */

/** Codes that mean "the network path failed", not "the gateway refused". */
export function isNetworkFailure(code?: string): boolean {
  return code === "network_error" || code === "request_timeout" || code === "stream_failed";
}

/** A fresh idempotency key for one click's session request (gateway: `[A-Za-z0-9_-]{8,80}`). */
export function newRequestId(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `rq_${random}`.slice(0, 64);
}
