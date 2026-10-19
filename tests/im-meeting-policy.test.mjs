import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
  assert.match(meetingAvailabilityMessage(baseSnapshot), /实际接收的媒体资源/);
});

test("server participant UUID maps to the ARTC string identity without separators", () => {
  assert.equal(sdkUserIdForParticipant("a41df0d6-3ba2-4a91-bf0d-2905f1eecaa1"), "a41df0d63ba24a91bf0d2905f1eecaa1");
});

test("ARTC client requires server credentials and turns off automatic subscriptions before channel join", async () => {
  const source = await readFile(new URL("../src/shell/messages/meeting/artc-client.ts", import.meta.url), "utf8");
  const credentialGuard = source.indexOf("if (!credentials.app_id || !credentials.token");
  const sdkLoad = source.indexOf("const sdk = await loadAliRtc()");
  const disableAudio = source.indexOf("setDefaultSubscribeAllRemoteAudioStreams(false)");
  const disableVideo = source.indexOf("setDefaultSubscribeAllRemoteVideoStreams(false)");
  const join = source.indexOf("await engine.joinChannel(");
  assert.ok(credentialGuard >= 0 && credentialGuard < sdkLoad);
  assert.ok(disableAudio >= 0 && disableAudio < join);
  assert.ok(disableVideo >= 0 && disableVideo < join);
  assert.ok(source.includes("publishLocalAudioStream(false)"));
  assert.ok(source.includes("publishLocalVideoStream(false)"));
  assert.ok(source.includes("publishLocalScreenShareStream(false)"));
});
