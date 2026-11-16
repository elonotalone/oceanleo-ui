import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { controllerHeaders } from "./device-settings";

type Prepared = { socket: WebSocket; controller: string; ready: boolean; claimed: boolean; timer?: ReturnType<typeof setInterval> };
const prepared = new Map<string, Prepared>();
type CreatedSocket = { socket: WebSocket; controller: string; messages: string[]; timer: ReturnType<typeof setTimeout> };
const created = new Map<string, CreatedSocket>();

/** Preparing signalling creates no remote session, consent request or billing. */
export function prepareRemoteWebRtcSocket(deviceId: string): () => void {
  let cancelled = false, entry: Prepared | undefined;
  const close = () => {
    cancelled = true;
    if (!entry || entry.claimed) return;
    if (prepared.get(deviceId) === entry) prepared.delete(deviceId);
    clearInterval(entry.timer);
    entry.socket.onopen = entry.socket.onmessage = entry.socket.onerror = entry.socket.onclose = null;
    try { entry.socket.close(); } catch { /* Cold connect remains available. */ }
  };
  void (async () => {
    try {
      if (prepared.has(deviceId) || prepared.size >= 4 || typeof window === "undefined") return;
      const token = await accessToken();
      if (!token || cancelled || prepared.has(deviceId)) return;
      const controller = controllerHeaders()["X-OceanLeo-Controller"];
      if (!controller) return;
      const url = new URL(`${GATEWAY_BASE}/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop/viewer-stream`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url.toString());
      entry = { socket, controller, ready: false, claimed: false };
      const current = entry;
      prepared.set(deviceId, current);
      const send = (value: object) => { if (!current.claimed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
      socket.onopen = () => send({ type: "auth", token, controller });
      socket.onmessage = event => {
        if (typeof event.data !== "string" || event.data.length > 1024) { close(); return; }
        try { const data = JSON.parse(event.data); if (data.type === "ready" && data.transport === "webrtc-v1") current.ready = true; } catch { close(); }
      };
      socket.onerror = socket.onclose = close;
      current.timer = setInterval(() => {
        if (current.claimed) return;
        void accessToken().then(fresh => {
          if (!fresh) { close(); return; }
          send({ type: "auth.refresh", token: fresh }); send({ type: "ping" });
        }).catch(close);
      }, 20_000);
    } catch { close(); /* Old gateways and unavailable credentials use legacy connect. */ }
  })();
  return close;
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
  const socket = takePreparedRemoteWebRtcSocket(deviceId, controller);
  if (!socket) return null;
  return new Promise(resolve => {
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", fail);
      socket.onmessage = socket.onerror = socket.onclose = null;
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
      if (data.type !== "created" || !data.session || typeof data.session.session_id !== "string") { fail(); return; }
      settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", fail);
      const sessionId = data.session.session_id as string;
      const messages: string[] = [];
      const timer = setTimeout(() => { if (created.get(sessionId)?.socket === socket) { created.delete(sessionId); socket.close(); } }, 10_000);
      const item = { socket, controller, messages, timer };
      created.set(sessionId, item);
      socket.onmessage = next => {
        if (typeof next.data !== "string" || next.data.length > 65_536 || messages.length >= 64) { clearTimeout(timer); created.delete(sessionId); socket.close(); return; }
        messages.push(next.data);
      };
      socket.onclose = socket.onerror = () => { clearTimeout(timer); created.delete(sessionId); };
      resolve(data.session);
    };
    try { socket.send(JSON.stringify({ type: "create", body })); } catch { fail(); }
  });
}

export function takeCreatedRemoteWebRtcSocket(sessionId: string, controller: string): CreatedSocket | null {
  const item = created.get(sessionId);
  if (!item || item.controller !== controller || item.socket.readyState !== WebSocket.OPEN) return null;
  clearTimeout(item.timer); created.delete(sessionId);
  item.socket.onopen = item.socket.onmessage = item.socket.onclose = item.socket.onerror = null;
  return item;
}
