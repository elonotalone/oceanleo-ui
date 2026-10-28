import assert from "node:assert/strict";
import test from "node:test";
import { openRemoteMedia, RemotePublisherStatusError } from "../src/pages/remote-desktop-media.ts";

const credentials = () => ({ provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "session-channel", user_id: "viewer", publisher_id: "desktop", token: "opaque-token", timestamp: Math.floor(Date.now() / 1000) + 120, expires_at: new Date(Date.now() + 120000).toISOString(), track: "screen", role: "viewer", camera: false, microphone: false });
function harness() {
  const events = new Map(), calls = [], states = [], frames = [];
  let callback;
  const video = Object.assign(new EventTarget(), {
    videoWidth: 0, videoHeight: 0, readyState: 0, currentTime: 0, srcObject: {},
    requestVideoFrameCallback(fn) { callback = fn; return 1; },
    cancelVideoFrameCallback() { callback = null; },
  });
  const engine = {
    on(name, fn) { events.set(name, fn); }, off(name) { events.delete(name); },
    setChannelProfile(value) { calls.push(["profile", value]); },
    setClientRole(value) { calls.push(["role", value]); },
    setDefaultSubscribeAllRemoteAudioStreams(value) { calls.push(["auto-audio", value]); },
    setDefaultSubscribeAllRemoteVideoStreams(value) { calls.push(["auto-video", value]); },
    publishLocalAudioStream(value) { calls.push(["publish-audio", value]); },
    publishLocalVideoStream(value) { calls.push(["publish-video", value]); },
    publishLocalScreenShareStream(value) { calls.push(["publish-screen", value]); },
    joinChannel(token) { calls.push(["join", token]); },
    leaveChannel() { calls.push(["leave"]); }, destroy() { calls.push(["destroy"]); },
    setRemoteViewConfig(view, uid, track) { calls.push(["view", view, uid, track]); },
    bizControl: { updateScreenWant(uid, value) { calls.push(["screen", uid, value]); } },
    getOnlineRemoteUsers() { return ["unrelated", "desktop"]; },
    refreshAuthInfo(token) { calls.push(["renew", token]); },
  };
  const abort = new AbortController();
  const handlers = { state: (...args) => states.push(args), frame: (...args) => frames.push(args), renew: async () => credentials() };
  return { engine, calls, states, frames, video, abort, handlers, events,
    decoded(width = 1920, height = 1080) { video.videoWidth = width; video.videoHeight = height; video.readyState = 2; callback?.(); },
    start: () => openRemoteMedia(credentials(), video, handlers, abort.signal, async () => ({ createEngine: () => engine })),
  };
}

test("receive-only independent engine subscribes solely to the approved publisher's screen, and join is not first-frame success", async () => {
  const h = harness(); const viewer = await h.start();
  try {
    assert.deepEqual(h.states, [["joining"], ["waiting_frame"]]);
    assert.deepEqual(h.frames, []);
    assert.deepEqual(h.calls.filter(([name]) => name.startsWith("publish") || name.startsWith("auto")), [["auto-audio", false], ["auto-video", false], ["publish-audio", false], ["publish-video", false], ["publish-screen", false]]);
    h.events.get("remoteTrackAvailableNotify")("intruder", 1, 3);
    h.events.get("remoteTrackAvailableNotify")("desktop", 1, 1);
    assert.deepEqual(h.calls.filter(([name]) => name === "screen"), [["screen", "desktop", true]]);
    h.decoded();
    assert.deepEqual(h.frames, [[1920, 1080]]);
    assert.deepEqual(h.states.at(-1), ["playing"]);
    h.decoded(2560, 1440);
    assert.deepEqual(h.frames.at(-1), [2560, 1440]);
  } finally { await viewer.close(); }
  assert.equal(h.video.srcObject, null);
  assert.equal(h.events.size, 0);
});

test("lost signaling immediately tears down receiver even while join is pending", async () => {
  const h = harness(); let joined;
  h.engine.joinChannel = () => new Promise((resolve) => { joined = resolve; });
  const starting = h.start();
  for (let i = 0; i < 40 && !joined; i++) await Promise.resolve();
  assert.ok(joined);
  h.abort.abort(); joined();
  await assert.rejects(starting, /aborted/);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.calls.filter(([name]) => name === "destroy").length, 1);
  assert.ok(!h.states.some(([state]) => state === "playing"));
});

test("a refresh cannot move the viewer into another session/channel", async () => {
  const h = harness(); const viewer = await h.start();
  h.handlers.renew = async () => ({ ...credentials(), channel_id: "other-channel" });
  h.events.get("authInfoWillExpire")();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(h.states.at(-1), ["error", "media_auth_failed"]);
  assert.equal(h.calls.some(([name]) => name === "renew"), false);
  await viewer.close();
});

test("first-frame deadline fails explicitly and destroys the receiver", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 100000 });
  const h = harness(); const viewer = await h.start();
  t.mock.timers.tick(21000);
  assert.deepEqual(h.states.at(-1), ["error", "media_first_frame_timeout"]);
  assert.equal(h.video.srcObject, null);
  await viewer.close();
});

test("stalled frames disable live state, then recover only after another decoded frame", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 100000 });
  const h = harness(); const viewer = await h.start();
  h.decoded();
  t.mock.timers.tick(6000);
  assert.deepEqual(h.states.at(-1), ["reconnecting"]);
  h.decoded();
  assert.deepEqual(h.states.at(-1), ["playing"]);
  assert.equal(h.frames.length, 2, "recovered frame re-enables geometry after stale input was cleared");
  await viewer.close();
});

test("credential expiry is enforced locally even when renewal never returns", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: 100000 });
  const h = harness();
  h.handlers.renew = () => new Promise(() => {});
  const viewer = await h.start();
  for (let i = 0; i < 12; i++) { h.decoded(); t.mock.timers.tick(10000); }
  assert.deepEqual(h.states.at(-1), ["error", "media_auth_failed"]);
  assert.equal(h.video.srcObject, null);
  await viewer.close();
});

test("renewal refusal preserves account and revocation status, tears down, and never retries", async () => {
  const h = harness();
  let renewals = 0;
  h.handlers.renew = async () => { renewals++; throw Object.assign(new Error("controller_revoked"), { status: 403 }); };
  const viewer = await h.start();
  h.events.get("authInfoWillExpire")();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.deepEqual(h.states.at(-1), ["error", "controller_revoked", 403]);
  assert.equal(h.video.srcObject, null);
  assert.equal(renewals, 1);
  assert.equal(h.calls.some(([name]) => name === "renew"), false);
  assert.equal(h.calls.filter(([name]) => name === "destroy").length, 1);
  await viewer.close();
});

test("RTC renewal preserves a typed publisher failure and keeps untrusted exceptions neutral", async () => {
  for (const [error, expected] of [
    [new RemotePublisherStatusError("screen_content_timeout"), "screen_content_timeout"],
    [new RemotePublisherStatusError("screen_permission_or_capture_unavailable"), "screen_permission_or_capture_unavailable"],
    [new RemotePublisherStatusError("NSError synthetic-private token=fixture-only"), "media_capture_or_publish_failed"],
    [new Error("screen_permission_required"), "media_auth_failed"],
    [new Error("SDK synthetic-private token=fixture-only"), "media_auth_failed"],
  ]) {
    const h = harness();
    h.handlers.renew = async () => { throw error; };
    const viewer = await h.start();
    h.events.get("authInfoWillExpire")();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.deepEqual(h.states.at(-1), ["error", expected]);
    assert.equal(h.calls.some(([name]) => name === "renew"), false);
    assert.equal(h.calls.filter(([name]) => name === "destroy").length, 1);
    await viewer.close();
  }
});
