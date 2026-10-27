// Current publisher geometry, decoded frames and ordinary DOM pointer events.
// The media collaborator is inert: no browser, network, SDK, device or pixels.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const { RemoteDesktopPanel } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return value => value; }"),
  "./RemoteDesktopVideo": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function RemoteDesktopVideo(props) {
      globalThis.__currentGeometryVideo = props;
      return React.createElement("video", { ref: props.videoRef, "data-remote-video": true });
    }
  `),
}));

const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => {}); };
const video = () => globalThis.__currentGeometryVideo;
const panel = () => document.querySelector("[data-oceanleo-remote-desktop]");
const ready = () => panel().getAttribute("data-remote-video-ready");
const status = (display = "screen-a", width = 1920, height = 1080) => ({
  state: "publishing", geometry: { display_id: display, width, height },
});

async function fixture() {
  const actions = [];
  let stream;
  let closes = 0;
  const client = {
    async createSession() { return { ok: true, data: { session_id: "fixture", state: "connecting", transport: "websocket-v2" } }; },
    async openStream(_device, _session, callbacks) {
      stream = callbacks;
      return { ok: true, data: { send(action) { actions.push(action); return true; }, close() {}, acknowledgeFrame() {} } };
    },
    async negotiateMedia() { throw new Error("the inert media collaborator must not negotiate"); },
    async closeSession() { closes += 1; return { ok: true, data: { closed: true } }; },
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(RemoteDesktopPanel, { deviceId: "pc", deviceName: "Fixture", client, onClose() {} })));
  await flush();
  await act(async () => stream.state("active"));
  await flush();
  document.querySelector("[data-remote-video]").getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 320, width: 320, height: 320 });
  return {
    actions,
    get closes() { return closes; },
    async media(value) { await act(async () => stream.media({}, value)); await flush(); },
    async frame(width, height) { await act(async () => video().onFrame(width, height)); await flush(); },
    async state() { await act(async () => stream.state("active")); await flush(); },
    async pointer(type, x = 160, y = 160) {
      const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
      await act(async () => document.querySelector("[data-remote-stage]").dispatchEvent(event));
      await flush();
    },
    async unmount() { await act(async () => root.unmount()); host.remove(); delete globalThis.__currentGeometryVideo; },
  };
}

test("geometry loss and rotation discard stale point mapping; only a matching fresh frame restores input", async () => {
  const view = await fixture();
  const presses = () => view.actions.filter(action => action.kind === "pointer_down");
  try {
    await view.frame(1280, 720);
    await view.pointer("pointerdown");
    assert.equal(ready(), "false", "video alone has no publisher geometry");
    assert.equal(presses().length, 0);
    await view.media(status());
    await view.frame(1280, 720);
    assert.equal(ready(), "true", "scaled current frame matches the display");
    await view.pointer("pointerdown");
    assert.equal(presses().length, 1);
    await view.pointer("pointermove", 170, 170); // pending coalesced move must be discarded
    await view.media({ state: "starting" });
    const settled = view.actions.length;
    assert.equal(ready(), "false");
    assert.equal(view.actions.at(-1).kind, "release_all", "geometry loss releases held input");
    await view.state(); // a state/ACK report cannot establish a frame's geometry
    await view.frame(1280, 720);
    await view.pointer("pointerdown");
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    assert.equal(view.actions.length, settled, "no stale input or queued move is replayed");
    await view.media(status("screen-a", 1080, 1920));
    await view.frame(1280, 720);
    assert.equal(ready(), "false", "the old landscape frame does not match portrait geometry");
    await view.pointer("pointerdown");
    assert.equal(presses().length, 1);
    await view.frame(608, 1080); // one pixel of encoder rounding is allowed
    assert.equal(ready(), "true");
    await view.pointer("pointerdown", 115, 240);
    assert.equal(presses().length, 2);
    assert.ok(Math.abs(presses()[1].x - 0.25) < 0.002 && Math.abs(presses()[1].y - 0.75) < 0.002, "the new portrait frame supplies the point mapping");
    await view.media(status("screen-a", 1080, 1920));
    assert.equal(ready(), "true", "an unchanged metadata poll leaves current input usable");
    assert.equal(view.closes, 0, "geometry refresh preserves the remote session");
  } finally { await view.unmount(); }
});

test("a different display with identical dimensions still needs a new frame, including negotiation status updates", async () => {
  const view = await fixture();
  try {
    await view.media(status());
    await view.frame(1280, 720);
    await act(async () => video().onStatus(status("screen-b")));
    assert.equal(ready(), "false", "display identity changed even though the encoded dimensions did not");
    const count = view.actions.length;
    await view.pointer("pointerdown");
    assert.equal(view.actions.length, count);
    await view.frame(1280, 720);
    await view.pointer("pointerdown");
    assert.equal(view.actions.at(-1).kind, "pointer_down");
    await act(async () => video().onStatus(null));
    assert.equal(ready(), "false", "a renewal without current geometry cannot preserve the old mapping");
    assert.equal(view.closes, 0);
  } finally { await view.unmount(); }
});
