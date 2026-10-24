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
import { hasOpenTurn, isRetriableStreamCancelText, sessionListStatus, sessionWaitingWake, turnStillRunning } from "../src/shell/cloud-computer/agent-dialog/session-status.ts";

const PROGRAMS = ["cursor", "claude", "codex", "hermes", "oceanleo"];

test("live evidence withholds idle for all programs, without reviving historical tools", () => {
  for (const program of PROGRAMS) {
    const probe = { linkUp: true, occupancyAt: 10, now: 11, occupancyBusy: [], sessionId: "s" };
    const turn = { kind: "turn", id: "turn", acpSession: "s", live: true, stop: "", items: [
      { kind: "tool", id: "tool", tool: { id: "tool", status: "in_progress", content: [], locations: [] } },
    ] };
    assert.equal(composerOccupancy({ ...probe, messages: [turn] }), "uncertain", program);
    assert.equal(composerOccupancy({ ...probe, occupancyBusy: ["s"], messages: [turn] }), "working", program);
    for (const stop of ["end_turn", "cancelled", "error"]) {
      assert.equal(composerOccupancy({ ...probe, messages: [{ ...turn, stop }] }), "idle", `${program}: ${stop}`);
    }
    assert.equal(composerOccupancy({ ...probe, messages: [{ ...turn, live: false }] }), "idle", program);
    assert.equal(composerOccupancy({ ...probe, sessionId: "new", messages: [turn] }), "idle", program);
    assert.equal(composerOccupancy({ ...probe, messages: [turn, { kind: "user", id: "new", text: "next" }] }), "idle", program);
  }
});

test("completed transcript resolves live evidence even with residual pending tools", () => {
  let state = { ...initialDialogState(), program: "codex", activeSession: "s" };
  state = applyDialog(state, { type: "frame", frame: { t: "tool", program: "codex", acp_session: "s", id: "tool", status: "in_progress" } });
  state = applyDialog(state, { type: "frame", frame: { t: "transcript", program: "codex", acp_session: "s", live: false, frames: [
    { t: "tool", program: "codex", acp_session: "s", id: "tool", status: "in_progress" },
  ] } });
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s", messages: state.messages }), "idle");
});

test("turn_start with no output yet still withholds idle after a contradictory probe", () => {
  let state = { ...initialDialogState(), program: "codex", activeSession: "s" };
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "codex", acp_session: "s" } });
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "codex", busy: [] } });
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s", messages: state.messages }), "uncertain");
});

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
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", now: 11,
  }), "idle", "fresh server idle outranks stale transcript work");
  assert.equal(composerOccupancy({
    linkUp: true, occupancyAt: 1, occupancyBusy: [], sessionId: "s",
    now: 1 + OCCUPANCY_STALE_MS + 1,
  }), "uncertain");
  assert.equal(composerOccupancy({
    linkUp: false, occupancyAt: null, occupancyBusy: [], sessionId: "s",
  }), "uncertain");
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

test("后台等待仍可识别，但不会让左侧图标走动或占用输入框", () => {
  assert.deepEqual(confirmedWaitingSessions(["parked"], true), ["parked"]);
  assert.deepEqual(confirmedWaitingSessions(["parked"], false), []);
  assert.equal(sessionListStatus("parked", [], [], []), null);
  assert.equal(sessionListStatus("parked", ["parked"], [], []), "running");
  assert.equal(sessionListStatus("idle", [], [], []), null);
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

test("composerOccupancy：旧工具状态不能覆盖服务端空闲", () => {
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
    linkUp: true, occupancyAt: 10, occupancyBusy: [], sessionId: "s", now: 11,
  }), "idle");
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
  const stopping = [
    messages[0],
    {
      ...inProgress[1],
      stop: "stopping",
    },
  ];
  assert.equal(turnStillRunning(stopping), false);
});

test("open turn stays working after occupancy empties", () => {
  const messages = [
    { kind: "user", id: "u", text: "go" },
    {
      kind: "turn",
      id: "t",
      acpSession: "s",
      stop: "",
      items: [{ kind: "assistant", id: "a", text: "working" }],
    },
  ];
  assert.equal(turnStillRunning(messages), true);
  assert.equal(isRetriableStreamCancelText("Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)"), true);
  assert.equal(isRetriableStreamCancelText("already finished"), false);
});

test("replayed user plus live-armed thought stays working after occupancy empties", () => {
  const messages = [
    { kind: "user", id: "u", text: "go", replay: true },
    {
      kind: "turn",
      id: "t",
      acpSession: "s",
      stop: "",
      live: true,
      items: [{ kind: "thought", id: "h", text: "plan" }],
    },
  ];
  assert.equal(hasOpenTurn(messages), true);
  assert.equal(turnStillRunning(messages), true);
  const historyOnly = [
    { kind: "user", id: "u", text: "old", replay: true },
    {
      kind: "turn",
      id: "t",
      acpSession: "s",
      stop: "",
      items: [{ kind: "thought", id: "h", text: "old plan" }],
    },
  ];
  assert.equal(hasOpenTurn(historyOnly), false);
  assert.equal(turnStillRunning(historyOnly), false);
});

test("invalid_argument 从 occupancy busy 列表拿掉该会话", () => {
  assert.deepEqual(
    occupancyBusyAfterFrame(["s"], { t: "error", code: "invalid_argument", acp_session: "s" }),
    [],
  );
  assert.deepEqual(
    occupancyBusyAfterFrame(["s"], {
      t: "error",
      code: "acp_start_failed",
      acp_session: "s",
      text: "Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)",
    }),
    ["s"],
  );
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
  }), "uncertain");
});

test("cancel request waits for server termination and survives view restoration", () => {
  for (const program of PROGRAMS) {
    let state = initialDialogState();
    state = applyDialog(state, { type: "program", program });
    state = applyDialog(state, { type: "session-loading", id: "s" });
    state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program, acp_session: "s" } });
    state = applyDialog(state, { type: "frame", frame: { t: "thought", program, acp_session: "s", text: "working" } });
    state = applyDialog(state, { type: "cancel-local" });
    assert.equal(state.messages.at(-1)?.stop, "stopping", program);
    assert.equal(state.busy, true, program);
    assert.deepEqual(state.occupancyBusy, ["s"], program);
    state = applyDialog(state, { type: "program", program: "claude" });
    state = applyDialog(state, { type: "program", program });
    state = applyDialog(state, { type: "restore-view", messages: [{ kind: "turn", id: "t", acpSession: "s", stop: "stopping", items: [] }], activeSession: "s", sessions: [], sessionsSupported: true, sessionLoading: false, models: [], modelSource: "", selectedModel: "", mode: null, selectedMode: "", configOptions: [], commands: [] });
    assert.equal(state.busy, true, program);
    state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program, busy: [] } });
    assert.equal(state.busy, false, program);
    assert.equal(state.messages.at(-1)?.stop, "stopping", program);
    assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s", messages: state.messages }), "uncertain", program);
    state = applyDialog(state, { type: "frame", frame: { t: "done", program, acp_session: "s", stop: "cancelled" } });
    assert.equal(state.messages.at(-1)?.stop, "cancelled", program);
  }
});

test("cancel delivery uncertainty needs terminal confirmation after reconnect", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s" } });
  state = applyDialog(state, { type: "cancel-local" });
  state = applyDialog(state, { type: "occupancy-lost" });
  assert.equal(state.messages.at(-1)?.stop, "stopping");
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s" }), "uncertain");
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "cursor", busy: ["s"] } });
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s" }), "working");
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "cursor", busy: [] } });
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s", messages: state.messages }), "uncertain");
  state = applyDialog(state, { type: "frame", frame: { t: "transcript", program: "cursor", acp_session: "s", live: false, frames: [] } });
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "s", messages: state.messages }), "idle");
});

test("remote task terminal detail clears a send pending before any running reading", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "oceanleo" });
  state = { ...state, draftRef: "oceanleo" };
  state = applyDialog(state, { type: "send-began" });
  assert.ok(state.occupancyPendingAt);
  state = applyDialog(state, { type: "server-settled" });
  state = applyDialog(state, { type: "frame", frame: { t: "occupancy", program: "oceanleo", busy: [] } });
  assert.equal(state.busy, false);
  assert.equal(state.occupancyPendingAt, null);
  assert.equal(composerOccupancy({ linkUp: state.occupancyLink, occupancyAt: state.occupancyAt, occupancyBusy: state.occupancyBusy, sessionId: "oceanleo", pendingAt: state.occupancyPendingAt, pendingSession: state.occupancyPendingSession }), "idle");
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
