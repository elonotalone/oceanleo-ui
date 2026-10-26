import { document, window } from "./remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./module-bench.mjs";

class Pointer extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperties(this, { pointerId: { value: init.pointerId ?? 1 }, pointerType: { value: init.pointerType ?? "mouse" } });
  }
}
window.PointerEvent = Pointer;
const { RemoteDesktopPanel } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", {
  "../api/remote-desktop": dataModule("export const remoteDesktopClient = null"),
  "../i18n/ui/useUI": dataModule("export function useUI(){return (text)=>text;}"),
}));
export const settle = (ms = 25) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
export { document, window, act };

export async function mountStream({ pending = false, coarse = false, overrides = {} } = {}) {
  window.matchMedia = () => ({ matches: coarse });
  const log = { inputs: [], acknowledgements: [], closes: [], streamCloses: 0, httpFrames: 0, onClose: 0 };
  let handlers;
  const stream = { send(action) { log.inputs.push(action); return true; }, acknowledgeFrame(seq) { log.acknowledgements.push(seq); }, close() { log.streamCloses++; } };
  const client = {
    async createSession() { return { ok: true, data: { session_id: "session-stream", state: pending ? "pending_consent" : "connecting", expires_at: "", transport: "websocket-v2" } }; },
    async openStream(_device, _session, callbacks) { handlers = callbacks; callbacks.state(pending ? "pending_consent" : "active"); return { ok: true, data: stream }; },
    async getFrame() { log.httpFrames++; return { ok: true, data: { state: "active", frame: null } }; },
    async sendInput(_device, _session, _seq, action) { log.inputs.push(action); return { ok: true }; },
    async closeSession(_device, id) { log.closes.push(id); return { ok: true, data: { closed: true } }; },
    ...overrides,
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(RemoteDesktopPanel, { deviceId: "d-1", deviceName: "Studio", client, onClose: () => { log.onClose++; }, frameIntervalMs: 5 })); });
  await settle();
  const screen = () => document.querySelector("[data-oceanleo-remote-desktop]");
  const view = {
    host, log, client, screen,
    handlers: () => handlers,
    stage: () => screen().querySelector("[data-remote-stage]"),
    input: () => screen().querySelector("[data-remote-input]"),
    image: () => screen().querySelector("[data-remote-frame]"),
    async frame(sequence = 1) {
      await act(async () => { handlers.frame({ image: "data:image/jpeg;base64,/9j/AAAA", width: 1920, height: 1080, sequence }); });
      if (view.image()) view.image().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
    },
    async fire(target, event) { await act(async () => target.dispatchEvent(event)); },
    async pointer(type, x = 420, y = 230, options = {}) { await view.fire(view.stage(), new Pointer(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...options })); },
    async key(type, key, options = {}) { await view.fire(view.input(), new window.KeyboardEvent(type, { bubbles: true, cancelable: true, key, ...options })); },
    async unmount() { if (view.unmounted) return; view.unmounted = true; await act(async () => root.unmount()); host.remove(); await settle(0); },
  };
  if (!pending) await view.frame();
  return view;
}
