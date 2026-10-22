// 通话引擎状态机（engine/controller.ts）：SDK、网关、时钟、存储、设备、实时事件全部用假对象。
// 覆盖：入会参数（A-11）与默认开关/记忆（A1）、名单以 SDK 为准、订阅规则（A6）、续期与重连（A8）、
// 心跳节奏、独处计时（A9）、来电状态机、被移出、上限（A11）、问题检测、互斥（A20）。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-engine-store.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

import { rtcUserIdForParticipant } from "../src/lib/im/call-types.ts";
import { ENDED_RESET_MS, MIC_SILENT_MS, NETWORK_POOR_MS, createCallController } from "../src/shell/messages/call/engine/controller.ts";
import { PREFS_KEY } from "../src/shell/messages/call/engine/prefs.ts";

const START = Date.parse("2026-10-23T10:00:00.000Z");
const ME_PID = "aaaaaaaa-0000-4000-8000-000000000001";
const ME_UID = rtcUserIdForParticipant(ME_PID);
const pid = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, "0")}`;
const uidOf = (n) => rtcUserIdForParticipant(pid(n));
const NAMES = { "user-me": "我", "user-1": "甲", "user-2": "乙", "user-3": "丙", "user-caller": "来电人" };

const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

function createFakeClock() {
  let now = START;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + Math.max(0, ms), fn, every: null });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + ms, fn, every: ms });
      return seq;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        await settle();
        let next = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (!next || timer.at < next[1].at || (timer.at === next[1].at && id < next[0]))) next = [id, timer];
        }
        if (!next) break;
        const [id, timer] = next;
        now = timer.at;
        if (timer.every) timer.at += timer.every;
        else timers.delete(id);
        timer.fn();
      }
      now = target;
      await settle();
    },
  };
}

function participant(id, userId, media = { mic: true, camera: false, screen: false }) {
  return { participant_id: id, user_id: userId, joined_at: "2026-10-23T10:00:00Z", last_seen_at: "2026-10-23T10:00:00Z", media };
}

function callView({ callId = "call-1", cid = "conv-1", participants = [participant(ME_PID, "user-me")], status = "active" } = {}) {
  return {
    call_id: callId,
    conversation_id: cid,
    status,
    started_by: "user-me",
    started_at: "2026-10-23T10:00:00Z",
    ended_at: null,
    ended_reason: null,
    participants,
    participant_count: participants.length,
    ring: null,
    recording: null,
    transcription: null,
    controls: [],
  };
}

function apiError(status, code, message = "") {
  return Object.assign(new Error(message || code), { name: "ImApiError", status, code });
}

function createFakeApi() {
  let tokens = 0;
  const api = {
    calls: [],
    call: callView(),
    failStart: null,
    failJoin: null,
    failRefresh: [],
    failHeartbeat: null,
    pendingStart: null,
    response(callId = api.call.call_id) {
      tokens += 1;
      return {
        call: { ...api.call, call_id: callId },
        participant_id: ME_PID,
        rtc: { app_id: "app", channel_id: callId, user_id: ME_UID, token: `tok-${tokens}`, timestamp: 1_900_000_000, expires_at: "2030-01-01T00:00:00Z" },
        edition: "global",
      };
    },
    async startOrJoin(cid) {
      api.calls.push(["startOrJoin", cid]);
      if (api.pendingStart) return api.pendingStart;
      if (api.failStart) throw api.failStart;
      return api.response();
    },
    async join(callId) {
      api.calls.push(["join", callId]);
      if (api.failJoin) throw api.failJoin;
      return api.response(callId);
    },
    async leave(callId, opts) {
      api.calls.push(["leave", callId, opts ?? null]);
      return { ok: true, call: null };
    },
    async refreshToken(callId) {
      api.calls.push(["refreshToken", callId]);
      const failure = api.failRefresh.shift();
      if (failure) throw failure;
      return { rtc: { app_id: "app", channel_id: callId, user_id: ME_UID, token: "tok-refreshed", timestamp: 1_900_086_400, expires_at: "2030-01-02T00:00:00Z" } };
    },
    async heartbeat(callId, media) {
      api.calls.push(["heartbeat", callId, media]);
      if (api.failHeartbeat) throw api.failHeartbeat;
      return { ok: true };
    },
    async decline(callId) {
      api.calls.push(["decline", callId]);
      return { ok: true };
    },
    count(name) {
      return api.calls.filter((c) => c[0] === name).length;
    },
  };
  return api;
}

class FakeEngine {
  constructor(registry) {
    this.calls = [];
    this.handlers = new Map();
    this.online = [];
    this.userInfo = new Map();
    this.failMic = null;
    this.failCamera = null;
    this.failJoin = null;
    this.screenTrack = null;
    this.bizControl = {
      updateVideoWant: (uid, sub) => this.calls.push(["updateVideoWant", uid, sub]),
      updateScreenWant: (uid, sub) => this.calls.push(["updateScreenWant", uid, sub]),
    };
    registry.push(this);
  }
  record(...entry) {
    this.calls.push(entry);
  }
  named(name) {
    return this.calls.filter((c) => c[0] === name);
  }
  index(name) {
    return this.calls.findIndex((c) => c[0] === name);
  }
  on(name, fn) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), fn]);
  }
  emit(name, ...args) {
    for (const fn of this.handlers.get(name) ?? []) fn(...args);
  }
  setChannelProfile(profile) { this.record("setChannelProfile", profile); }
  async setClientRole(role) { this.record("setClientRole", role); }
  setDefaultSubscribeAllRemoteAudioStreams(v) { this.record("defaultAudio", v); }
  setDefaultSubscribeAllRemoteVideoStreams(v) { this.record("defaultVideo", v); }
  subscribeRemoteMediaStream(...args) { this.record("subscribeRemoteMediaStream", ...args); }
  async publishLocalAudioStream(v) { this.record("publishAudio", v); }
  async publishLocalVideoStream(v) {
    this.record("publishVideo", v);
    if (v && this.failCamera) throw this.failCamera;
  }
  async publishLocalScreenShareStream(v) { this.record("publishScreen", v); }
  async startScreenShare() { this.record("startScreenShare"); }
  async stopScreenShare() { this.record("stopScreenShare"); }
  enableAudioVolumeIndication(ms) { this.record("volumeIndication", ms); }
  muteLocalMic(mute) { this.record("muteLocalMic", mute); }
  muteRemoteAudioPlaying(uid, mute) { this.record("muteRemoteAudioPlaying", uid, mute); }
  async startAudioCapture(constraints) {
    this.record("startAudioCapture", constraints ?? null);
    if (this.failMic) throw this.failMic;
  }
  async switchMicrophone(id) { this.record("switchMicrophone", id); }
  async switchCamera(id) { this.record("switchCamera", id); }
  async setCameraCapturerConfiguration(config) { this.record("cameraConfig", config); }
  async enableLocalVideo(v) { this.record("enableLocalVideo", v); }
  async startPreview() {}
  async stopPreview() {}
  async setLocalViewConfig(el, track) { this.record("setLocalViewConfig", el?.id ?? null, track); }
  setRemoteViewConfig(el, uid, track) { this.record("setRemoteViewConfig", el?.id ?? null, uid, track); }
  getUserInfo(uid) { return this.userInfo.get(uid); }
  getOnlineRemoteUsers() { return this.online.slice(); }
  async getVideoTrack() { return this.screenTrack ?? undefined; }
  async getAudioTrack() { return undefined; }
  async joinChannel(token, name) {
    this.record("joinChannel", token, name ?? null);
    if (this.failJoin) throw this.failJoin;
  }
  async leaveChannel() { this.record("leaveChannel"); }
  async refreshAuthInfo(token) { this.record("refreshAuthInfo", token); }
  async destroy() { this.record("destroy"); }
}

function setup({ storage = null, devices = null, sinkSupported = true, busy = false } = {}) {
  const clock = createFakeClock();
  const engines = [];
  const sdk = {
    source: "npm",
    version: "7.3.8",
    supported: true,
    async isSupported() { return { support: sdk.supported, detail: { isScreenShareSupported: true } }; },
    createEngine() { return new FakeEngine(engines); },
    async getMicrophoneList() { return []; },
    async getCameraList() { return []; },
    async getSpeakerList() { return []; },
  };
  const api = createFakeApi();
  const hub = [];
  const store = new Map(storage ? [[PREFS_KEY, JSON.stringify(storage)]] : []);
  const deviceList = devices ?? [
    { kind: "audioinput", deviceId: "default", label: "Default" },
    { kind: "audioinput", deviceId: "mic-2", label: "USB mic" },
    { kind: "videoinput", deviceId: "cam-1", label: "Camera" },
    { kind: "audiooutput", deviceId: "spk-1", label: "Speaker" },
  ];
  const deviceListeners = new Set();
  const mutex = { owner: busy ? "leo-realtime" : null, released: [] };
  const active = [];
  const controller = createCallController({
    api,
    loadSdk: async () => sdk,
    selfUserId: async () => "user-me",
    fetchProfiles: async (ids) => ids.map((id) => ({ user_id: id, display_name: NAMES[id] ?? id, avatar_url: null })),
    subscribeHub: (handler) => {
      hub.push(handler);
      return () => {};
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    clock,
    mediaDevices: {
      enumerateDevices: async () => deviceList.slice(),
      addEventListener: (_t, listener) => deviceListeners.add(listener),
      removeEventListener: (_t, listener) => deviceListeners.delete(listener),
    },
    claimCall: (owner) => {
      if (mutex.owner) return null;
      mutex.owner = owner;
      return 7;
    },
    releaseCall: (owner, claim) => {
      mutex.released.push([owner, claim]);
      if (mutex.owner === owner && claim === 7) mutex.owner = null;
    },
    setActiveEngine: (engine) => active.push(engine),
    sinkIdSupported: () => sinkSupported,
  });
  const notifications = { count: 0 };
  controller.store.subscribe(() => {
    notifications.count += 1;
  });
  return {
    clock,
    sdk,
    engines,
    api,
    store,
    deviceList,
    deviceListeners,
    mutex,
    active,
    controller,
    actions: controller.actions,
    notifications,
    snap: () => controller.store.getSnapshot(),
    engine: () => engines.at(-1),
    hub: (event) => {
      for (const handler of hub) handler(event);
    },
    prefs: () => JSON.parse(store.get(PREFS_KEY) ?? "null"),
  };
}

async function joined(options) {
  const t = setup(options);
  await t.actions.startOrJoin("conv-1", { title: "设计组" });
  await settle();
  return t;
}

function remoteJoin(t, n, info = { hasAudio: true, hasCamera: false, hasScreenShare: false }) {
  const engine = t.engine();
  engine.userInfo.set(uidOf(n), info);
  engine.emit("remoteUserOnLineNotify", uidOf(n), 0);
}

function serverWith(t, ns, media = {}) {
  const participants = [participant(ME_PID, "user-me"), ...ns.map((n) => participant(pid(n), `user-${n}`, media[n] ?? { mic: true, camera: false, screen: false }))];
  t.hub({ type: "call", conversation_id: "conv-1", call: callView({ participants }) });
}

// ---------------------------------------------------------------------------

test("start: SDK loads before the gateway; A-11 setup and single-param token join; mic on, camera off by default", async () => {
  const t = await joined();
  const engine = t.engine();
  assert.deepEqual(t.api.calls[0], ["startOrJoin", "conv-1"]);
  assert.deepEqual(engine.named("setChannelProfile"), [["setChannelProfile", "interactive_live"]]);
  assert.deepEqual(engine.named("setClientRole"), [["setClientRole", "interactive"]]);
  assert.deepEqual(engine.named("defaultAudio"), [["defaultAudio", true]], "remote audio is automatic");
  assert.deepEqual(engine.named("defaultVideo"), [["defaultVideo", false]], "remote video is never automatic");
  const join = engine.named("joinChannel")[0];
  assert.equal(join[1], "tok-1", "the gateway base64 token is passed as the single argument");
  for (const before of ["setChannelProfile", "setClientRole", "defaultAudio", "defaultVideo", "publishVideo", "publishAudio", "startAudioCapture"]) {
    assert.ok(engine.index(before) < engine.index("joinChannel"), `${before} happens before joinChannel`);
  }
  assert.deepEqual(engine.named("publishVideo"), [["publishVideo", false]], "camera stays off");
  assert.deepEqual(engine.named("publishAudio"), [["publishAudio", true]], "microphone publishes");
  const s = t.snap();
  assert.equal(s.phase, "connected");
  assert.equal(s.conversationId, "conv-1");
  assert.equal(s.conversationTitle, "设计组");
  assert.equal(s.callId, "call-1");
  assert.equal(s.me.mic, true);
  assert.equal(s.me.camera, false);
  assert.deepEqual(s.participants.map((p) => [p.participantId, p.isMe, p.displayName]), [[ME_PID, true, "我"]]);
  assert.deepEqual(s.order, [ME_PID]);
  assert.deepEqual(t.api.calls.find((c) => c[0] === "heartbeat"), ["heartbeat", "call-1", { mic: true, camera: false, screen: false }]);
  assert.equal(t.mutex.owner, "meeting", "the Leo realtime lock is held while in the call");
  assert.equal(t.active.at(-1), engine, "the active engine is registered for getLocalMicTrack");
});

test("remembered choices are applied and user toggles persist; passive failures do not overwrite memory", async () => {
  const t = await joined({ storage: { mic: false, camera: true, micDeviceId: "mic-2", cameraDeviceId: "cam-1" } });
  const engine = t.engine();
  assert.deepEqual(engine.named("publishAudio"), [["publishAudio", false]], "remembered mic-off means no capture at join");
  assert.equal(engine.named("startAudioCapture").length, 0);
  assert.deepEqual(engine.named("cameraConfig"), [["cameraConfig", { deviceId: "cam-1" }]]);
  assert.deepEqual(engine.named("publishVideo").at(-1), ["publishVideo", true], "remembered camera-on turns on after join");
  assert.equal(t.snap().me.camera, true);
  assert.equal(t.snap().me.mic, false);

  await t.actions.setMic(true);
  assert.deepEqual(engine.named("startAudioCapture").at(-1), ["startAudioCapture", { deviceId: "mic-2" }], "the remembered microphone is used");
  assert.deepEqual(engine.named("muteLocalMic").at(-1), ["muteLocalMic", false]);
  assert.equal(t.prefs().mic, true);
  await t.actions.setMic(false);
  assert.deepEqual(engine.named("muteLocalMic").at(-1), ["muteLocalMic", true]);
  assert.equal(t.prefs().mic, false);
  await t.actions.setCamera(false);
  assert.deepEqual(engine.named("enableLocalVideo").at(-1), ["enableLocalVideo", false], "camera capture stops (light off)");
  assert.equal(t.prefs().camera, false);

  const denied = setup({ storage: { mic: true, camera: false } });
  denied.sdk.createEngine = () => {
    const engine2 = new FakeEngine(denied.engines);
    engine2.failMic = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    return engine2;
  };
  await denied.actions.startOrJoin("conv-1");
  await settle();
  const s = denied.snap();
  assert.equal(s.phase, "connected", "a denied microphone still joins (listen-only)");
  assert.equal(s.me.mic, false);
  assert.deepEqual(s.issues, [{ kind: "mic_permission" }]);
  assert.equal(denied.prefs().mic, true, "a permission failure is not remembered as the user's choice");
});

test("roster follows SDK presence; the server CallView only supplies names and media", async () => {
  const t = await joined();
  serverWith(t, [1, 2], { 1: { mic: false, camera: true, screen: false } });
  await settle();
  assert.equal(t.snap().participants.length, 1, "server-listed people are not rendered until the SDK sees them");
  remoteJoin(t, 1, { hasAudio: false, hasCamera: true, hasScreenShare: false });
  await settle();
  let s = t.snap();
  const one = s.participants.find((p) => p.participantId === pid(1));
  assert.equal(one.displayName, "甲");
  assert.equal(one.userId, "user-1");
  assert.equal(one.mic, false);
  assert.equal(one.camera, true);
  assert.equal(one.connection, "connected");
  t.engine().emit("userAudioMuted", uidOf(1), false);
  t.engine().emit("remoteTrackAvailableNotify", uidOf(1), 1, 1);
  await settle();
  assert.equal(t.snap().participants.find((p) => p.participantId === pid(1)).mic, true, "SDK track events win over stale server media");

  // 不在服务端名单里的 SDK 远端也照样显示（姓名等服务端广播再补）。
  remoteJoin(t, 3);
  await settle();
  s = t.snap();
  assert.ok(s.participants.some((p) => p.participantId === pid(3) && p.userId === ""), "SDK presence decides rendering");

  // 掉线（超时）但服务端还在 → reconnecting；服务端名单里没了 → 移除。
  t.engine().emit("remoteUserOffLineNotify", uidOf(1), 1);
  await settle();
  assert.equal(t.snap().participants.find((p) => p.participantId === pid(1)).connection, "reconnecting");
  serverWith(t, [2]);
  await settle();
  assert.equal(t.snap().participants.some((p) => p.participantId === pid(1)), false);
  // 主动离开 → 立刻移除。
  t.engine().emit("remoteUserOffLineNotify", uidOf(3), 0);
  await settle();
  assert.deepEqual(t.snap().participants.map((p) => p.participantId), [ME_PID]);
});

test("a dropped person who never comes back disappears after the 2-minute server grace", async () => {
  const t = await joined();
  serverWith(t, [1]);
  remoteJoin(t, 1);
  await settle();
  t.engine().emit("remoteUserOffLineNotify", uidOf(1), 1);
  await t.clock.advance(119_000);
  assert.equal(t.snap().participants.find((p) => p.participantId === pid(1))?.connection, "reconnecting");
  await t.clock.advance(2_000);
  assert.equal(t.snap().participants.some((p) => p.participantId === pid(1)), false);
});

test("subscriptions: audio automatic; camera only for visible tiles; screen only for the sharer on stage; audio-only drops all video", async () => {
  const t = await joined();
  const engine = t.engine();
  for (const n of [1, 2, 3, 4, 5]) remoteJoin(t, n, { hasAudio: true, hasCamera: true, hasScreenShare: false });
  await settle();
  let s = t.snap();
  assert.deepEqual(s.visibleIds, [ME_PID, pid(1), pid(2), pid(3)]);
  assert.equal(s.overflowCount, 2);
  const videoWants = () => {
    const state = new Map();
    for (const [name, uid, sub] of engine.calls) if (name === "updateVideoWant") state.set(uid, sub);
    return state;
  };
  let wants = videoWants();
  assert.equal(wants.get(uidOf(1)), true);
  assert.equal(wants.get(uidOf(3)), true);
  assert.equal(wants.has(uidOf(4)), false, "hidden tiles never subscribe video");
  assert.equal(engine.named("subscribeRemoteMediaStream").length, 0, "per-user wants go through BizControl, not the lossy public call");

  // 放大视图翻到第 2 页：只收这一页。
  t.actions.setViewport("stage", [pid(4), pid(5)]);
  wants = videoWants();
  assert.equal(wants.get(uidOf(4)), true);
  assert.equal(wants.get(uidOf(5)), true);
  assert.equal(wants.get(uidOf(1)), false, "tiles that scrolled away are unsubscribed");

  // 有人共享屏幕：小窗模式不收，放大视图收。
  t.actions.setViewport("dock", s.visibleIds);
  engine.emit("remoteTrackAvailableNotify", uidOf(2), 1, 3);
  await settle();
  s = t.snap();
  assert.equal(s.screenSharerId, pid(2));
  assert.equal(engine.named("updateScreenWant").length, 0, "the dock does not show screens, so it does not receive them");
  t.actions.setViewport("stage", [pid(1)]);
  assert.deepEqual(engine.named("updateScreenWant").at(-1), ["updateScreenWant", uidOf(2), true]);

  await t.actions.setAudioOnly(true);
  wants = videoWants();
  for (const n of [1, 2, 3, 4, 5]) assert.notEqual(wants.get(uidOf(n)), true, `audio-only: no camera for ${n}`);
  assert.deepEqual(engine.named("updateScreenWant").at(-1), ["updateScreenWant", uidOf(2), false]);
  assert.equal(t.snap().me.audioOnly, true);

  // 画面元素：自己 = 本地预览，别人 = 远端视图（track 1 摄像头 / 2 屏幕）。
  t.actions.attachVideo({ id: "v-me" }, ME_PID, "camera");
  t.actions.attachVideo({ id: "v-2s" }, pid(2), "screen");
  t.actions.attachVideo(null, pid(2), "screen");
  await settle();
  assert.deepEqual(engine.named("setLocalViewConfig").at(-1), ["setLocalViewConfig", "v-me", 1]);
  assert.deepEqual(engine.named("setRemoteViewConfig").slice(-2), [
    ["setRemoteViewConfig", "v-2s", uidOf(2), 2],
    ["setRemoteViewConfig", null, uidOf(2), 2],
  ]);
});

test("token refresh: authInfoWillExpire → refreshToken → refreshAuthInfo(new token); one retry after a failure", async () => {
  const t = await joined();
  const engine = t.engine();
  t.api.failRefresh = [apiError(0, "network")];
  engine.emit("authInfoWillExpire");
  await settle();
  assert.equal(t.api.count("refreshToken"), 1);
  assert.equal(engine.named("refreshAuthInfo").length, 0);
  await t.clock.advance(5_000);
  assert.equal(t.api.count("refreshToken"), 2, "retried once within the 30 s window");
  assert.deepEqual(engine.named("refreshAuthInfo"), [["refreshAuthInfo", "tok-refreshed"]]);
  assert.equal(t.snap().phase, "connected");
});

test("expired credentials or a failed connection rejoin with a fresh engine; reconnecting is visible", async () => {
  const t = await joined();
  const first = t.engine();
  first.emit("connectionStatusChange", 4, 0);
  await settle();
  assert.equal(t.snap().phase, "reconnecting");
  assert.ok(t.snap().issues.some((i) => i.kind === "network_lost"));
  first.emit("connectionStatusChange", 3, 0);
  await settle();
  assert.equal(t.snap().phase, "connected");
  assert.equal(t.snap().issues.some((i) => i.kind === "network_lost"), false);

  first.emit("authInfoExpired");
  await settle();
  await settle();
  assert.deepEqual(t.api.calls.filter((c) => c[0] === "join"), [["join", "call-1"]]);
  const second = t.engine();
  assert.notEqual(second, first, "a fresh SDK instance");
  assert.deepEqual(first.calls.slice(-2), [["leaveChannel"], ["destroy"]]);
  assert.equal(second.named("joinChannel")[0][1], "tok-2");
  assert.equal(t.snap().phase, "connected");
  // 旧实例的迟到事件不再生效。
  first.emit("connectionStatusChange", 4, 0);
  await settle();
  assert.equal(t.snap().phase, "connected");
});

test("heartbeat every 30 s with media; a media change is reported within 0.4 s; server-ended calls end locally", async () => {
  const t = await joined();
  const beats = () => t.api.calls.filter((c) => c[0] === "heartbeat");
  assert.equal(beats().length, 1, "one heartbeat right after joining");
  await t.clock.advance(29_000);
  assert.equal(beats().length, 1);
  await t.clock.advance(1_000);
  assert.equal(beats().length, 2);
  await t.actions.setCamera(true);
  await t.clock.advance(400);
  assert.deepEqual(beats().at(-1), ["heartbeat", "call-1", { mic: true, camera: true, screen: false }]);
  await t.clock.advance(60_000);
  assert.equal(beats().length, 5);

  t.api.failHeartbeat = apiError(404, "call_unavailable");
  await t.clock.advance(30_000);
  assert.equal(t.snap().phase, "ended");
  assert.equal(t.api.count("leave"), 0, "the call is already gone: no leave request");
  assert.equal(t.mutex.owner, null);
  await t.clock.advance(ENDED_RESET_MS);
  assert.equal(t.snap().phase, "idle");
});

test("not_participant on heartbeat re-registers through join (A-15)", async () => {
  const t = await joined();
  t.api.failHeartbeat = apiError(403, "not_participant");
  await t.clock.advance(30_000);
  t.api.failHeartbeat = null;
  await settle();
  assert.equal(t.api.count("join"), 1);
  assert.equal(t.snap().phase, "connected");
});

test("alone for 10 minutes → 60 s countdown → leave; cancel restarts the clock; someone joining clears it", async () => {
  const t = await joined();
  await t.clock.advance(10 * 60_000 - 1);
  assert.equal(t.snap().aloneDeadline, null);
  await t.clock.advance(1);
  assert.equal(t.snap().aloneDeadline, t.clock.now() + 60_000);
  t.actions.cancelAloneTimer();
  assert.equal(t.snap().aloneDeadline, null);
  await t.clock.advance(5 * 60_000);
  remoteJoin(t, 1);
  await settle();
  await t.clock.advance(20 * 60_000);
  assert.equal(t.snap().aloneDeadline, null, "not alone, no countdown");
  t.engine().emit("remoteUserOffLineNotify", uidOf(1), 0);
  await settle();
  await t.clock.advance(10 * 60_000);
  assert.ok(t.snap().aloneDeadline !== null);
  await t.clock.advance(60_000);
  const s = t.snap();
  assert.equal(s.phase, "ended");
  assert.equal(s.error?.code, "alone_timeout");
  assert.deepEqual(t.api.calls.filter((c) => c[0] === "leave"), [["leave", "call-1", null]]);
});

test("incoming: ring → incoming with caller name; ring end clears; accept joins; decline calls the API; expiry clears", async () => {
  const t = setup();
  t.controller.store.subscribe(() => {});
  await settle();
  const expires = new Date(START + 45_000).toISOString();
  t.hub({ type: "call_ring", conversation_id: "conv-dm", call_id: "call-dm", caller_id: "user-caller", expires_at: expires });
  await settle();
  assert.deepEqual(t.snap().incoming, { callId: "call-dm", conversationId: "conv-dm", callerId: "user-caller", callerName: "来电人", expiresAt: expires });
  t.hub({ type: "call_ring_end", conversation_id: "conv-dm", call_id: "call-dm", reason: "cancelled" });
  await settle();
  assert.equal(t.snap().incoming, null);

  t.hub({ type: "call_ring", conversation_id: "conv-dm", call_id: "call-dm", caller_id: "user-caller", expires_at: expires });
  await settle();
  t.api.call = callView({ callId: "call-dm", cid: "conv-dm" });
  await t.actions.acceptIncoming();
  await settle();
  assert.deepEqual(t.api.calls.find((c) => c[0] === "join"), ["join", "call-dm"]);
  assert.equal(t.snap().incoming, null);
  assert.equal(t.snap().phase, "connected");
  assert.equal(t.snap().conversationId, "conv-dm");

  t.hub({ type: "call_ring", conversation_id: "conv-dm2", call_id: "call-dm2", caller_id: "user-caller", expires_at: new Date(START + 45_000).toISOString() });
  await settle();
  await t.actions.declineIncoming();
  assert.deepEqual(t.api.calls.at(-1), ["decline", "call-dm2"]);
  assert.equal(t.snap().incoming, null);

  t.hub({ type: "call_ring", conversation_id: "conv-dm3", call_id: "call-dm3", caller_id: "user-caller", expires_at: new Date(t.clock.now() + 45_000).toISOString() });
  await settle();
  assert.equal(t.snap().incoming?.callId, "call-dm3");
  await t.clock.advance(45_000);
  assert.equal(t.snap().incoming, null, "an unanswered ring disappears at its deadline");
});

test("caller side: a declined or missed ring while still alone leaves the call with the reason", async () => {
  const t = await joined();
  t.hub({ type: "call_ring_end", conversation_id: "conv-1", call_id: "call-1", reason: "declined" });
  await settle();
  assert.equal(t.snap().phase, "ended");
  assert.equal(t.snap().error.code, "ring_declined");
  assert.deepEqual(t.api.calls.filter((c) => c[0] === "leave"), [["leave", "call-1", null]]);

  const u = await joined();
  remoteJoin(u, 1);
  await settle();
  u.hub({ type: "call_ring_end", conversation_id: "conv-1", call_id: "call-1", reason: "missed" });
  await settle();
  assert.equal(u.snap().phase, "connected", "someone else is here: the call goes on");
});

test("call_kicked leaves without calling the API and says why", async () => {
  const t = await joined();
  t.hub({ type: "call_kicked", conversation_id: "conv-1", call_id: "call-1", reason: "removed_from_conversation" });
  await settle();
  const s = t.snap();
  assert.equal(s.phase, "ended");
  assert.equal(s.error.code, "removed_from_conversation");
  assert.equal(t.api.count("leave"), 0);
  assert.deepEqual(t.engines[0].calls.slice(-2), [["leaveChannel"], ["destroy"]]);
  assert.equal(t.mutex.owner, null);
});

test("limits: the 26th camera is refused with video_full; call_full on join is an issue and an error", async () => {
  const t = await joined();
  const many = Array.from({ length: 26 }, (_, i) => i + 1);
  const media = Object.fromEntries(many.map((n) => [n, { mic: true, camera: n <= 25, screen: false }]));
  serverWith(t, many, media);
  for (const n of many) remoteJoin(t, n, { hasAudio: true, hasCamera: n <= 25, hasScreenShare: false });
  await settle();
  await t.actions.setCamera(true);
  assert.equal(t.engine().named("publishVideo").filter((c) => c[1] === true).length, 0, "the camera is not opened");
  assert.equal(t.snap().me.camera, false);
  assert.ok(t.snap().issues.some((i) => i.kind === "video_full"));
  t.engine().emit("remoteTrackAvailableNotify", uidOf(1), 1, 0); // 有人关了摄像头
  await settle();
  assert.equal(t.snap().issues.some((i) => i.kind === "video_full"), false, "the notice clears once a slot frees up");

  const full = setup();
  full.api.failStart = apiError(409, "call_full", "");
  await full.actions.startOrJoin("conv-1");
  await settle();
  const s = full.snap();
  assert.equal(s.phase, "error");
  assert.equal(s.error.code, "call_full");
  assert.match(s.error.message, /50/);
  assert.deepEqual(s.issues, [{ kind: "call_full" }]);
  assert.equal(full.engines.length, 0, "no SDK instance is created when the gateway refuses");
  assert.equal(full.mutex.owner, null);
});

test("a person-to-person call cannot start during a Leo realtime call", async () => {
  const t = setup({ busy: true });
  await t.actions.startOrJoin("conv-1");
  await settle();
  assert.equal(t.snap().phase, "error");
  assert.equal(t.snap().error.code, "busy_leo_realtime");
  assert.equal(t.api.calls.length, 0);
});

test("leaving while the gateway is still answering leaves the late call and never creates an engine", async () => {
  const t = setup();
  let resolve;
  t.api.pendingStart = new Promise((r) => {
    resolve = r;
  });
  const starting = t.actions.startOrJoin("conv-1");
  await settle();
  assert.equal(t.snap().phase, "joining");
  await t.actions.leave();
  resolve(t.api.response());
  await starting;
  await settle();
  assert.deepEqual(t.api.calls.filter((c) => c[0] === "leave"), [["leave", "call-1", null]]);
  assert.equal(t.engines.length, 0);
  assert.equal(t.mutex.owner, null);
  assert.equal(t.snap().phase, "ended");
});

test("issues: silent microphone after 8 s, unplugged device falls back, sustained poor network", async () => {
  const t = await joined({ storage: { mic: true, camera: false, micDeviceId: "mic-2" } });
  const engine = t.engine();
  for (let i = 0; i < 30; i += 1) {
    engine.emit("audioVolume", [{ userId: "", volume: 0 }]);
    await t.clock.advance(300);
  }
  assert.ok(t.snap().issues.some((i) => i.kind === "mic_silent"), `mic_silent after ${MIC_SILENT_MS} ms of zero level`);
  engine.emit("audioVolume", [{ userId: "", volume: 20 }]);
  await settle();
  assert.equal(t.snap().issues.some((i) => i.kind === "mic_silent"), false);

  t.deviceList.splice(t.deviceList.findIndex((d) => d.deviceId === "mic-2"), 1);
  for (const listener of t.deviceListeners) listener();
  await settle();
  assert.deepEqual(engine.named("switchMicrophone").at(-1), ["switchMicrophone", "default"]);
  assert.equal(t.snap().me.micDeviceId, "default");
  assert.ok(t.snap().issues.some((i) => i.kind === "device_lost" && i.detail === "mic"));

  for (let i = 0; i < 4; i += 1) {
    engine.emit("networkQuality", { subscribe: { rtt: 600, loss: 60, quality: 4 } });
    await t.clock.advance(2_000);
  }
  assert.equal(t.snap().me.network, 1);
  assert.ok(t.snap().issues.some((i) => i.kind === "network_poor"), `network_poor after ${NETWORK_POOR_MS} ms`);
  engine.emit("networkQuality", { subscribe: { rtt: 40, loss: 0, quality: 0 } });
  await settle();
  assert.equal(t.snap().me.network, 5);
  assert.equal(t.snap().issues.some((i) => i.kind === "network_poor"), false);
});

test("speaking lights the tile without moving it; locally muting someone uses playback mute and survives a rejoin", async () => {
  const t = await joined();
  remoteJoin(t, 1);
  remoteJoin(t, 2);
  await settle();
  const before = t.snap().visibleIds.slice();
  t.engine().emit("audioVolume", [{ userId: "", volume: 0 }, { userId: uidOf(2), volume: 60 }]);
  await settle();
  const s = t.snap();
  assert.equal(s.participants.find((p) => p.participantId === pid(2)).speaking, true);
  assert.deepEqual(s.visibleIds, before);
  await t.actions.setLocalMute(pid(1), true);
  assert.deepEqual(t.engine().named("muteRemoteAudioPlaying").at(-1), ["muteRemoteAudioPlaying", uidOf(1), true]);
  assert.equal(t.snap().participants.find((p) => p.participantId === pid(1)).locallyMuted, true);
  t.engine().emit("remoteUserOffLineNotify", uidOf(1), 0);
  remoteJoin(t, 1);
  await settle();
  assert.deepEqual(t.engine().named("muteRemoteAudioPlaying").at(-1), ["muteRemoteAudioPlaying", uidOf(1), true], "re-applied to the new SDK user");
});

test("devices: list, select (persisted), speaker via setSinkId; unsupported speaker selection says so", async () => {
  const t = await joined();
  const devices = await t.actions.listDevices();
  assert.deepEqual(devices.microphones.map((d) => d.deviceId), ["default", "mic-2"]);
  assert.deepEqual(devices.cameras, [{ deviceId: "cam-1", label: "Camera" }]);
  assert.deepEqual(devices.speakers, [{ deviceId: "spk-1", label: "Speaker" }]);
  await t.actions.selectDevice("mic", "mic-2");
  assert.deepEqual(t.engine().named("switchMicrophone").at(-1), ["switchMicrophone", "mic-2"]);
  assert.equal(t.prefs().micDeviceId, "mic-2");
  const sinks = [];
  t.engine().userInfo.set(uidOf(1), { hasAudio: true, audioElement: { setSinkId: async (id) => sinks.push(id) } });
  t.engine().emit("remoteUserOnLineNotify", uidOf(1), 0);
  await t.actions.selectDevice("speaker", "spk-1");
  await settle();
  assert.deepEqual(sinks.at(-1), "spk-1");
  assert.equal(t.snap().me.speakerDeviceId, "spk-1");

  const u = await joined({ sinkSupported: false });
  assert.deepEqual((await u.actions.listDevices()).speakers, []);
  await assert.rejects(u.actions.selectDevice("speaker", "spk-1"), /speaker_select_unsupported/);
});

test("screen share publishes, reports the shared surface, and stops when the browser bar ends it", async () => {
  const t = await joined();
  const listeners = {};
  t.engine().screenTrack = {
    readyState: "live",
    getSettings: () => ({ width: 2560, height: 1440, displaySurface: "monitor" }),
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    removeEventListener: (type) => {
      delete listeners[type];
    },
  };
  await t.actions.setScreenShare(true);
  assert.deepEqual(t.engine().named("publishScreen").at(-1), ["publishScreen", true]);
  assert.equal(t.snap().me.screen, true);
  assert.equal(t.snap().screenSharerId, ME_PID);
  assert.deepEqual(t.actions.getScreenShareSurface(), { width: 2560, height: 1440, displaySurface: "monitor" });
  listeners.ended();
  await settle();
  assert.equal(t.snap().me.screen, false);
  assert.deepEqual(t.engine().named("stopScreenShare").length, 1);
  assert.equal(t.actions.getScreenShareSurface(), null);
});

test("getStats derives from SDK stats events and leaves unknown fields null", async () => {
  const t = await joined();
  assert.deepEqual(await t.actions.getStats(), { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null });
  const engine = t.engine();
  engine.emit("rtcStats", { currentRoundTripTime: 0.085, bytesSent: 10_000, bytesReceived: 50_000, timestamp: 1_000 });
  engine.emit("rtcStats", { currentRoundTripTime: 0.09, bytesSent: 20_000, bytesReceived: 100_000, timestamp: 3_000 });
  engine.emit("networkQuality", { subscribe: { rtt: 90, loss: 3, quality: 1 } });
  await settle();
  assert.deepEqual(await t.actions.getStats(), { rttMs: 90, upLossPct: null, downLossPct: 3, upKbps: 40, downKbps: 200 });
  assert.equal(t.snap().me.network, 4);
});

test("the server ending the call ends it locally (no leave request) and the dock returns to idle", async () => {
  const t = await joined();
  t.hub({ type: "call", conversation_id: "conv-1", call: { ...callView(), status: "ended", ended_reason: "empty" } });
  await settle();
  assert.equal(t.snap().phase, "ended");
  assert.equal(t.api.count("leave"), 0);
  await t.clock.advance(ENDED_RESET_MS);
  assert.equal(t.snap().phase, "idle");
  assert.equal(t.snap().callId, null);
});

test("the same user joining elsewhere (bye 3) ends this tab's call without leaving on the server", async () => {
  const t = await joined();
  t.engine().emit("bye", 3);
  await settle();
  assert.equal(t.snap().phase, "ended");
  assert.equal(t.snap().error.code, "joined_elsewhere");
  assert.equal(t.api.count("leave"), 0);
});

test("leave: API leave + SDK leave/destroy, lock released, prefs untouched; page hide sends a keepalive leave", async () => {
  const t = await joined();
  t.controller.onPageHide();
  await settle();
  assert.deepEqual(t.api.calls.filter((c) => c[0] === "leave"), [["leave", "call-1", { keepalive: true }]]);
  await t.actions.leave();
  await settle();
  assert.equal(t.snap().phase, "ended");
  assert.deepEqual(t.engines[0].calls.slice(-2), [["leaveChannel"], ["destroy"]]);
  assert.equal(t.mutex.owner, null);
  assert.equal(t.active.at(-1), null, "the active engine is cleared");
  assert.ok(t.notifications.count > 0);
});
