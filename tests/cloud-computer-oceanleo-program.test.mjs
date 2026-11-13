// The OceanLeo program's dialog controller, MessageList and oceanleo-program helpers are deleted with the
// agent-dialog card; these cases keep the shared dialog reducer (used by the task page and the mobile app).
import assert from "node:assert/strict";
import test from "node:test";

import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

test("reducer：默认程序是 oceanleo，登录卡空态字段齐全", () => {
  const state = initialDialogState();
  assert.equal(state.program, "oceanleo");
  assert.equal(state.busy, false);
  assert.deepEqual(state.messages, []);
  assert.deepEqual(state.login, {
    open: false,
    program: null,
    phase: "idle",
    url: "",
    code: "",
    needsCode: false,
    codeDraft: "",
    hint: "",
    failed: "",
    pending: false,
  });
});

test("reducer：登录相位 opening → waiting → done，贴码草稿受控", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "open-login", program: "claude" });
  assert.equal(state.login.open, true);
  assert.equal(state.login.program, "claude");
  assert.equal(state.login.phase, "opening");
  assert.equal(state.login.pending, true);

  // hint 可能先于 url 到：也算进入 waiting。
  state = applyDialog(state, { type: "frame", frame: { t: "login_hint", program: "claude", text: "去浏览器完成授权" } });
  assert.equal(state.login.phase, "waiting");
  assert.equal(state.login.hint, "去浏览器完成授权");
  assert.equal(state.login.pending, false);

  state = applyDialog(state, {
    type: "frame",
    frame: { t: "login_url", program: "claude", url: "https://example.com/device", code: "ABCD", needs_code: true },
  });
  assert.equal(state.login.phase, "waiting");
  assert.equal(state.login.url, "https://example.com/device");
  assert.equal(state.login.code, "ABCD");
  assert.equal(state.login.needsCode, true);
  assert.equal(state.login.failed, "");

  state = applyDialog(state, { type: "login-code-draft", code: " 123456 " });
  assert.equal(state.login.codeDraft, " 123456 ");

  state = applyDialog(state, { type: "frame", frame: { t: "login_done", program: "claude" } });
  assert.equal(state.login.phase, "done");
  assert.equal(state.login.open, true);
  assert.equal(state.login.pending, false);

  state = applyDialog(state, { type: "close-login" });
  assert.equal(state.login.open, false);
  assert.equal(state.login.phase, "idle");
});

test("reducer：login_failed 带 code；agent_busy 兜底收尾开着的登录卡", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "open-login", program: "codex" });
  state = applyDialog(state, { type: "frame", frame: { t: "login_failed", program: "codex", code: "timeout" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "timeout");
  assert.equal(state.login.open, true);
  assert.equal(state.login.pending, false);

  // W2 起发 login_failed busy；旧节点可能还发 error agent_busy——登录卡开着时按 busy 收尾。
  // 登录卡不挑当前程序：默认选中是 oceanleo，用户看着 oceanleo 点 codex 的登录也收。
  state = applyDialog(state, { type: "open-login", program: "codex" });
  assert.equal(state.login.phase, "opening");
  state = applyDialog(state, { type: "frame", frame: { t: "error", program: "codex", code: "agent_busy" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "busy");
  // 但 agentBusy 是「当前程序」的输入禁用语义：codex 忙不该禁用 oceanleo 的输入。
  assert.equal(state.agentBusy, false);

  // 不带 program 的 agent_busy（旧节点广播）既收尾登录卡，也置当前 agentBusy。
  state = applyDialog(state, { type: "open-login", program: "codex" });
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "agent_busy" } });
  assert.equal(state.login.phase, "failed");
  assert.equal(state.login.failed, "busy");
  assert.equal(state.agentBusy, true);

  // 登录卡没开时 agent_busy 不碰登录状态。
  state = initialDialogState();
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "agent_busy" } });
  assert.equal(state.login.phase, "idle");
  assert.equal(state.login.open, false);
  assert.equal(state.agentBusy, true);
});

test("reducer：transcript 立刻换成服务端历史；另一路 session 的 agent_busy 不禁用当前输入", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s-keep", messages: [{ kind: "user", id: "u1", text: "cached" }] });
  assert.equal(state.messages[0].text, "cached");
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "transcript",
      program: "cursor",
      acp_session: "s-keep",
      frames: [
        { t: "user_message", program: "cursor", text: "hello", acp_session: "s-keep" },
        { t: "turn_start", program: "cursor", acp_session: "s-keep" },
        { t: "delta", program: "cursor", text: "world", acp_session: "s-keep" },
        { t: "done", program: "cursor", stop: "end_turn", acp_session: "s-keep" },
      ],
    },
  });
  assert.equal(state.activeSession, "s-keep");
  assert.equal(state.sessionLoading, false);
  assert.equal(state.messages[0].kind, "user");
  assert.equal(state.messages[0].text, "hello");
  const turn = state.messages.find((message) => message.kind === "turn");
  assert.ok(turn);
  assert.equal(turn.items.some((item) => item.kind === "assistant" && item.text === "world"), true);
  assert.equal(state.hasOlder, false);
  assert.equal(state.historyOffset, 0);

  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "transcript",
      program: "cursor",
      acp_session: "s-keep",
      mode: "replace",
      offset: 4,
      total: 8,
      has_older: true,
      frames: [
        { t: "user_message", program: "cursor", text: "later", acp_session: "s-keep" },
        { t: "turn_start", program: "cursor", acp_session: "s-keep" },
        { t: "delta", program: "cursor", text: "tail", acp_session: "s-keep" },
        { t: "done", program: "cursor", stop: "end_turn", acp_session: "s-keep" },
      ],
    },
  });
  assert.equal(state.hasOlder, true);
  assert.equal(state.historyOffset, 4);
  assert.equal(state.messages[0].text, "later");
  state = applyDialog(state, { type: "history-loading" });
  assert.equal(state.historyLoading, true);
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "transcript",
      program: "cursor",
      acp_session: "s-keep",
      mode: "prepend",
      offset: 0,
      total: 8,
      has_older: false,
      frames: [
        { t: "user_message", program: "cursor", text: "earlier", acp_session: "s-keep" },
        { t: "turn_start", program: "cursor", acp_session: "s-keep" },
        { t: "delta", program: "cursor", text: "head", acp_session: "s-keep" },
        { t: "done", program: "cursor", stop: "end_turn", acp_session: "s-keep" },
      ],
    },
  });
  assert.equal(state.historyLoading, false);
  assert.equal(state.hasOlder, false);
  assert.equal(state.historyOffset, 0);
  assert.equal(state.messages[0].text, "earlier");
  assert.equal(state.messages.some((message) => message.kind === "user" && message.text === "later"), true);

  state = applyDialog(state, { type: "frame", frame: { t: "sessions", program: "cursor", supported: true, sessions: [{ id: "s-keep", title: "hello" }], active: "s-keep" } });
  assert.equal(state.serverActiveSession, "s-keep");

  state = applyDialog(state, { type: "frame", frame: { t: "error", program: "cursor", code: "agent_busy", acp_session: "s-other" } });
  assert.equal(state.agentBusy, false);
});

test("reducer：未知帧只推进接收游标；切换程序不影响原程序的进行中轮次", () => {
  let state = initialDialogState();
  for (const frame of [
    { t: "brand_new_frame", payload: 1 },
    { t: "brand_new_frame", program: "cursor" },
    { t: "" },
  ]) {
    const before = state;
    state = applyDialog(state, { type: "frame", frame });
    assert.equal(state.frameCursor, before.frameCursor + 1);
    assert.deepEqual({ ...state, frameCursor: before.frameCursor }, before,
      "unknown frames do not change messages, program, input or session state");
  }

  state = { ...state, draftRef: "new:oceanleo-draft" };
  state = applyDialog(state, { type: "send-began" });
  assert.equal(state.busy, false, "sending is pending until the server reports work");
  assert.equal(state.occupancyPendingSession, "new:oceanleo-draft");
  state = applyDialog(state, { type: "frame", frame: {
    t: "sessions", program: "oceanleo", supported: true, sessions: [], busy: ["new:oceanleo-draft"],
  } });
  assert.equal(state.busy, true);
  state = applyDialog(state, { type: "program", program: "cursor" });
  assert.equal(state.program, "cursor");
  assert.equal(state.busy, false);
  assert.equal(Boolean(state.liveTurns["oceanleo::new:oceanleo-draft"]), true);
});

test("reducer：发送等待服务端确认，turn_start 补上会话 id 后显示 Stop", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "send-began" });
  assert.equal(state.busy, false);
  assert.equal(typeof state.occupancyPendingAt, "number");
  assert.equal(Boolean(state.liveTurns["cursor::"]), false);
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s1" } });
  assert.equal(state.activeSession, "s1");
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::s1"]), true);
  assert.equal(Boolean(state.liveTurns["cursor::"]), false);
});

test("reducer：多会话 liveTurns 互不打断；invalid_argument 只结束当前会话", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s-a" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-a" } });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);

  state = applyDialog(state, { type: "session-loading", id: "s-b" });
  assert.equal(state.activeSession, "s-b");
  assert.equal(state.busy, false);
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);

  state = applyDialog(state, { type: "send-began" });
  assert.equal(state.busy, false);
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-b" } });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::s-b"]), true);

  state = applyDialog(state, { type: "frame", frame: { t: "error", program: "cursor", code: "invalid_argument", acp_session: "s-b" } });
  assert.equal(state.busy, false);
  assert.equal(Boolean(state.liveTurns["cursor::s-b"]), false);

  state = applyDialog(state, { type: "frame", frame: { t: "done", program: "cursor", stop: "end_turn", acp_session: "s-b" } });
  assert.equal(state.busy, false);
  assert.equal(Boolean(state.liveTurns["cursor::s-b"]), false);
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);

  state = applyDialog(state, { type: "restore-view", messages: [], activeSession: "s-a", sessions: [], sessionsSupported: true, sessionLoading: false, models: [], modelSource: "", selectedModel: "", mode: null, selectedMode: "", configOptions: [], commands: [] });
  assert.equal(state.busy, true);
  assert.equal(state.activeSession, "s-a");

  state = applyDialog(state, { type: "program", program: "claude" });
  assert.equal(state.busy, false);
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);
});

test("reducer：Stop 请求保留忙碌，直到 sessions.busy 确认停止", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = { ...state, draftRef: "new:draft1" };
  state = applyDialog(state, { type: "send-began" });
  assert.equal(state.busy, false);
  assert.equal(state.occupancyPendingSession, "new:draft1");
  state = applyDialog(state, { type: "frame", frame: {
    t: "sessions", program: "cursor", supported: true, sessions: [], busy: ["new:draft1"],
  } });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::new:draft1"]), true);

  state = applyDialog(state, { type: "cancel-local" });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::new:draft1"]), true);

  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "sessions",
      program: "cursor",
      supported: true,
      sessions: [{ id: "s-ghost", title: "s-ghost" }],
      busy: ["new:draft1"],
      running: [],
    },
  });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::new:draft1"]), true);

  state = applyDialog(state, { type: "session-loading", id: "s-a" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-a" } });
  state = applyDialog(state, { type: "cancel-local" });
  assert.equal(state.busy, true);
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "sessions",
      program: "cursor",
      supported: true,
      sessions: [{ id: "s-a", title: "A" }],
      busy: ["s-a"],
      running: ["s-a"],
    },
  });
  assert.equal(state.busy, true);
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);
  state = applyDialog(state, { type: "frame", frame: { t: "sessions", program: "cursor", supported: true, sessions: [], busy: [] } });
  assert.equal(state.busy, false, "a prior busy reading followed by idle confirms termination");
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-a" } });
  assert.equal(state.busy, true, "a new live frame can begin later work");
  state = applyDialog(state, { type: "frame", frame: { t: "sessions", program: "cursor", supported: true, sessions: [], busy: [] } });
  assert.equal(state.busy, false);
});

test("reducer：sessions.busy 清掉已结束的回合，不把空闲 running 当成进行中", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, { type: "session-loading", id: "s-a" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-a" } });
  state = applyDialog(state, { type: "session-loading", id: "s-b" });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "cursor", acp_session: "s-b" } });
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), true);
  assert.equal(Boolean(state.liveTurns["cursor::s-b"]), true);
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "sessions",
      program: "cursor",
      supported: true,
      sessions: [{ id: "s-a", title: "A" }, { id: "s-b", title: "B" }],
      busy: ["s-b"],
      running: ["s-a", "s-b"],
    },
  });
  assert.equal(Boolean(state.liveTurns["cursor::s-a"]), false);
  assert.equal(Boolean(state.liveTurns["cursor::s-b"]), true);
  assert.deepEqual(state.runningSessions, ["s-a", "s-b"]);
});
