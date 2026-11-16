import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { document, window } from "./helpers/remote-desktop-dom.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

const { RemoteDesktopPanel } = await import(await compileModule("src/pages/RemoteDesktopPanel.tsx", {
  "../api/remote-desktop": dataModule("export const remoteDesktopClient = null;"),
  "../i18n/ui/useUI": dataModule("export function useUI(){return (text,vars)=>text.replace(/\\{(\\w+)\\}/g,(all,key)=>String(vars?.[key]??all));}"),
  "./remote-desktop-media": dataModule("export class RemotePublisherStatusError extends Error {} export function openRemoteMedia(){throw new Error('WebRTC must not start the ARTC SDK');}"),
}));

const descriptor = {
  transport: "webrtc-v1", role: "viewer", session_id: "webrtc-session", display_id: null,
  ice_servers: [{ urls: ["stun:relay.test:3478"] }], ice_expires_at: new Date(Date.now() + 3600000).toISOString(),
  server_now: Date.now() / 1000, lease_expires_at: new Date(Date.now() + 120000).toISOString(),
};
const mounted = [];
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });

async function mount({ pending = false, withDescriptor = true, overrides = {} } = {}) {
  window.matchMedia = () => ({ matches: false });
  const log = { streams: 0, streamCloses: 0, closes: [], inputs: [], videos: [], acknowledgements: 0, negotiations: [] };
  let callbacks, options;
  const stream = {
    transport: "webrtc-v1",
    attachVideo(video) { log.videos.push(video); },
    acknowledgeMediaFrame() { log.acknowledgements++; },
    send(action) { log.inputs.push(action); return true; },
    close() { log.streamCloses++; },
  };
  const client = {
    async createSession() { return { ok: true, data: { session_id: descriptor.session_id, state: pending ? "pending_consent" : "connecting", transport: "webrtc-v1", expires_at: descriptor.lease_expires_at, ...(withDescriptor ? { media: { media: descriptor, media_status: { state: "publishing" } } } : {}) } }; },
    async openStream(_device, _session, handlers, streamOptions) { log.streams++; callbacks = handlers; options = streamOptions; handlers.state(pending ? "pending_consent" : "active"); return { ok: true, data: stream }; },
    async negotiateMedia(_device, _session, displayId, requestOptions) { log.negotiations.push({ displayId, transport: requestOptions?.transport }); return { ok: true, data: { media: { ...descriptor, display_id: displayId }, media_status: { state: "publishing" } } }; },
    async closeSession(_device, sessionId) { log.closes.push(sessionId); return { ok: true, data: { closed: true } }; },
    ...overrides,
  };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(RemoteDesktopPanel, { deviceId: "device", deviceName: "Studio", client, onClose() {} })));
  await settle();
  const screen = () => document.querySelector("[data-oceanleo-remote-desktop]");
  const view = {
    log, screen, handlers: () => callbacks, options: () => options,
    video: () => screen().querySelector("video"), input: () => screen().querySelector("textarea"),
    async frame(width = 1920, height = 1080) { await act(async () => { callbacks.webrtcFrame(width, height); callbacks.webrtcState("playing"); }); },
    async toolbar() { if (!screen().querySelector("[data-remote-toolbar]")) await act(async () => screen().querySelector("[data-remote-toolbar-handle]").click()); },
    async unmount() { if (view.unmounted) return; view.unmounted = true; await act(async () => root.unmount()); host.remove(); },
  };
  mounted.push(view);
  return view;
}

test("WebRTC renders a plain attached video, passes the selected descriptor, and gates input on decoded geometry", async () => {
  const view = await mount();
  const video = view.video();
  await act(async () => view.handlers().media(descriptor, { state: "publishing" }));
  assert.equal(view.screen().getAttribute("data-remote-media"), "webrtc");
  assert.ok(video.hasAttribute("data-remote-webrtc-video"));
  assert.equal(video.muted, true);
  assert.equal(view.log.videos.at(-1), video);
  assert.equal(view.options().transport, "webrtc-v1");
  assert.deepEqual(view.options().descriptor, descriptor);
  assert.equal(typeof view.options().clickedAt, "number");
  assert.deepEqual(view.log.negotiations, [], "the plain video must not negotiate or start ARTC");
  assert.equal(view.input().disabled, true);
  await act(async () => view.handlers().webrtcFrame(NaN, 1080));
  assert.equal(view.input().disabled, true);
  await view.frame();
  assert.equal(view.input().disabled, false);
  assert.equal(view.log.acknowledgements, 1);
  assert.equal(view.video(), video);
  video.getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  await act(async () => {
    const down = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 420, clientY: 230, button: 0 });
    Object.defineProperties(down, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
    view.screen().querySelector("[data-remote-stage]").dispatchEvent(down);
  });
  assert.deepEqual(view.log.inputs.at(-1), { kind: "pointer_down", x: .5, y: .5, button: "left" });
});

test("WebRTC can attach while consent is pending and waits for the stream's descriptor instead of starting ARTC", async () => {
  const view = await mount({ pending: true, withDescriptor: false });
  assert.equal(view.options().descriptor, undefined);
  assert.equal(view.video(), null);
  assert.equal(view.input().disabled, true);
  await act(async () => view.handlers().state("active"));
  await settle();
  assert.ok(view.video());
  assert.deepEqual(view.log.negotiations, []);
  await view.frame();
  assert.equal(view.input().disabled, false);
});

test("WebRTC input recovery keeps decoded pixels, geometry, the peer attachment, and the authorized session", async () => {
  const view = await mount(); await view.frame();
  const video = view.video();
  await act(async () => view.handlers().webrtcState("input_reconnecting"));
  assert.match(view.screen().textContent, /输入正在重新连接，画面继续显示/);
  assert.equal(view.video(), video);
  assert.equal(view.input().disabled, false);
  assert.equal(view.screen().getAttribute("data-remote-video-ready"), "true");
  await act(async () => view.handlers().webrtcFrame(1920, 1080));
  assert.match(view.screen().textContent, /输入正在重新连接/ , "new picture frames cannot hide input recovery");
  assert.deepEqual(view.log.closes, []);
  assert.equal(view.log.streamCloses, 0);
  assert.deepEqual(view.log.videos, [video]);
  await act(async () => view.handlers().webrtcState("playing"));
  assert.equal(view.screen().querySelector("[data-remote-media-notice]"), null);
});

test("every WebRTC input fault origin is barred from disconnect and DELETE", async () => {
  const view = await mount(); await view.frame();
  const video = view.video();
  for (const code of ["media_data_channel_unavailable", "media_data_channel_write_unknown", "input_ack_unknown", "input_executor_failed", "input_receipt_rejected", "input_release_failed", "input_backlog_timeout", "input_failed"]) {
    for (const deliver of [() => view.handlers().error(code), () => view.handlers().media(descriptor, { state: "failed", error: code }), () => view.handlers().state("closed", code)]) {
      await act(async () => deliver());
      assert.equal(view.video(), video, code);
      assert.equal(view.input().disabled, false, code);
      assert.equal(view.screen().getAttribute("data-remote-phase"), "active", code);
      assert.deepEqual(view.log.closes, [], code);
      assert.equal(view.log.streamCloses, 0, code);
      assert.equal(view.log.streams, 1, code);
    }
  }
});

test("picture and signalling reconnects preserve the same last frame and usable direct input", async () => {
  const view = await mount(); await view.frame();
  const video = view.video();
  await act(async () => view.handlers().media(descriptor, { state: "publishing" }));
  await act(async () => view.handlers().webrtcState("picture_reconnecting"));
  assert.match(view.screen().textContent, /保留最后一帧/);
  assert.equal(view.video(), video);
  for (const state of ["reconnecting", "connecting", "active"]) await act(async () => view.handlers().state(state));
  await act(async () => view.handlers().media(null, { state: "publishing" }));
  for (const code of ["network_error", "websocket_closed", "signal_protocol_error"]) await act(async () => view.handlers().error(code));
  assert.equal(view.video(), video);
  assert.equal(view.input().disabled, false);
  assert.equal(view.screen().getAttribute("data-remote-phase"), "active");
  assert.equal(view.log.streams, 1);
  assert.equal(view.log.streamCloses, 0);
  assert.deepEqual(view.log.closes, []);
  await act(async () => view.handlers().webrtcState("playing"));
  assert.equal(view.screen().querySelector("[data-remote-media-notice]"), null);
});

test("connection details distinguish direct and relay paths and show the selected path round trip", async () => {
  const view = await mount(); await view.frame(); await view.toolbar();
  await act(async () => view.handlers().webrtcState("playing", { rtt_ms: 12 }));
  assert.equal(view.screen().querySelector("[data-remote-connection-details]"), null, "an incomplete candidate pair cannot claim a direct path");
  await act(async () => view.handlers().webrtcState("playing", { local_type: "host", remote_type: "srflx", protocol: "udp", address_family: "ipv6", rtt_ms: 12 }));
  let details = view.screen().querySelector("[data-remote-connection-details]");
  assert.match(details.textContent, /设备直接连接/); assert.match(details.textContent, /ipv6/); assert.match(details.textContent, /12 毫秒/);
  await act(async () => view.handlers().webrtcState("playing", { local_type: "relay", remote_type: "host", protocol: "tcp", address_family: "ipv4", relay_region: "sg", rtt_ms: 80 }));
  details = view.screen().querySelector("[data-remote-connection-details]");
  assert.match(details.textContent, /通过中继连接/); assert.match(details.textContent, /sg/); assert.match(details.textContent, /80 毫秒/);
});

test("WebRTC display selection negotiates its pinned transport while keeping the video and stream attached", async () => {
  const view = await mount(); await view.frame();
  const video = view.video();
  const displays = [{ display_id: "a", label: "A", width: 1920, height: 1080 }, { display_id: "b", label: "B", width: 1280, height: 720 }];
  await act(async () => view.handlers().media(descriptor, { state: "publishing", displays, geometry: displays[0] }));
  await view.toolbar();
  await act(async () => { const select = view.screen().querySelector("select"); select.value = "b"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await settle();
  assert.deepEqual(view.log.negotiations, [{ displayId: "b", transport: "webrtc-v1" }]);
  assert.equal(view.video(), video);
  assert.equal(view.input().disabled, true);
  await view.frame(1280, 720);
  assert.equal(view.input().disabled, false);
  assert.equal(view.log.streamCloses, 0); assert.deepEqual(view.log.closes, []);
});

test("an explicit terminal capture failure removes WebRTC pixels and closes the authorized session", async () => {
  const view = await mount(); await view.frame();
  await act(async () => view.handlers().media(descriptor, { state: "failed", error: "screen_capture_failed" }));
  assert.equal(view.video(), null); assert.equal(view.input().disabled, true);
  assert.deepEqual(view.log.closes, [descriptor.session_id]);
  assert.equal(view.log.streamCloses, 1); assert.equal(view.log.videos.at(-1), null);
});

test("the legacy ARTC receiver refuses a WebRTC descriptor before loading its SDK", async () => {
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: descriptor.session_id, state: "connecting", transport: "artc-v1", expires_at: descriptor.lease_expires_at, media: { media: descriptor, media_status: { state: "publishing" } } } }; },
  } });
  assert.equal(view.video(), null);
  assert.match(view.screen().textContent, /ARTC/);
  assert.deepEqual(view.log.closes, [descriptor.session_id]);
});

for (const [name, reason] of [["owner disables access", "disabled_locally"], ["sign-out", "signed_out"], ["consent revoked", "controller_revoked"], ["input consent revoked", "input_consent_revoked"], ["billing stops", "balance_exhausted"], ["lease expires", "lease_expired"]]) {
  test(`a normal WebRTC end (${name}) removes pixels and closes once`, async () => {
    const view = await mount(); await view.frame();
    await act(async () => view.handlers().state("closed", reason));
    assert.equal(view.video(), null); assert.equal(view.input().disabled, true);
    if (reason === "input_consent_revoked") assert.equal(view.screen().getAttribute("data-remote-phase"), "revoked");
    assert.deepEqual(view.log.closes, [descriptor.session_id]); assert.equal(view.log.streamCloses, 1);
    await view.unmount(); assert.equal(view.log.streamCloses, 1);
  });
}

test("intentional leave closes WebRTC while unmount detaches video without reopening a peer", async () => {
  const view = await mount(); await view.frame(); await view.toolbar();
  await act(async () => [...view.screen().querySelectorAll("button")].find(button => button.textContent === "退出桌面").click());
  assert.deepEqual(view.log.closes, [descriptor.session_id]); assert.equal(view.log.streamCloses, 1);
  await view.unmount(); assert.equal(view.log.streamCloses, 1); assert.equal(view.log.videos.at(-1), null);
});

test("all UI languages translate WebRTC recovery, path and round-trip copy", async () => {
  const copy = ["输入正在重新连接，画面继续显示。", "画面正在重新连接，保留最后一帧。", "设备直接连接", "通过中继连接", "往返延迟：{ms} 毫秒"];
  for (const locale of LOCALES) {
    const dict = await loadUiMessages(locale);
    for (const source of copy) assert.ok(dict[source] || locale === "zh", `${locale}: ${source}`);
    assert.match(dict[copy[4]] ?? copy[4], /\{ms\}/);
    if (["en", "de", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi", "tr"].includes(locale)) for (const source of copy) assert.doesNotMatch(dict[source], /[一-鿿]/);
  }
});
