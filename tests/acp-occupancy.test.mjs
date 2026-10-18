import assert from "node:assert/strict";
import test from "node:test";

import {
  composerOccupancy,
  confirmedBusySessions,
  confirmedWaitingSessions,
  occupancyBusyAfterFrame,
  occupancyFresh,
  OCCUPANCY_STALE_MS,
} from "../src/shell/cloud-computer/agent-dialog/occupancy.ts";
import { createOccupancyProbe } from "../src/shell/cloud-computer/agent-dialog/occupancy-probe.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";
import { sessionListStatus, sessionWaitingWake, turnStillRunning } from "../src/shell/cloud-computer/agent-dialog/session-status.ts";

const PROGRAMS = ["cursor", "claude", "codex", "hermes", "oceanleo"];

test("composerOccupancy：无读数或链路断开是灰的 uncertain", () => {
  assert.equal(composerOccupancy({
    linkUp: false, occupancyAt: Date.now(), occupancyBusy: [], sessionId: "s",
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: null, occupancyBusy: [], sessionId: "s",
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 1, occupancyBusy: [], sessionId: "s", now: 1 + OCCUPANCY_STALE_MS + 1,
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", pendingAt: 20, pendingSession: "s", now: 30,
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "new", pendingAt: 20, pendingSession: "old", now: 30,
  }), "idle");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "new", pendingAt: 20, now: 30,
  }), "idle");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", offline: true, now: 11,
  }), "uncertain");
});

test("composerOccupancy：确认在干活 / 确认空闲", () => {
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: ["s"], sessionId: "s", now: 11,
  }), "working");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: ["other"], sessionId: "s", now: 11,
  }), "idle");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", now: 11,
  }), "idle");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", now: 11, localRunning: true,
  }), "working");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 1, occupancyBusy: [], sessionId: "s",
    now: 1 + OCCUPANCY_STALE_MS + 1, localRunning: true,
  }), "working");
  assert.equal(composerOccupancy({
    linkUp: false, occupancyAt: null, occupancyBusy: [], sessionId: "s", localRunning: true,
  }), "working");
});

test("后台 session 的 turn_start/done/error 改 occupancy.busy，空数组也要落地", () => {
  assert.deepEqual(occupancyBusyAfterFrame([], { t: "turn_start", acp_session: "one" }), ["one"]);
  assert.deepEqual(occupancyBusyAfterFrame(["one", "two"], { t: "done", acp_session: "one" }), ["two"]);
  assert.deepEqual(occupancyBusyAfterFrame(["one"], { t: "done", acp_session: "one" }), []);
  assert.deepEqual(occupancyBusyAfterFrame(["one"], { t: "error", acp_session: "one", code: "acp_exited" }), []);
  assert.equal(occupancyBusyAfterFrame(["one"], { t: "models", acp_session: "one" }), null);
  assert.equal(occupancyBusyAfterFrame(["one"], { t: "done" }), null);
});

test("像素图标只在确认 working 的 busy 列表里", () => {
  assert.deepEqual(confirmedBusySessions(["a"], false), []);
  assert.deepEqual(confirmedBusySessions(["a", "b"], true), ["a", "b"]);
  assert.equal(sessionListStatus("a", confirmedBusySessions(["a"], true), [], []), "running");
  assert.equal(sessionListStatus("a", confirmedBusySessions(["a"], false), [], []), null);
  assert.equal(occupancyFresh({ linkUp: true, occupancyAt: 1, now: 2 }), true);
});

test("后台还在等、之后会自己醒：左侧走动，输入框仍是空闲", () => {
  assert.deepEqual(confirmedWaitingSessions(["parked"], true), ["parked"]);
  assert.deepEqual(confirmedWaitingSessions(["parked"], false), []);
  assert.equal(sessionListStatus("parked", [], [], [], ["parked"]), "running");
  assert.equal(sessionListStatus("idle", [], [], [], ["parked"]), null);
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "parked", now: 11,
  }), "idle");
  assert.equal(sessionWaitingWake([
    { kind: "user", id: "u1", text: "go" },
    { kind: "turn", id: "t1", acpSession: "s", stop: "end_turn", items: [
      { kind: "tool", id: "x", tool: { id: "x", kind: "execute", title: "Watch", status: "completed",
        content: [{ type: "content", text: "Command running in background with ID: btmkyd2nl" }], locations: [] } },
    ] },
  ]), true);
  assert.equal(sessionWaitingWake([
    { kind: "user", id: "u1", text: "go" },
    { kind: "turn", id: "t1", acpSession: "s", stop: "end_turn", items: [
      { kind: "tool", id: "x", tool: { id: "x", kind: "execute", title: "Watch", status: "completed",
        content: [{ type: "content", text: "Command running in background with ID: btmkyd2nl" }], locations: [] } },
    ] },
    { kind: "user", id: "u2", text: "<task-notification><task-id>btmkyd2nl</task-id></task-notification>" },
  ]), false);
  assert.equal(sessionWaitingWake([
    { kind: "user", id: "u1", text: "go" },
    { kind: "turn", id: "t1", acpSession: "s", stop: "end_turn", items: [
      { kind: "tool", id: "x", tool: { id: "x", kind: "execute", title: "Watch", status: "completed",
        content: [{ type: "content", text: "Command running in background with ID: btmkyd2nl" }], locations: [] } },
    ] },
    { kind: "user", id: "u2", text: "next" },
    { kind: "turn", id: "t2", acpSession: "s", stop: "end_turn", items: [
      { kind: "assistant", id: "a", text: "done" },
    ] },
  ]), false);
});

test("occupancy.waiting 进状态，不把输入框打成 working", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "claude" });
  state = { ...state, activeSession: "parked" };
  state = applyDialog(state, { type: "occupancy-link", up: true });
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "claude", busy: [], waiting: ["parked"] } });
  assert.deepEqual(state.occupancyBusy, []);
  assert.deepEqual(state.occupancyWaiting, ["parked"]);
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "parked",
    now: state.occupancyAt,
  }), "idle");
});

test("五个程序的 occupancy 帧都把对应 session 标成 working", () => {
  for (const program of PROGRAMS) {
    let state = initialDialogState();
    state = applyDialog(state, { type: "program", program });
    state = { ...state, activeSession: "live" };
    state = applyDialog(state, { type: "occupancy-link", up: true });
    state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program, busy: ["live"] } });
    assert.deepEqual(state.occupancyBusy, ["live"], program);
    assert.equal(composerOccupancy({
      linkUp: state.occupancyLink,
      occupancyAt: state.occupancyAt,
      occupancyBusy: state.occupancyBusy,
      sessionId: "live",
    }), "working", program);
    state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program, busy: [] } });
    assert.equal(composerOccupancy({
      linkUp: state.occupancyLink,
      occupancyAt: state.occupancyAt,
      occupancyBusy: state.occupancyBusy,
      sessionId: "live",
    }), "idle", program);
  }
});

test("composerOccupancy：已 stamp 的回合只要工具还在等待就是 working", () => {
  const messages = [
    { kind: "user", id: "u", text: "go" },
    {
      kind: "turn",
      id: "t",
      acpSession: "s",
      stop: "end_turn",
      items: [{
        kind: "tool",
        id: "i",
        tool: { id: "wait-1", kind: "execute", title: "python3", status: "pending", content: [], locations: [] },
      }],
    },
  ];
  assert.equal(turnStillRunning(messages), true);
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", now: 11, localRunning: true,
  }), "working");
  const inProgress = [
    messages[0],
    {
      ...messages[1],
      items: [{
        kind: "tool",
        id: "i",
        tool: { id: "run-1", kind: "execute", title: "tsc", status: "in_progress", content: [], locations: [] },
      }],
    },
  ];
  assert.equal(turnStillRunning(inProgress), true);
  const cancelled = [
    messages[0],
    {
      ...inProgress[1],
      stop: "cancelled",
    },
  ];
  assert.equal(turnStillRunning(cancelled), false);
});

test("occupancy-lost 回到 uncertain，像素列表清空", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "codex" });
  state = { ...state, activeSession: "x" };
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "codex", busy: ["x"] } });
  state = applyDialog(state, { type: "occupancy-lost" });
  assert.equal(state.occupancyLink, false);
  assert.equal(state.occupancyAt, null);
  assert.deepEqual(state.occupancyBusy, []);
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "x",
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: state.occupancyLink,
    occupancyAt: state.occupancyAt,
    occupancyBusy: state.occupancyBusy,
    sessionId: "x",
    localRunning: true,
  }), "working");
});

test("occupancy probe：2s 一轮，未应答算 stale", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  const sent = [];
  const probe = createOccupancyProbe({
    allowed: () => true,
    send: (program) => {
      sent.push(program);
      return true;
    },
  });
  t.after(() => probe.reset());
  probe.request("cursor");
  assert.deepEqual(sent, ["cursor"]);
  probe.request("cursor");
  assert.equal(sent.length, 1, "in-flight occupancy does not overlap");
  t.mock.timers.tick(6001);
  assert.equal(probe.stale("cursor"), true);
  probe.receive("cursor");
  assert.equal(probe.stale("cursor"), false);
  probe.start(() => "hermes");
  t.mock.timers.tick(2000);
  assert.ok(sent.includes("hermes"));
});
