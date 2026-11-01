import assert from "node:assert/strict";
import test from "node:test";

import { dialogToAgentMessages } from "../src/shell/native-thread/map-dialog.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

test("native transcript keeps text and tools in frame order after replay", () => {
  const frames = [
    { t: "user_message", program: "claude", acp_session: "s", text: "核对一下……" },
    { t: "turn_start", program: "claude", acp_session: "s" },
    { t: "tool", program: "claude", acp_session: "s", id: "inspect", kind: "read", title: "检查子智能体", status: "completed" },
    { t: "delta", program: "claude", acp_session: "s", text: "那段对话派出去……REL）。" },
    { t: "tool", program: "claude", acp_session: "s", id: "edit", kind: "edit", title: "Edit", status: "completed" },
    { t: "delta", program: "claude", acp_session: "s", text: "Message is ready. I'm waiting…" },
    { t: "tool", program: "claude", acp_session: "s", id: "wait", kind: "other", title: "等待", status: "completed" },
    { t: "done", program: "claude", acp_session: "s", stop: "end_turn" },
  ];
  const state = frames.reduce(
    (current, frame) => applyDialog(current, { type: "frame", frame }),
    { ...initialDialogState(), program: "claude", activeSession: "s" },
  );
  const mapped = dialogToAgentMessages(state.messages, { live: false });
  assert.deepEqual(mapped.map((message) => message.kind), ["text", "step", "text", "step", "text", "step"]);
  assert.deepEqual(mapped.map((message) => message.content), [
    "核对一下……", "检查子智能体", "那段对话派出去……REL）。", "Edit",
    "Message is ready. I'm waiting…", "等待",
  ]);
});
