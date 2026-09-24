import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { agentMessageFingerprint, agentMessagesChanged, threadPresentation, resolveTaskStatus } from "../src/shell/agent-thread/rules.ts";

const user = { id: 1, role: "user", kind: "text", content: "hi" };
const reply = (content, meta = {}) => ({ id: 2, role: "assistant", kind: "text", content, meta });
const view = (status, message, options = {}) => threadPresentation([user, message], status, options);

test("legacy empty done and C1 streaming rows keep thinking until visible text", () => {
  assert.equal(view("running", reply("", { done: true, suggestions: ["a"] })).thinking, true);
  assert.equal(view("running", reply("", { streaming: true })).thinking, true);
  assert.equal(view("running", reply("hello", { streaming: true })).thinking, false);
  assert.equal(view("running", reply("hello", { streaming: true })).complete, false);
  assert.equal(view("running", reply("hello", { done: true })).complete, true);
});

test("active progress and multi-step replies keep the right activity indicator", () => {
  assert.deepEqual(
    (({ thinking, working }) => ({ thinking, working }))(view("running", reply(""), { activeProgress: true })),
    { thinking: false, working: true },
  );
  for (const meta of [{}, { streaming: false }]) {
    const step = { id: 3, role: "assistant", kind: "step", content: "continuing" };
    assert.deepEqual(
      (({ thinking, working }) => ({ thinking, working }))(
        threadPresentation([user, reply("step one finished", meta), step], "running"),
      ),
      { thinking: true, working: true },
    );
  }
  assert.deepEqual(
    (({ thinking, working }) => ({ thinking, working }))(view("running", reply("streaming", { streaming: true }))),
    { thinking: false, working: true },
  );
  assert.equal(view("running", reply("", { done: true })).thinking, true);
  assert.deepEqual(
    (({ thinking, working }) => ({ thinking, working }))(view("running", reply("finished", { done: true }))),
    { thinking: false, working: false },
  );
});

test("all stop sources clear activity and suggestions", () => {
  const cases = [
    view("stopped", reply("partial", { suggestions: ["next"] })),
    view("running", reply("partial", { stopped: true, suggestions: ["next"] })),
    view("running", reply("partial", { suggestions: ["next"] }), { taskId: "t", stoppedTaskId: "t" }),
  ];
  for (const result of cases) {
    assert.equal(result.working, false);
    assert.equal(result.thinking, false);
    assert.deepEqual(result.suggestions, []);
  }
});

test("suggestions require completed current turn and done status", () => {
  const suggested = reply("hello", { done: true, suggestions: ["a", "b", "c"] });
  for (const status of ["running", "stopped", "failed", "error"]) {
    assert.deepEqual(view(status, suggested).suggestions, []);
  }
  assert.deepEqual(view("done", suggested).suggestions, ["a", "b", "c"]);
  assert.deepEqual(view("done", reply("hello", { stopped: true, suggestions: ["a"] })).suggestions, []);
  assert.deepEqual(threadPresentation([suggested, user], "done").suggestions, []);
  assert.deepEqual(view("done", suggested, { stoppedTaskId: "t", taskId: "t" }).suggestions, []);
});

test("stop override survives a stale running refresh and durable stopped meta", () => {
  assert.equal(resolveTaskStatus({ serverStatus: "running", taskId: "t", stoppedTaskId: "t" }), "stopped");
  assert.equal(view("done", reply("partial", { stopped: true })).stopped, true);
});

test("in-place C1 meta updates count as new content", () => {
  const streaming = [user, reply("hello", { streaming: true })];
  const completed = [user, reply("hello", { done: true, suggestions: ["a"] })];
  assert.equal(agentMessagesChanged(streaming, completed), true);
  assert.notEqual(agentMessageFingerprint(streaming), agentMessageFingerprint(completed));
});

test("all three surfaces import common polling and cloud has no local cadence constants", async () => {
  const root = new URL("../src/shell/", import.meta.url);
  for (const path of ["AgentChat.tsx", "FunctionAgentChat.tsx", "cloud-computer/agent-dialog/oceanleo-program.ts"]) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /agent-thread\//);
  }
  const cloud = await readFile(new URL("cloud-computer/agent-dialog/oceanleo-program.ts", root), "utf8");
  assert.doesNotMatch(cloud, /const POLL_(ACTIVE|FIRST_BYTE|IDLE_LADDER)/);
  const functionChat = await readFile(new URL("FunctionAgentChat.tsx", root), "utf8");
  assert.match(functionChat, /stoppedTaskRef\.current = taskId/);
  assert.match(functionChat, /resolveTaskStatus\(\{ serverStatus, taskId: id, stoppedTaskId: stoppedTaskRef\.current \}\)/);
  const controller = await readFile(new URL("cloud-computer/agent-dialog/useAgentDialogController.tsx", root), "utf8");
  assert.match(controller, /stoppedOceanTaskRef\.current = taskId/);
  assert.match(controller, /resolveTaskStatus\(/);
});

test("both chats wire shared working and thinking and retain stopped history", async () => {
  const root = new URL("../src/shell/", import.meta.url);
  for (const path of ["AgentChat.tsx", "FunctionAgentChat.tsx"]) {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, /threadPresentation\(messages, status, \{[^}]*activeProgress: Boolean\(activeProgressKey\)/);
    assert.match(source, /running=\{presentation\.working && item\.key === activeProgressKey\}/);
    assert.match(source, /\{presentation\.thinking && \(\s*<div/);
    const stoppedProp = source.match(/stopped=\{([\s\S]*?)\}\s*onArtifactOpen=/)?.[1] || "";
    assert.ok(/item\.message\.meta\?\.stopped === true\s*\|\|/.test(stoppedProp), `${path}: durable stop should stand alone`);
    assert.ok(/item\.index === lastAssistantIdx/.test(stoppedProp), `${path}: local stop should stay on the latest answer`);
  }
});
