// R1: native dialog state -> the main chat's AgentMessage stream.
import assert from "node:assert/strict";
import test from "node:test";

import { dialogToAgentMessages } from "../src/shell/native-thread/map-dialog.ts";
import { buildAgentRenderItems, buildAgentProgressActions } from "../src/lib/agent-progress.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

const archive = {
  id: "file", name: "report.pdf", mime: "application/pdf", size: 4,
  download_path: "/v1/computer-task-sessions/managed/attachments/file",
};

function dialog() {
  return [
    { kind: "user", id: "u1", text: "Fix the build", attachments: [{ name: "report.pdf", mime: "application/pdf", archive }, { name: "shot.png", mime: "image/png", preview: "data:image/png;base64,AAAA" }] },
    {
      kind: "turn", id: "t1", acpSession: "s", stop: "end_turn", items: [
        { kind: "thought", id: "i1", text: "Look at the failing step" },
        { kind: "tool", id: "i2", tool: { id: "tool-1", kind: "read", title: "Read package.json", status: "completed", content: [], locations: [] } },
        { kind: "assistant", id: "i3", text: "Found it. " },
        { kind: "tool", id: "i4", tool: { id: "tool-2", kind: "execute", title: "npm test", status: "failed", content: [], locations: [] } },
        { kind: "plan", id: "i5", entries: [{ content: "Patch", priority: "high", status: "completed" }, { content: "Verify", priority: "low", status: "pending" }] },
        { kind: "permission", id: "i6", permId: "p-auto", title: "Run", permKind: "execute", options: [], toolTitle: "ls", chosen: "", auto: true },
        { kind: "permission", id: "i7", permId: "p1", title: "Allow edit?", permKind: "edit", options: [{ id: "a", name: "Allow", kind: "allow_once" }, { id: "r", name: "Reject", kind: "reject_once" }], toolTitle: "Edit src/a.ts", chosen: "", auto: false },
        { kind: "question", id: "i8", questionId: "q1", title: "Which one?", detail: "", questions: { questions: [{ id: "pick", prompt: "Pick", options: ["A", "B"] }] }, submitted: false },
        { kind: "usage", id: "i9", used: 10, size: 100 },
        { kind: "assistant", id: "i10", text: "Done." },
      ],
    },
    { kind: "notice", id: "n1", code: "acp_exited", program: "codex" },
    { kind: "notice", id: "n2", code: "computer_reconnecting", program: "codex" },
    { kind: "notice", id: "n3", code: "node_error", program: "codex", text: "Model overloaded" },
  ];
}

test("every dialog item kind maps to the main stream message model", () => {
  const out = dialogToAgentMessages(dialog(), { live: true });
  const shape = out.map((m) => [m.role, m.kind]);
  assert.deepEqual(shape, [
    ["user", "text"],
    ["assistant", "analysis"],
    ["assistant", "step"],
    ["assistant", "text"],
    ["assistant", "step"],
    ["assistant", "plan"],
    ["assistant", "step"],
    ["assistant", "gate"],
    ["assistant", "gate"],
    ["assistant", "text"],
    ["assistant", "error"],
    ["assistant", "error"],
  ]);
  const [user, thought, read, text1, failed, plan, auto, gate, question, text2, exited, frameText] = out;
  assert.equal(user.content, "Fix the build");
  assert.equal(user.meta.attachments.length, 2);
  assert.equal(user.meta.attachments[0].native_archive.download_path, archive.download_path);
  assert.equal(user.meta.attachments[0].url, "");
  assert.equal(user.meta.attachments[1].url, "data:image/png;base64,AAAA");
  assert.equal(user.meta.attachments[1].media_type, "image");
  assert.equal(thought.meta.step_index, read.meta.step_index, "a thought pairs with the tool it led to");
  assert.equal(read.content, "Read package.json");
  assert.equal(read.meta.native_tool, true);
  assert.equal(read.meta.tool_status, "completed");
  assert.equal(failed.content, "npm test（失败）");
  assert.notEqual(failed.meta.step_index, read.meta.step_index);
  assert.deepEqual(plan.meta.plan_steps, ["Patch", "Verify"]);
  assert.equal(auto.kind, "step");
  assert.equal(auto.content, "已自动允许：ls");
  assert.equal(gate.meta.native_permission.permId, "p1");
  assert.deepEqual(gate.meta.native_permission.options.map((o) => o.id), ["a", "r"]);
  assert.equal(gate.meta.native_permission.chosen, "");
  assert.equal(gate.meta.gate_prompt, "Allow edit?\nEdit src/a.ts");
  assert.equal(question.meta.native_question.questionId, "q1");
  assert.equal(question.meta.gate_prompt, "Which one?");
  assert.equal(text1.meta.final, undefined);
  assert.equal(text2.meta.final, true, "last answer of a finished turn is final");
  assert.equal(exited.content, "这个程序的对话进程退出了，重新发一句会再启动。");
  assert.equal(frameText.content, "Model overloaded");
  assert.ok(!out.some((m) => m.meta?.native_notice === "computer_reconnecting"), "reconnect churn is not conversation content");
});

test("ids are deterministic negative integers, unique and stable", () => {
  const a = dialogToAgentMessages(dialog(), { live: true });
  const b = dialogToAgentMessages(dialog(), { live: true });
  assert.deepEqual(a.map((m) => m.id), b.map((m) => m.id));
  assert.ok(a.every((m) => Number.isInteger(m.id) && m.id < 0));
  assert.equal(new Set(a.map((m) => m.id)).size, a.length);
  const grown = dialogToAgentMessages([...dialog(), { kind: "user", id: "u2", text: "again" }], { live: true });
  assert.deepEqual(grown.slice(0, a.length).map((m) => m.id), a.map((m) => m.id), "appending keeps earlier ids");
});

test("buildAgentRenderItems yields one progress card per turn with tool labels; gates stay in the stream", () => {
  const out = dialogToAgentMessages(dialog(), { live: true });
  const items = buildAgentRenderItems(out);
  const progress = items.filter((item) => item.type === "progress");
  assert.equal(progress.length, 1);
  const labels = buildAgentProgressActions(progress[0].messages).flatMap((action) => action.labels);
  assert.deepEqual(labels, ["Read package.json", "npm test（失败）", "已自动允许：ls"]);
  const first = buildAgentProgressActions(progress[0].messages)[0];
  assert.equal(first.analysis.content, "Look at the failing step");
  const visible = items.filter((item) => item.type === "message").map((item) => item.message.kind);
  assert.deepEqual(visible, ["text", "text", "gate", "gate", "text", "error", "error"]);
});

test("a live turn without a stop leaves the last answer streaming; interrupted turns are marked stopped", () => {
  const running = [{ kind: "user", id: "u", text: "go" }, { kind: "turn", id: "t", acpSession: "s", stop: "", live: true, items: [{ kind: "assistant", id: "a", text: "Working" }] }];
  assert.equal(dialogToAgentMessages(running, { live: true })[1].meta.final, undefined);
  assert.equal(dialogToAgentMessages(running, { live: false })[1].meta.final, true, "archive turns are never streaming");
  const stopped = [{ kind: "turn", id: "t", acpSession: "s", stop: "cancelled", items: [{ kind: "assistant", id: "a", text: "Half" }] }];
  const [half] = dialogToAgentMessages(stopped, { live: true });
  assert.equal(half.meta.final, true);
  assert.equal(half.meta.stopped, true);
});

test("login/install notices point to settings instead of in-stream cards; tt translates", () => {
  const tt = (zh, vars) => `[${zh.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""))}]`;
  const out = dialogToAgentMessages([
    { kind: "notice", id: "a", code: "not_logged_in", program: "claude" },
    { kind: "notice", id: "b", code: "program_missing", program: "codex" },
  ], { live: true, tt });
  assert.equal(out[0].content, "[这个程序还没有登录，请在设置里登录后再发。]");
  assert.equal(out[1].content, "[这台电脑上还没有装好这个程序，请在设置里安装后再发。]");
});

test("cloud-saved archive frames through applyDialog map to the same messages as the live stream", () => {
  const frames = [
    { t: "user_message", program: "codex", acp_session: "s", text: "Hello", replay: true },
    { t: "turn_start", program: "codex", acp_session: "s", replay: true },
    { t: "thought", program: "codex", acp_session: "s", text: "Thinking", replay: true },
    { t: "tool", program: "codex", acp_session: "s", id: "tl", kind: "read", title: "Read a.ts", status: "completed", replay: true },
    { t: "delta", program: "codex", acp_session: "s", text: "Hi there", replay: true },
    { t: "done", program: "codex", acp_session: "s", stop: "end_turn" },
  ];
  const start = { ...initialDialogState(), program: "codex", activeSession: "s" };
  const archived = frames.reduce((state, frame) => applyDialog(state, { type: "frame", frame }), start).messages;
  const liveState = frames.map((frame) => ({ ...frame, replay: undefined }))
    .reduce((state, frame) => applyDialog(state, { type: "frame", frame }), start).messages;
  const strip = (list) => list.map(({ id, ...rest }) => rest);
  assert.deepEqual(strip(dialogToAgentMessages(archived, { live: false })), strip(dialogToAgentMessages(liveState, { live: true })));
  assert.deepEqual(dialogToAgentMessages(archived, { live: false }).map((m) => m.kind), ["text", "analysis", "step", "text"]);
});
