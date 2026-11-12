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

test("ACP Send does not depend on the socket and no connection text is rendered", () => {
  assert.match(agentChat, /const acpComposerDisabled = readOnly;/);
  assert.match(agentChat, /const acpSendBlocked = acpBusy \|\| pendingInFlight/);
  assert.match(agentChat, /const acpSendBlockedReason = null/);
  assert.doesNotMatch(agentChat, /tt\("(?:Connecting|正在连接…|网络断开|网络断开，恢复后可发送|连接断开)"\)/);
  assert.doesNotMatch(agentChat, /data-acp-connection=/);
  assert.match(agentChat, /readOnly=\{readOnly\}/);
});
