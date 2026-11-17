import type { RemoteDesktopApiResult, RemoteDesktopClient, RemoteDesktopRequestOptions, RemoteDesktopSession, RemoteDesktopStream, RemoteDesktopStreamHandlers } from "./remote-desktop";
import { prepareRemoteWebRtcSocket, queuePreparedRemoteWebRtcStart } from "./remote-desktop-webrtc-preconnect";
import { newRequestId } from "./remote-desktop-retry";

type Result<T> = Promise<RemoteDesktopApiResult<T>>;
type Entry = {
  deviceId: string; client: RemoteDesktopClient; abort: AbortController; claimed: boolean; disposed: boolean;
  state: "preconnecting" | "connecting" | "ready" | "starting" | "active" | "closed";
  session?: Result<RemoteDesktopSession>; stream?: Result<RemoteDesktopStream>;
  handlers?: RemoteDesktopStreamHandlers; snapshots: Map<PropertyKey, unknown[]>;
  value?: RemoteDesktopSession; live?: RemoteDesktopStream; releaseSocket?: () => void;
  fail?(): void; renew?: ReturnType<typeof setInterval>; requestId?: string; clickedAt?: number; firstPresentedMs?: number;
  startIntent?: boolean;
  timing?: Record<string, number>[];
};
// One visible owner card, one socket/peer. Never build a hidden pool.
const entries = new Map<string, Entry>();
const now = () => typeof performance === "undefined" ? Date.now() : performance.now();
const visible = () => typeof document !== "undefined" && document.visibilityState === "visible";
// R8 hosts validate rd.start keys strictly. Encode wait-for-gateway intent in the
// existing valid request id, so those hosts retain their ordinary HTTP fallback.
function gatewayIntentKey(entry: Entry): void {
  if (entry.startIntent && entry.requestId && !entry.requestId.startsWith("gwi_")) entry.requestId = `gwi_${entry.requestId.slice(0, 76)}`;
}
function dispose(entry: Entry): void {
  if (entry.disposed) return;
  entry.disposed = true; entry.state = "closed";
  if (entries.get(entry.deviceId) === entry) entries.delete(entry.deviceId);
  entry.fail?.(); clearInterval(entry.renew); entry.releaseSocket?.(); entry.abort.abort(); entry.live?.close();
  if (entry.value) void entry.client.closeSession(entry.deviceId, entry.value.session_id).catch(() => {});
}
/** Prepare only after the caller proved owner permission and actual card visibility. */
export function prepareRemoteDesktopStandby(deviceId: string, client: RemoteDesktopClient): () => void {
  if ([...entries.values()].some(entry => entry.claimed && !entry.disposed)) return () => {};
  for (const entry of entries.values()) if (!entry.claimed) dispose(entry);
  if (!visible()) return () => {};
  const ownerDocument = document;
  const entry: Entry = { deviceId, client, abort: new AbortController(), claimed: false, disposed: false, state: "preconnecting", snapshots: new Map() };
  entries.set(deviceId, entry);
  const handlers = new Proxy({} as RemoteDesktopStreamHandlers, { get: (_target, key) => (...args: unknown[]) => {
    if (entry.disposed) return;
    const viewerTiming = key === "serverTiming" && typeof (args[0] as Record<string, unknown>)?.viewer_stage === "number";
    if (viewerTiming && !entry.handlers) {
      (entry.timing ??= []).push(args[0] as Record<string, number>);
      if (entry.timing.length > 64) entry.timing.shift();
    } else if (!viewerTiming) entry.snapshots.set(key, args);
    if (key === "standbyState") entry.state = args[0] as Entry["state"];
    if (key === "webrtcPresentation" && entry.clickedAt !== undefined && entry.firstPresentedMs === undefined) {
      const at = (args[0] as { presented_at_ms?: number })?.presented_at_ms;
      if (typeof at === "number") entry.firstPresentedMs = Math.max(0, at - entry.clickedAt);
    }
    const listener = entry.handlers?.[key as keyof RemoteDesktopStreamHandlers];
    if (listener) (listener as (...values: unknown[]) => void)(...args);
    if (key === "state" && args[0] === "closed") dispose(entry);
  } });
  let resolveSession!: (result: RemoteDesktopApiResult<RemoteDesktopSession>) => void;
  let begun = false;
  entry.session = new Promise(resolve => { resolveSession = resolve; });
  entry.fail = () => resolveSession({ ok: false, error: "standby_unavailable" });
  entry.stream = entry.session.then(async result => {
    if (!result.ok || !result.data) { dispose(entry); return { ok: false, error: result.error ?? "standby_unavailable" }; }
    entry.value = result.data;
    if (entry.disposed || !result.data.standby || result.data.transport !== "webrtc-v1" || !client.openStream) {
      dispose(entry); return { ok: false, error: "standby_unavailable" };
    }
    const opened = await client.openStream(deviceId, result.data.session_id, handlers, {
      standby: true, transport: "webrtc-v1", descriptor: result.data.media?.media?.transport === "webrtc-v1" ? result.data.media.media : undefined,
      standbyStartIntent: entry.startIntent, activationRequestId: entry.requestId, clickedAt: entry.clickedAt,
      signal: entry.abort.signal,
    });
    if (entry.disposed) { opened.data?.close(); return { ok: false, error: "aborted" }; }
    if (!opened.ok || !opened.data) { dispose(entry); return opened; }
    entry.live = opened.data;
    return opened;
  });
  void entry.stream.catch(() => dispose(entry));
  entry.releaseSocket = prepareRemoteWebRtcSocket(deviceId, {
    unavailable: () => { if (!begun) entry.fail?.(); },
    ready(capabilities) {
      if (entry.disposed || begun) return;
      if (!capabilities.includes("remote-desktop-standby-v1") || !visible()) { entry.fail?.(); return; }
      begun = true; entry.state = "connecting";
      entry.startIntent = capabilities.includes("remote-desktop-start-intent-v1");
      gatewayIntentKey(entry);
      void client.createSession(deviceId, { standby: true, ownerDirect: true, requestId: newRequestId(), signal: entry.abort.signal,
        standbyStartIntent: entry.startIntent, get activationRequestId() { return entry.requestId; },
      }).then(result => {
        if (result.ok && result.data) {
          if (entry.disposed) { void client.closeSession(deviceId, result.data.session_id).catch(() => {}); resolveSession({ ok: false, error: "aborted" }); return; }
          entry.value = result.data;
          if (!result.data.standby || result.data.transport !== "webrtc-v1" || entry.disposed) {
            dispose(entry); resolveSession({ ok: false, error: "standby_unavailable" }); return;
          }
        }
        resolveSession(result);
      }).catch(() => entry.fail?.());
    },
  });
  entry.renew = setInterval(() => {
    if (entry.state === "active" || entry.disposed) return;
    if (!visible()) { dispose(entry); return; }
    entry.live?.renewStandby?.();
  }, 10_000);
  const readyTimeout = setTimeout(() => { if (!begun) { entry.fail?.(); dispose(entry); } }, 10_000);
  void entry.session.finally(() => clearTimeout(readyTimeout));
  const hide = () => { if (!visible() && entry.state !== "active") dispose(entry); };
  ownerDocument.addEventListener("visibilitychange", hide);
  return () => { ownerDocument.removeEventListener("visibilitychange", hide); if (entry.state !== "active") dispose(entry); };
}
export function claimRemoteDesktopStandbySession(deviceId: string, options?: RemoteDesktopRequestOptions): Result<RemoteDesktopSession> | null {
  const entry = entries.get(deviceId);
  if (!entry?.session || entry.claimed || entry.disposed || !visible() || options?.signal?.aborted) return null;
  entry.claimed = true; entry.requestId = options?.requestId ?? newRequestId(); entry.clickedAt = options?.clickedAt ?? now();
  gatewayIntentKey(entry);
  entry.state = "starting";
  if (entry.startIntent) queuePreparedRemoteWebRtcStart(deviceId, entry.requestId);
  entry.live?.activateStandby?.(entry.requestId, entry.clickedAt);
  options?.signal?.addEventListener("abort", () => dispose(entry), { once: true });
  return entry.session;
}
export function claimRemoteDesktopStandbyStream(deviceId: string, sessionId: string, handlers: RemoteDesktopStreamHandlers, options?: RemoteDesktopRequestOptions): Result<RemoteDesktopStream> | null {
  const entry = entries.get(deviceId);
  if (!entry?.claimed || !entry.stream || entry.value?.session_id !== sessionId || entry.disposed) return null;
  entry.handlers = handlers;
  for (const sample of entry.timing ?? []) { try { handlers.serverTiming?.(sample); } catch { /* diagnostic observer */ } }
  entry.timing = undefined;
  for (const [key, args] of entry.snapshots) {
    const listener = handlers[key as keyof RemoteDesktopStreamHandlers];
    if (listener) (listener as (...values: unknown[]) => void)(...args);
  }
  options?.signal?.addEventListener("abort", () => dispose(entry), { once: true });
  return entry.stream.then(result => {
    if (options?.signal?.aborted || entry.disposed) return { ok: false, error: "aborted" };
    if (result.ok && result.data) {
      entry.state = "starting"; result.data.activateStandby?.(entry.requestId!, entry.clickedAt!);
      const live = result.data;
      return { ...result, data: { ...live, close() {
        if (entries.get(deviceId) === entry) entries.delete(deviceId);
        entry.disposed = true; entry.state = "closed"; clearInterval(entry.renew); live.close();
      } } };
    }
    return result;
  });
}
/** Numeric timing/state only: never exposes auth, SDP, candidate addresses or input. */
export function inspectRemoteDesktopStandby(deviceId: string) {
  const entry = entries.get(deviceId);
  return entry ? { state: entry.state, claimed: entry.claimed, clicked_at_ms: entry.clickedAt, first_presented_ms: entry.firstPresentedMs } : null;
}
