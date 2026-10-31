// Background sub-agent (Task/Agent) tool calls must not split the parent's
// reply. Evidence: cts_9909e1f74aef4aff952563ba6cec866a seq 27125–27890 —
// "Point" → 1 step → " 2 (line width)…" → 48 steps → …; every step group was
// new tool ids from sub-agents streamed on the root ACP session.
import assert from "node:assert/strict";
import test from "node:test";

import { dialogToAgentMessages } from "../src/shell/native-thread/map-dialog.ts";
import { buildAgentRenderItems, buildProcessEntries, summarizeProcess } from "../src/lib/agent-progress.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

const base = { program: "claude", acp_session: "s" };

function run(frames, program = "claude") {
  const start = { ...initialDialogState(), program, activeSession: "s" };
  return frames
    .map((frame) => ({ ...base, program, ...frame }))
    .reduce((state, frame) => applyDialog(state, { type: "frame", frame }), start).messages;
}

function turnOf(messages) {
  return messages.find((message) => message.kind === "turn");
}

/** The evidence shape: an Agent launch, then reply text interleaved with sub-agent tool calls. */
function evidence({ parent }) {
  const stamp = (agent) => (parent ? { parent: agent } : {});
  const subTools = (from, count, agent, failedAt = -1) =>
    Array.from({ length: count }, (_, index) => ({
      t: "tool", id: `sub-${from + index}`, kind: "read", title: `Read f${from + index}.ts`,
      status: index === failedAt ? "failed" : "pending", ...stamp(agent),
    }));
  return [
    { t: "user_message", text: "Review the drawing code" },
    { t: "turn_start" },
    { t: "tool", id: "agent-1", kind: "think", title: "Audit stroke code", status: "pending" },
    { t: "tool", id: "agent-1", status: "completed" },
    { t: "delta", text: "Launched an auditor. Meanwhile:\n\nPoint" },
    ...subTools(1, 1, "agent-1"),
    { t: "delta", text: " 2 (line width) is " },
    ...subTools(2, 48, "agent-1", 5),
    { t: "delta", text: "already clamped." },
    // A late update of an existing sub-agent tool, without the stamp.
    { t: "tool", id: "sub-1", status: "completed" },
    { t: "done", stop: "end_turn" },
  ];
}

const WHOLE = "Launched an auditor. Meanwhile:\n\nPoint 2 (line width) is already clamped.";

test("parent-stamped sub-agent tools nest under their Agent step and never split the reply", () => {
  const turn = turnOf(run(evidence({ parent: true })));
  assert.deepEqual(turn.items.map((item) => item.kind), ["tool", "assistant"]);
  assert.equal(turn.items[1].text, WHOLE);
  const agent = turn.items[0].tool;
  assert.equal(agent.id, "agent-1");
  assert.equal(agent.children.length, 49);
  assert.ok(agent.children.every((child) => child.parent === "agent-1"));
  // The unstamped late update still reached the nested card.
  assert.equal(agent.children[0].status, "completed");

  const messages = dialogToAgentMessages(run(evidence({ parent: true })), { live: false });
  assert.deepEqual(messages.map((m) => m.kind), ["text", "step", "text"]);
  assert.equal(messages[2].content, WHOLE);
  assert.equal(messages[1].meta.tool_card.children.length, 49);

  const items = buildAgentRenderItems(messages);
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message"]);
  const entries = buildProcessEntries(items[1].messages);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].children.length, 49);
  assert.equal(entries[0].children.filter((child) => child.status === "failed").length, 1);
  assert.equal(entries[0].children[0].status, "done");
  assert.equal(entries[0].children[0].title, "Read f1.ts");
  assert.equal(summarizeProcess(items[1].messages, entries).tools, 1);
});

test("a sub-agent tool that arrives before its Agent tool waits, then joins it", () => {
  const turn = turnOf(run([
    { t: "turn_start" },
    { t: "delta", text: "Starting" },
    { t: "tool", id: "sub-early", kind: "search", title: "Grep stroke", status: "pending", parent: "agent-late" },
    { t: "delta", text: " the audit." },
    { t: "tool", id: "sub-early", status: "completed" },
    { t: "tool", id: "agent-late", kind: "think", title: "Audit", status: "in_progress" },
    { t: "done", stop: "end_turn" },
  ]));
  assert.deepEqual(turn.items.map((item) => item.kind), ["assistant", "tool"]);
  assert.equal(turn.items[0].text, "Starting the audit.");
  assert.deepEqual(turn.items[1].tool.children.map((child) => [child.id, child.status]), [["sub-early", "completed"]]);
  assert.deepEqual(turn.orphans, []);
});

test("legacy archive without `parent`: split text rejoins and the tools go under the one Agent step", () => {
  const turn = turnOf(run(evidence({ parent: false })));
  assert.deepEqual(turn.items.map((item) => item.kind), ["tool", "assistant"]);
  assert.equal(turn.items[1].text, WHOLE);
  assert.equal(turn.items[0].tool.children.length, 49);
  assert.equal(turn.items[0].tool.children[0].status, "completed");
  const messages = dialogToAgentMessages(run(evidence({ parent: false })), { live: false });
  assert.deepEqual(messages.map((m) => m.kind), ["text", "step", "text"]);
});

test("legacy archive with several Agent launches: text rejoins, tools form one group after it", () => {
  const frames = evidence({ parent: false });
  frames.splice(4, 0, { t: "tool", id: "agent-2", kind: "think", title: "Audit fill code", status: "completed" });
  const turn = turnOf(run(frames));
  assert.deepEqual(turn.items.slice(0, 3).map((item) => item.kind), ["tool", "tool", "assistant"]);
  assert.equal(turn.items[2].text, WHOLE);
  assert.equal(turn.items.length, 3 + 49);
  assert.ok(turn.items.slice(3).every((item) => item.kind === "tool" && item.tool.id.startsWith("sub-")));
  const items = buildAgentRenderItems(dialogToAgentMessages(run(frames), { live: false }));
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message", "progress"]);
  assert.equal(items[2].message.content, WHOLE);
  assert.equal(items[3].messages.length, 49);
});

test("legacy heuristic leaves real separate messages alone", () => {
  // No Agent launch: the agent's own tool between two messages.
  const plain = turnOf(run([
    { t: "turn_start" },
    { t: "delta", text: "Let me check" },
    { t: "tool", id: "r1", kind: "read", title: "Read a.ts", status: "completed" },
    { t: "delta", text: " the config." },
  ]));
  assert.deepEqual(plain.items.map((item) => item.kind), ["assistant", "tool", "assistant"]);
  // After a background launch, a finished sentence followed by a new one stays two messages.
  const own = turnOf(run([
    { t: "turn_start" },
    { t: "tool", id: "agent-1", kind: "think", title: "Audit", status: "completed" },
    { t: "delta", text: "Let me read the config." },
    { t: "tool", id: "r1", kind: "read", title: "Read config.ts", status: "completed" },
    { t: "delta", text: "The config sets width 2." },
  ]));
  assert.deepEqual(own.items.map((item) => item.kind), ["tool", "assistant", "tool", "assistant"]);
  // A todo update is "think" too but is not an Agent launch.
  const todo = turnOf(run([
    { t: "turn_start" },
    { t: "tool", id: "todo", kind: "think", title: "Update TODOs: a, b", status: "completed" },
    { t: "delta", text: "Point" },
    { t: "tool", id: "r1", kind: "read", title: "Read a.ts", status: "completed" },
    { t: "delta", text: " 2" },
  ]));
  assert.deepEqual(todo.items.map((item) => item.kind), ["tool", "assistant", "tool", "assistant"]);
  // Other programs keep their order untouched.
  const codex = turnOf(run(evidence({ parent: false }), "codex"));
  assert.ok(codex.items.filter((item) => item.kind === "assistant").length > 1);
});
