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
    export { remoteFrameStyle } from ${JSON.stringify(await compileModule("src/pages/RemoteDesktopVideo.tsx"))};
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

test("decoded geometry drives pointer mapping; a media interruption waits for a fresh valid frame", async () => {
  const view = await fixture();
  const presses = () => view.actions.filter(action => action.kind === "pointer_down");
  try {
    await view.frame(1280, 720);
    assert.equal(ready(), "true", "a decoded frame provides geometry without a metadata poll");
    await view.pointer("pointerdown");
    assert.equal(presses().length, 1);
    await view.pointer("pointermove", 170, 170);
    await act(async () => video().onState("reconnecting"));
    assert.equal(ready(), "false");
    assert.equal(view.actions.at(-1).kind, "release_all", "media interruption releases held input");
    const count = view.actions.length;
    await view.pointer("pointerdown");
    await view.media(status());
    await act(async () => video().onState("playing"));
    assert.equal(ready(), "false", "playing/status alone cannot restore input");
    await view.frame(0, 720);
    await view.frame(Number.NaN, 720);
    await act(async () => new Promise(resolve => setTimeout(resolve, 30)));
    assert.equal(view.actions.length, count);
    assert.equal(ready(), "false");
    await view.frame(608, 1080);
    assert.equal(ready(), "true");
    await view.pointer("pointerdown", 115, 240);
    assert.equal(presses().length, 2);
    assert.ok(Math.abs(presses()[1].x - 0.25) < 0.002 && Math.abs(presses()[1].y - 0.75) < 0.002,
      "the decoded portrait frame supplies the new point mapping");
    assert.equal(view.closes, 0);
  } finally { await view.unmount(); }
});

test("publisher status is advisory and cannot replace the decoded frame's geometry", async () => {
  const view = await fixture();
  try {
    await view.media(status());
    await view.frame(1280, 720);
    await act(async () => video().onStatus(status("screen-b", 1080, 1920)));
    assert.equal(ready(), "true", "a delayed metadata update cannot discard current decoded geometry");
    await view.pointer("pointerdown", 240, 160);
    const action = view.actions.at(-1);
    assert.equal(action.kind, "pointer_down");
    assert.ok(Math.abs(action.x - 0.75) < 0.002 && Math.abs(action.y - 0.5) < 0.002);
    await act(async () => video().onStatus(null));
    assert.equal(ready(), "true");
    assert.equal(view.closes, 0);
  } finally { await view.unmount(); }
});
