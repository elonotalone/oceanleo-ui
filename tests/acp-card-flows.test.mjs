import assert from "node:assert/strict";
import test from "node:test";

import { applyDialog, busySessionsFor, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { composerOccupancy } from "../src/shell/cloud-computer/agent-dialog/occupancy.ts";
import { hasOpenTurn, sessionListStatus, turnHasUnfinishedWork, turnLooksSettled, turnStillRunning } from "../src/shell/cloud-computer/agent-dialog/session-status.ts";

// The agent-dialog card (AcpCard + its controller) is deleted; these cases keep the shared reducer / occupancy /
// session-status rules that the task page and the mobile app (native-agent-core) still use.

test("reduce：思考增量把回合标成进行中；历史回放 live=false 仍是空闲", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "done", program: "cursor", acp_session: "s", stop: "end_turn" } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(hasOpenTurn(state.messages), false);
  state = applyDialog(state, { type: "frame", frame: { t: "thought", program: "cursor", acp_session: "s", text: "hmm" } });
  assert.equal(state.occupancyBusy.includes("s"), true);
  assert.equal(state.liveTurns["cursor::s"], true);
  assert.equal(hasOpenTurn(state.messages), true);
  assert.deepEqual(busySessionsFor(state.liveTurns, "cursor"), ["s"]);

  state = applyDialog(state, { type: "frame", frame: {
    t: "transcript",
    program: "cursor",
    acp_session: "s",
    live: false,
    frames: [
      { t: "user_message", program: "cursor", acp_session: "s", text: "go" },
      { t: "turn_start", program: "cursor", acp_session: "s" },
      { t: "thought", program: "cursor", acp_session: "s", text: "plan" },
    ],
  } });
  assert.equal(state.occupancyBusy.includes("s"), false, "live=false closes stale replay");
  assert.equal(hasOpenTurn(state.messages), true);
  assert.equal(state.messages.at(-1)?.stop, "");
  assert.equal(turnStillRunning(state.messages), true);

  let replayed = initialDialogState();
  replayed = applyDialog(replayed, { type: "program", program: "cursor" });
  replayed = applyDialog(replayed, { type: "frame", frame: {
    t: "transcript",
    program: "cursor",
    acp_session: "hist",
    live: false,
    frames: [
      { t: "user_message", program: "cursor", acp_session: "hist", replay: true, text: "old" },
      { t: "delta", program: "cursor", acp_session: "hist", replay: true, text: "reply" },
    ],
  } });
  assert.equal(replayed.busy, false);
  assert.equal(hasOpenTurn(replayed.messages), false);
});

test("reduce：缺 done 的回复按 live=false 或 fresh occupancy 收口", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "frame", frame: {
    t: "transcript",
    program: "cursor",
    acp_session: "s",
    live: false,
    frames: [
      { t: "user_message", program: "cursor", acp_session: "s", text: "go" },
      { t: "turn_start", program: "cursor", acp_session: "s" },
      { t: "delta", program: "cursor", acp_session: "s", text: "already finished" },
    ],
  } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(hasOpenTurn(state.messages), false);
  assert.equal(turnLooksSettled(state.messages), false);
  assert.equal(state.messages.at(-1)?.stop, "end_turn");

  state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "delta", program: "cursor", acp_session: "s", text: "reply" } });
  assert.equal(state.occupancyBusy.includes("s"), true);
  state = applyDialog(state, { type: "frame", frame: {
    t: "occupancy",
    program: "cursor",
    busy: [],
  } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(state.messages.at(-1)?.stop, "");
  assert.equal(turnStillRunning(state.messages), true);
});

test("reduce：HTTP/2 CANCEL 字不进对话，也不把 Stop 收成 Send", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "thought", program: "cursor", acp_session: "s", text: "plan" } });
  state = applyDialog(state, { type: "frame", frame: {
    t: "delta",
    program: "cursor",
    acp_session: "s",
    text: "Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)",
  } });
  const last = state.messages.at(-1);
  assert.equal(last?.kind, "turn");
  assert.equal(last?.items?.some((item) => item.kind === "assistant" && /RetriableError/.test(item.text || "")), false);
  assert.equal(state.occupancyBusy.includes("s"), true);
  assert.equal(turnStillRunning(state.messages), true);
  state = applyDialog(state, { type: "frame", frame: {
    t: "error",
    program: "cursor",
    acp_session: "s",
    code: "acp_start_failed",
    text: "Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)",
  } });
  assert.equal(state.messages.some((message) => message.kind === "notice"), false);
  assert.equal(state.occupancyBusy.includes("s"), true);
  assert.equal(state.messages.at(-1)?.stop, "");
});

test("reduce：occupancy 清空后旧思考不能占用输入框", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "thought", program: "cursor", acp_session: "s", text: "plan" } });
  state = applyDialog(state, { type: "frame", frame: { t: "delta", program: "cursor", acp_session: "s", text: "reply" } });
  assert.equal(turnStillRunning(state.messages), true);
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "cursor", busy: [] } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(state.messages.at(-1)?.stop, "");
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "s",
  }), "idle");
});

test("reduce：回放用户后的思考由新 occupancy 空闲读数收口", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "frame", frame: {
    t: "transcript",
    program: "cursor",
    acp_session: "s",
    live: true,
    frames: [
      { t: "user_message", program: "cursor", acp_session: "s", replay: true, text: "go" },
    ],
  } });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "thought", program: "cursor", acp_session: "s", text: "plan" } });
  assert.equal(state.busy, true);
  assert.equal(state.messages.at(-1)?.live, true);
  assert.equal(hasOpenTurn(state.messages), true);
  assert.equal(turnStillRunning(state.messages), true);
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "cursor", busy: [] } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(state.busy, false);
  assert.equal(state.messages.at(-1)?.stop, "");
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "s",
  }), "idle");
});

test("reduce：末条工具仍在等待但 live=false 可恢复 Send", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "claude" });
  state = applyDialog(state, { type: "frame", frame: {
    t: "transcript",
    program: "claude",
    acp_session: "s",
    live: false,
    frames: [
      { t: "user_message", program: "claude", acp_session: "s", text: "go" },
      { t: "turn_start", program: "claude", acp_session: "s" },
      { t: "tool", program: "claude", acp_session: "s", id: "done-1", title: "ls", status: "completed" },
      { t: "tool", program: "claude", acp_session: "s", id: "wait-1", title: "python3", status: "pending" },
    ],
  } });
  assert.equal(turnHasUnfinishedWork(state.messages), true);
  assert.equal(turnStillRunning(state.messages), true);
  assert.equal(state.messages.at(-1)?.stop, "");
  assert.equal(state.occupancyBusy.includes("s"), false);
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "claude", busy: [] } });
  assert.equal(state.occupancyBusy.includes("s"), false);
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "s",
  }), "idle");
});

test("reduce：刚发出时空 occupancy 不能当成确认空闲", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = { ...state, draftRef: "new:draft1" };
  state = applyDialog(state, { type: "send-began" });
  assert.ok(state.occupancyPendingAt);
  state = applyDialog(state, { type: "frame", frame: {
    t: "occupancy",
    program: "cursor",
    busy: [],
  } });
  assert.ok(state.occupancyPendingAt, "empty occupancy while pending stays pending");
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "new:draft1",
    pendingAt: state.occupancyPendingAt,
    pendingSession: state.occupancyPendingSession,
  }), "uncertain");
});

test("sessionListStatus：进行中优先于中断和未读，绿点只表示未读完成", () => {
  assert.equal(sessionListStatus("a", ["a"], ["a"], ["a"]), "running");
  assert.equal(sessionListStatus("a", [], ["a"], ["a"]), "interrupted");
  assert.equal(sessionListStatus("a", [], [], ["a"]), "unread");
  assert.equal(sessionListStatus("a", [], [], []), null);
});

test("模型目录刷新保留配置菜单中已选的基础模型，不退回旧组合型号", () => {
  let state = { ...initialDialogState(), program: "codex", activeSession: "existing" };
  state = applyDialog(state, { type: "frame", frame: { t: "config", program: "codex", options: [{
    id: "model", name: "Model", category: "model", type: "select", current: "gpt-5.4",
    options: [{ value: "gpt-5.4", name: "GPT-5.4" }, { value: "gpt-5.3", name: "GPT-5.3" }],
  }] } });
  state = applyDialog(state, { type: "frame", frame: { t: "models", program: "codex", models: [
    { id: "gpt-5.4-high", name: "GPT-5.4 High", default: true },
  ] } });
  assert.equal(state.selectedModel, "gpt-5.4");
  state = applyDialog(state, { type: "frame", frame: { t: "models", program: "codex", models: [
    { id: "gpt-5.4", name: "GPT-5.4", usable: false },
    { id: "gpt-5.3", name: "GPT-5.3", default: true },
  ] } });
  assert.equal(state.selectedModel, "gpt-5.3", "explicitly unavailable models still fall back");
});

test("reduce：回放没有 done 时每条用户消息后的回复各成一轮", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  const replay = { program: "cursor", acp_session: "s", replay: true };
  for (const frame of [
    { t: "user_message", ...replay, text: "q1" },
    { t: "delta", ...replay, text: "a1" },
    { t: "user_message", ...replay, text: "q2" },
    { t: "delta", ...replay, text: "a2" },
  ]) {
    state = applyDialog(state, { type: "frame", frame });
  }
  assert.deepEqual(
    state.messages.map((message) =>
      message.kind === "user" ? `u:${message.text}` : `t:${message.items.map((item) => item.text).join("")}`,
    ),
    ["u:q1", "t:a1", "u:q2", "t:a2"],
  );
  assert.ok(state.messages.filter((message) => message.kind === "user").every((message) => message.replay === true));
  state = applyDialog(state, { type: "frame", frame: { t: "commands", program: "cursor", commands: [{ name: "x", description: "y" }] } });
  assert.equal(state.messages.length, 4, "commands 不进消息流");
  assert.deepEqual(state.commands, [{ name: "x", description: "y" }]);
});
