import assert from "node:assert/strict";
import test from "node:test";
import { RemoteTransportDiagnostics, parseRemoteInputDiagnostics } from "../src/api/remote-desktop-diagnostics.ts";
import { RemoteInputScheduler } from "../src/api/remote-desktop-scheduler.ts";
import { openRemoteMedia } from "../src/pages/remote-desktop-media.ts";
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

test("peer enqueue and attempt completion stay distinct; zero latches support across stale/omitted samples", () => {
  let now = 0;
  const d = new RemoteTransportDiagnostics(() => now);
  now = 10; d.written("data_channel", 1);
  now = 20; d.written("data_channel", 2);
  now = 30; d.observe({ dc_input_seq: 2, input_completed_seq: 0, input_injected_seq: 1 });
  let s = d.snapshot(scheduler, 0);
  assert.equal(s.dc_credit_basis, 2); assert.equal(s.input_completed_seq, 0);
  assert.equal(s.dc_pending_tracked_count, 2); assert.equal(s.dc_enqueued_count, 2);
  assert.equal(s.dc_enqueued_sum_ms, 30); assert.equal(s.dc_completed_count, 0);
  now = 50; d.observe({ input_completed_seq: 2 });
  s = d.snapshot(scheduler, 0);
  assert.equal(s.dc_pending_tracked_count, 0); assert.equal(s.dc_completed_count, 2);
  assert.equal(s.dc_completed_sum_ms, 70); assert.equal(s.input_injected_seq, 1);
  d.observe({ input_completed_seq: 1 }); d.observe({ dc_input_seq: 1 });
  assert.equal(d.snapshot(scheduler, 0).input_completed_seq, 2);
  assert.equal(d.snapshot(scheduler, 0).dc_credit_basis, 2);
  numeric(s);
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
  now += 100; d.written("websocket", 1001);
  d.control({ seq: 1001, stage: "accepted", elapsedMs: 12 });
  const next = d.snapshot(scheduler, 0);
  assert.equal(next.interval_ms, 100); assert.equal(next.dc_write_count, 0);
  assert.equal(next.ws_write_count, 1); assert.equal(next.ws_accepted_max_ms, 12);
  d.dispose(); assert.equal(d.snapshot(scheduler, 0).dc_pending_tracked_count, 0);
});

test("legacy enqueue samples remain explicitly weaker than completion and scheduler reads do not pump", () => {
  const d = new RemoteTransportDiagnostics(() => 0);
  d.written("data_channel", 3); d.observe({ dc_input_seq: 3 });
  const s = d.snapshot(scheduler, 0);
  assert.equal(s.dc_credit_basis, 1); assert.equal(s.input_completed_seq, undefined);
  assert.equal(s.dc_enqueued_count, 1); assert.equal(s.dc_completed_count, 0);
  let writes = 0;
  const input = new RemoteInputScheduler({ now: () => 0, write() { writes++; return false; }, congestion() {}, failure() {} });
  input.enqueue({ kind: "pointer_down", x: 0, y: 0 });
  input.enqueue({ kind: "move", x: .2, y: .2 });
  input.enqueue({ kind: "type", text: "never record this" });
  const before = writes, snapshot = input.diagnostics();
  assert.equal(snapshot.queued_count, 3); assert.equal(snapshot.queued_soft_count, 1);
  assert.deepEqual(input.diagnostics(), snapshot); assert.equal(writes, before);
  assert.doesNotMatch(JSON.stringify(snapshot), /never record|pointer_down|text/);
  input.dispose();
});

const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, location: { href: "https://example.test" } };
const api = await import(await compileModule("src/api/remote-desktop.ts", {
  "../lib/auth/client": dataModule('export async function accessToken(){return "private-user-token";}'),
  "../lib/auth/config": dataModule('export const GATEWAY_BASE="https://example.test";'),
}));

test("real stream exposes numeric snapshots without input changes or raw state credentials", async () => {
  class Socket {
    static OPEN = 1; static latest; readyState = 1; bufferedAmount = 12; sent = [];
    constructor() { Socket.latest = this; }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    message(value) { this.onmessage({ data: JSON.stringify(value) }); }
  }
  globalThis.WebSocket = Socket;
  const observed = [];
  const opening = api.remoteDesktopClient.openStream("private-device", "private-session", {
    state() {}, frame() {}, error() {}, diagnostics(value) { observed.push(value); throw Error("observer failure"); },
    inputDiagnostics(value) { numeric(value); throw Error("observer failure"); },
  });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = Socket.latest; socket.onopen(); socket.message({ type: "state", state: "active", acked_seq: 0 });
  const stream = (await opening).data;
  try {
    assert.equal(stream.send({ kind: "type", text: "private-input" }), true);
    socket.message({ type: "input_ack", seq: 1 });
    socket.message({ type: "state", state: "active", acked_seq: 1,
      input_diagnostics: { input_completed_seq: 0, input_queue_depth: 2, token: "private-media-token" } });
    const snapshot = stream.diagnostics(); numeric(snapshot);
    assert.equal(snapshot.ws_write_count, 1); assert.equal(snapshot.ws_accepted_count, 1);
    assert.equal(snapshot.input_completed_seq, 0); assert.equal(snapshot.ws_buffered_bytes, 12);
    assert.equal(socket.sent.filter((value) => value.type === "input").length, 1);
    assert.doesNotMatch(JSON.stringify(snapshot), /private|token|session|device|text/);
  } finally { assert.doesNotThrow(() => stream.close()); }
  assert.ok(observed.length);
  const status = api.parseRemoteMediaStatus({ state: "publishing", metrics: { version: 1, input_completed_seq: 0,
    input_injected_seq: 2, input_queue_depth: 4, input_inject_us: 123, first_packet_sent_ms: 0, input_error_count: true, input_queue_oldest_ms: -1 } });
  assert.deepEqual(status.metrics, { version: 1, input_queue_depth: 4, input_inject_us: 123, input_completed_seq: 0, input_injected_seq: 2, first_packet_sent_ms: 0 });
  assert.equal(api.parseRemoteMediaStatus({ state: "publishing", metrics: { version: 1, first_packet_sent_ms: null } }).metrics.first_packet_sent_ms, undefined);
});

function mediaHarness(t, pendingStats = false) {
  const events = new Map(), milestones = [], snapshots = [], calls = [];
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
  const engine = { on(name, fn) { events.set(name, fn); }, off(name) { events.delete(name); },
    setChannelProfile() {}, setClientRole() {}, setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
    publishLocalAudioStream() {}, publishLocalVideoStream() {}, publishLocalScreenShareStream() {},
    joinChannel() { calls.push("join"); return new Peer().setRemoteDescription(); }, leaveChannel() { calls.push("leave"); }, destroy() { calls.push("destroy"); },
    refreshAuthInfo() {}, setRemoteViewConfig() {}, getOnlineRemoteUsers: () => [], bizControl: { updateScreenWant() {} } };
  const credentials = { token: "private-media-token", publisher_id: "private-publisher", user_id: "private-viewer", channel_id: "private-channel", expires_at: new Date(Date.now() + 120000).toISOString() };
  const abort = new AbortController();
  return { milestones, snapshots, calls, abort, video, frame() { video.videoWidth = 100; video.videoHeight = 100; video.readyState = 2; frame(); },
    start: () => openRemoteMedia(credentials, video, { state() {}, frame() {}, renew: async () => credentials,
      timing(value) { milestones.push(value); }, diagnostics(value) { snapshots.push(value); } }, abort.signal, async () => ({ createEngine: () => engine })) };
}

test("media milestones expose load/prepare/join/frame/cleanup on one monotonic clock", async (t) => {
  const h = mediaHarness(t); const viewer = await h.start();
  h.frame();
  const value = h.milestones.at(-1); numeric(value);
  for (const key of ["media_open_ms", "sdk_load_started_ms", "sdk_loaded_ms", "engine_created_ms", "prepare_started_ms", "prepared_ms", "publish_disabled_ms", "join_started_ms", "joined_ms", "synthetic_skipped_ms", "first_decoded_frame_ms"]) assert.equal(typeof value[key], "number", key);
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

test("media diagnostics measure concurrent pending stats without changing baseline overlap or watchdog policy", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.now() });
  const h = mediaHarness(t, true), viewer = await h.start();
  void viewer.stats(); void viewer.stats();
  t.mock.timers.tick(1000);
  const snapshot = viewer.diagnostics(); numeric(snapshot);
  assert.equal(snapshot.stats_inflight_count, 3); assert.equal(snapshot.stats_inflight_high_water, 3);
  assert.equal(snapshot.stats_calls_total, 3); assert.equal(snapshot.recorded_peer_count, 1);
  t.mock.timers.tick(1000);
  assert.equal(viewer.diagnostics().stats_calls_total, 3, "watchdog still single-flights; explicit quality calls above remain separate");
  await viewer.close();
});
