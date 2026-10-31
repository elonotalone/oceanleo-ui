import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";
import { mountStream } from "./helpers/remote-desktop-stream-view.mjs";

const q = await import(await compileModule("src/api/remote-desktop-quality.ts"));
const ENV = { browser: "chrome", platform: "macos", site: "global" };

function hubWith(now, sent) {
  const hub = new q.RemoteDesktopQualityHub(() => now.t, () => ENV);
  return hub;
}

function fakeClient(now, sent, extra = {}) {
  let handlers;
  const stream = { send() { return true; }, inputPath: () => stream.lane, lane: "websocket", close() {}, acknowledgeFrame() {}, releaseForHandoff: () => Promise.resolve(), finishHandoff() {} };
  const client = {
    async createSession() { now.t += 100; return { ok: true, data: { session_id: "s".repeat(24), state: "pending_consent", expires_at: "", transport: "websocket-v2" } }; },
    async openStream(_d, _s, h) { handlers = h; now.t += 50; return { ok: true, data: stream }; },
    async negotiateMedia() { now.t += 200; return { ok: true, data: { media: {}, media_status: null } }; },
    async getFrame() { return { ok: true, data: { state: "active", frame: null } }; },
    async sendInput() { return { ok: true }; },
    async closeSession() { return { ok: true, data: { closed: true } }; },
    async reportQuality(report) { sent.push(report); return { ok: true, data: { stored: true } }; },
    ...extra,
  };
  return { client, stream, handlers: () => handlers };
}

test("one report per session: click-relative steps, consent excluded separately, lanes, media sink, renewals", async () => {
  const now = { t: 1000 }, sent = [];
  const hub = hubWith(now);
  const { client, stream, handlers } = fakeClient(now, sent);
  const wrapped = hub.wrap(client);
  hub.begin({ at: 900, attempt: 0 });
  const created = await wrapped.createSession("dev-1");
  assert.equal(created.data.session_id, "s".repeat(24));
  const opened = await wrapped.openStream("dev-1", created.data.session_id, { state() {}, frame() {}, error() {} });
  handlers().state("pending_consent");
  now.t += 3000; // person at the computer clicks 同意本次
  handlers().state("active");
  handlers().controlTiming({ seq: 1, stage: "accepted", elapsedMs: 40 });
  handlers().controlTiming({ seq: 1, stage: "completion_watermark", elapsedMs: 90 });
  opened.data.send({ kind: "click", x: 0.5, y: 0.5 });
  stream.lane = "data_channel";
  opened.data.send({ kind: "move", x: 0.5, y: 0.5 });
  opened.data.send({ kind: "move", x: 0.6, y: 0.5 });
  await wrapped.negotiateMedia("dev-1", created.data.session_id);
  const sink = wrapped.mediaQuality(created.data.session_id);
  now.t += 300; sink.mediaState("joining"); sink.mediaState("waiting_frame");
  now.t += 400; sink.frame(); sink.mediaState("playing");
  sink.mediaState("reconnecting"); sink.mediaState("playing");
  await wrapped.negotiateMedia("dev-1", created.data.session_id); // token renewal
  sink.stats({ fps: 30, framesDecoded: 100, packetsLost: 1, nackCount: 2, rttMs: 50, codec: "video/H264", width: 1920, height: 1080, relay: false });
  sink.stats({ fps: 24, framesDecoded: 160, packetsLost: 3, nackCount: 5, rttMs: 70 });
  now.t += 60_000;
  assert.equal(sent.length, 0, "nothing leaves before the session ends");
  await wrapped.closeSession("dev-1", created.data.session_id);
  await wrapped.closeSession("dev-1", created.data.session_id);
  assert.equal(sent.length, 1, "sent exactly once");
  const [r] = sent;
  assert.equal(r.v, 1);
  assert.equal(r.device_id, "dev-1");
  assert.equal(r.session_id, "s".repeat(24));
  assert.equal(r.media, "artc");
  assert.equal(r.transport, "websocket-v2");
  assert.equal(r.end_reason, "viewer_closed");
  assert.deepEqual(r.steps, { create_ms: 200, consent_ms: 3050, stream_open_ms: 250, active_ms: 3250, media_negotiate_ms: 3450, artc_join_ms: 3750, first_frame_ms: 4150 });
  assert.equal(r.reconnects, 1);
  assert.equal(r.media_renewals, 1);
  assert.deepEqual(r.input, { ws_count: 1, dc_count: 2, accepted: { n: 1, p50: 40, p90: 40, p99: 40, max: 40 }, executed: { n: 1, p50: 90, p90: 90, p99: 90, max: 90 } });
  assert.equal(r.video.frames_decoded, 160);
  assert.equal(r.video.packets_lost, 3);
  assert.equal(r.video.nack, 5);
  assert.equal(r.video.codec, "h264");
  assert.equal(r.video.fps_p50, 24);
  assert.equal(r.video.rtt_p90_ms, 70);
  assert.equal(r.video.relay, false);
  assert.deepEqual(r.env, ENV);
  assert.equal(wrapped.mediaQuality(created.data.session_id), null, "finished sessions take no more samples");
});

test("privacy: report carries only numbers, enums and fixed codes", async () => {
  const now = { t: 0 }, sent = [];
  const hub = hubWith(now);
  const { client, handlers } = fakeClient(now, sent);
  const wrapped = hub.wrap(client);
  hub.begin({ at: 0 });
  const created = await wrapped.createSession("dev-1");
  await wrapped.openStream("dev-1", created.data.session_id, { state() {}, frame() {}, error() {} });
  handlers().error("Device \"Alice's MacBook\" not found at C:\\Users\\alice");
  await wrapped.closeSession("dev-1", created.data.session_id);
  const [r] = sent;
  assert.match(r.end_reason, /^[a-z0-9_]{1,64}$/);
  const text = JSON.stringify(r);
  assert.doesNotMatch(text, /Alice|Users|MacBook/);
  for (const key of ["user_agent", "ip", "device_name", "label", "token"]) assert.ok(!text.includes(`"${key}"`));
});

test("failed request is reported without a session; aborted is not reported", async () => {
  const now = { t: 0 }, sent = [];
  const hub = hubWith(now);
  const { client } = fakeClient(now, sent, { async createSession() { now.t += 80; return { ok: false, error: "remote_desktop_other_gateway", status: 409 }; } });
  const wrapped = hub.wrap(client);
  hub.begin({ at: 0, attempt: 1 });
  await wrapped.createSession("dev-1");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].end_reason, "remote_desktop_other_gateway");
  assert.equal(sent[0].attempt, 1);
  assert.equal(sent[0].session_id, undefined);
  assert.deepEqual(sent[0].steps, { create_ms: 80 });
  const { client: aborted } = fakeClient(now, sent, { async createSession() { return { ok: false, error: "aborted" }; } });
  await hub.wrap(aborted).createSession("dev-1");
  assert.equal(sent.length, 1);
});

test("first terminal code wins; gateway close reason and media errors are codes; pagehide is page_hidden", async () => {
  const now = { t: 0 }, sent = [];
  const hub = hubWith(now);
  const { client, handlers } = fakeClient(now, sent);
  const wrapped = hub.wrap(client);
  const created = await wrapped.createSession("dev-1");
  await wrapped.openStream("dev-1", created.data.session_id, { state() {}, frame() {}, error() {} });
  handlers().state("closed", "device_lost");
  handlers().error("network_error");
  await wrapped.closeSession("dev-1", created.data.session_id);
  assert.equal(sent[0].end_reason, "device_lost");
  assert.equal(q.qualityCode("HTTP 503"), "http_503");
  assert.equal(q.qualityCode(undefined), "unknown");
  const collector = new q.RemoteDesktopQualityCollector({ deviceId: "d", origin: 0, attempt: 0, now: () => 5, env: ENV, send: (r) => sent.push(r), hidden: () => true });
  collector.finish();
  assert.equal(sent.at(-1).end_reason, "page_hidden");
  assert.equal(sent.at(-1).media, "none");
});

test("legacy (no video lane) first frame comes from the WebSocket frames", async () => {
  const now = { t: 0 }, sent = [];
  const hub = hubWith(now);
  const { client, handlers } = fakeClient(now, sent, { negotiateMedia: undefined });
  delete client.negotiateMedia;
  const wrapped = hub.wrap(client);
  assert.equal(wrapped.negotiateMedia, undefined, "optional methods stay optional");
  const created = await wrapped.createSession("dev-1");
  await wrapped.openStream("dev-1", created.data.session_id, { state() {}, frame() {}, error() {} });
  handlers().state("active");
  now.t += 700;
  handlers().frame({ image: "blob:x", width: 1, height: 1, sequence: 1 });
  await wrapped.closeSession("dev-1", created.data.session_id);
  assert.equal(sent[0].media, "legacy");
  assert.equal(sent[0].steps.first_frame_ms, 850);
});

test("getStats parsing: selected pair RTT, relay, codec; counters survive a receiver reset", () => {
  const report = new Map([
    ["in", { id: "in", type: "inbound-rtp", kind: "video", framesPerSecond: 29, framesDecoded: 500, packetsLost: 4, nackCount: 7, pliCount: 1, freezeCount: 2, totalFreezesDuration: 1.5, jitterBufferDelay: 10, jitterBufferEmittedCount: 250, frameWidth: 2560, frameHeight: 1440, codecId: "c" }],
    ["c", { id: "c", type: "codec", mimeType: "video/VP9" }],
    ["t", { id: "t", type: "transport", selectedCandidatePairId: "p" }],
    ["p", { id: "p", type: "candidate-pair", currentRoundTripTime: 0.081, localCandidateId: "l" }],
    ["l", { id: "l", type: "local-candidate", candidateType: "relay", address: "10.0.0.1" }],
  ]);
  const sample = q.videoStatSample([report]);
  assert.equal(sample.rttMs, 81);
  assert.equal(sample.relay, true);
  assert.equal(sample.codec, "video/VP9");
  assert.equal(JSON.stringify(sample).includes("10.0.0.1"), false, "no candidate address leaves");
  assert.equal(q.videoStatSample([new Map([["a", { type: "outbound-rtp", kind: "video" }]])]), null);
  const summary = q.summarizeVideoStats([sample, { ...sample, framesDecoded: 800, freezeCount: 3 }, { framesDecoded: 100, freezeCount: 0 }]);
  assert.equal(summary.frames_decoded, 900, "reset receiver adds its own count");
  assert.equal(summary.freeze_count, 3);
  assert.equal(summary.jitter_buffer_ms_avg, 40);
  assert.equal(summary.codec, "vp9");
  assert.equal(summary.freeze_ms, 1500);
});

test("coarse environment families only", () => {
  assert.deepEqual(q.qualityEnvironment("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0", "www.oceanleo.cn", false), { browser: "edge", platform: "windows", site: "cn" });
  assert.deepEqual(q.qualityEnvironment("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", "oceanbizs.com", false), { browser: "safari", platform: "macos", site: "oceanbizs" });
  assert.deepEqual(q.qualityEnvironment("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130", "oceanleo.com", false), { browser: "chrome", platform: "ios", site: "global" });
  assert.deepEqual(q.qualityEnvironment("anything", "evil-oceanleo.com", true), { browser: "oceanleo_app", platform: "other", site: "other" });
  assert.deepEqual(q.qualityEnvironment("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "localhost", false), { browser: "firefox", platform: "linux", site: "dev" });
  assert.equal(q.percentiles([]), undefined);
  assert.deepEqual(q.percentiles([5, 1, 3, 2, 4, 9_999_999]), { n: 6, p50: 3, p90: 600000, p99: 600000, max: 600000 });
});

const mounted = [];
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); });

test("panel: a real session reports once on exit with its session id and the client's own reporter", async () => {
  const reports = [];
  const view = await mountStream({ overrides: { async reportQuality(report) { reports.push(report); return { ok: true }; } } });
  mounted.push(view);
  assert.equal(reports.length, 0);
  await view.unmount();
  assert.equal(reports.length, 1);
  const [r] = reports;
  assert.equal(r.session_id, "session-stream");
  assert.equal(r.device_id, "d-1");
  assert.equal(r.transport, "websocket-v2");
  assert.equal(r.media, "legacy");
  assert.equal(typeof r.steps.create_ms, "number");
  assert.equal(typeof r.steps.first_frame_ms, "number");
  assert.match(r.end_reason, /^(viewer_closed|page_hidden)$/);
  assert.deepEqual(view.log.closes, ["session-stream"], "close path unchanged");
});
