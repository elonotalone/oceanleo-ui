import assert from "node:assert/strict";
import test from "node:test";
import { RemoteTransportDiagnostics, parseRemoteInputDiagnostics } from "../src/api/remote-desktop-diagnostics.ts";
import { RemoteInputScheduler } from "../src/api/remote-desktop-scheduler.ts";
import { openRemoteMedia as actualOpenRemoteMedia } from "../src/pages/remote-desktop-media.ts";
const openRemoteMedia = (...args) => { args[5] ??= () => ({ track: { kind: "video", id: "synthetic" }, stop() {} }); return actualOpenRemoteMedia(...args); };
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const scheduler = { queued_count: 0, queued_soft_count: 0, outstanding_count: 0, retry_count: 0,
  last_seq: 0, execution_watermark: 0, held_key_count: 0, held_button_count: 0 };
const numeric = (value) => assert.ok(Object.values(value).every((n) => typeof n === "number" && Number.isFinite(n)));

test("native/gateway diagnostic parsing admits only fixed unsigned safe integers, including explicit zero", () => {
  assert.equal(parseRemoteInputDiagnostics(null), null);
  assert.equal(parseRemoteInputDiagnostics([]), null);
  const parsed = parseRemoteInputDiagnostics({ input_completed_seq: 0, input_injected_seq: 1, input_queue_depth: 4,
    gateway_pending_count: 2, gateway_inflight_count: true, input_queue_wait_us: 1.5,
    input_error_count: -1, input_inject_us: Number.MAX_SAFE_INTEGER + 1, token: "private", text: "private" });
  assert.deepEqual(parsed, { gateway_pending_count: 2, input_queue_depth: 4, input_completed_seq: 0, input_injected_seq: 1 });
  numeric(parsed);
});

test("measurement stores a bounded tail with explicit eviction, and snapshots never consume an interval", () => {
  let now = 0;
  const d = new RemoteTransportDiagnostics(() => now);
  for (let seq = 1; seq <= 1000; seq++) { now++; d.written("data_channel", seq); }
  const first = d.snapshot(scheduler, 64);
  assert.equal(first.dc_pending_tracked_count, 256); assert.equal(first.dc_tracking_evicted_total, 744);
  assert.equal(first.dc_receipt_seq_gap, 1000); assert.equal(first.dc_write_count, 1000);
  assert.deepEqual(d.snapshot(scheduler, 64), first);
  assert.equal(d.snapshot(scheduler, 64, true).dc_write_count, 1000);
  now += 100; d.written("data_channel", 1001);
  d.control({ seq: 1001, stage: "input_receipt", status: "executed", elapsedMs: 12 });
  const next = d.snapshot(scheduler, 0);
  assert.equal(next.interval_ms, 100); assert.equal(next.dc_write_count, 1);
  assert.equal(next.ws_write_count, 0); assert.equal(next.dc_completed_max_ms, 12);
  d.dispose(); assert.equal(d.snapshot(scheduler, 0).dc_pending_tracked_count, 0);
});

const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, location: { href: "https://example.test" } };
const api = await import(await compileModule("src/api/remote-desktop.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return "private-user-token";}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://example.test";'),
}));

function mediaHarness(t, pendingStats = false) {
  const events = new Map(), milestones = [], snapshots = [], calls = [], samples = [];
  let frame;
  const receiver = { track: { id: "screen" }, getStats: () => pendingStats ? new Promise(() => {}) : Promise.resolve(new Map([
    ["in", { id: "in", type: "inbound-rtp", kind: "video", framesPerSecond: 30, framesDecoded: 100, jitterBufferDelay: .5, jitterBufferEmittedCount: 10 }],
    ["pair", { id: "pair", type: "candidate-pair", selected: true, currentRoundTripTime: .02, localCandidateId: "local" }],
    ["local", { id: "local", type: "local-candidate", candidateType: "relay", address: "private-candidate-address" }],
  ])) };
  class Peer { connectionState = "connected"; setRemoteDescription() { return Promise.resolve(); } getReceivers() { return [receiver]; } }
  const previousPeer = globalThis.RTCPeerConnection;
  globalThis.RTCPeerConnection = Peer;
  t.after(() => { globalThis.RTCPeerConnection = previousPeer; });
  const video = Object.assign(new EventTarget(), { srcObject: { getVideoTracks: () => [{ id: "screen" }] },
    videoWidth: 0, videoHeight: 0, readyState: 0, currentTime: 0,
    requestVideoFrameCallback(fn) { frame = fn; return 1; }, cancelVideoFrameCallback() {} });
  const engine = { setParameter() {}, sendDataChannelMessage() {}, startScreenShare() {}, stopScreenShare() {}, on(name, fn) { events.set(name, fn); }, off(name) { events.delete(name); },
    setChannelProfile() {}, setClientRole() {}, setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
    publishLocalAudioStream() {}, publishLocalVideoStream() {}, publishLocalScreenShareStream() {},
    joinChannel() { calls.push("join"); return new Peer().setRemoteDescription(); }, leaveChannel() { calls.push("leave"); }, destroy() { calls.push("destroy"); },
    refreshAuthInfo() {}, setRemoteViewConfig() {}, getOnlineRemoteUsers: () => [], bizControl: { updateScreenWant() {} } };
  const credentials = { data_channel_input: true, token: "private-media-token", publisher_id: "private-publisher", user_id: "private-viewer", channel_id: "private-channel", expires_at: new Date(Date.now() + 120000).toISOString() };
  const abort = new AbortController();
  return { milestones, snapshots, calls, samples, abort, video, frame() { video.videoWidth = 100; video.videoHeight = 100; video.readyState = 2; frame(); },
    start: () => openRemoteMedia(credentials, video, { state() {}, frame() {}, renew: async () => credentials,
      timing(value) { milestones.push(value); }, diagnostics(value) { snapshots.push(value); }, stats(value) { samples.push(value); } }, abort.signal, async () => ({ createEngine: () => engine, dataChannelMessage: data => ({ data, type: 2 }) })) };
}

test("media milestones expose load/prepare/join/frame/cleanup on one monotonic clock", async (t) => {
  const h = mediaHarness(t); const viewer = await h.start();
  h.frame();
  const value = h.milestones.at(-1); numeric(value);
  for (const key of ["media_open_ms", "sdk_load_started_ms", "sdk_loaded_ms", "engine_created_ms", "prepare_started_ms", "prepared_ms", "publish_disabled_ms", "join_started_ms", "joined_ms", "synthetic_ready_ms", "first_decoded_frame_ms"]) assert.equal(typeof value[key], "number", key);
  assert.ok(value.sdk_loaded_ms >= value.sdk_load_started_ms); assert.ok(value.joined_ms >= value.join_started_ms);
  assert.doesNotMatch(JSON.stringify(value), /private|token|publisher|channel/);
  await viewer.stats();
  const snapshot = viewer.diagnostics(); numeric(snapshot);
  assert.equal(snapshot.rtc_fps, 30); assert.equal(snapshot.rtc_jitter_buffer_delay_ms, 500);
  assert.equal(snapshot.rtc_rtt_ms, 20); assert.equal(snapshot.rtc_relay, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /private|candidate|address|token|channel/);
  await viewer.close(); assert.equal(typeof h.milestones.at(-1).closed_ms, "number");
  assert.deepEqual(h.calls, ["join", "leave", "destroy"]);
});

test("media diagnostics share one pending stats read across quality callers and watchdog", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const h = mediaHarness(t, true), viewer = await h.start();
  void viewer.stats(); void viewer.stats();
  t.mock.timers.tick(1000);
  const snapshot = viewer.diagnostics(); numeric(snapshot);
  assert.equal(snapshot.stats_inflight_count, 1); assert.equal(snapshot.stats_inflight_high_water, 1);
  assert.equal(snapshot.stats_calls_total, 1); assert.equal(snapshot.recorded_peer_count, 1);
  t.mock.timers.tick(1000);
  assert.equal(viewer.diagnostics().stats_calls_total, 1, "watchdog and quality callers share one pending native stats request");
  await viewer.close();
});


test("watchdog publishes one parsed RTC sample per read for all quality consumers and stops on close", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const h = mediaHarness(t), viewer = await h.start();
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  assert.equal(viewer.diagnostics().stats_calls_total, 1);
  assert.equal(h.samples.length, 1);
  assert.equal(h.samples[0].fps, viewer.diagnostics().rtc_fps);
  assert.equal(h.samples[0].rttMs, viewer.diagnostics().rtc_rtt_ms);
  t.mock.timers.tick(1000); await new Promise(setImmediate);
  assert.equal(viewer.diagnostics().stats_calls_total, 2);
  assert.equal(h.samples.length, 2);
  await viewer.close();
  t.mock.timers.tick(3000); await new Promise(setImmediate);
  assert.equal(h.samples.length, 2);
});
