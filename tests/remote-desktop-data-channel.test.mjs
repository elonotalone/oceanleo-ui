// D4/D5/goal 6 (2026-10-30): peer-to-peer input over the ARTC data channel with the gateway
// WebSocket as automatic fallback, view-only refusals, billing/access snapshots, and the
// lowest playout delay on the viewer's own screen receiver.
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { openRemoteMedia, lowerPlayoutDelay } from "../src/pages/remote-desktop-media.ts";

const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };

const api = await import(
  await compileModule("src/api/remote-desktop.ts", {
    "../lib/auth/client": dataModule(`export async function accessToken(){ return "user-token"; }`),
    "../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://gw.test";`),
  })
);

class FakeSocket {
  static OPEN = 1;
  static latest;
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.latest = this; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  message(data) { this.onmessage({ data: JSON.stringify(data) }); }
}

async function streamHarness() {
  window.location = { href: "https://oceanleo.com/devices" };
  globalThis.WebSocket = FakeSocket;
  const log = { errors: [], sessions: [], refused: [] };
  const promise = api.remoteDesktopClient.openStream("d1", "session-1", {
    state() {}, frame() {}, error: (code) => log.errors.push(code),
    session: (info) => log.sessions.push(info), inputRefused: (code) => log.refused.push(code),
  });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeSocket.latest;
  socket.onopen();
  socket.message({ type: "state", state: "active", acked_seq: 0 });
  return { socket, stream: (await promise).data, log };
}

const inputs = (socket) => socket.sent.filter((item) => item.type === "input");
const receipt = (socket, seq, acked = 0) => socket.message({ type: "state", state: "active", acked_seq: acked, media: null, media_status: { state: "publishing", metrics: { version: 1, dc_input_seq: seq } } });
/** Attach, probe while nothing is held, and let the computer prove receipt of the probe. */
function trust(socket, stream, peer) {
  stream.attachDataChannel(peer);
  assert.equal(stream.send({ kind: "move", x: 0, y: 0 }), true, "untrusted lane: this input still goes to the gateway");
  assert.deepEqual(peer.sent.map((m) => [m.seq, m.a.kind]), [[1, "release_all"]], "harmless probe only");
  assert.deepEqual(inputs(socket).map((m) => m.seq), [2]);
  socket.message({ type: "input_ack", seq: 2 });
  receipt(socket, 1, 2);
}
function lane() {
  const sent = [];
  return { sent, send(payload) { assert.ok(new TextEncoder().encode(payload).byteLength <= 1024); sent.push(JSON.parse(payload)); return true; } };
}

test("an attached data channel carries input with the contract envelope and no gateway round trip", async () => {
  const { socket, stream } = await streamHarness();
  try {
    const peer = lane();
    trust(socket, stream, peer);
    peer.sent.length = 0;
    for (const action of [{ kind: "move", x: .1, y: .2 }, { kind: "pointer_down", x: .1, y: .2, button: "left" }, { kind: "pointer_up", x: .1, y: .2, button: "left" }, { kind: "key_down", key: "a" }, { kind: "key_up", key: "a" }]) {
      assert.equal(stream.send(action), true);
    }
    assert.deepEqual(peer.sent.map((m) => [m.v, m.sid, m.seq, m.a.kind]), [
      [1, "session-1", 3, "move"], [1, "session-1", 4, "pointer_down"], [1, "session-1", 5, "pointer_up"], [1, "session-1", 6, "key_down"], [1, "session-1", 7, "key_up"],
    ]);
    assert.deepEqual(Object.keys(peer.sent[0]), ["v", "sid", "seq", "a"]);
    assert.equal(inputs(socket).length, 1, "no stop-and-wait and nothing duplicated on the gateway");
    assert.equal(stream.inputPath(), "data_channel");
  } finally { stream.close(); }
});

test("a broken or oversized peer message falls back to the gateway path with a higher seq, never reordered", async () => {
  const { socket, stream } = await streamHarness();
  try {
    const peer = lane();
    trust(socket, stream, peer);
    peer.sent.length = 0; socket.sent.length = 0;
    stream.send({ kind: "key_down", key: "Shift" });
    receipt(socket, 3, 2);
    // Oversize (> 1 KB): this action takes the gateway; the next ones wait until it is executed.
    stream.send({ kind: "type", text: "长".repeat(400) });
    stream.send({ kind: "key_up", key: "Shift" });
    assert.deepEqual(peer.sent.map((m) => m.seq), [3]);
    assert.deepEqual(inputs(socket).map((m) => [m.seq, m.action.kind]), [[5, "type"], [6, "key_up"]]);
    socket.message({ type: "input_ack", seq: 5 }); socket.message({ type: "input_ack", seq: 6 });
    socket.message({ type: "state", state: "active", acked_seq: 6 });
    stream.send({ kind: "move", x: .5, y: .5 });
    assert.deepEqual(peer.sent.at(-1).seq, 7, "drained gateway path hands back to the peer lane");
    // A throwing channel is detached for good: input continues on the gateway.
    peer.send = () => { throw new Error("closed"); };
    stream.send({ kind: "move", x: .6, y: .6 });
    assert.deepEqual(inputs(socket).at(-1).seq, 9);
    assert.equal(peer.sent.length, 2);
    assert.equal(stream.inputPath(), "websocket");
  } finally { stream.close(); }
});

test("stop releases on both lanes; the gateway release has the higher seq", async () => {
  const { socket, stream } = await streamHarness();
  const peer = lane();
  trust(socket, stream, peer);
  stream.send({ kind: "key_down", key: "Control" });
  stream.close();
  assert.deepEqual(peer.sent.map((m) => [m.seq, m.a.kind]), [[1, "release_all"], [3, "key_down"], [4, "release_all"]]);
  assert.deepEqual(inputs(socket).map((m) => [m.seq, m.action.kind]), [[2, "move"], [5, "release_all"]]);
});

test("without a device receipt the lane is never trusted; a stalled receipt falls back to the gateway", async (t) => {
  const { socket, stream } = await streamHarness();
  try {
    const peer = lane();
    stream.attachDataChannel(peer);
    for (let i = 0; i < 3; i++) stream.send({ kind: "key_down", key: "a" }), stream.send({ kind: "key_up", key: "a" });
    assert.deepEqual(peer.sent.map((m) => m.a.kind), ["release_all"], "one probe, never real input before proof");
    assert.equal(inputs(socket).length, 6);
  } finally { stream.close(); }

  const second = await streamHarness();
  try {
    const peer = lane();
    trust(second.socket, second.stream, peer);
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    second.stream.send({ kind: "key_down", key: "b" });
    assert.equal(peer.sent.at(-1).a.kind, "key_down");
    t.mock.timers.tick(1600);
    second.stream.send({ kind: "key_up", key: "b" });
    assert.equal(peer.sent.at(-1).a.kind, "key_down", "no receipt within 1.5 s: lane dropped");
    assert.deepEqual(inputs(second.socket).at(-1).action, { kind: "key_up", key: "b" });
    assert.equal(second.stream.inputPath(), "websocket");
  } finally { t.mock.timers.reset(); second.stream.close(); }
});

test("a probe lost before the computer subscribed is re-sent with a fresh seq, then the lane is trusted", async (t) => {
  const { socket, stream } = await streamHarness();
  const executed = (seq) => { socket.message({ type: "input_ack", seq }); socket.message({ type: "state", state: "active", acked_seq: seq }); };
  try {
    t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
    const peer = lane();
    stream.attachDataChannel(peer);
    stream.send({ kind: "move", x: 1, y: 1 });
    assert.deepEqual(peer.sent.map((m) => [m.seq, m.a.kind]), [[1, "release_all"]]);
    executed(2);
    stream.send({ kind: "move", x: 2, y: 2 });
    assert.equal(peer.sent.length, 1, "within the receipt window: no second probe");
    executed(3);
    t.mock.timers.tick(1600);
    stream.send({ kind: "move", x: 3, y: 3 });
    assert.deepEqual(peer.sent.map((m) => [m.seq, m.a.kind]), [[1, "release_all"], [4, "release_all"]], "retry, higher seq");
    assert.equal(inputs(socket).at(-1).seq, 5, "the input itself still took the gateway");
    executed(5);
    receipt(socket, 4, 5);
    assert.equal(stream.send({ kind: "move", x: 4, y: 4 }), true);
    assert.deepEqual(peer.sent.at(-1).a, { kind: "move", x: 4, y: 4 });
    assert.equal(stream.inputPath(), "data_channel");
  } finally { t.mock.timers.reset(); stream.close(); }
});

test("view-only refusal is final, never retried, keeps the session; access and billing reach the viewer", async () => {
  const { socket, stream, log } = await streamHarness();
  try {
    socket.message({ type: "state", state: "active", acked_seq: 0, access: { input_allowed: false, audio: false }, billing: { per_minute: 0.096, currency: "CNY", charged_minutes: 2 } });
    assert.deepEqual(log.sessions.at(-1), { access: { input_allowed: false, audio: false }, billing: { per_minute: 0.096, currency: "CNY", charged_minutes: 2 } });
    stream.send({ kind: "key_down", key: "a" });
    socket.message({ type: "input_rejected", seq: 1, error: "input_not_allowed" });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(log.refused, ["input_not_allowed"]);
    assert.deepEqual(log.errors, []);
    assert.equal(inputs(socket).length, 1, "not retried");
    assert.equal(socket.readyState, 1);
  } finally { stream.close(); }
  assert.equal(api.parseRemoteBilling({ per_minute: -1, currency: "CNY", charged_minutes: 0 }), null);
  assert.equal(api.parseRemoteBilling({ per_minute: 1, currency: "EUR", charged_minutes: 0 }), null);
  assert.equal(api.parseRemoteAccess({ audio: true }), null);
});

const credentials = (extra = {}) => ({ provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "c", user_id: "viewer", publisher_id: "desktop", token: "t", timestamp: 1, expires_at: new Date(Date.now() + 120000).toISOString(), track: "screen", role: "viewer", camera: false, microphone: false, ...extra });
function engineHarness() {
  const events = new Map(), calls = [];
  const engine = {
    on(name, fn) { events.set(name, fn); }, off(name) { events.delete(name); },
    setChannelProfile() {}, setClientRole() {}, setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
    publishLocalAudioStream(value) { calls.push(["publish-audio", value]); }, publishLocalVideoStream(value) { calls.push(["publish-video", value]); },
    publishLocalScreenShareStream(value) { calls.push(["publish-screen", value]); },
    startScreenShare(config) { calls.push(["screen-share", config]); }, stopScreenShare() { calls.push(["stop-screen"]); },
    joinChannel() {}, leaveChannel() {}, destroy() {}, setRemoteViewConfig() {}, bizControl: { updateScreenWant() {} }, getOnlineRemoteUsers: () => [],
    refreshAuthInfo() {}, setParameter(value) { calls.push(["parameter", JSON.parse(value)]); }, sendDataChannelMessage(message) { calls.push(["dc", message]); },
  };
  const video = Object.assign(new EventTarget(), { videoWidth: 0, videoHeight: 0, readyState: 0, currentTime: 0, srcObject: {}, requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {} });
  const lanes = [];
  const handlers = { state() {}, frame() {}, renew: async () => credentials(), dataChannel: (value) => lanes.push(value) };
  const sdk = async () => ({ createEngine: () => engine, dataChannelMessage: (data) => ({ data, type: 2 }) });
  const track = { id: "synthetic", kind: "video" };
  let stopped = 0;
  const inputTrack = () => ({ track, stop() { stopped++; } });
  return { engine, events, calls, lanes, track, stopped: () => stopped, start: (extra) => openRemoteMedia(credentials(extra), video, handlers, new AbortController().signal, sdk, inputTrack) };
}

test("the viewer publishes a media-less data channel only when the gateway granted it, and exposes it once published", async () => {
  const off = engineHarness();
  await (await off.start()).close();
  assert.deepEqual(off.calls.filter(([n]) => n === "parameter" || n === "screen-share"), [], "no grant: nothing published, input stays on the gateway");

  const h = engineHarness();
  const viewer = await h.start({ data_channel_input: true });
  assert.deepEqual(h.calls.find(([n]) => n === "parameter")[1], { data: { enablePubDataChannel: true, enableSubDataChannel: false } });
  // Sender must publish: only the synthetic track, as screen share, created before publish so the
  // SDK never asks for getDisplayMedia; mic and camera stay unpublished.
  const order = h.calls.filter(([n]) => ["screen-share", "publish-screen", "publish-audio", "publish-video"].includes(n));
  assert.deepEqual(order, [["publish-audio", false], ["publish-video", false], ["publish-screen", false], ["screen-share", { audio: false, videoTrack: h.track }], ["publish-screen", true]]);
  assert.deepEqual(h.lanes, []);
  h.events.get("dataPublishStateChanged")(1, 3);
  assert.equal(h.lanes.length, 1);
  assert.equal(h.lanes[0].send('{"v":1}'), true);
  const [, message] = h.calls.find(([n]) => n === "dc");
  assert.equal(message.type, 2);
  assert.equal(new TextDecoder().decode(message.data), '{"v":1}');
  h.events.get("connectionStatusChange")(4);
  assert.equal(h.lanes.at(-1), null, "reconnecting detaches the lane: input falls back to the gateway");
  await viewer.close();
  assert.equal(h.lanes.at(-1), null);
  assert.equal(h.stopped(), 1, "the synthetic track stops with the viewer");
});

test("lowest playout delay touches only this video's screen receiver", () => {
  const mine = { track: { id: "screen" } }, other = { track: { id: "call-camera" } }, legacy = { track: { id: "screen" }, playoutDelayHint: null };
  mine.jitterBufferTarget = null; other.jitterBufferTarget = null;
  const video = { srcObject: { getVideoTracks: () => [{ id: "screen" }] } };
  assert.equal(lowerPlayoutDelay(video, [{ getReceivers: () => [mine, other] }, { getReceivers: () => [legacy] }]), 2);
  assert.equal(mine.jitterBufferTarget, 0);
  assert.equal(other.jitterBufferTarget, null);
  assert.equal(legacy.playoutDelayHint, 0);
  assert.equal(lowerPlayoutDelay(video, [{ getReceivers: () => [mine] }]), 0, "tuned once");
});

test("a CSP-blocked ARTC media host ends setup at once with media_host_blocked and the host, not a black video", async () => {
  const { blockedMediaHost } = await import("../src/pages/remote-desktop-media.ts");
  assert.equal(blockedMediaHost({ effectiveDirective: "connect-src", blockedURI: "https://r6-rtcsub.media-bj.alivecdn.com/x?token=secret" }), "r6-rtcsub.media-bj.alivecdn.com");
  assert.equal(blockedMediaHost({ violatedDirective: "connect-src https://x", blockedURI: "wss://rs.rtn.aliyuncs.com/roomserver" }), "rs.rtn.aliyuncs.com");
  assert.equal(blockedMediaHost({ effectiveDirective: "img-src", blockedURI: "https://a.alivecdn.com/" }), null);
  assert.equal(blockedMediaHost({ effectiveDirective: "connect-src", blockedURI: "https://evil.example/alivecdn.com" }), null);
  assert.equal(blockedMediaHost({ effectiveDirective: "connect-src", blockedURI: "https://cn-hangzhou.log.aliyuncs.com/" }), null, "telemetry is not media");

  const listeners = new Map();
  const previous = globalThis.document;
  globalThis.document = { addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: (n) => listeners.delete(n) };
  try {
    const h = engineHarness();
    const states = [], diagnostics = [];
    const video = Object.assign(new EventTarget(), { videoWidth: 0, videoHeight: 0, readyState: 0, srcObject: {}, requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {} });
    const viewer = await openRemoteMedia(credentials(), video, { state: (...a) => states.push(a), frame() {}, renew: async () => credentials(), diagnostic: (d) => diagnostics.push(d) },
      new AbortController().signal, async () => ({ createEngine: () => h.engine }), () => null);
    listeners.get("securitypolicyviolation")({ effectiveDirective: "connect-src", blockedURI: "https://r6-rtcsub.media-bj.alivecdn.com/pull" });
    assert.deepEqual(diagnostics, [{ blocked_host: "r6-rtcsub.media-bj.alivecdn.com" }]);
    assert.deepEqual(states.at(-1), ["error", "media_host_blocked"]);
    await viewer.close();
    assert.equal(listeners.has("securitypolicyviolation"), false, "listener removed on close");
  } finally { globalThis.document = previous; }
});

test("a screen subscribe error with no frame afterwards becomes media_subscribe_failed with the SDK code", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  try {
    const h = engineHarness();
    const states = [], diagnostics = [];
    const video = Object.assign(new EventTarget(), { videoWidth: 0, videoHeight: 0, readyState: 0, srcObject: {}, requestVideoFrameCallback() { return 1; }, cancelVideoFrameCallback() {} });
    const viewer = await openRemoteMedia(credentials(), video, { state: (...a) => states.push(a), frame() {}, renew: async () => credentials(), diagnostic: (d) => diagnostics.push(d) },
      new AbortController().signal, async () => ({ createEngine: () => h.engine }), () => null);
    h.events.get("occurError")({ code: 16844116 }, "intruder");
    h.events.get("occurError")({ code: 1 }, "desktop");
    t.mock.timers.tick(6000);
    assert.deepEqual(diagnostics, [], "foreign uid and unrelated codes are ignored");
    h.events.get("occurError")({ code: 16844116 }, "desktop");
    t.mock.timers.tick(4900);
    assert.notDeepEqual(states.at(-1), ["error", "media_subscribe_failed"], "SDK retry gets its grace");
    t.mock.timers.tick(200);
    assert.deepEqual(diagnostics, [{ sdk_error: 16844116 }]);
    assert.deepEqual(states.at(-1), ["error", "media_subscribe_failed"]);
    await viewer.close();
  } finally { t.mock.timers.reset(); }
});


test("decoded media receipt is sent over the authenticated stream without injecting input", async () => {
  const { socket, stream } = await streamHarness();
  try {
    socket.sent.length = 0;
    stream.acknowledgeMediaFrame();
    assert.deepEqual(socket.sent, [{ type: "media_ready" }]);
  } finally { stream.close(); }
});
