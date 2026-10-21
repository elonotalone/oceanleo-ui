import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { canJoinMeeting, meetingAvailabilityMessage, sdkUserIdForParticipant } from "../src/shell/messages/meeting/meeting-policy.ts";

const baseSnapshot = {
  meeting: { meeting_id: "m-1", status: "active" },
  artc_configured: true,
  metering_status: "ready",
};

test("meeting join requires active meeting, configured ARTC, ready metering, positive known balance, and online idle client", () => {
  const base = { snapshot: baseSnapshot, wallet: { balance: 1 }, online: true, busy: false, connected: false };
  assert.equal(canJoinMeeting(base), true);
  for (const input of [
    { ...base, snapshot: { ...baseSnapshot, meeting: null } },
    { ...base, snapshot: { ...baseSnapshot, meeting: { meeting_id: "m-1", status: "ended" } } },
    { ...base, snapshot: { ...baseSnapshot, artc_configured: false } },
    { ...base, snapshot: { ...baseSnapshot, metering_status: "unavailable" } },
    { ...base, snapshot: { ...baseSnapshot, metering_status: "config_missing" } },
    { ...base, wallet: null },
    { ...base, wallet: { balance: 0 } },
    { ...base, wallet: { balance: Number.NaN } },
    { ...base, online: false },
    { ...base, busy: true },
    { ...base, connected: true },
  ]) assert.equal(canJoinMeeting(input), false);
});

test("meeting readiness copy distinguishes missing provider config from unavailable metering", () => {
  assert.match(meetingAvailabilityMessage(null), /读取会议状态/);
  assert.match(meetingAvailabilityMessage({ ...baseSnapshot, artc_configured: false }), /尚未开通或配置/);
  assert.equal(meetingAvailabilityMessage({ ...baseSnapshot, metering_status: "unavailable", metering_reason: "核验暂不可用" }), "核验暂不可用");
  assert.match(meetingAvailabilityMessage(baseSnapshot), /静音或只听也可能计费/);
});

test("meeting pre-join billing copy explains provider-cost pass-through for every participant", async () => {
  const source = await readFile(new URL("../src/shell/messages/meeting/MeetingPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /服务商核验的音频、视频和屏幕共享用量原价结算，不加客户费率或加价/);
  assert.match(source, /发起人和受邀者各自使用自己的余额；静音或只听也可能计费/);
  assert.doesNotMatch(source, /per_user_minute|资费/);
});

test("server participant UUID maps to the ARTC string identity without separators", () => {
  assert.equal(sdkUserIdForParticipant("a41df0d6-3ba2-4a91-bf0d-2905f1eecaa1"), "a41df0d63ba24a91bf0d2905f1eecaa1");
});

test("ARTC client requires server credentials and turns off automatic subscriptions before channel join", async () => {
  const operations = [];
  let instanceCount = 0;
  const engine = {
    setDefaultSubscribeAllRemoteAudioStreams(value) { operations.push(["default-audio", value]); },
    setDefaultSubscribeAllRemoteVideoStreams(value) { operations.push(["default-video", value]); },
    publishLocalAudioStream(value) { operations.push(["publish-audio", value]); },
    publishLocalVideoStream(value) { operations.push(["publish-video", value]); },
    publishLocalScreenShareStream(value) { operations.push(["publish-screen", value]); },
    setChannelProfile(value) { operations.push(["profile", value]); },
    async joinChannel() { operations.push(["join"]); },
    async leaveChannel() {}, destroy() {}, on() {}, async subscribeRemoteMediaStream() {},
    setRemoteViewConfig() {}, setLocalViewConfig() {}, async startPreview() {}, async stopPreview() {},
    async switchMicrophone() {}, async switchCamera() {},
  };
  globalThis.window = { AliRtcEngine: { async isSupported() { return { support: true }; }, getInstance() { instanceCount += 1; return engine; }, AliRtcVideoTrack: { AliRtcVideoTrackBoth: 1 } } };
  try {
    const { createArtcClient } = await import("../src/shell/messages/meeting/artc-client.ts");
    await assert.rejects(createArtcClient({ app_id: "", token: "", channel_id: "", user_id: "", expires_at: "" }, "name"), /meeting_credentials_incomplete/);
    assert.equal(instanceCount, 0, "incomplete server credentials must not create a media engine");
    const credentials = { app_id: "app", token: "server-token", channel_id: "room", user_id: "member", expires_at: new Date(Date.now() + 60_000).toISOString(), meeting: { meeting_id: "m", conversation_id: "c", edition: "global", channel_id: "room", status: "active", created_by: "u", created_at: "", ended_at: null, participants: [] } };
    const client = await createArtcClient(credentials, "name");
    const joinIndex = operations.findIndex(([name]) => name === "join");
    assert.ok(operations.slice(0, joinIndex).some(([name, value]) => name === "default-audio" && value === false));
    assert.ok(operations.slice(0, joinIndex).some(([name, value]) => name === "default-video" && value === false));
    assert.ok(operations.slice(0, joinIndex).some(([name, value]) => name === "publish-audio" && value === false));
    assert.ok(operations.slice(0, joinIndex).some(([name, value]) => name === "publish-video" && value === false));
    assert.ok(operations.slice(0, joinIndex).some(([name, value]) => name === "publish-screen" && value === false));
    await client.destroy();
  } finally { delete globalThis.window; }
});
