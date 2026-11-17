import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { controllerHeaders } from "./device-settings";
import { WebRtcRemoteDesktopViewer, type PreparedWebRtcPeer } from "./remote-desktop-webrtc";

type PreparationOptions = { ready?(capabilities: string[]): void; unavailable?(): void };
type Prepared = { socket: WebSocket; controller: string; ready: boolean; claimed: boolean; capabilities: string[]; owners: Set<PreparationOptions>; timer?: ReturnType<typeof setInterval> };
const prepared = new Map<string, Prepared>();
type ClickSocket = { socket: WebSocket; deviceId: string; startIntent: boolean; requestId?: string; createSent: boolean };
type CreatedSocket = ClickSocket & { controller: string; messages: string[]; timer: ReturnType<typeof setTimeout>; initialPeer?: PreparedWebRtcPeer };
const created = new Map<string, CreatedSocket>();
const creating = new Map<string, ClickSocket>();

/** A click may overtake session creation; the same authenticated socket orders both. */
export function queuePreparedRemoteWebRtcStart(deviceId: string, requestId: string): boolean {
  const item = creating.get(deviceId) ?? [...created.values()].find(value => value.deviceId === deviceId);
  if (!item?.startIntent || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId) || item.socket.readyState !== WebSocket.OPEN) return false;
  if (item.requestId) return item.requestId === requestId;
  item.requestId = requestId;
  if (item.createSent) {
    try { item.socket.send(JSON.stringify({ type: "standby.start", request_id: requestId })); }
    catch { return false; }
  }
  return true;
}

/** Preparing signalling creates no remote session, consent request or billing. */
export function prepareRemoteWebRtcSocket(deviceId: string, options: PreparationOptions = {}): () => void {
  let cancelled = false, entry: Prepared | undefined;
  const subscribe = (current: Prepared) => {
    if (cancelled || current.claimed) return false;
    entry = current; current.owners.add(options);
    if (current.ready) queueMicrotask(() => { if (!cancelled && !current.claimed) options.ready?.(current.capabilities); });
    return true;
  };
  const release = () => {
    if (cancelled) return;
    cancelled = true;
    if (!entry) return;
    entry.owners.delete(options);
    if (entry.claimed || entry.owners.size) return;
    if (prepared.get(deviceId) === entry) prepared.delete(deviceId);
    clearInterval(entry.timer);
    entry.socket.onopen = entry.socket.onmessage = entry.socket.onerror = entry.socket.onclose = null;
    try { entry.socket.close(); } catch { /* ordinary create remains available */ }
  };
  void (async () => {
    try {
      if (typeof window === "undefined") { options.unavailable?.(); return; }
      const existing = prepared.get(deviceId);
      if (existing && subscribe(existing)) return;
      if (prepared.size >= 4) { options.unavailable?.(); return; }
      const token = await accessToken();
      if (!token || cancelled) { options.unavailable?.(); return; }
      const controller = controllerHeaders()["X-OceanLeo-Controller"];
      if (!controller) { options.unavailable?.(); return; }
      const racing = prepared.get(deviceId);
      if (racing) { if (racing.controller === controller && subscribe(racing)) return; options.unavailable?.(); return; }
      const url = new URL(`${GATEWAY_BASE}/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop/viewer-stream`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url.toString());
      const current: Prepared = { socket, controller, ready: false, claimed: false, capabilities: [], owners: new Set() };
      prepared.set(deviceId, current); subscribe(current);
      const close = () => {
        if (current.claimed) return;
        if (prepared.get(deviceId) === current) prepared.delete(deviceId);
        clearInterval(current.timer);
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        for (const owner of current.owners) owner.unavailable?.();
        current.owners.clear();
        try { socket.close(); } catch { /* ordinary create remains available */ }
      };
      const send = (value: object) => { if (!current.claimed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
      socket.onopen = () => send({ type: "auth", token, controller });
      socket.onmessage = event => {
        if (typeof event.data !== "string" || event.data.length > 1024) { close(); return; }
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ready" && data.transport === "webrtc-v1") {
            current.ready = true; current.capabilities = Array.isArray(data.capabilities) ? data.capabilities.filter((value: unknown): value is string => typeof value === "string") : [];
            for (const owner of [...current.owners]) owner.ready?.(current.capabilities);
          }
        } catch { close(); }
      };
      socket.onerror = socket.onclose = close;
      current.timer = setInterval(() => {
        if (current.claimed) return;
        void accessToken().then(fresh => { if (!fresh) { close(); return; } send({ type: "auth.refresh", token: fresh }); send({ type: "ping" }); }).catch(close);
      }, 20_000);
    } catch { options.unavailable?.(); release(); }
  })();
  return release;
}

export function takePreparedRemoteWebRtcSocket(deviceId: string, controller: string): WebSocket | null {
  const entry = prepared.get(deviceId);
  if (!entry || !entry.ready || entry.claimed || entry.controller !== controller || entry.socket.readyState !== WebSocket.OPEN) return null;
  entry.claimed = true; clearInterval(entry.timer); prepared.delete(deviceId);
  entry.socket.onopen = entry.socket.onmessage = entry.socket.onerror = entry.socket.onclose = null;
  return entry.socket;
}

/** Reuse the ordinary create body/idempotency key on the already-open connection. */
export async function createPreparedRemoteWebRtcSession(deviceId: string, body: object, signal?: AbortSignal): Promise<unknown | null> {
  if (signal?.aborted) return null;
  let controller: string;
  try { controller = controllerHeaders()["X-OceanLeo-Controller"]; } catch { return null; }
  const startIntent = prepared.get(deviceId)?.capabilities.includes("remote-desktop-start-intent-v1") === true
    && (body as { standby?: boolean }).standby === true;
  const socket = takePreparedRemoteWebRtcSocket(deviceId, controller);
  if (!socket) return null;
  const click: ClickSocket = { socket, deviceId, startIntent, createSent: false,
    requestId: startIntent ? (body as { activation_request_id?: string }).activation_request_id : undefined };
  creating.set(deviceId, click);
  const stopCreating = () => { if (creating.get(deviceId) === click) creating.delete(deviceId); };
  const initialPeer = await WebRtcRemoteDesktopViewer.prepareInitialPeer();
  if (signal?.aborted || socket.readyState !== WebSocket.OPEN) {
    stopCreating(); initialPeer?.pc.close(); socket.close(); return null;
  }
  return new Promise(resolve => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true; stopCreating(); clearTimeout(timeout); signal?.removeEventListener("abort", fail);
      socket.onmessage = socket.onerror = socket.onclose = null;
      initialPeer?.pc.close();
      try { socket.close(); } catch { /* HTTP retries the SAME request id. */ }
      resolve(null);
    };
    const timeout = setTimeout(fail, 8000);
    signal?.addEventListener("abort", fail, { once: true });
    socket.onerror = socket.onclose = fail;
    socket.onmessage = event => {
      if (typeof event.data !== "string" || event.data.length > 65_536) { fail(); return; }
      let data: any;
      try { data = JSON.parse(event.data); } catch { fail(); return; }
      if (data.type === "pong" || data.type === "ready") return;
      if (data.type !== "created" || !data.session || typeof data.session.session_id !== "string") { fail(); return; }
      settled = true; stopCreating(); clearTimeout(timeout); signal?.removeEventListener("abort", fail);
      const sessionId = data.session.session_id as string;
      const acceptedPeer = data.session.transport === "webrtc-v1" ? initialPeer : undefined;
      if (initialPeer && !acceptedPeer) initialPeer.pc.close();
      const messages: string[] = [];
      let disposed = false;
      const dispose = () => { if (disposed) return; disposed = true; clearTimeout(timer); created.delete(sessionId); acceptedPeer?.pc.close(); };
      const timer = setTimeout(() => { if (created.get(sessionId)?.socket === socket) { dispose(); socket.close(); } }, 10_000);
      const item = { ...click, controller, messages, timer, initialPeer: acceptedPeer };
      created.set(sessionId, item);
      socket.onmessage = next => {
        if (typeof next.data !== "string" || next.data.length > 65_536 || messages.length >= 64) { dispose(); socket.close(); return; }
        messages.push(next.data);
      };
      socket.onclose = socket.onerror = dispose;
      resolve(data.session);
    };
    try {
      if (initialPeer) initialPeer.offeredAt = performance.now();
      socket.send(JSON.stringify({ type: "create", body: { ...body, ...(click.requestId ? { activation_request_id: click.requestId } : {}) }, ...(initialPeer ? { offer: { k: "offer", gen: 1, sdp: initialPeer.offer.sdp } } : {}) }));
      click.createSent = true;
    } catch { fail(); }
  });
}

export function takeCreatedRemoteWebRtcSocket(sessionId: string, controller: string): CreatedSocket | null {
  const item = created.get(sessionId);
  if (!item || item.controller !== controller || item.socket.readyState !== WebSocket.OPEN) return null;
  clearTimeout(item.timer); created.delete(sessionId);
  item.socket.onopen = item.socket.onmessage = item.socket.onclose = item.socket.onerror = null;
  return item;
}
