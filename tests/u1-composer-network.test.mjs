import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const composer = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
const agentChat = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");

test("LeoComposer keeps the editor read-only split from transport submission blocking", () => {
  assert.match(composer, /readOnly\?: boolean/);
  assert.match(composer, /sendBlocked\?: boolean/);
  assert.match(composer, /disabled=\{readOnly\}/, "editor receives permission lock only");
  assert.match(composer, /!readOnly && !sendBlocked/, "Send waits on transport state without freezing text");
  assert.match(composer, /aria-describedby=\{sendBlockedReason \? "leo-composer-send-blocked"/);
  assert.match(composer, /id="leo-composer-send-blocked"/);
});

test("ACP reconnecting, busy and pending states keep typing enabled and explain Send", () => {
  assert.match(agentChat, /const acpTransportBlocked = taskId \? !acpConnected : acpDraftOffline/);
  assert.match(agentChat, /const acpSendBlocked = acpTransportBlocked \|\| acpBusy \|\| pendingInFlight/);
  assert.match(agentChat, /sendBlockedReason=\{acpSendBlockedReason\}/);
  assert.match(agentChat, /frames\.state === "connecting" \? tt\("正在连接…"\) : tt\("网络断开，恢复后可发送"\)/);
  assert.match(agentChat, /pendingInFlight\n\s*\? tt\("上一条还在发送"\)/);
  assert.match(agentChat, /readOnly=\{readOnly\}/);
});

