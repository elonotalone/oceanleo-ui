import { takePreparedRemoteWebRtcSocket, takeCreatedRemoteWebRtcSocket } from "./remote-desktop-webrtc-preconnect";
import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { controllerHeaders } from "./device-settings";
import { parseRemoteInputDiagnostics } from "./remote-desktop-diagnostics";
import { qualityCode, qualityEnvironment, type RemoteDesktopQualityReport, type RemoteDesktopQualityWindow } from "./remote-desktop-quality";
import { WebRtcRemoteDesktopViewer, type RemoteWebRtcDescriptor, type WebRtcQualityReport } from "./remote-desktop-webrtc";
import { isWebRtcInputFault as inputFault } from "./remote-desktop-webrtc-errors";
import type {
  RemoteDesktopAccess, RemoteDesktopActivity, RemoteDesktopApiResult, RemoteDesktopBilling,
  RemoteDesktopClient, RemoteDesktopRequestOptions, RemoteDesktopSessionState, RemoteDesktopStream,
  RemoteDesktopStreamHandlers, RemoteMediaStatus,
} from "./remote-desktop";

interface Parsers {
  descriptor(value: unknown, sessionId?: string): RemoteWebRtcDescriptor | null;
  mediaStatus(value: unknown): RemoteMediaStatus | null;
  access(value: unknown): RemoteDesktopAccess | null;
  billing(value: unknown): RemoteDesktopBilling | null;
  activity(value: unknown): RemoteDesktopActivity | null;
}
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const monotonic = () => typeof performance !== "undefined" ? performance.now() : Date.now();
const terminalAuth = (code?: string) => ["unauthorized", "revoked", "controller_revoked", "signed_out", "account_mismatch", "session_not_found", "session_closed", "remote_desktop_disabled", "input_consent_revoked", "lease_expired"].includes(code ?? "");
const MAX_SIGNAL_BYTES = 65_536;

/** The authenticated socket carries signalling only; its lifetime never owns the direct peer. */
export async function openRemoteWebRtcStream(
  deviceId: string, sessionId: string, handlers: RemoteDesktopStreamHandlers,
  options: RemoteDesktopRequestOptions & { sessionCreatedAt?: number; descriptorReceivedAt?: number }, client: RemoteDesktopClient, parsers: Parsers,
): Promise<RemoteDesktopApiResult<RemoteDesktopStream>> {
  if (options.signal?.aborted) return { ok: false, error: "aborted" };
  const initialToken = await accessToken();
  if (!initialToken) return { ok: false, error: "unauthorized" };
  let controller: string;
  try { controller = controllerHeaders()["X-OceanLeo-Controller"]; }
  catch { return { ok: false, error: "controller_identity_unavailable" }; }
  const initialDescriptor = options.descriptor ? parsers.descriptor(options.descriptor, sessionId) : null;
  if (options.descriptor && !initialDescriptor) return { ok: false, error: "response_malformed" };
  if (options.sequenceFloor !== undefined && (!Number.isSafeInteger(options.sequenceFloor) || options.sequenceFloor < 0)) return { ok: false, error: "response_malformed" };
  if (options.signal?.aborted) return { ok: false, error: "aborted" };
  let createdSocket = takeCreatedRemoteWebRtcSocket(sessionId, controller);
  let initialPeer = createdSocket?.initialPeer;

  const url = new URL(`${GATEWAY_BASE}/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop/sessions/${encodeURIComponent(sessionId)}/stream`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  let socket: WebSocket | null = null, peer: WebRtcRemoteDesktopViewer | null = null;
  let ended = false, ending = false, settled = false, authenticated = false, authFrameSent = false, inputAllowed = true;
  let clickedAt = Number.isFinite(options.clickedAt) ? options.clickedAt! : monotonic();
  let state: RemoteDesktopSessionState = "pending_consent";
  let video: HTMLVideoElement | null = null, descriptor: RemoteWebRtcDescriptor | null = null;
  let leaseDeadline = Infinity, renewalAt = Infinity, leaseIdentity = -Infinity;
  let standbyIdentity: string | undefined;
  let reconnectWindow = 180_000, disconnectedAt = monotonic(), retryDelay = 200;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let socketTimeout: ReturnType<typeof setTimeout> | undefined;
  let negotiation: Promise<void> | null = null, nextNegotiation = 0, negotiationBackoff = 1000;
  let pingId = 0, lastPongAt = monotonic(), lastRefreshAt = monotonic();
  let mediaReady = false, mediaReadySent = false;
  let incomingSignals: Record<string, unknown>[] = [], outgoingSignals: Record<string, unknown>[] = [];
  let signalTimes: number[] = [];
  let firstOfferSentAt = initialPeer?.offeredAt;
  let resolve!: (result: RemoteDesktopApiResult<RemoteDesktopStream>) => void;
  const connected = new Promise<RemoteDesktopApiResult<RemoteDesktopStream>>(done => { resolve = done; });
  const settle = (result: RemoteDesktopApiResult<RemoteDesktopStream>) => { if (!settled) { settled = true; resolve(result); } };

  const closeSocket = () => {
    const old = socket; socket = null; authenticated = false; authFrameSent = false;
    if (socketTimeout) clearTimeout(socketTimeout);
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; try { old.close(); } catch { /* already closed */ } }
  };
  const finish = (reason: string, notify = true) => {
    if (ended || ending) return;
    if (inputFault(reason)) { handlers.webrtcState?.("input_reconnecting"); return; }
    ending = true;
    initialPeer?.pc.close(); initialPeer = undefined;
    if (createdSocket) { createdSocket.socket.close(); createdSocket = null; }
    // Let an intentional leave send its peer bye before the signalling socket closes.
    if (peer) peer.close(reason);
    else report({
      v: 1, transport: "webrtc-v1", media: "webrtc", device_id: deviceId, session_id: sessionId,
      attempt: 0, end_reason: reason, duration_ms: Math.max(0, Math.min(86_400_000, Math.round(monotonic() - clickedAt))),
      reconnects: 0, media_renewals: 0,
      steps: {
        ...(options.sessionCreatedAt !== undefined ? { session_created_ms: Math.max(0, Math.min(600_000, Math.round(options.sessionCreatedAt - clickedAt))) } : {}),
        ...(options.descriptorReceivedAt !== undefined ? { descriptor_received_ms: Math.max(0, Math.min(600_000, Math.round(options.descriptorReceivedAt - clickedAt))) } : {}),
      },
      input: { ws_count: 0, dc_count: 0 },
      video: { picture_age_source: "unknown", frames_rendered: 0, freeze_count: 0, freeze_ms: 0 },
      env: qualityEnvironment(), window_start_ms: Date.now(), viewer: { t: "rd.viewer_report", v: 1, seq: 1 },
    }, true);
    ended = true;
    clearInterval(heartbeat);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    options.signal?.removeEventListener("abort", abort);
    closeSocket();
    outgoingSignals = []; incomingSignals = [];
    settle({ ok: false, error: reason });
    if (notify) handlers.state("closed", reason);
  };
  const write = (value: object, beforeAuth = false): boolean => {
    const active = socket;
    if (ended || !active || (!authenticated && !beforeAuth) || active.readyState !== WebSocket.OPEN || active.bufferedAmount > 256 * 1024) return false;
    try { active.send(JSON.stringify(value)); return true; }
    catch { queueMicrotask(() => { if (socket === active) reconnect(); }); return false; }
  };
  const flushSignals = () => {
    // The server reads/authenticates the first envelope before processing any signal.
    // Queueing offers immediately behind that envelope saves one network round trip;
    // other traffic still waits for the server's authenticated state.
    if ((!authenticated && !authFrameSent) || ended) return;
    const now = monotonic(); signalTimes = signalTimes.filter(at => now - at < 10_000);
    while (outgoingSignals.length && signalTimes.length < 180) {
      const data = outgoingSignals[0];
      if (!write({ type: "signal", data }, authFrameSent)) break;
      if (data.k === "offer" && firstOfferSentAt === undefined) firstOfferSentAt = monotonic();
      outgoingSignals.shift(); signalTimes.push(now);
    }
  };
  const enqueueSignal = (data: Record<string, unknown>): boolean => {
    if (ended || new TextEncoder().encode(JSON.stringify({ type: "signal", data })).byteLength > MAX_SIGNAL_BYTES) return false;
    // Bound a detached socket to the current offer and latest 64 trickled candidates.
    const generation = Number(data.gen);
    if (Number.isSafeInteger(generation)) outgoingSignals = outgoingSignals.filter(item => !Number.isSafeInteger(item.gen) || Number(item.gen) >= generation);
    if (data.k === "offer") outgoingSignals = outgoingSignals.filter(item => item.k !== "offer");
    outgoingSignals.push(data);
    while (outgoingSignals.filter(item => item.k === "candidate").length > 64) {
      const first = outgoingSignals.findIndex(item => item.k === "candidate"); outgoingSignals.splice(first, 1);
    }
    if (outgoingSignals.length > 68) outgoingSignals.splice(0, outgoingSignals.length - 68);
    flushSignals(); return true;
  };
  const persistQuality = async <T extends { path?: unknown }>(write: (payload: T) => Promise<RemoteDesktopApiResult<unknown>>, payload: T): Promise<void> => {
    const result = await write(payload);
    // Older strict gateways can still store the media/input evidence while optional
    // comparison telemetry is being rolled out. Never retry another validation error.
    if (result.status !== 422 || !payload.path || typeof payload.path !== "object") return;
    const extended = new Set(["direct_rtt_ms", "relay_rtt_ms", "comparison_source", "selection_state", "best_relay_region"]);
    const entries = Object.entries(payload.path);
    if (!entries.some(([key]) => extended.has(key))) return;
    await write({ ...payload, path: Object.fromEntries(entries.filter(([key]) => !extended.has(key))) });
  };
  const report = (value: WebRtcQualityReport, final: boolean) => {
    // Reports are diagnostics only: a refused report cannot alter either transport.
    try {
      const common = { v: 1 as const, device_id: deviceId, session_id: sessionId, transport: "webrtc-v1" as const };
      const steps = { ...value.steps };
      delete steps.offer_sent_ms;
      if (firstOfferSentAt !== undefined) steps.offer_sent_ms = Math.max(0, Math.min(600_000, Math.round(firstOfferSentAt - clickedAt)));
      const videoSummary = value.video ? {
        picture_age: value.video.picture_age, picture_age_source: value.video.picture_age_source,
        frames_rendered: value.video.frames_rendered, freeze_count: value.video.freeze_count, freeze_ms: value.video.freeze_ms,
      } : undefined;
      if (final) {
        const payload: RemoteDesktopQualityReport = {
          ...common, media: peer ? "webrtc" : "none", attempt: value.attempt ?? 0,
          duration_ms: value.duration_ms ?? 0, reconnects: value.reconnects ?? 0, media_renewals: value.media_renewals ?? 0,
          end_reason: qualityCode(value.end_reason ?? "viewer_closed"), steps,
          input: { ...value.input, ws_count: value.input?.ws_count ?? 0, dc_count: value.input?.dc_count ?? 0 },
          video: { ...videoSummary, samples: Math.min(10_000, value.video?.frames_rendered ?? 0) },
          ...(value.path ? { path: value.path } : {}), env: value.env ?? qualityEnvironment(),
        };
        if (client.reportQuality) void persistQuality(client.reportQuality.bind(client), payload).catch(() => {});
      } else {
        const payload: RemoteDesktopQualityWindow = { ...common, window_start_ms: value.window_start_ms ?? Date.now(), viewer: value.viewer ?? {},
          steps, input: value.input, video: videoSummary,
          ...(value.path ? { path: value.path } : {}),
          ...(value.publisher ? { publisher: Object.fromEntries(Object.entries(value.publisher).filter(([key, number]) => /^[a-z][a-z0-9_]{0,47}$/.test(key) && Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER).slice(0, 64)) } : {}),
        };
        if (client.reportQualityWindow) void persistQuality(client.reportQualityWindow.bind(client), payload).catch(() => {});
      }
    } catch { /* best effort */ }
  };
  const applyDescriptor = (value: RemoteWebRtcDescriptor, receivedAt = monotonic()): boolean => {
    if (ended) return false;
    const expiresAt = Date.parse(value.lease_expires_at);
    if (descriptor && (expiresAt < leaseIdentity || value.server_now < descriptor.server_now)) return false;
    const validUntil = value.standby ? Math.min(expiresAt, Date.parse(value.standby_expires_at ?? "")) : expiresAt;
    const deadline = receivedAt + Math.max(0, validUntil - value.server_now * 1000);
    // Repeated snapshots of one lease must not turn a stale timestamp into extra time.
    leaseDeadline = expiresAt === leaseIdentity && value.standby_expires_at === standbyIdentity && value.standby === descriptor?.standby ? Math.min(leaseDeadline, deadline) : deadline;
    standbyIdentity = value.standby_expires_at;
    leaseIdentity = expiresAt;
    renewalAt = value.standby ? Infinity : leaseDeadline - 60_000;
    descriptor = value;
    if (leaseDeadline <= monotonic()) { finish("lease_expired"); return false; }
    if (peer) { peer.updateDescriptor(value); return true; }
    peer = new WebRtcRemoteDesktopViewer({
      descriptor: value, deviceId, clickedAt, sequenceFloor: options.sequenceFloor,
      sessionCreatedAt: options.sessionCreatedAt, descriptorReceivedAt: receivedAt,
      initialPeer,
      sendSignal: enqueueSignal,
      onState: (next, path) => { if (!ended) handlers.webrtcState?.(next, path); },
      onStandbyState: (state, at) => handlers.standbyState?.(state, at),
      onPresentation: sample => { if (!ended) handlers.webrtcPresentation?.(sample); },
      onFrame: (width, height) => {
        if (ended) return;
        handlers.webrtcFrame?.(width, height);
        mediaReady = true;
        if (!mediaReadySent) mediaReadySent = write({ type: "media_ready" });
      },
      onTerminal: reason => finish(reason), onReport: report,
    });
    initialPeer = undefined;
    peer.attachVideo(video);
    const pending = incomingSignals; incomingSignals = [];
    void peer.start().then(async () => { for (const signal of pending) { if (ended) break; await peer?.signal(signal); } }).catch(() => {
      // The peer owns same-session recovery; a rejected start never deletes the session.
      if (!ended) handlers.webrtcState?.("picture_reconnecting");
    });
    return true;
  };
  const negotiate = () => {
    if (ended || negotiation || !client.negotiateMedia || monotonic() < nextNegotiation) return;
    negotiation = (async () => {
      try {
        const result = await client.negotiateMedia!(deviceId, sessionId, descriptor?.display_id ?? undefined, { signal: options.signal, transport: "webrtc-v1" });
        if (ended) return;
        if (!result.ok || !result.data) {
          if (terminalAuth(result.error)) { finish(result.error!); return; }
          nextNegotiation = monotonic() + negotiationBackoff; negotiationBackoff = Math.min(8000, negotiationBackoff * 2); return;
        }
        const media = parsers.descriptor(result.data.media, sessionId);
        if (!media) { finish("response_malformed"); return; }
        negotiationBackoff = 1000; nextNegotiation = monotonic() + 1000;
        if (!applyDescriptor(media)) return;
        handlers.media?.(media, result.data.media_status);
        if (result.data.media_status?.state === "failed") finish(result.data.media_status.error || "media_capture_or_publish_failed");
      } catch { nextNegotiation = monotonic() + negotiationBackoff; negotiationBackoff = Math.min(8000, negotiationBackoff * 2); }
      finally { negotiation = null; }
    })();
  };
  const stream: RemoteDesktopStream = {
    activateStandby: (requestId, at) => { clickedAt = at; peer?.activateStandby(requestId, at); },
    renewStandby: () => write({ type: "standby.renew" }),
    transport: "webrtc-v1", attachVideo: value => { video = value; peer?.attachVideo(value); },
    send: action => !ended && Boolean(peer) && (inputAllowed || action.kind === "release_all") && peer!.send(action),
    sendViewerReport: value => !ended && Boolean(peer?.sendControl(value)),
    releaseForHandoff: () => ended || !peer ? Promise.reject(new Error("input_ack_unknown")) : peer.releaseForHandoff(),
    finishHandoff: () => { if (!ended) peer?.finishHandoff(); },
    lastSequence: () => peer?.lastSequence() ?? options.sequenceFloor ?? 0,
    inputPath: () => "data_channel",
    acknowledgeFrame() {},
    acknowledgeMediaFrame() { mediaReady = true; if (!mediaReadySent) mediaReadySent = write({ type: "media_ready" }); },
    close: () => finish("viewer_left", false),
  };
  const abort = () => finish("aborted", false);
  const reconnect = () => {
    if (ended) return;
    if (authenticated) disconnectedAt = monotonic();
    closeSocket(); mediaReadySent = false;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, retryDelay);
    retryDelay = Math.min(8000, retryDelay * 2);
  };
  const connect = async (token?: string) => {
    if (ended) return;
    let fresh: string | null;
    try { fresh = token ?? await accessToken(); } catch { reconnect(); return; }
    if (ended) return;
    if (!fresh) { finish("unauthorized"); return; }
    const created = createdSocket ?? takeCreatedRemoteWebRtcSocket(sessionId, controller);
    createdSocket = null;
    const prepared = created?.socket ?? takePreparedRemoteWebRtcSocket(deviceId, controller);
    let active: WebSocket;
    try { active = prepared ?? new WebSocket(url.toString()); } catch { reconnect(); return; }
    socket = active;
    socketTimeout = setTimeout(() => { if (socket === active) reconnect(); }, 10_000);
    active.onopen = () => { if (socket === active) { authFrameSent = write({ type: "auth", token: fresh, controller }, true); if (authFrameSent) flushSignals(); } };
    active.onmessage = event => {
      if (ended || socket !== active) return;
      if (typeof event.data !== "string" || new TextEncoder().encode(event.data).byteLength > MAX_SIGNAL_BYTES) { reconnect(); return; }
      let data: unknown;
      try { data = JSON.parse(event.data); } catch { reconnect(); return; }
      if (!record(data)) { reconnect(); return; }
      if (data.type === "pong") {
        if (Number.isSafeInteger(data.id) && Number(data.id) > 0 && Number(data.id) <= pingId) { lastPongAt = monotonic(); handlers.pong?.(); }
        return;
      }
      if (data.type === "signal") {
        if (!record(data.data)) { reconnect(); return; }
        if (peer) void peer.signal(data.data).catch(() => {});
        else { incomingSignals.push(data.data); incomingSignals = incomingSignals.slice(-65); }
        return;
      }
      if (data.type !== "state" || !["pending_consent", "connecting", "active", "reconnecting", "closed"].includes(String(data.state))) { reconnect(); return; }
      if (data.session_id !== undefined && data.session_id !== sessionId || data.transport !== undefined && data.transport !== "webrtc-v1") { finish("response_malformed"); return; }
      state = data.state as RemoteDesktopSessionState;
      if (state === "closed") { finish(typeof data.error === "string" ? data.error : "session_closed"); return; }
      if (!authenticated) lastRefreshAt = monotonic();
      authenticated = true; retryDelay = 200; lastPongAt = monotonic();
      if (socketTimeout) clearTimeout(socketTimeout);
      if ("activity" in data) {
        const activity = parsers.activity(data.activity);
        if (activity?.reconnect_window_s) reconnectWindow = activity.reconnect_window_s * 1000;
        handlers.activity?.(activity);
      }
      if ("access" in data || "billing" in data) {
        const access = parsers.access(data.access);
        if (access) { if (inputAllowed && !access.input_allowed) peer?.send({ kind: "release_all" }); inputAllowed = access.input_allowed; }
        handlers.session?.({ access, billing: parsers.billing(data.billing) });
      }
      if (record(data.timing)) handlers.serverTiming?.(Object.fromEntries(Object.entries(data.timing).filter(([, value]) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) as Record<string, number>);
      if ("input_diagnostics" in data) { const diagnostics = parseRemoteInputDiagnostics(data.input_diagnostics); if (diagnostics) handlers.inputDiagnostics?.(diagnostics); }
      if ("media" in data && data.media !== null) {
        const media = parsers.descriptor(data.media, sessionId);
        if (!media) { finish("response_malformed"); return; }
        const accepted = applyDescriptor(media);
        if (ended) return;
        if (accepted) {
          const status = parsers.mediaStatus(data.media_status);
          handlers.media?.(media, status);
          if (status?.state === "failed") { finish(status.error || "media_capture_or_publish_failed"); return; }
        }
      } else if (parsers.mediaStatus(data.media_status)?.state === "failed") {
        const status = parsers.mediaStatus(data.media_status)!;
        handlers.media?.(descriptor, status); finish(status.error || "media_capture_or_publish_failed"); return;
      }
      if (ended) return;
      handlers.state(state, typeof data.error === "string" ? data.error : undefined);
      settle({ ok: true, data: stream });
      peer?.flushSignals();
      flushSignals();
      if (mediaReady && !mediaReadySent) mediaReadySent = write({ type: "media_ready" });
      if (!descriptor && state !== "pending_consent") negotiate();
    };
    active.onerror = active.onclose = () => { if (socket === active && !ended) reconnect(); };
    if (prepared) {
      // The socket already authenticated before click. Refresh identity, bind the
      // ordinary session lease and pipeline SDP on that same open connection.
      authFrameSent = write({ type: "auth.refresh", token: fresh }, true)
        && (Boolean(created) || write({ type: "attach", session_id: sessionId }, true));
      if (created) for (const data of created.messages) active.onmessage?.({ data } as MessageEvent);
      if (authFrameSent) flushSignals(); else reconnect();
    }
  };
  const heartbeat = setInterval(() => {
    if (ended) return;
    const now = monotonic();
    if (now >= leaseDeadline) { finish("lease_expired"); return; }
    if (!authenticated && now - disconnectedAt >= reconnectWindow) { finish("viewer_reconnect_timeout"); return; }
    if (authenticated && now - lastPongAt >= 10_000) { reconnect(); return; }
    if (authenticated) {
      write({ type: "ping", id: ++pingId }); flushSignals();
      if (now - lastRefreshAt >= 20_000) {
        lastRefreshAt = now;
        void accessToken().then(token => { if (!ended) { if (token) write({ type: "auth.refresh", token }); else finish("unauthorized"); } }).catch(() => { if (!ended) reconnect(); });
      }
    }
    if (descriptor && now >= renewalAt || !descriptor && state !== "pending_consent") negotiate();
  }, 1000);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (initialDescriptor) applyDescriptor(initialDescriptor, options.descriptorReceivedAt ?? monotonic());
  if (!ended) void connect(initialToken);
  return connected;
}
