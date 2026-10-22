// 通话网关接口与 SDK 装载/诊断/统计（合同 §3.2、§3.9；仲裁 A-5、A-9、A-11）。
// callsApi 的鉴权与错误由 `src/lib/im/client.ts` 的 imFetch 负责（这里换成记录路由的替身）。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-engine-api.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { CALL_LIMITS, rtcUserIdForParticipant } from "../src/lib/im/call-types.ts";
import { getLocalMicTrack, setActiveEngine } from "../src/shell/messages/call/engine/active.ts";
import { diagnosticsEngineFrom } from "../src/shell/messages/call/engine/diagnostics.ts";
import { issueFromDeviceException, issueFromMediaError, withIssue, withoutIssue } from "../src/shell/messages/call/engine/issues.ts";
import { createStatsTracker, netLevelFromMetrics, netLevelFromQuality } from "../src/shell/messages/call/engine/network.ts";
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, writePrefs } from "../src/shell/messages/call/engine/prefs.ts";
import { ARTC_CDN_URLS, CHANNEL_PROFILE, CLIENT_ROLE, applyRemoteVideoWant, pickEngineClass, wrapEngineClass } from "../src/shell/messages/call/engine/sdk.ts";

const clientStub = dataModule(`
  export async function imFetch(path, init = {}) {
    globalThis.__CALLS.push({ path, method: init.method || "GET", json: init.json, keepalive: init.keepalive });
    return globalThis.__REPLY ? globalThis.__REPLY(path) : { ok: true };
  }
`);

async function loadCallsApi() {
  return import(await compileModule("src/lib/im/calls-api.ts", { "./client": clientStub }));
}

test("callsApi: every §3.2 route, method and body; ids are URL-encoded; responses come back as-is", async () => {
  globalThis.__CALLS = [];
  const rtc = { app_id: "a", channel_id: "c", user_id: "u", token: "t", timestamp: 1, expires_at: "x" };
  globalThis.__REPLY = (path) => (path.endsWith("/token") || path.endsWith("/test-token") ? { rtc } : { ok: true, call: null });
  try {
    const { callsApi } = await loadCallsApi();
    await callsApi.status("conv/1");
    await callsApi.startOrJoin("conv-1");
    await callsApi.join("call-1");
    await callsApi.leave("call-1");
    await callsApi.leave("call-1", { keepalive: true });
    assert.deepEqual(await callsApi.refreshToken("call-1"), { rtc });
    await callsApi.heartbeat("call-1", { mic: true, camera: 0, screen: undefined, extra: "dropped" });
    await callsApi.decline("call-1");
    assert.deepEqual(await callsApi.testToken(), { rtc });
    assert.deepEqual(globalThis.__CALLS, [
      { path: "/v1/im/conversations/conv%2F1/call", method: "GET", json: undefined, keepalive: undefined },
      { path: "/v1/im/conversations/conv-1/call", method: "POST", json: undefined, keepalive: undefined },
      { path: "/v1/im/calls/call-1/join", method: "POST", json: undefined, keepalive: undefined },
      { path: "/v1/im/calls/call-1/leave", method: "POST", json: undefined, keepalive: undefined },
      { path: "/v1/im/calls/call-1/leave", method: "POST", json: undefined, keepalive: true },
      { path: "/v1/im/calls/call-1/token", method: "POST", json: undefined, keepalive: undefined },
      { path: "/v1/im/calls/call-1/heartbeat", method: "POST", json: { media: { mic: true, camera: false, screen: false } }, keepalive: undefined },
      { path: "/v1/im/calls/call-1/decline", method: "POST", json: undefined, keepalive: undefined },
      { path: "/v1/im/calls/test-token", method: "POST", json: undefined, keepalive: undefined },
    ]);
  } finally {
    delete globalThis.__CALLS;
    delete globalThis.__REPLY;
  }
});

test("call constants match the contract §3.1 and ARTC ids drop the separators", () => {
  assert.equal(CALL_LIMITS.MAX_PARTICIPANTS, 50);
  assert.equal(CALL_LIMITS.MAX_VIDEO, 25);
  assert.equal(CALL_LIMITS.RING_TIMEOUT_MS, 45_000);
  assert.equal(CALL_LIMITS.HEARTBEAT_MS, 30_000);
  assert.equal(CALL_LIMITS.STALE_AFTER_MS, 120_000);
  assert.equal(CALL_LIMITS.ALONE_AFTER_MS, 600_000);
  assert.equal(CALL_LIMITS.ALONE_COUNTDOWN_MS, 60_000);
  assert.equal(CALL_LIMITS.DOCK_TILES, 4);
  assert.equal(CALL_LIMITS.STAGE_PAGE, 9);
  assert.equal(CALL_LIMITS.STAGE_PAGE_MOBILE, 4);
  assert.equal(rtcUserIdForParticipant("a41df0d6-3ba2-4a91-bf0d-2905f1eecaa1"), "a41df0d63ba24a91bf0d2905f1eecaa1");
});

test("SDK loader recognises the npm default export, the CDN global class and the UMD namespace", () => {
  class Engine {
    static createInstance() {
      return { id: "fresh" };
    }
  }
  assert.equal(pickEngineClass({ default: Engine, AliRtcVideoTrack: {} }), Engine, "npm ES build: default export");
  assert.equal(pickEngineClass(Engine), Engine, "CDN script: window.AliRtcEngine is the class");
  assert.equal(pickEngineClass({ default: { default: Engine } }), Engine, "nested interop");
  assert.equal(pickEngineClass({ AliRtcEngine: Engine }), Engine);
  assert.equal(pickEngineClass({}), null);
  assert.equal(pickEngineClass(null), null);
  assert.equal(pickEngineClass(function notAnEngine() {}), null);
  assert.deepEqual(ARTC_CDN_URLS, [
    "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.3.8/aliyun-rtc-sdk.js",
    "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.3.7/aliyun-rtc-sdk.js",
  ]);
});

test("each call or diagnostic gets its own SDK instance (createInstance); no multi-instance method is a clear error", async () => {
  let created = 0;
  const sdk = wrapEngineClass({ createInstance: () => ({ n: ++created }), async isSupported() { return { support: true } } }, "npm");
  assert.notEqual(sdk.createEngine(), sdk.createEngine());
  assert.equal(created, 2);
  assert.deepEqual(await sdk.isSupported(), { support: true });
  const single = wrapEngineClass({ getInstance: () => ({}) }, "cdn");
  assert.throws(() => single.createEngine(), /artc_multi_instance_unsupported/);
  assert.equal(single.source, "cdn");
});

test("per-user video wants prefer BizControl (camera and screen separately); fallback keeps audio on", () => {
  const calls = [];
  const engine = {
    bizControl: {
      updateVideoWant: (uid, sub) => calls.push(["video", uid, sub]),
      updateScreenWant: (uid, sub) => calls.push(["screen", uid, sub]),
    },
    subscribeRemoteMediaStream: () => calls.push(["public"]),
  };
  applyRemoteVideoWant(engine, "u", { camera: false, screen: false }, { camera: true, screen: false });
  applyRemoteVideoWant(engine, "u", { camera: true, screen: false }, { camera: true, screen: true });
  applyRemoteVideoWant(engine, "u", { camera: true, screen: true }, { camera: false, screen: false });
  assert.deepEqual(calls, [["video", "u", true], ["screen", "u", true], ["video", "u", false], ["screen", "u", false]]);
});

function fakeDiagEngine() {
  const calls = [];
  const handlers = new Map();
  return {
    calls,
    emit: (name, ...args) => (handlers.get(name) ?? []).forEach((fn) => fn(...args)),
    on: (name, fn) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    setChannelProfile: (v) => calls.push(["setChannelProfile", v]),
    setClientRole: async (v) => calls.push(["setClientRole", v]),
    setDefaultSubscribeAllRemoteAudioStreams: (v) => calls.push(["defaultAudio", v]),
    setDefaultSubscribeAllRemoteVideoStreams: (v) => calls.push(["defaultVideo", v]),
    publishLocalVideoStream: async (v) => calls.push(["publishVideo", v]),
    publishLocalAudioStream: async (v) => calls.push(["publishAudio", v]),
    startAudioCapture: async (c) => calls.push(["startAudioCapture", c]),
    joinChannel: async (token, name) => calls.push(["joinChannel", token, name]),
    leaveChannel: async () => calls.push(["leaveChannel"]),
    destroy: async () => calls.push(["destroy"]),
  };
}

test("diagnostics engine (A-5, A-11): own instance, interactive role, audio only, no remote subscriptions, single-param token", async () => {
  const engine = fakeDiagEngine();
  let instances = 0;
  const sdk = { createEngine: () => (instances += 1, engine) };
  const diag = diagnosticsEngineFrom(sdk);
  assert.equal(instances, 1);
  await diag.join({ app_id: "a", channel_id: "diag-x", user_id: "u", token: "BASE64TOKEN", timestamp: 1, expires_at: "x" }, { displayName: "测试", micDeviceId: "mic-9" });
  assert.deepEqual(engine.calls, [
    ["setChannelProfile", CHANNEL_PROFILE],
    ["setClientRole", CLIENT_ROLE],
    ["defaultAudio", false],
    ["defaultVideo", false],
    ["publishVideo", false],
    ["publishAudio", true],
    ["startAudioCapture", { deviceId: { exact: "mic-9" } }],
    ["joinChannel", "BASE64TOKEN", "测试"],
  ]);
  assert.equal(CHANNEL_PROFILE, "interactive_live");
  assert.equal(CLIENT_ROLE, "interactive");
  engine.emit("rtcStats", { currentRoundTripTime: 0.05, bytesSent: 1_000, bytesReceived: 0, timestamp: 0 });
  engine.emit("rtcStats", { currentRoundTripTime: 0.05, bytesSent: 6_000, bytesReceived: 0, timestamp: 1_000 });
  const stats = await diag.getStats();
  assert.equal(stats.rttMs, 50);
  assert.equal(stats.upKbps, 40);
  assert.equal(stats.upLossPct, null);
  assert.equal(stats.downLossPct, null, "nobody else is in the diagnostic channel");
  await diag.leave();
  await diag.leave();
  assert.deepEqual(engine.calls.slice(-2), [["leaveChannel"], ["destroy"]], "leave is idempotent");
  await assert.rejects(diag.join({ token: "x" }), /diagnostics_closed/);
  await assert.rejects(diagnosticsEngineFrom({ createEngine: () => fakeDiagEngine() }).join({ token: "" }), /rtc_credentials_incomplete/);
});

test("getLocalMicTrack returns the active call's live mic track and nothing otherwise (A-9)", async () => {
  setActiveEngine(null);
  assert.equal(await getLocalMicTrack(), null);
  const live = { readyState: "live" };
  setActiveEngine({ getAudioTrack: async (userId) => (userId ? null : live) });
  assert.equal(await getLocalMicTrack(), live);
  setActiveEngine({ getAudioTrack: async () => ({ readyState: "ended" }) });
  assert.equal(await getLocalMicTrack(), null, "an ended track is not handed out");
  setActiveEngine({ getAudioTrack: async () => { throw new Error("gone"); } });
  assert.equal(await getLocalMicTrack(), null);
  setActiveEngine(null);
});

test("stats: rtt from the candidate pair, kbps from byte deltas, loss from SDK quality or inbound packets; never invented", () => {
  let now = 0;
  const tracker = createStatsTracker(() => now);
  assert.deepEqual(tracker.stats(), { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null });
  tracker.onTransport({ currentRoundTripTime: 0.12, bytesSent: 0, bytesReceived: 0, timestamp: 10_000 });
  assert.equal(tracker.stats().upKbps, null, "one sample is not a rate");
  tracker.onTransport({ currentRoundTripTime: 0.12, bytesSent: 25_000, bytesReceived: 100_000, timestamp: 12_000 });
  assert.deepEqual(tracker.stats(), { rttMs: 120, upLossPct: null, downLossPct: null, upKbps: 100, downKbps: 400 });
  tracker.onNetworkQuality({ subscribe: { rtt: 0, loss: 0, quality: 6 } });
  assert.equal(tracker.stats().downLossPct, null, "unknown quality (no remote users) is not 0 % loss");
  tracker.onNetworkQuality({ subscribe: { rtt: 130, loss: 12, quality: 2 } });
  assert.equal(tracker.stats().downLossPct, 12);
  assert.equal(tracker.selfLevel(), 3);
  // 远端：入站包两次之差算丢包率。
  tracker.onRemoteInbound("audio", [{ uid: "r1", stats: { packetsLost: 0, packetsReceived: 100 } }]);
  assert.equal(tracker.remoteLevel("r1"), 0, "one sample: unknown");
  tracker.onRemoteInbound("audio", [{ uid: "r1", stats: { packetsLost: 30, packetsReceived: 170 } }]);
  assert.equal(tracker.remoteLevel("r1"), 2, "30 lost of 100 in the window → 30 % → level 2");
  // candidate-pair 不带字节数时，用本地 outbound-rtp 估上行。
  const t2 = createStatsTracker(() => now);
  t2.onTransport({ currentRoundTripTime: 0.02 });
  now = 1_000;
  t2.onLocalOutbound("audio", [{ track: 1, stats: { bytesSent: 1_000 } }]);
  now = 3_000;
  t2.onLocalOutbound("audio", [{ track: 1, stats: { bytesSent: 11_000 } }]);
  assert.equal(t2.stats().upKbps, 40);
  tracker.reset();
  assert.deepEqual(tracker.stats(), { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null });
});

test("signal bars follow the SDK quality scale (0 excellent … 5 disconnected, 6 unknown)", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, undefined].map(netLevelFromQuality), [5, 4, 3, 2, 1, 1, 0, 0]);
  assert.equal(netLevelFromMetrics(null, null), 0);
  assert.equal(netLevelFromMetrics(0, 40), 5);
  assert.equal(netLevelFromMetrics(15, null), 4);
  assert.equal(netLevelFromMetrics(null, 400), 2);
  assert.equal(netLevelFromMetrics(60, 50), 1);
});

test("media errors map to the contract issue kinds; cancelling the screen picker is not an issue", () => {
  const denied = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
  assert.deepEqual(issueFromMediaError("mic", denied), { kind: "mic_permission" });
  assert.deepEqual(issueFromMediaError("mic", Object.assign(new Error("x"), { name: "NotFoundError" })), { kind: "no_mic" });
  assert.deepEqual(issueFromMediaError("mic", { code: 17040393, message: "mic not available" }), { kind: "no_mic" });
  assert.deepEqual(issueFromMediaError("camera", { code: 17039621, message: "camera auth fail" }), { kind: "camera_permission" });
  assert.deepEqual(issueFromMediaError("camera", Object.assign(new Error("busy"), { name: "NotReadableError" })), { kind: "device_lost", detail: "camera" });
  assert.equal(issueFromMediaError("screen", denied), null, "the user closed the picker");
  assert.deepEqual(issueFromMediaError("screen", Object.assign(new Error("Permission denied by system"), { name: "NotAllowedError" })), { kind: "screen_permission" });
  assert.deepEqual(issueFromDeviceException(3), { kind: "mic_permission" });
  assert.deepEqual(issueFromDeviceException(4), { kind: "no_mic" });
  assert.deepEqual(issueFromDeviceException(2), { kind: "device_lost", detail: "mic" });
  assert.deepEqual(issueFromDeviceException(7), { kind: "device_lost", detail: "speaker" });
  assert.deepEqual(issueFromDeviceException(11), { kind: "camera_permission" });
  assert.equal(issueFromDeviceException(0), null);
  const list = withIssue(withIssue([], { kind: "no_mic" }), { kind: "device_lost", detail: "mic" });
  assert.deepEqual(withIssue(list, { kind: "no_mic" }), list, "one entry per kind");
  assert.deepEqual(withoutIssue(list, "no_mic"), [{ kind: "device_lost", detail: "mic" }]);
});

test("device memory: defaults when empty or corrupted, merges patches, ignores junk", () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.deepEqual(readPrefs(storage), DEFAULT_PREFS);
  assert.deepEqual(readPrefs(null), DEFAULT_PREFS);
  writePrefs(storage, { camera: true });
  writePrefs(storage, { micDeviceId: "mic-1" });
  assert.deepEqual(readPrefs(storage), { ...DEFAULT_PREFS, camera: true, micDeviceId: "mic-1" });
  map.set(PREFS_KEY, "{not json");
  assert.deepEqual(readPrefs(storage), DEFAULT_PREFS);
  map.set(PREFS_KEY, JSON.stringify({ mic: "yes", camera: false, speakerDeviceId: 42 }));
  assert.deepEqual(readPrefs(storage), { ...DEFAULT_PREFS, camera: false });
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(writePrefs(throwing, { mic: false }), { ...DEFAULT_PREFS, mic: false }, "storage failures never break a call");
});
