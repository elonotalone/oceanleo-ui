import assert from "node:assert/strict";
import test from "node:test";
import { openRemoteMedia } from "../src/pages/remote-desktop-media.ts";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
async function harness(t, { stats = true, trackId = "screen-track", kind = "video", counters = { bytesReceived: 100, packetsReceived: 1, framesReceived: 1 } } = {}) {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 100000 });
  const events = new Map(), states = [], frames = [];
  let callback, statsMode = "ok", statsCalls = 0;
  const video = Object.assign(new EventTarget(), {
    videoWidth: 0, videoHeight: 0, readyState: 0,
    srcObject: { getVideoTracks: () => [{ id: "screen-track" }] },
    requestVideoFrameCallback(fn) { callback = fn; return 1; },
    cancelVideoFrameCallback() { callback = undefined; },
  });
  class Peer {
    async setRemoteDescription() {}
    getReceivers() { return [{ track: { id: trackId }, getStats: async () => {
      statsCalls++;
      if (statsMode === "reject") throw new Error("stats unavailable");
      if (statsMode === "pending") return new Promise(() => {});
      return new Map([["screen-inbound", { id: "screen-inbound", type: "inbound-rtp", kind, ...counters }]]);
    } }]; }
  }
  const originalPeer = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = Peer;
  const engine = {
    on(name, fn) { events.set(name, fn); }, off(name) { events.delete(name); },
    setChannelProfile() {}, setClientRole() {},
    setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
    publishLocalAudioStream() {}, publishLocalVideoStream() {}, publishLocalScreenShareStream() {},
    async joinChannel() { if (stats) await new Peer().setRemoteDescription(); },
    leaveChannel() {}, destroy() {}, refreshAuthInfo() {},
  };
  const credentials = {
    provider: "artc", transport: "artc-v1", app_id: "fixture-app", channel_id: "fixture-session",
    user_id: "viewer", publisher_id: "desktop", token: "fixture-token", expires_at: new Date(Date.now() + 120000).toISOString(),
    track: "screen", role: "viewer", camera: false, microphone: false,
  };
  const abort = new AbortController();
  const viewer = await openRemoteMedia(credentials, video, {
    state: (...args) => states.push(args), frame: (...args) => frames.push(args), renew: async () => credentials,
  }, abort.signal, async () => ({ createEngine: () => engine }));
  t.after(async () => { await viewer.close(); globalThis.RTCPeerConnection = originalPeer; });
  return {
    video, states, frames, counters, events, viewer, statsCalls: () => statsCalls,
    statsMode(mode) { statsMode = mode; },
    frame() { video.videoWidth = 1920; video.videoHeight = 1080; video.readyState = 2; callback?.(); },
    async tick(seconds = 1) { for (let i = 0; i < seconds; i++) { t.mock.timers.tick(1000); await flush(); } },
  };
}

test("static desktop with four-second keyframes stays playing beyond the hard timeout window", async (t) => {
  const h = await harness(t); h.frame();
  for (let i = 0; i < 8; i++) {
    await h.tick(4); h.counters.bytesReceived += 100; h.counters.packetsReceived++; h.counters.framesReceived++; h.frame();
  }
  assert.equal(h.states.filter(([state]) => state === "playing").length, 1);
  assert.equal(h.states.some(([state]) => state === "reconnecting" || state === "error"), false);
  assert.equal(h.frames.length, 9);
  assert.ok(h.statsCalls() >= 30);
});

for (const counter of ["bytesReceived", "packetsReceived", "framesReceived"]) {
  test(`${counter} deltas keep a temporarily stalled decoder out of reconnecting`, async (t) => {
    const h = await harness(t, { counters: { [counter]: 1 } }); h.frame();
    for (let i = 0; i < 12; i++) { h.counters[counter]++; await h.tick(); }
    assert.deepEqual(h.states.at(-1), ["playing"]);
    assert.equal(h.states.some(([state]) => state === "reconnecting"), false);
    assert.equal(h.video.srcObject === null, false);
    h.frame(); await h.tick();
    assert.equal(h.frames.length, 2);
  });
}

test("unchanged positive counters signal real loss only after six seconds; the next frame recovers", async (t) => {
  const h = await harness(t); h.frame();
  const attached = h.video.srcObject;
  await h.tick(); // Establish the cumulative-counter baseline.
  await h.tick(6);
  assert.deepEqual(h.states.at(-1), ["playing"]);
  await h.tick();
  assert.deepEqual(h.states.at(-1), ["reconnecting"]);
  assert.equal(h.video.srcObject, attached, "a stall keeps the existing decoder/last picture attached");
  h.counters.bytesReceived += 100; await h.tick();
  assert.deepEqual(h.states.at(-1), ["reconnecting"], "traffic alone cannot claim a decoded recovery");
  h.frame();
  assert.deepEqual(h.states.at(-1), ["playing"]);
  assert.equal(h.frames.length, 2);
});

test("zero counters and unavailable stats do not invent inbound activity", async (t) => {
  const h = await harness(t, { counters: { bytesReceived: 0, packetsReceived: 0, framesReceived: 0 } }); h.frame();
  await h.tick(6); assert.deepEqual(h.states.at(-1), ["playing"]);
  await h.tick(); assert.deepEqual(h.states.at(-1), ["reconnecting"]);
});

test("a replacement receiver's counter reset establishes a new live baseline", async (t) => {
  const h = await harness(t, { counters: { bytesReceived: 1000 } }); h.frame();
  await h.tick(6);
  h.counters.bytesReceived = 20;
  await h.tick(6);
  assert.deepEqual(h.states.at(-1), ["playing"]);
  h.frame();
});

for (const options of [{ trackId: "other-call-camera" }, { kind: "audio" }]) {
  test(`${JSON.stringify(options)} traffic cannot keep a lost screen receiver live`, async (t) => {
    const h = await harness(t, options); h.frame();
    for (let i = 0; i < 7; i++) { h.counters.bytesReceived += 100; await h.tick(); }
    assert.deepEqual(h.states.at(-1), ["reconnecting"]);
    assert.equal(h.statsCalls(), options.trackId ? 0 : 7);
  });
}

for (const statsMode of ["reject", "pending", "absent"]) {
  test(`${statsMode} receiver stats still preserve the six-second grace and 20-second failure`, async (t) => {
    const h = await harness(t, { stats: statsMode !== "absent" }); h.statsMode(statsMode); h.frame();
    await h.tick(6); assert.deepEqual(h.states.at(-1), ["playing"]);
    await h.tick(); assert.deepEqual(h.states.at(-1), ["reconnecting"]);
    assert.notEqual(h.video.srcObject, null);
    await h.tick(13); assert.notEqual(h.video.srcObject, null);
    await h.tick(); assert.deepEqual(h.states.at(-1), ["error", "media_frame_timeout"]);
    assert.equal(h.video.srcObject, null);
    if (statsMode === "pending") assert.equal(h.statsCalls(), 1, "hung requests do not accumulate");
  });
}

test("inbound traffic without decoded frames still reaches the hard decoder failure", async (t) => {
  const h = await harness(t); h.frame();
  for (let i = 0; i < 21; i++) { h.counters.bytesReceived += 100; await h.tick(); }
  assert.equal(h.states.some(([state]) => state === "reconnecting"), false);
  assert.deepEqual(h.states.at(-1), ["error", "media_frame_timeout"]);
  assert.equal(h.video.srcObject, null);
});

test("traffic cannot postpone the first decoded frame deadline", async (t) => {
  const h = await harness(t);
  for (let i = 0; i < 21; i++) { h.counters.packetsReceived++; await h.tick(); }
  assert.deepEqual(h.states.at(-1), ["error", "media_first_frame_timeout"]);
});

for (const event of [1, 4, "publisher-offline"]) {
  test(`explicit ${event} connection loss reconnects immediately and recovers on a decoded frame`, async (t) => {
    const h = await harness(t); h.frame(); const attached = h.video.srcObject;
    if (event === "publisher-offline") {
      h.events.get("remoteUserOffLineNotify")("other-call");
      assert.deepEqual(h.states.at(-1), ["playing"]);
      h.events.get("remoteUserOffLineNotify")("desktop");
    } else h.events.get("connectionStatusChange")(event);
    assert.deepEqual(h.states.at(-1), ["reconnecting"]);
    assert.equal(h.video.srcObject, attached);
    h.frame(); assert.deepEqual(h.states.at(-1), ["playing"]);
  });
}
