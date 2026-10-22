import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { acceptMediaStreamIfCurrent, applyForCurrentSession, dispatchForCurrentCallSocket, floatToPcm16LE, flushPlaybackQueue, isCurrentCallAttempt, isCurrentCallSocket, pcm16LEToFloat, pcmSamplesPerFrame, shouldRefreshRealtimeBill, stopMediaStreams, videoFrameEnvelope } from "../src/lib/realtime-audio.ts";
import { appendFinalUserTranscript, upsertFinalAssistantTranscript } from "../src/lib/realtime-transcript.ts";
import { callStatusLabel, formatConnectedTime, tokenUsageRows } from "../src/lib/call-billing-display.ts";
// 人际通话（calls-v2）：旧「会话会议」的 artc-client / meeting-admission / meetings-api / 邀请与面板状态已删除（A20）；
// 与 Leo 实时通话的互斥迁到通话引擎 engine/mutex.ts，旧路径 meeting/meeting-host-state.ts 只做再导出。
import { claimCall, releaseCall, activeCallOwner } from "../src/shell/messages/call/engine/mutex.ts";
import * as legacyMutex from "../src/shell/messages/meeting/meeting-host-state.ts";
import { createLeoRealtimeSession, realtimeSessionRequestBody, realtimeSocket, takeRealtimeMessages } from "../src/lib/leo-realtime.ts";

test("realtime PCM uses signed little-endian 16 bit mono frames at provider input rates", () => {
  const encoded = floatToPcm16LE(new Float32Array([-1, -0.5, 0, 0.5, 1]));
  assert.deepEqual(Array.from(encoded), [0, 128, 0, 192, 0, 0, 255, 63, 255, 127]);
  const decoded = pcm16LEToFloat(encoded);
  assert.equal(decoded.length, 5);
  assert.ok(Math.abs(decoded[1] + 0.5) < 0.001);
  assert.ok(Math.abs(decoded[3] - 0.5) < 0.001);
  assert.equal(pcmSamplesPerFrame(16_000, 20), 320);
  assert.equal(pcmSamplesPerFrame(24_000, 20), 480);
  assert.throws(() => pcmSamplesPerFrame(24_000, 250), /invalid_pcm_frame_shape/);
});

test("speech interruption stops and disconnects all queued audio and resets the playback cursor", () => {
  const calls = [];
  const queue = [1, 2, 3].map((id) => ({
    stop() { calls.push(`stop-${id}`); if (id === 2) throw new Error("already stopped"); },
    disconnect() { calls.push(`disconnect-${id}`); },
  }));
  let cursor = -1;
  flushPlaybackQueue(queue, 12.5, (value) => { cursor = value; });
  assert.deepEqual(calls, ["stop-1", "disconnect-1", "stop-2", "disconnect-2", "stop-3", "disconnect-3"]);
  assert.deepEqual(queue, []);
  assert.equal(cursor, 12.5);
});

test("late failed realtime attempt cannot clean up resources owned by a newer start", async () => {
  let settleA;
  let currentAttempt = 1;
  let cleanupCount = 0;
  const attemptA = new Promise((resolve) => { settleA = resolve; }).then(() => {
    if (isCurrentCallAttempt(1, currentAttempt)) cleanupCount += 1;
  });
  currentAttempt = 2; // cancel A, start B before A's await/catch settles
  settleA();
  await attemptA;
  assert.equal(cleanupCount, 0);
  assert.equal(isCurrentCallAttempt(2, currentAttempt), true);
});

test("late socket close from attempt A cannot end attempt B", async () => {
  let deliverCloseA;
  let attempt = 1;
  let activeSocket = { name: "A" };
  let endCallCount = 0;
  const pendingClose = new Promise((resolve) => { deliverCloseA = resolve; }).then(() => {
    if (isCurrentCallSocket(1, attempt, socketA, activeSocket)) endCallCount += 1;
  });
  const socketA = activeSocket;
  attempt = 2;
  activeSocket = { name: "B" };
  deliverCloseA();
  await pendingClose;
  assert.equal(endCallCount, 0);
  assert.equal(isCurrentCallSocket(2, attempt, activeSocket, activeSocket), true);
});

test("late queued websocket messages from attempt A cannot mutate attempt B", async () => {
  let deliverMessageA;
  let attempt = 1;
  let socket = { name: "A" };
  const accepted = [];
  const pendingA = new Promise((resolve) => { deliverMessageA = resolve; }).then((data) => {
    dispatchForCurrentCallSocket(1, attempt, socketA, socket, () => accepted.push(data));
  });
  const socketA = socket;
  attempt = 2;
  socket = { name: "B" };
  deliverMessageA({ type: "session.closed" });
  await pendingA;
  assert.deepEqual(accepted, []);
  assert.equal(dispatchForCurrentCallSocket(2, attempt, socket, socket, () => accepted.push("B event")), true);
  assert.deepEqual(accepted, ["B event"]);
});

test("late bill response from session A cannot overwrite the receipt for session B", async () => {
  let resolveA;
  let currentSessionId = "A";
  let displayed = null;
  const billA = new Promise((resolve) => { resolveA = resolve; }).then((result) => {
    applyForCurrentSession("A", currentSessionId, result, (value) => { displayed = value; });
  });
  currentSessionId = "B";
  resolveA({ session_id: "A", net: 0.01 });
  await billA;
  assert.equal(displayed, null);
  assert.equal(applyForCurrentSession("B", currentSessionId, { session_id: "B", net: 0.02 }, (value) => { displayed = value; }), true);
  assert.deepEqual(displayed, { session_id: "B", net: 0.02 });
});

test("call claims are generation-owned and old release cannot unlock a remounted same-owner call", () => {
  releaseCall("meeting", 0);
  const attemptA = claimCall("meeting");
  assert.equal(typeof attemptA, "number");
  releaseCall("meeting", attemptA);
  const attemptB = claimCall("meeting");
  assert.notEqual(attemptA, attemptB);
  releaseCall("meeting", attemptA);
  assert.equal(activeCallOwner(), "meeting");
  assert.equal(claimCall("leo-realtime"), null);
  releaseCall("meeting", attemptB);
  assert.equal(activeCallOwner(), null);
});

test("billing summaries distinguish confirmed charges from held reserves and describe token counts", () => {
  assert.equal(formatConnectedTime(61), "1 分 1 秒");
  assert.match(callStatusLabel("active"), /预留而非最终扣款/);
  assert.match(callStatusLabel("closed", true), /待服务端核对/);
  assert.deepEqual(tokenUsageRows({ usage: { input_tokens: 17, audio_output_tokens: 4 } }), [
    { label: "输入 token", value: 17 }, { label: "音频输出 token", value: 4 },
  ]);
});

test("person-to-person call client carries no balance, receipt or invitation surface (A18/A20)", async () => {
  const api = await readFile(new URL("../src/lib/im/calls-api.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../src/shell/messages/call/engine/controller.ts", import.meta.url), "utf8");
  for (const source of [api, engine]) {
    assert.doesNotMatch(source, /余额|扣费|资费|计费|receipt|wallet|reserve/i);
    assert.doesNotMatch(source, /invitation|invite/i, "joining no longer depends on an invitation");
  }
  assert.doesNotMatch(api, /\/meetings\//, "the new client only uses the /calls routes");
});

test("final provider transcripts refresh canonical Leo history without duplicating streamed assistant text", () => {
  assert.deepEqual(appendFinalUserTranscript(["old"], "hello"), ["old", "我：hello"]);
  assert.deepEqual(upsertFinalAssistantTranscript(["我：hello", "Leo：Hello"], "Hello"), ["我：hello", "Leo：Hello"]);
  assert.deepEqual(upsertFinalAssistantTranscript(["我：hello"], "Hi"), ["我：hello", "Leo：Hi"]);
  assert.equal(shouldRefreshRealtimeBill(10_000, 24_999), false);
  assert.equal(shouldRefreshRealtimeBill(10_000, 25_000), true);
});

test("remote video subscriptions use the declared SDK argument order: (uid, track, subVideo, subAudio)", async () => {
  const { applyRemoteVideoWant, VIDEO_TRACK } = await import("../src/shell/messages/call/engine/sdk.ts");
  const calls = [];
  const engine = { subscribeRemoteMediaStream(uid, track, subVideo, subAudio) { calls.push([uid, track, subVideo, subAudio]); } };
  applyRemoteVideoWant(engine, "u1", { camera: false, screen: false }, { camera: true, screen: false });
  applyRemoteVideoWant(engine, "u1", { camera: true, screen: false }, { camera: true, screen: true });
  applyRemoteVideoWant(engine, "u1", { camera: true, screen: true }, { camera: false, screen: false });
  assert.deepEqual(calls, [
    ["u1", VIDEO_TRACK.camera, true, true],
    ["u1", VIDEO_TRACK.both, true, true],
    ["u1", VIDEO_TRACK.none, false, true],
  ], "audio stays subscribed (4th argument) whatever the video want is");
});

test("camera and screen frame envelopes stay separately labeled, and cleanup stops every local track", () => {
  assert.deepEqual(videoFrameEnvelope("camera", "jpeg-camera"), {
    type: "video.frame", source: "camera", mime_type: "image/jpeg", data: "jpeg-camera",
  });
  assert.deepEqual(videoFrameEnvelope("screen", "jpeg-screen"), {
    type: "video.frame", source: "screen", mime_type: "image/jpeg", data: "jpeg-screen",
  });
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push("mic") }, { stop: () => stopped.push("camera") }] };
  stopMediaStreams([stream, null]);
  assert.deepEqual(stopped, ["mic", "camera"]);
});

test("late media permission results after hangup stop the acquired stream instead of repopulating call state", async () => {
  let finishPermission;
  let current = true;
  const stopped = [];
  const pending = acceptMediaStreamIfCurrent(new Promise((resolve) => { finishPermission = resolve; }), () => current);
  current = false;
  finishPermission({ getTracks: () => [{ stop() { stopped.push("track"); } }] });
  assert.equal(await pending, null);
  assert.deepEqual(stopped, ["track"]);
});

test("Leo realtime requests carry only owner session id and bounded typed page context", () => {
  assert.deepEqual(realtimeSessionRequestBody("app-session-id", {
    page: "task", task_id: "task-1", computer_id: "computer-1",
  }), {
    session_id: "app-session-id",
    context: { page: "task", task_id: "task-1", computer_id: "computer-1" },
  });
});

test("session POST preserves owner context and returns only the ready server session", async () => {
  const requests = [];
  const created = {
    session_id: "server-realtime-id", ready: true, edition: "global", provider: "configured",
    audio: { codec: "pcm_s16le", input_sample_rate_hz: 24_000, output_sample_rate_hz: 24_000, channels: 1, max_chunk_ms: 200 },
    stream_path: "/v1/leo/realtime/sessions/server-realtime-id/stream",
    bill: { currency: "USD", admitted: true },
  };
  const result = await createLeoRealtimeSession("app-session-id", { page: "home" }, undefined, {
    getToken: async () => "supabase-token",
    gatewayBase: "https://api.oceanleo.com",
    async fetch(url, init) {
      requests.push({ url, init });
      return { ok: true, async json() { return created; } };
    },
  });
  assert.equal(result.session_id, "server-realtime-id");
  assert.equal(requests[0].url, "https://api.oceanleo.com/v1/leo/realtime/sessions");
  assert.equal(requests[0].init.headers.Authorization, "Bearer supabase-token");
  assert.deepEqual(JSON.parse(requests[0].init.body), { session_id: "app-session-id", context: { page: "home" } });
  assert.equal(requests[0].init.body.includes("provider-key"), false);
});

test("realtime socket authenticates in its first frame and waits for provider-ready", async () => {
  const sends = [];
  let socket;
  class FakeSocket {
    readyState = 1;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor(url) { this.url = url; }
    send(value) { sends.push(value); }
    close(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  const connected = realtimeSocket({
    stream_path: "/v1/leo/realtime/sessions/server-id/stream",
  }, undefined, {
    getToken: async () => "access-token",
    gatewayBase: "https://api.oceanleo.com",
    createSocket(url) { socket = new FakeSocket(url); return socket; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  socket.onopen();
  assert.deepEqual(JSON.parse(sends[0]), { type: "auth", token: "access-token" });
  assert.equal(socket.url, "wss://api.oceanleo.com/v1/leo/realtime/sessions/server-id/stream");
  let settled = false;
  void connected.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "network open alone must not mean the provider session is ready");
  socket.onmessage({ data: JSON.stringify({ type: "session.ready" }) });
  const readySocket = await connected;
  assert.equal(readySocket, socket);
  assert.deepEqual(takeRealtimeMessages(socket), [JSON.stringify({ type: "session.ready" })]);
});

test("aborting a session-ready wait closes the pending socket and rejects as cancellation", async () => {
  let socket;
  const controller = new AbortController();
  class FakeSocket {
    readyState = 1;
    onopen = null;
    onmessage = null;
    onclose = null;
    onerror = null;
    constructor() { socket = this; }
    send() {}
    close(code, reason) { this.readyState = 3; this.onclose?.({ code, reason }); }
  }
  const pending = realtimeSocket({ stream_path: "/v1/leo/realtime/sessions/server-id/stream" }, controller.signal, {
    getToken: async () => "access-token",
    gatewayBase: "https://api.oceanleo.com",
    createSocket: () => new FakeSocket(),
  });
  await new Promise((resolve) => setImmediate(resolve));
  socket.onopen();
  controller.abort();
  await assert.rejects(pending, /call_cancelled/);
  assert.equal(socket.readyState, 3);
});

test("Leo realtime and person-to-person calls stay mutually exclusive through one shared claim (A20)", () => {
  assert.equal(legacyMutex.claimCall, claimCall, "the legacy path re-exports the engine mutex, so there is only one lock");
  assert.equal(legacyMutex.releaseCall, releaseCall);
  releaseCall("meeting", 0);
  releaseCall("leo-realtime", 0);
  const meetingClaim = claimCall("meeting");
  assert.equal(typeof meetingClaim, "number");
  assert.equal(activeCallOwner(), "meeting");
  assert.equal(claimCall("leo-realtime"), null, "a second entry point cannot start a concurrent call");
  releaseCall("leo-realtime", meetingClaim);
  assert.equal(activeCallOwner(), "meeting", "a non-owner cannot release the active call");
  releaseCall("meeting", meetingClaim);
  const leoClaim = claimCall("leo-realtime");
  assert.equal(typeof leoClaim, "number", "a different call may start after release");
  assert.equal(claimCall("meeting"), null, "a person-to-person call cannot start during a Leo realtime call");
  releaseCall("leo-realtime", leoClaim);
  assert.equal(activeCallOwner(), null);
});
