import test from "node:test";
import assert from "node:assert/strict";
import { acceptMediaStreamIfCurrent, floatToPcm16LE, flushPlaybackQueue, isCurrentCallAttempt, pcm16LEToFloat, pcmSamplesPerFrame, shouldRefreshRealtimeBill, stopMediaStreams, videoFrameEnvelope } from "../src/lib/realtime-audio.ts";
import { appendFinalUserTranscript, upsertFinalAssistantTranscript } from "../src/lib/realtime-transcript.ts";
import { callStatusLabel, formatConnectedTime, tokenUsageRows } from "../src/lib/call-billing-display.ts";
import { createArtcClient } from "../src/shell/messages/meeting/artc-client.ts";
import { meetingHostRequestSnapshot, openMeeting, closeMeeting, claimCall, releaseCall, activeCallOwner, createMeetingInvitationHandler } from "../src/shell/messages/meeting/meeting-host-state.ts";
import { admitMeetingClient } from "../src/shell/messages/meeting/meeting-admission.ts";
import { normalizeMeetingBillResponse } from "../src/lib/im/meetings-api.ts";
import { createLeoRealtimeSession, realtimeSessionRequestBody, realtimeSocket, takeRealtimeMessages } from "../src/lib/leo-realtime.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

test("meeting leave/end response normalizes the server bill field to the UI receipt field", () => {
  const bill = { meeting_id: "m1", participant_id: "p1", currency: "CNY", raw_usage: {}, gross: 0, discount: 0, net: 0, status: "closed" };
  assert.equal(normalizeMeetingBillResponse({ ok: true, bill }).billing, bill);
  assert.equal(normalizeMeetingBillResponse({ ok: true, billing: bill }).billing, bill);
});

test("final provider transcripts refresh canonical Leo history without duplicating streamed assistant text", () => {
  assert.deepEqual(appendFinalUserTranscript(["old"], "hello"), ["old", "我：hello"]);
  assert.deepEqual(upsertFinalAssistantTranscript(["我：hello", "Leo：Hello"], "Hello"), ["我：hello", "Leo：Hello"]);
  assert.deepEqual(upsertFinalAssistantTranscript(["我：hello"], "Hi"), ["我：hello", "Leo：Hi"]);
  assert.equal(shouldRefreshRealtimeBill(10_000, 24_999), false);
  assert.equal(shouldRefreshRealtimeBill(10_000, 25_000), true);
});

test("ARTC media subscriptions preserve the other modality and async failures do not publish false state", async () => {
  const calls = [];
  const deviceCalls = [];
  let releaseDevice;
  let failNext = false;
  const engine = {
    setDefaultSubscribeAllRemoteAudioStreams() {},
    setDefaultSubscribeAllRemoteVideoStreams() {},
    publishLocalAudioStream(enabled) { deviceCalls.push(["microphone", enabled]); return new Promise((resolve) => { releaseDevice = resolve; }); },
    publishLocalVideoStream(enabled) { deviceCalls.push(["camera", enabled]); },
    publishLocalScreenShareStream(enabled) { deviceCalls.push(["screen", enabled]); },
    async switchMicrophone(deviceId) { deviceCalls.push(["switch-microphone", deviceId]); },
    async switchCamera(deviceId) { deviceCalls.push(["switch-camera", deviceId]); },
    setChannelProfile() {},
    async joinChannel() {},
    async leaveChannel() {},
    destroy() {},
    on() {},
    async subscribeRemoteMediaStream(userId, track, audio, video) {
      calls.push({ userId, track, audio, video });
      if (failNext) { failNext = false; throw new Error("sdk rejected subscription"); }
    },
    setRemoteViewConfig() {},
    setLocalViewConfig() {},
    async startPreview() {},
    async stopPreview() {},
  };
  globalThis.window = { AliRtcEngine: {
    async isSupported() { return { support: true }; },
    getInstance() { return engine; },
    async getMicrophoneList() { return [{ deviceId: "mic-1", label: "Mic 1" }]; },
    async getCameraList() { return [{ deviceId: "camera-1", label: "Camera 1" }]; },
    AliRtcVideoTrack: { AliRtcVideoTrackBoth: 1 },
  } };
  try {
    const client = await createArtcClient({
      app_id: "app", token: "provider-token", channel_id: "room", user_id: "member",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      meeting: { meeting_id: "m", conversation_id: "c", edition: "global", channel_id: "room", status: "active", created_by: "u", created_at: "", ended_at: null, participants: [] },
    }, "name");
    deviceCalls.length = 0;
    let microphoneSettled = false;
    const microphoneSwitch = client.setMicrophone(true).then(() => { microphoneSettled = true; });
    await Promise.resolve();
    assert.equal(microphoneSettled, false, "local control must await the SDK promise");
    assert.deepEqual(deviceCalls[0], ["microphone", true]);
    releaseDevice();
    await microphoneSwitch;
    await client.setCamera(true);
    await client.setScreenShare(true);
    assert.deepEqual(deviceCalls.slice(1), [["camera", true], ["screen", true]]);
    await client.switchMicrophone("mic-1");
    await client.switchCamera("camera-1");
    assert.deepEqual(deviceCalls.slice(3), [["switch-microphone", "mic-1"], ["switch-camera", "camera-1"]]);
    await client.subscribeAudio("remote", true);
    await client.subscribeVideo("remote", true);
    assert.deepEqual(calls.at(-1), { userId: "remote", track: 1, audio: true, video: true });
    failNext = true;
    await assert.rejects(client.subscribeVideo("remote", false), /sdk rejected/);
    await client.subscribeAudio("remote", false);
    assert.deepEqual(calls.at(-1), { userId: "remote", track: 1, audio: false, video: true });
    await client.subscribeVideo("remote", false);
    assert.deepEqual(calls.at(-1), { userId: "remote", track: 1, audio: false, video: false });
    await client.destroy();
  } finally {
    delete globalThis.window;
  }
});

test("meeting media enumeration and camera/microphone selection use the documented SDK operations", async () => {
  globalThis.window = { AliRtcEngine: {
    async isSupported() { return { support: true }; },
    getInstance() {
      return {
        setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
        publishLocalAudioStream() {}, publishLocalVideoStream() {}, publishLocalScreenShareStream() {},
        setChannelProfile() {}, async joinChannel() {}, async leaveChannel() {}, destroy() {}, on() {},
        async subscribeRemoteMediaStream() {}, setRemoteViewConfig() {}, setLocalViewConfig() {},
        async startPreview() {}, async stopPreview() {},
        async switchMicrophone(id) { if (id === "bad") throw new Error("device removed"); },
        async switchCamera(id) { if (id === "bad") throw new Error("device removed"); },
      };
    },
    AliRtcVideoTrack: { AliRtcVideoTrackBoth: 1 },
    async getMicrophoneList() { return [{ deviceId: "mic-1", label: "Built-in microphone" }]; },
    async getCameraList() { return [{ deviceId: "camera-1", label: "Front camera" }]; },
  } };
  try {
    const { getArtcDevices, createArtcClient } = await import("../src/shell/messages/meeting/artc-client.ts");
    assert.deepEqual(await getArtcDevices(), {
      microphones: [{ deviceId: "mic-1", label: "Built-in microphone" }],
      cameras: [{ deviceId: "camera-1", label: "Front camera" }],
    });
    const client = await createArtcClient({ app_id: "app", token: "token", channel_id: "room", user_id: "member", expires_at: new Date(Date.now() + 60_000).toISOString(), meeting: { meeting_id: "m", conversation_id: "c", edition: "global", channel_id: "room", status: "active", created_by: "u", created_at: "", ended_at: null, participants: [] } }, "name");
    await client.switchMicrophone("mic-1");
    await client.switchCamera("camera-1");
    await assert.rejects(client.switchCamera("bad"), /device removed/);
    await client.destroy();
  } finally { delete globalThis.window; }
});

test("meeting invitation accept and reject call their authenticated meeting-scoped routes", async () => {
  globalThis.__CALL_API = { calls: [] };
  const clientStub = dataModule(`
    export async function imFetch(path, init = {}) {
      globalThis.__CALL_API.calls.push({ path, init });
      return { ok: true };
    }
  `);
  const moduleUrl = await compileModule("src/lib/im/meetings-api.ts", { "./client": clientStub });
  const { meetingsApi } = await import(moduleUrl);
  await meetingsApi.invite("meeting/one", ["member-a"]);
  await meetingsApi.invitations("meeting-1");
  await meetingsApi.acceptInvitation("meeting-1", "invite-1");
  await meetingsApi.rejectInvitation("meeting-1", "invite-2");
  await meetingsApi.bill("meeting-1");
  assert.deepEqual(globalThis.__CALL_API.calls.map(({ path, init }) => [path, init.method || "GET", init.json]), [
    ["/v1/im/meetings/meeting%2Fone/invitations", "POST", { recipient_ids: ["member-a"] }],
    ["/v1/im/meetings/meeting-1/invitations", "GET", undefined],
    ["/v1/im/meetings/meeting-1/invitations/invite-1/accept", "POST", undefined],
    ["/v1/im/meetings/meeting-1/invitations/invite-2/reject", "POST", undefined],
    ["/v1/im/meetings/meeting-1/bill", "GET", undefined],
  ]);
  delete globalThis.__CALL_API;
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

test("meeting invitation identity is resolved asynchronously and stale account results cannot open another user's call", async () => {
  const opened = [];
  const pendingIds = [];
  const handler = createMeetingInvitationHandler(() => new Promise((resolve) => pendingIds.push(resolve)), (request) => opened.push(request));
  const invitation = { invitation_id: "i", meeting_id: "m", inviter_id: "host", invitee_id: "self", status: "pending", created_at: "", expires_at: "" };
  const older = handler.handle("c", invitation);
  const newer = handler.handle("c", invitation);
  pendingIds[1]("self");
  assert.equal(await newer, true);
  pendingIds[0]("other-user");
  assert.equal(await older, false);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].myUserId, "self");
  assert.equal(opened[0].conversationId, "c");
  handler.cancel();
});

test("meeting admission closes late join and destroys late SDK clients after unmount", async () => {
  const leave = [];
  const destroy = [];
  let current = true;
  let resolveCredentials;
  const joining = admitMeetingClient({
    join: () => new Promise((resolve) => { resolveCredentials = resolve; }),
    async createClient() { return { id: "client" }; },
    isCurrent: () => current,
    async leave(id) { leave.push(id); },
    async destroy(client) { destroy.push(client.id); },
  });
  current = false;
  resolveCredentials({ meeting: { meeting_id: "meeting-late" } });
  assert.equal(await joining, null);
  assert.deepEqual(leave, ["meeting-late"]);
  assert.deepEqual(destroy, []);

  current = true;
  let resolveClient;
  const creating = admitMeetingClient({
    async join() { return { meeting: { meeting_id: "meeting-client-late" } }; },
    createClient() { return new Promise((resolve) => { resolveClient = resolve; }); },
    isCurrent: () => current,
    async leave(id) { leave.push(id); },
    async destroy(client) { destroy.push(client.id); },
  });
  await Promise.resolve();
  current = false;
  resolveClient({ id: "client-late" });
  assert.equal(await creating, null);
  assert.deepEqual(leave, ["meeting-late", "meeting-client-late"]);
  assert.deepEqual(destroy, ["client-late"]);
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

test("global meeting request stays owned across surface switches and cannot be replaced while active", () => {
  closeMeeting();
  const first = { conversationId: "c1", conversationTitle: "First", myUserId: "u1", myRole: "member", profiles: {}, members: [] };
  const second = { ...first, conversationId: "c2", conversationTitle: "Second" };
  openMeeting(first);
  openMeeting(second);
  assert.equal(meetingHostRequestSnapshot().conversationId, "c1");
  closeMeeting();
  assert.equal(meetingHostRequestSnapshot(), null);
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
  releaseCall("leo-realtime", leoClaim);
});
