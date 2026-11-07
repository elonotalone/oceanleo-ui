// The agent-dialog card (AgentDialogPane, LoginCard, controller, reconnect, questions) is deleted; these cases
// keep the shared helpers the task page and the mobile app still use: install-dir, diff-lines, parse, reduce.
import assert from "node:assert/strict";
import test from "node:test";

import { lineDiff } from "../src/shell/cloud-computer/agent-dialog/diff-lines.ts";
import { installDirPayload } from "../src/shell/cloud-computer/agent-dialog/install-dir.ts";
import { parseModels } from "../src/shell/cloud-computer/agent-dialog/parse.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

test("安装目录、行级 diff，工具帧按 id 合并", () => {
  assert.equal(installDirPayload("~/.local", "full"), "");
  assert.equal(installDirPayload("  ", "full"), "");
  assert.equal(installDirPayload("~/apps", "full"), "~/apps");
  assert.equal(installDirPayload("/opt/tools", "none"), "");
  const rows = lineDiff("a\nb\n", "a\nc\n");
  assert.deepEqual(rows.filter((row) => row.op !== " ").map((row) => `${row.op}${row.text}`), ["-b", "+c"]);

  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "tool", program: "cursor", id: "t1", kind: "edit", title: "Edit file", status: "in_progress" },
  });
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "tool",
      program: "cursor",
      id: "t1",
      status: "completed",
      content: [{ type: "diff", path: "a.txt", old_text: "a\nb", new_text: "a\nc" }],
    },
  });
  const turn = state.messages.find((message) => message.kind === "turn");
  const tool = turn.items.find((item) => item.kind === "tool");
  assert.equal(turn.items.filter((item) => item.kind === "tool").length, 1);
  assert.equal(tool.tool.title, "Edit file");
  assert.equal(tool.tool.status, "completed");
  assert.equal(tool.tool.content[0].type, "diff");
});

test("Fast/effort stay visible across model switches until a real catalog replaces them", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "config",
      program: "cursor",
      options: [{
        id: "mode",
        name: "mode",
        category: "mode",
        current: "agent",
        options: [{ value: "agent", name: "Agent" }],
      }, {
        id: "fast",
        name: "fast",
        category: "fast",
        current: true,
        options: [{ value: true, name: "Fast" }, { value: false, name: "Standard" }],
      }, {
        id: "thought_level",
        name: "thinking",
        category: "thought_level",
        current: "high",
        options: [{ value: "high", name: "high" }, { value: "xhigh", name: "xhigh" }],
      }],
    },
  });
  state = applyDialog(state, { type: "set-model", id: "other" });
  assert.deepEqual(state.configOptions.map((option) => option.id), ["mode", "fast", "thought_level"]);
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "config",
      program: "cursor",
      options: [{
        id: "mode",
        name: "mode",
        category: "mode",
        current: "plan",
        options: [{ value: "agent", name: "Agent" }, { value: "plan", name: "Plan" }],
      }],
    },
  });
  assert.deepEqual(state.configOptions.map((option) => option.id), ["mode", "fast", "thought_level"]);
  state = applyDialog(state, { type: "frame", frame: { t: "config", program: "cursor", options: [] } });
  assert.deepEqual(state.configOptions.map((option) => option.id), ["mode", "fast", "thought_level"]);
  state = applyDialog(state, {
    type: "frame",
    frame: {
      t: "config",
      program: "cursor",
      options: [{
        id: "model",
        name: "Model",
        category: "model",
        current: "other",
        options: [{ value: "other", name: "Other" }],
      }, {
        id: "mode",
        name: "mode",
        category: "mode",
        current: "agent",
        options: [{ value: "agent", name: "Agent" }],
      }],
    },
  });
  assert.deepEqual(state.configOptions.map((option) => option.id), ["model", "mode"]);
});

test("dialog_detached 不把电脑标成离线，输入仍可发", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "program", program: "cursor" });
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "session_opened", program: "cursor", acp_session: "s1" },
  });
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "error", program: "cursor", code: "dialog_detached", acp_session: "s1" },
  });
  assert.equal(state.offline, false);
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "sessions", program: "cursor", supported: true, sessions: [{ id: "s1", title: "one" }], running: ["s1"], busy: [] },
  });
  assert.deepEqual(state.runningSessions, ["s1"]);
});

test("parsePrograms 解析 auth 并派生 logged_in，老帧按 logged_in 退化", async () => {
  const { parsePrograms } = await import("../src/shell/cloud-computer/agent-dialog/parse.ts");
  const rows = parsePrograms([
    { id: "cursor", installed: true, auth: "key" },
    { id: "hermes", installed: true, auth: "malformed" },
    { id: "claude", installed: true, auth: "unknown" },
    { id: "codex", installed: true, auth: "login" },
  ]);
  assert.equal(rows.find((row) => row.id === "cursor").logged_in, true);
  assert.equal(rows.find((row) => row.id === "hermes").logged_in, false);
  assert.equal(rows.find((row) => row.id === "claude").logged_in, null);
  assert.equal(rows.find((row) => row.id === "codex").logged_in, true);
  // 老帧没有 auth 字段：logged_in true→login、false→none、缺→unknown
  const legacy = parsePrograms([
    { id: "cursor", installed: true, logged_in: true },
    { id: "hermes", installed: true, logged_in: false },
    { id: "claude", installed: true, logged_in: null },
  ]);
  assert.equal(legacy.find((row) => row.id === "cursor").auth, "login");
  assert.equal(legacy.find((row) => row.id === "hermes").auth, "none");
  assert.equal(legacy.find((row) => row.id === "claude").auth, "unknown");
  // 不认得的 auth 不猜，按 unknown
  const weird = parsePrograms([{ id: "cursor", installed: true, auth: "maybe" }]);
  assert.equal(weird[0].auth, "unknown");
});

test("Stop waits for the server's terminal result before releasing the composer", () => {
  let state = applyDialog(initialDialogState(), { type: "program", program: "hermes" });
  state = applyDialog(state, { type: "frame", frame: { t: "session_opened", program: "hermes", acp_session: "hermes-session" } });
  state = applyDialog(state, { type: "frame", frame: { t: "turn_start", program: "hermes", acp_session: "hermes-session" } });
  state = applyDialog(state, { type: "frame", frame: { t: "delta", program: "hermes", acp_session: "hermes-session", text: "partial answer" } });

  state = applyDialog(state, { type: "cancel-local" });
  assert.equal(state.busy, true);
  assert.equal(state.messages.find(message => message.kind === "turn").stop, "stopping");

  state = applyDialog(state, { type: "frame", frame: { t: "done", program: "hermes", acp_session: "hermes-session", stop: "cancelled" } });
  assert.equal(state.busy, false);
  assert.equal(state.messages.find(message => message.kind === "turn").stop, "cancelled");
});

test("Hermes catalogs are canonical, preserving a valid explicit selection", () => {
  let state = applyDialog(initialDialogState(), { type: "program", program: "hermes" });
  state = applyDialog(state, { type: "frame", frame: { t: "session_opened", program: "hermes", acp_session: "hermes-session" } });
  state = applyDialog(state, { type: "set-model", id: "deepseek:z" });
  state = applyDialog(state, { type: "frame", frame: { t: "models", program: "hermes", acp_session: "hermes-session", source: "acp", models: [
    { id: "deepseek:z", name: "Z", default: false, provider: "deepseek" },
    { id: "deepseek:a", name: "A", default: true, provider: "deepseek" },
    { id: "deepseek:a", name: "A model", default: true, provider: "deepseek" },
  ] } });

  assert.deepEqual(state.models.map(model => model.id), ["deepseek:a", "deepseek:z"]);
  assert.equal(state.selectedModel, "deepseek:z");
  assert.deepEqual(state.models.map(model => model.default), [true, false]);

  state = applyDialog(state, { type: "set-model", id: "deepseek:stale" });
  state = applyDialog(state, { type: "frame", frame: { t: "models", program: "hermes", acp_session: "hermes-session", source: "acp", models: [
    { id: "deepseek:z", name: "Z", default: false, provider: "deepseek" },
    { id: "deepseek:a", name: "A", default: true, provider: "deepseek" },
  ] } });
  assert.equal(state.selectedModel, "deepseek:a");
});

test("Hermes screenshot catalogs exclude stale deepseek-v4-flash from the offered list", () => {
  const offered = [
    { id: "DeepSeek-V4-Pro", name: "DeepSeek-V4-Pro", default: true, provider: "deepseek" },
    { id: "DeepSeek-V4.1-Flash", name: "DeepSeek-V4.1-Flash", default: false, provider: "deepseek" },
  ];
  const fresh = parseModels(offered, "hermes");
  const restored = parseModels([
    { ...offered[1], default: true },
    { ...offered[0], default: false },
  ], "hermes");
  assert.deepEqual(fresh.map(model => model.id), ["DeepSeek-V4-Pro", "DeepSeek-V4.1-Flash"]);
  assert.deepEqual(restored.map(model => model.id), fresh.map(model => model.id));
  const injected = parseModels([
    { id: "deepseek:deepseek-v4-flash", name: "deepseek-v4-flash", default: true, provider: "deepseek" },
    { id: "deepseek:deepseek-v4-pro", name: "DeepSeek-V4-Pro", default: false, provider: "deepseek" },
    { id: "deepseek:deepseek-flash", name: "DeepSeek-V4.1-Flash", default: false, provider: "deepseek" },
    { id: "openai-api:gpt-4.1", name: "gpt-4.1", default: false, provider: "openai-api" },
  ], "hermes");
  assert.deepEqual(injected.map(model => model.id), [
    "deepseek:deepseek-flash",
    "deepseek:deepseek-v4-pro",
    "openai-api:gpt-4.1",
  ]);
});

test("invalid_argument ends an optimistic send so Stop does not stick", () => {
  let state = applyDialog(initialDialogState(), { type: "program", program: "hermes" });
  state = applyDialog(state, { type: "frame", frame: { t: "session_opened", program: "hermes", acp_session: "s" } });
  state = applyDialog(state, { type: "send-began" });
  state = applyDialog(state, { type: "frame", frame: {
    t: "user_message", program: "hermes", acp_session: "s", text: "hi",
  } });
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "invalid_argument", program: "hermes" } });
  assert.equal(state.busy, false);
  assert.equal(state.occupancyPendingAt, null);
  assert.equal((state.occupancyBusy || []).includes("s"), false);
  assert.equal(state.messages.some((message) => message.kind === "notice" && message.code === "invalid_argument"), true);
});
