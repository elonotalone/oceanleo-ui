// ARTC data channel is mandatory; gateway sockets only control the session.
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { openRemoteMedia as actualOpenRemoteMedia, lowerPlayoutDelay } from "../src/pages/remote-desktop-media.ts";
const openRemoteMedia = (...args) => { args[5] ??= () => ({ track: { kind: "video", id: "synthetic" }, stop() {} }); return actualOpenRemoteMedia(...args); };

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
const credentials = (extra = {}) => ({ provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "c", user_id: "viewer", publisher_id: "desktop", token: "t", timestamp: 1, expires_at: new Date(Date.now() + 120000).toISOString(), track: "screen", role: "viewer", camera: false, microphone: false, data_channel_input: true, ...extra });
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
  const handlers = { sessionId: "session-1", state() {}, frame() {}, renew: async () => credentials(), dataChannel: (value) => lanes.push(value) };
  const sdk = async () => ({ createEngine: () => engine, dataChannelMessage: (data) => ({ data, type: 2 }) });
  const track = { id: "synthetic", kind: "video" };
  let stopped = 0;
  const inputTrack = () => ({ track, stop() { stopped++; } });
  return { engine, events, calls, lanes, track, handlers, stopped: () => stopped, start: (extra) => openRemoteMedia(credentials(extra), video, handlers, new AbortController().signal, sdk, inputTrack) };
}

test("the viewer publishes a media-less data channel only when the gateway granted it, and exposes it once published", async () => {
  const off = engineHarness();
  await (await off.start({ data_channel_input: false })).close();
  assert.deepEqual(off.calls.filter(([n]) => n === "screen-share"), []);

  const h = engineHarness();
  const viewer = await h.start({ data_channel_input: true });
  assert.deepEqual(h.calls.find(([n]) => n === "parameter")[1], { data: { enablePubDataChannel: true, enableSubDataChannel: true } });
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
  assert.equal(h.lanes.at(-1), null, "reconnecting detaches the lane: input pauses until ARTC reconnects");
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
      new AbortController().signal, async () => ({ createEngine: () => h.engine, dataChannelMessage: data => ({ data, type: 2 }) }));
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
      new AbortController().signal, async () => ({ createEngine: () => h.engine, dataChannelMessage: data => ({ data, type: 2 }) }));
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

function directLane() {
  const peer=lane(); const listeners=new Set();
  peer.subscribe=fn=>{listeners.add(fn);return ()=>listeners.delete(fn);};
  peer.ack=seq=>{for(const fn of listeners)fn({t:'rd.input_ack',v:1,sid:'session-1',acked_seq:seq});};
  peer.listenerCount=()=>listeners.size;
  return peer;
}


test('a real publisher data subscription loss drops the lane; resubscription restores it and unrelated users are ignored',async()=>{
  const h=engineHarness();const viewer=await h.start({data_channel_input:true});
  try{
    h.events.get('dataPublishStateChanged')(1,3);const first=h.lanes.at(-1);assert.ok(first);
    h.events.get('dataSubscribeStateChanged')('other',3,4);assert.equal(h.lanes.at(-1),first);
    h.events.get('dataSubscribeStateChanged')('desktop',3,4);assert.equal(h.lanes.at(-1),null);
    h.events.get('dataSubscribeStateChanged')('desktop',4,3);assert.ok(h.lanes.at(-1));
    h.events.get('remoteUserOffLineNotify')('desktop');assert.equal(h.lanes.at(-1),null);
  }finally{await viewer.close();}
});

test('an explicitly read-only descriptor receives video without creating a data channel', async () => {
 const h=engineHarness();const viewer=await h.start({data_channel_input:false});
 assert.equal(h.calls.some(([name])=>name==='parameter'||name==='screen-share'),false);
 h.events.get('dataPublishStateChanged')(1,3);assert.deepEqual(h.lanes,[]);
 await viewer.close();
});
test('renewal to read-only detaches DC and stops the synthetic publisher while keeping video', async () => {
 const h=engineHarness(),viewer=await h.start({data_channel_input:true});
 h.events.get('dataPublishStateChanged')(1,3);assert.ok(h.lanes.at(-1));
 h.handlers.renew=async()=>credentials({data_channel_input:false});
 h.events.get('authInfoWillExpire')();await new Promise(setImmediate);
 assert.equal(h.lanes.at(-1),null);assert.equal(h.stopped(),1);
 assert.ok(h.calls.some(([name,value])=>name==='publish-screen'&&value===false));
 h.events.get('dataPublishStateChanged')(1,3);assert.equal(h.lanes.at(-1),null);
 await viewer.close();
});
test('ARTC receipts are publisher/session scoped and reject legacy ACKs and malformed terminals', async () => {
 const h=engineHarness(),viewer=await h.start({data_channel_input:true});h.events.get('dataPublishStateChanged')(1,3);
 const received=[];h.lanes[0].subscribe(x=>received.push(x));
 const emit=(uid,value)=>h.events.get('dataChannelMsg')(uid,{type:2,data:new TextEncoder().encode(JSON.stringify(value)).buffer});
 const receipt={v:1,t:'rd.input_receipt',sid:'session-1',seq:1,status:'executed',executed_at_ms:123};
 emit('other',receipt);emit('desktop',{...receipt,sid:'other'});emit('desktop',{...receipt,v:2});emit('desktop',{...receipt,status:'accepted'});emit('desktop',{...receipt,seq:0});emit('desktop',{v:1,t:'rd.input_ack',sid:'session-1',acked_seq:1});
 assert.deepEqual(received,[]);for(const status of ['executed','merged','rejected'])emit('desktop',{...receipt,status});
 assert.deepEqual(received.map(x=>x.status),['executed','merged','rejected']);
 await viewer.close();assert.equal(h.events.has('dataChannelMsg'),false);
});
