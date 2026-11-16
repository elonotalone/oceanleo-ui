import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { mockRtpReceiver } from "./helpers/remote-desktop-webrtc.mjs";

const api = await import(await compileModule("src/api/remote-desktop.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){ return globalThis.__webrtcToken === undefined ? "viewer-token" : globalThis.__webrtcToken; }'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE = "https://gateway.test";'),
  "./device-settings": dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"controller"}}; export async function registerController(){return {ok:true}}'),
}));
const { RemoteDesktopQualityHub } = await import(await compileModule("src/api/remote-desktop-quality.ts"));
const warmApi = await import(await compileModule("src/api/remote-desktop.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return "viewer-token";}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://gateway.test";'),
  "./device-settings": dataModule('export function controllerHeaders(){return {"X-OceanLeo-Controller":"controller"}};export async function registerController(){return {ok:true}}'),
  "./remote-desktop-webrtc-preconnect": dataModule(`
    export async function createPreparedRemoteWebRtcSession(){return null;}
    export function takePreparedRemoteWebRtcSocket(){return null;}
    export function takeCreatedRemoteWebRtcSocket(){const item=globalThis.__webrtcCreated;globalThis.__webrtcCreated=null;return item??null;}
  `),
}));
const epoch = Date.parse("2026-11-16T12:00:00Z");
function descriptor(extra = {}) {
  return { transport: "webrtc-v1", role: "viewer", session_id: "sid", display_id: null,
    ice_servers: [{ urls: ["stun:stun.test:3478"] }, { urls: ["turn:relay.test:3478?transport=udp"], username: "ephemeral", credential: "opaque", region: "sg" }],
    server_now: epoch / 1000, lease_expires_at: new Date(epoch + 120_000).toISOString(), ice_expires_at: new Date(epoch + 3_600_000).toISOString(), ...extra };
}
const drain = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
class Channel {
  readyState = "open"; bufferedAmount = 0; sent = [];
  constructor(label) { this.label = label; }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = "closed"; }
}
class Peer {
  static all = []; channels = []; offers = []; connectionState = "new"; iceConnectionState = "new"; remoteDescription = null; closed = false; configurations = [];
  constructor(configuration) { this.configuration = configuration; Peer.all.push(this); }
  addTransceiver() { return { receiver: { jitterBufferTarget: 100 }, setCodecPreferences() {} }; }
  createDataChannel(label) { const channel = new Channel(label); this.channels.push(channel); return channel; }
  async createOffer(options) { this.offers.push(options); return { type: "offer", sdp: "opaque-offer" }; }
  async setLocalDescription(value) { this.localDescription = value; }
  async setRemoteDescription(value) { this.remoteDescription = value; }
  async addIceCandidate(value) { this.candidate = value; }
  getConfiguration() { return this.configuration; }
  setConfiguration(value) { this.configuration = value; this.configurations.push(value); }
  async getStats() { return new Map(); }
  close() { this.closed = true; this.connectionState = "closed"; }
}
class Socket {
  static OPEN = 1; static all = []; readyState = 1; bufferedAmount = 0; sent = [];
  constructor(url) { this.url = url; Socket.all.push(this); }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState = 3; }
  message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
function setup(t, reply = () => ({ stored: true })) {
  mockRtpReceiver(t);
  Peer.all = []; Socket.all = [];
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let now = 1000;
  const prior = Object.getOwnPropertyDescriptor(globalThis.performance, "now");
  Object.defineProperty(globalThis.performance, "now", { configurable: true, value: () => now });
  const oldWindow = globalThis.window, oldPeer = globalThis.RTCPeerConnection, oldSocket = globalThis.WebSocket, oldFetch = globalThis.fetch;
  globalThis.window = { location: { href: "https://viewer.test/devices" } };
  globalThis.RTCPeerConnection = Peer; globalThis.WebSocket = Socket;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url, init }); const value = await reply(url, init); return { ok: true, status: 200, json: async () => value }; };
  const streams = [];
  t.after(async () => { for (const stream of streams) stream.close(); await drain(); delete globalThis.__webrtcToken; if (prior) Object.defineProperty(globalThis.performance, "now", prior); else delete globalThis.performance.now; globalThis.window = oldWindow; globalThis.RTCPeerConnection = oldPeer; globalThis.WebSocket = oldSocket; globalThis.fetch = oldFetch; });
  return { calls, streams, async tick(ms) { now += ms; t.mock.timers.tick(ms); await drain(); } };
}
async function open(h, options = {}, firstState = {}) {
  const states = [], errors = [], peerStates = [], frames = [];
  const promise = api.remoteDesktopClient.openStream("device/1", "sid", {
    state: (...value) => states.push(value), error: value => errors.push(value), frame() {},
    webrtcState: value => peerStates.push(value), webrtcFrame: (...value) => frames.push(value),
  }, { transport: "webrtc-v1", descriptor: descriptor(), clickedAt: 900, ...options });
  await drain();
  const socket = Socket.all.at(-1); socket?.onopen?.();
  socket?.message({ type: "state", state: "active", transport: "webrtc-v1", ...firstState });
  const result = await promise;
  if (result.data) h.streams.push(result.data);
  await drain();
  return { result, stream: result.data, socket, states, errors, peerStates, frames };
}

test("create negotiates WebRTC beside ARTC and parses inline descriptor with strict session binding", async t => {
  const h = setup(t, () => ({ session_id: "sid", state: "connecting", transport: "webrtc-v1", media: { media: descriptor(), media_status: { state: "starting" } } }));
  const result = await api.remoteDesktopClient.createSession("device", { requestId: "stable-request" });
  assert.equal(result.ok, true); assert.equal(result.data.transport, "webrtc-v1");
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { request_id: "stable-request", transports: ["webrtc-v1", "artc-v1"], media: ["artc-v1"] });
  assert.equal(result.data.media.media.ice_servers[1].region, "sg");
  for (const invalid of [descriptor({ role: "host" }), descriptor({ session_id: "other" }), descriptor({ server_now: NaN }), descriptor({ lease_expires_at: "bad" }), descriptor({ ice_servers: [{ urls: ["https://bad.test"] }] }), descriptor({ ice_servers: [{ urls: ["turn:relay.test"] }] })]) assert.equal(api.parseRemoteMedia(invalid, "sid"), null);
});
test("created-stream adoption keeps its offered peer, replays early answer after local SDP, and reports original offer time",async t=>{
  const h=setup(t);const pc=new Peer({iceServers:[]}),socket=new Socket('wss://gateway.test/viewer-stream');
  const transceiver=pc.addTransceiver();const channels=new Map(['rd-input','rd-fast','rd-ctl'].map(label=>[label,pc.createDataChannel(label)]));
  globalThis.__webrtcCreated={socket,controller:'controller',messages:[
    JSON.stringify({type:'state',state:'active',transport:'webrtc-v1',session_id:'sid'}),
    JSON.stringify({type:'signal',data:{k:'answer',gen:1,sdp:'early-warm-answer'}}),
  ],initialPeer:{pc,transceiver,channels,offer:{type:'offer',sdp:'created-offer'},offeredAt:950}};
  t.after(()=>delete globalThis.__webrtcCreated);
  const result=await warmApi.remoteDesktopClient.openStream('device','sid',{state(){},frame(){}},
    {transport:'webrtc-v1',descriptor:descriptor(),clickedAt:900});
  assert.equal(result.ok,true);h.streams.push(result.data);await drain();
  assert.equal(Peer.all.length,1);assert.equal(Socket.all.length,1);assert.equal(pc.channels.length,3);
  assert.equal(pc.offers.length,0);assert.equal(pc.localDescription.sdp,'created-offer');assert.equal(pc.remoteDescription.sdp,'early-warm-answer');
  assert.equal(pc.configuration.iceServers[1].username,'ephemeral');
  assert.deepEqual(socket.sent[0],{type:'auth.refresh',token:'viewer-token'});
  assert.equal(socket.sent.some(value=>value.type==='attach'||value.type==='signal'&&value.data.k==='offer'),false);
  result.data.close();await drain();const report=h.calls.find(call=>call.url.endsWith('/remote-desktop/quality'));
  assert.equal(JSON.parse(report.init.body).steps.offer_sent_ms,50);
});

test("WebRTC media renewal uses the pinned transport and rejects mismatched descriptor sessions", async t => {
  let media = descriptor(); const h = setup(t, () => ({ media, media_status: null }));
  const result = await api.remoteDesktopClient.negotiateMedia("device", "sid", "display2", { transport: "webrtc-v1" });
  assert.equal(result.ok, true); assert.deepEqual(JSON.parse(h.calls[0].init.body), { transport: "webrtc-v1", display_id: "display2" });
  media = descriptor({ session_id: "other" });
  assert.equal((await api.remoteDesktopClient.negotiateMedia("device", "sid", undefined, { transport: "webrtc-v1" })).error, "response_malformed");
});

test("signalling reconnect keeps the same actual peer, video and input channels alive", async t => {
  const h = setup(t); const v = await open(h); const peer = Peer.all[0];
  assert.equal(v.result.ok, true); assert.equal(v.stream.transport, "webrtc-v1");
  assert.equal(v.socket.url, "wss://gateway.test/v1/devices/device%2F1/remote-desktop/sessions/sid/stream");
  assert.deepEqual(v.socket.sent[0], { type: "auth", token: "viewer-token", controller: "controller" });
  assert.ok(v.socket.sent.some(item => item.type === "signal" && item.data.k === "offer"));
  const input = peer.channels.find(channel => channel.label === "rd-input");
  v.stream.send({ kind: "key_down", key: "A" }); const before = v.stream.lastSequence();
  v.socket.onclose();
  assert.equal(v.stream.send({ kind: "key_up", key: "A" }), true);
  assert.ok(v.stream.lastSequence() > before); assert.equal(peer.closed, false);
  await h.tick(200); const next = Socket.all.at(-1); assert.notEqual(next, v.socket);
  next.onopen(); next.message({ type: "state", state: "active", media: descriptor() });
  next.message({ type: "signal", data: { k: "answer", gen: 1, sdp: "opaque-answer" } }); await drain();
  assert.equal(Peer.all.length, 1); assert.equal(peer.remoteDescription.sdp, "opaque-answer");
  assert.equal(input.readyState, "open"); assert.equal(peer.closed, false); assert.deepEqual(v.errors, []);
  assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

for (const reason of ["peer_failed", "ice_restart_required"]) test(`signalled ${reason} recovers within the existing authenticated session`, async t => {
  const h = setup(t); const v = await open(h); const old = Peer.all[0];
  v.socket.message({ type: "signal", data: { k: "bye", gen: 1, reason } });
  await h.tick(200);
  const replacement = reason === "peer_failed";
  const current = Peer.all.at(-1);
  assert.equal(Peer.all.length, replacement ? 2 : 1); assert.equal(old.closed, replacement);
  assert.deepEqual(current.offers.at(-1), replacement ? undefined : { iceRestart: true });
  assert.deepEqual(v.socket.sent.filter(item => item.type === "signal" && item.data.k === "offer").map(item => item.data.gen), [1, replacement ? 2 : 1]);
  assert.equal(Socket.all.length, 1); assert.equal(v.socket.readyState, Socket.OPEN);
  assert.ok(v.states.every(([state]) => state !== "closed")); assert.deepEqual(v.errors, []);
  assert.equal(v.stream.send({ kind: "click", x: .5, y: .5 }), true);
  assert.equal(current.channels.find(channel => channel.label === "rd-input").sent.at(-1).sid, "sid");
  assert.ok(h.calls.every(call => call.init.method !== "DELETE" && !call.url.endsWith("/sessions") && !call.url.endsWith("/quality")));
});

test("first decoded frame drives video acknowledgement and nested final telemetry", async t => {
  const h = setup(t); const v = await open(h); let frame;
  const video = { videoWidth: 1280, videoHeight: 720, play: () => Promise.resolve(), requestVideoFrameCallback(fn) { frame = fn; return 1; }, cancelVideoFrameCallback() {} };
  v.stream.attachVideo(video); frame(1000, { expectedDisplayTime: 1000, captureTime: 980 });
  assert.deepEqual(v.frames, [[1280, 720]]); assert.ok(v.socket.sent.some(item => item.type === "media_ready"));
  await h.tick(10_000);
  const window = h.calls.find(call => call.url.endsWith("/quality/windows")); assert.ok(window);
  const windowBody = JSON.parse(window.init.body); assert.equal(windowBody.transport, "webrtc-v1"); assert.ok(windowBody.viewer); assert.equal(windowBody.video.picture_age_source, "captureTime");
  assert.ok(!("end_reason" in windowBody)); assert.ok(!("env" in windowBody)); assert.ok(!("media" in windowBody));
  v.stream.close(); await drain();
  const reports = h.calls.filter(call => call.url.endsWith("/quality")); assert.equal(reports.length, 1);
  const final = JSON.parse(reports[0].init.body); assert.equal(final.media, "webrtc"); assert.equal(final.transport, "webrtc-v1"); assert.equal(final.input.ws_count, 0); assert.equal(final.device_id, "device/1"); assert.equal(final.video.frames_rendered, 1); assert.equal(final.video.samples, 1);
  assert.ok(!("window_start_ms" in final)); assert.ok(!("viewer" in final)); assert.ok(!("publisher" in final));
  assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("lease renews at sixty seconds and updates ICE on the same peer despite clock skew", async t => {
  const skewed = epoch + 86_400_000;
  const initial = descriptor({ server_now: skewed / 1000, lease_expires_at: new Date(skewed + 61_000).toISOString() });
  const renewed = descriptor({ server_now: (skewed + 1000) / 1000, lease_expires_at: new Date(skewed + 121_000).toISOString(), ice_servers: [{ urls: ["stun:new.test:3478"] }] });
  const h = setup(t, () => ({ media: renewed, media_status: { state: "publishing" } }));
  const v = await open(h, { descriptor: initial }); const peer = Peer.all[0];
  await h.tick(1000);
  assert.ok(h.calls.some(call => call.url.endsWith("/media"))); assert.equal(Peer.all.length, 1); assert.equal(peer.closed, false);
  assert.equal(peer.configuration.iceServers[0].urls[0], "stun:new.test:3478"); assert.deepEqual(v.errors, []);
});

test("input failures remain recoverable; explicit capture and authority endings use closed state", async t => {
  const h = setup(t); const v = await open(h); const peer = Peer.all[0];
  v.socket.message({ type: "state", state: "active", media: descriptor(), media_status: { state: "failed", error: "input_failed" } });
  assert.equal(peer.closed, false); assert.ok(v.peerStates.includes("input_reconnecting")); assert.deepEqual(v.errors, []);
  v.socket.message({ type: "state", state: "closed", error: "input_ack_unknown" });
  assert.equal(peer.closed, false); assert.ok(!v.states.some(([state]) => state === "closed"));
  for (const code of ["host_input_executor_failed", "webrtc_data_channel_lost", "data_channel_lost", "control_send_failed"]) {
    v.socket.message({ type: "state", state: "active", media: descriptor(), media_status: { state: "failed", error: code } });
    assert.equal(peer.closed, false, code);
    assert.ok(!v.states.some(([state]) => state === "closed"), code);
  }
  v.socket.message({ type: "state", state: "active", media: descriptor(), media_status: { state: "failed", error: "capture_restart_failed" } });
  assert.equal(peer.closed, true); assert.deepEqual(v.states.at(-1), ["closed", "capture_restart_failed"]);
  assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("an expired lease closes explicitly without creating a peer or deleting a session", async t => {
  const h = setup(t); const v = await open(h, { descriptor: descriptor({ lease_expires_at: new Date(epoch - 1).toISOString() }) });
  assert.equal(v.result.error, "lease_expired"); assert.equal(Peer.all.length, 0); assert.equal(Socket.all.length, 0); assert.deepEqual(v.states.at(-1), ["closed", "lease_expired"]);
  assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("quality hub preserves WebRTC video methods and emits no duplicate ARTC report", async t => {
  const h = setup(t, url => url.endsWith("/sessions") ? { session_id: "sid", state: "connecting", transport: "webrtc-v1", media: { media: descriptor() } } : { stored: true });
  const hub = new RemoteDesktopQualityHub(); const client = hub.wrap(api.remoteDesktopClient);
  const created = await client.createSession("device/1"); assert.equal(created.ok, true); assert.equal(client.mediaQuality("sid"), null);
  const pending = client.openStream("device/1", "sid", { state() {}, error() {}, frame() {} }, { transport: "webrtc-v1", descriptor: descriptor() });
  await drain(); const socket = Socket.all.at(-1); socket.onopen(); socket.message({ type: "state", state: "active" });
  const result = await pending; h.streams.push(result.data); assert.equal(typeof result.data.attachVideo, "function"); assert.equal(result.data.transport, "webrtc-v1");
  result.data.close(); await drain();
  const reports = h.calls.filter(call => call.url.endsWith("/quality")).map(call => JSON.parse(call.init.body));
  assert.equal(reports.length, 1); assert.equal(reports[0].transport, "webrtc-v1");
});

test("consent waits before media negotiation; active state obtains the first descriptor", async t => {
  const h = setup(t, () => ({ media: descriptor(), media_status: { state: "starting" } }));
  const v = await open(h, { descriptor: undefined }, { state: "pending_consent" });
  assert.equal(Peer.all.length, 0); assert.equal(h.calls.length, 0);
  await h.tick(1000); assert.equal(h.calls.length, 0);
  v.socket.message({ type: "state", state: "active" }); await drain();
  assert.equal(Peer.all.length, 1); assert.deepEqual(JSON.parse(h.calls[0].init.body), { transport: "webrtc-v1" });
  assert.ok(v.socket.sent.some(item => item.type === "signal" && item.data.k === "offer"));
});

test("frequent state snapshots do not postpone periodic auth refresh; revocation closes explicitly", async t => {
  const h = setup(t); const v = await open(h);
  for (let n = 0; n < 20; n++) { await h.tick(1000); v.socket.message({ type: "state", state: "active" }); }
  assert.ok(v.socket.sent.some(item => item.type === "auth.refresh" && item.token === "viewer-token"));
  assert.ok(v.socket.sent.some(item => item.type === "ping"));
  v.socket.message({ type: "state", state: "closed", error: "controller_revoked" });
  assert.deepEqual(v.states.at(-1), ["closed", "controller_revoked"]); assert.equal(Peer.all[0].closed, true);
  assert.deepEqual(v.errors, []); assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("failed renewal and repeated stale descriptors cannot extend an expiring lease", async t => {
  const h = setup(t, () => { throw new TypeError("network failed"); });
  const short = descriptor({ lease_expires_at: new Date(epoch + 2000).toISOString() });
  const v = await open(h, { descriptor: short });
  await h.tick(1000); assert.equal(Peer.all[0].closed, false);
  v.socket.message({ type: "state", state: "active", media: short });
  await h.tick(1000);
  assert.equal(Peer.all[0].closed, true); assert.deepEqual(v.states.at(-1), ["closed", "lease_expired"]);
  assert.deepEqual(v.errors, []); assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("only an exhausted reconnect window ends a lost signalling stream", async t => {
  const h = setup(t); const v = await open(h, {}, { activity: { reconnect_window_s: 2 } });
  const peer = Peer.all[0]; v.socket.onclose(); await h.tick(200);
  assert.equal(peer.closed, false); assert.equal(v.stream.send({ kind: "move", x: .5, y: .5 }), true);
  await h.tick(1800);
  assert.equal(peer.closed, true); assert.deepEqual(v.states.at(-1), ["closed", "viewer_reconnect_timeout"]);
  assert.deepEqual(v.errors, []); assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("foreign-session snapshot fails closed while malformed signalling only reconnects its socket", async t => {
  const h = setup(t); const v = await open(h); const peer = Peer.all[0];
  v.socket.onmessage({ data: "invalid JSON" }); assert.equal(peer.closed, false); assert.deepEqual(v.errors, []);
  await h.tick(200); const socket = Socket.all.at(-1); socket.onopen();
  socket.message({ type: "state", state: "active", media: descriptor({ session_id: "foreign" }) });
  assert.equal(peer.closed, true); assert.deepEqual(v.states.at(-1), ["closed", "response_malformed"]);
  assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("leaving before a descriptor still reports one WebRTC session without inventing picture timing", async t => {
  const h = setup(t); const v = await open(h, { descriptor: undefined }, { state: "pending_consent" });
  assert.equal(Peer.all.length, 0); v.stream.close(); v.stream.close(); await drain();
  const reports = h.calls.filter(call => call.url.endsWith("/quality")); assert.equal(reports.length, 1);
  const body = JSON.parse(reports[0].init.body); assert.equal(body.transport, "webrtc-v1"); assert.equal(body.media, "none"); assert.equal(body.end_reason, "viewer_left"); assert.equal(body.video.frames_rendered, 0);
  assert.equal(body.steps.first_frame_presented_ms, undefined); assert.ok(h.calls.every(call => call.init.method !== "DELETE"));
});

test("intentional leave sends peer bye before closing its socket and preserves a reconnect sequence floor", async t => {
  const h = setup(t); const v = await open(h, { sequenceFloor: 40 });
  v.stream.send({ kind: "click", x: .5, y: .5 }); assert.ok(v.stream.lastSequence() > 40);
  v.stream.close();
  assert.ok(v.socket.sent.some(item => item.type === "signal" && item.data.k === "bye" && item.data.reason === "viewer_left"));
  assert.equal(v.socket.readyState, 3); assert.equal(Peer.all[0].closed, true);
});

test("a pre-renewal descriptor cannot regress ICE or extend the renewed lease", async t => {
  let renewals = 0;
  const renewed = descriptor({ server_now: (epoch + 60_000) / 1000, lease_expires_at: new Date(epoch + 180_000).toISOString(), display_id: "new-display", ice_servers: [{ urls: ["stun:new.test:3478"] }] });
  const h = setup(t, url => {
    if (!url.endsWith("/media")) return { stored: true };
    if (++renewals === 1) return { media: renewed, media_status: null };
    throw new TypeError("renewal unavailable");
  });
  const v = await open(h); const peer = Peer.all[0];
  const pulse = async seconds => { for (let n = 0; n < seconds; n++) { await h.tick(1000); Socket.all.at(-1)?.message({ type: "state", state: "active" }); } };
  await pulse(80); assert.equal(peer.configuration.iceServers[0].urls[0], "stun:new.test:3478");
  v.socket.message({ type: "state", state: "active", media: descriptor() });
  assert.equal(peer.configuration.iceServers[0].urls[0], "stun:new.test:3478", "stale snapshot does not regress renewed credentials");
  await pulse(99); assert.equal(peer.closed, false);
  await h.tick(1000); assert.equal(peer.closed, true); assert.deepEqual(v.states.at(-1), ["closed", "lease_expired"]);
});

test("offer timing starts at its actual socket write while session creation retains its receipt time", async t => {
  const h = setup(t, url => url.endsWith("/sessions")
    ? { session_id: "sid", state: "connecting", transport: "webrtc-v1", media: { media: descriptor() } }
    : { stored: true });
  const created = await api.remoteDesktopClient.createSession("device/1"); assert.equal(created.ok, true);
  const pending = api.remoteDesktopClient.openStream("device/1", "sid", { state() {}, frame() {}, error() {} }, {
    transport: "webrtc-v1", descriptor: created.data.media.media, clickedAt: 900,
  });
  await drain();
  assert.equal(Peer.all.length, 1); assert.equal(Socket.all[0].sent.length, 0);
  await h.tick(10_000);
  const window = JSON.parse(h.calls.find(call => call.url.endsWith("/quality/windows")).init.body);
  assert.equal(window.steps.session_created_ms, 100);
  assert.equal(window.steps.offer_sent_ms, undefined, "an offer queued while offline has no wire timestamp");
  await h.tick(200); const socket = Socket.all.at(-1); socket.onopen(); socket.message({ type: "state", state: "active" });
  const result = await pending; h.streams.push(result.data);
  assert.ok(socket.sent.some(item => item.type === "signal" && item.data.k === "offer"));
  result.data.close(); await drain();
  const final = JSON.parse(h.calls.find(call => call.url.endsWith("/quality")).init.body);
  assert.equal(final.steps.session_created_ms, 100); assert.equal(final.steps.offer_sent_ms, 10_300);
});


test('offer queues behind auth before the first state acknowledgement',async t=>{
 const h=setup(t);const pending=api.remoteDesktopClient.openStream('device/1','sid',{state(){},error(){},frame(){}},{transport:'webrtc-v1',descriptor:descriptor()});
 await drain();const socket=Socket.all.at(-1);assert.equal(socket.sent.length,0);socket.onopen();await drain();
 assert.equal(socket.sent[0].type,'auth');assert.ok(socket.sent.slice(1).some(x=>x.type==='signal'&&x.data.k==='offer'));
 socket.message({type:'state',state:'active',transport:'webrtc-v1'});const result=await pending;assert.equal(result.ok,true);h.streams.push(result.data);
});
