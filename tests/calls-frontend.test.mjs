import test from "node:test";
import assert from "node:assert/strict";
import { floatToPcm16LE, pcm16LEToFloat, pcmSamplesPerFrame, stopMediaStreams, videoFrameEnvelope } from "../src/lib/realtime-audio.ts";
import { createArtcClient } from "../src/shell/messages/meeting/artc-client.ts";
import { meetingHostRequestSnapshot, openMeeting, closeMeeting, claimCall, releaseCall, activeCallOwner } from "../src/shell/messages/meeting/meeting-host-state.ts";
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

test("global meeting request stays owned across surface switches and cannot be replaced while active", () => {
  closeMeeting();
  const first = { conversationId: "c1", conversationTitle: "First", myUserId: "u1", myRole: "member", profiles: {}, members: [] };
  const second = { ...first, conversationId: "c2", conversationTitle: "Second" };
  openMeeting(first);
  openMeeting(second);
  assert.equal(meetingHostRequestSnapshot().conversationId, "c1");
  closeMeeting();
  assert.equal(meetingHostRequestSnapshot(), null);
  releaseCall("meeting");
  releaseCall("leo-realtime");
  assert.equal(claimCall("meeting"), true);
  assert.equal(activeCallOwner(), "meeting");
  assert.equal(claimCall("leo-realtime"), false, "a second entry point cannot start a concurrent call");
  releaseCall("leo-realtime");
  assert.equal(activeCallOwner(), "meeting", "a non-owner cannot release the active call");
  releaseCall("meeting");
  assert.equal(claimCall("leo-realtime"), true, "a different call may start after release");
  releaseCall("leo-realtime");
});
