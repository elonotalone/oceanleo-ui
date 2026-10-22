// 人际通话的客户端规则（calls-v2，合同 §1 A1 / A18 / A20）。
// 旧「会话会议」的 meeting-policy（余额门槛、计费提示、检查麦克风）与 artc-client 已删除；
// 这里改为对新引擎与新接口断言：点了就进、没有余额/计费门槛、没有邀请审批、ARTC 身份映射不变。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/im-meeting-policy.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { rtcUserIdForParticipant } from "../src/lib/im/call-types.ts";
import { participantIdFromRtcUserId } from "../src/shell/messages/call/engine/controller.ts";
import { DEFAULT_PREFS } from "../src/shell/messages/call/engine/prefs.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("server participant UUID maps to the ARTC string identity without separators, and back", () => {
  const pid = "a41df0d6-3ba2-4a91-bf0d-2905f1eecaa1";
  assert.equal(rtcUserIdForParticipant(pid), "a41df0d63ba24a91bf0d2905f1eecaa1");
  assert.equal(participantIdFromRtcUserId("a41df0d63ba24a91bf0d2905f1eecaa1"), pid);
  assert.equal(participantIdFromRtcUserId("not-a-uuid"), "not-a-uuid", "non-UUID SDK ids pass through untouched");
});

test("default media on first join: microphone on, camera off (A1)", () => {
  assert.equal(DEFAULT_PREFS.mic, true);
  assert.equal(DEFAULT_PREFS.camera, false);
});

test("joining is one click: no microphone check, no preview, no invitation gate, no wallet gate (A1/A18/A20)", async () => {
  const controller = await read("src/shell/messages/call/engine/controller.ts");
  const api = await read("src/lib/im/calls-api.ts");
  // 新接口只有合同 §3.2 的八个动作，没有邀请/接受/拒绝邀请/账单。
  for (const name of ["status", "startOrJoin", "join", "leave", "refreshToken", "heartbeat", "decline", "testToken"]) {
    assert.match(api, new RegExp(`\\b${name}\\(`), `callsApi.${name} exists`);
  }
  assert.doesNotMatch(api, /invit|accept|reject|bill/i);
  // 入会路径：装 SDK → 网关入会 → 建引擎入频道；中间没有「检查麦克风」「预览」「余额」这一步。
  assert.doesNotMatch(controller, /检查麦克风|checkDevices|deviceChecked|startPreview\(\)/);
  assert.doesNotMatch(controller, /balance|wallet|余额|计费|扣费/i);
  assert.doesNotMatch(controller, /billing_mode|metering/);
});

test("no host role: leaving never ends the call for others and nobody can end it for everyone (A20)", async () => {
  const controller = await read("src/shell/messages/call/engine/controller.ts");
  const api = await read("src/lib/im/calls-api.ts");
  assert.doesNotMatch(api, /\/end\b|\bend\(/, "there is no end-for-everyone route in the client");
  assert.doesNotMatch(controller, /\bowner\b.*\bend\b|isHost|myRole/);
});
