// W4 2026-10-31 task page polish: wider reading column, the small time above
// user bubbles (task chat + LeoChat share one pure function and one separator),
// and the step mark that replaced the accent-blue dot.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  CHAT_TIME_GAP_MS,
  agentMessageTimeSeparators,
  chatTimeMs,
  chatTimeSeparators,
  formatChatTime,
} from "../src/shell/chat-time-separators.ts";
import {
  AGENT_CONVERSATION_MAX_WIDTH_CLASS,
  AGENT_CONVERSATION_MAX_WIDTH_REM,
} from "../src/shell/agent-conversation-layout.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/t" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);
const { AgentProgress } = await import(await compileModule("src/shell/AgentProgress.tsx", { "../i18n/ui/useUI": uiStub }));
const { AgentStepMark, agentStepState, AGENT_STEP_STATES } = await import(await compileModule("src/shell/AgentStepMark.tsx", {}));
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./share/share-clipboard": dataModule("export async function writeClipboardText() { return true; }"),
  "../lib/cloud-computer-api": dataModule("export async function cloudComputerRequest() { return {}; } export function computerIdRequestField() { return {}; }"),
}));
const { buildRows } = await import("../src/shell/messages/conversation/conversation-store.ts");
const { dialogToAgentMessages } = await import("../src/shell/native-thread/map-dialog.ts");

async function render(Component, props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, cleanup: () => { act(() => root.unmount()); host.remove(); } };
}

const local = (text) => Date.parse(text); // local time (no Z): day boundaries follow the test machine
const user = (created_at, extra = {}) => ({ id: Math.random(), role: "user", kind: "text", content: "hi", created_at, ...extra });
const reply = (created_at) => ({ id: Math.random(), role: "assistant", kind: "text", content: "ok", created_at });

// ---------------------------------------------------------------------------
// The pure function
// ---------------------------------------------------------------------------

test("first anchor gets a time; quick follow-ups do not; a gap over 5 minutes does", () => {
  assert.equal(CHAT_TIME_GAP_MS, 5 * 60 * 1000);
  const items = ["2026-10-31T16:54:00", "2026-10-31T16:55:00", "2026-10-31T16:59:59", "2026-10-31T17:05:30"].map(local);
  const seps = chatTimeSeparators(items, { timeOf: (at) => at });
  assert.deepEqual([...seps.keys()], [0, 3]);
  assert.equal(seps.get(0), items[0]);
});

test("a new local day gets a time even within 5 minutes; untimed items never get one nor reset the clock", () => {
  const items = [local("2026-10-30T23:58:00"), null, local("2026-10-31T00:01:00"), local("2026-10-31T00:02:00")];
  const seps = chatTimeSeparators(items, { timeOf: (at) => at });
  assert.deepEqual([...seps.keys()], [0, 2]);
});

test("task chat: only user messages are anchors; the gap is measured from the previous user message", () => {
  const messages = [
    user("2026-10-31T16:54:00"),
    reply("2026-10-31T16:54:10"),
    reply("2026-10-31T17:20:00"), // the agent worked a long time: no time line on its reply
    user("2026-10-31T16:57:00"), // 3 minutes after the previous user message
    user("2026-10-31T17:30:00"),
  ];
  assert.deepEqual([...agentMessageTimeSeparators(messages).keys()], [0, 4]);
});

test("task chat: a just-sent bubble without a saved time counts as now; saved native history without a time gets none", () => {
  const now = local("2026-10-31T18:00:00");
  const optimistic = [user("2026-10-31T16:54:00"), reply("2026-10-31T16:54:10"), user(undefined)];
  assert.deepEqual([...agentMessageTimeSeparators(optimistic, now).entries()], [[0, local("2026-10-31T16:54:00")], [2, now]]);
  const firstEver = [user(undefined)];
  assert.deepEqual([...agentMessageTimeSeparators(firstEver, now).entries()], [[0, now]]);
  const savedNative = [user(undefined, { meta: { native: true } }), reply(undefined)];
  assert.equal(agentMessageTimeSeparators(savedNative, now).size, 0);
  const queuedNative = [user(undefined, { meta: { native: true, native_pending: true } })];
  assert.deepEqual([...agentMessageTimeSeparators(queuedNative, now).keys()], [0]);
});

test("native: a live send carries its time through map-dialog as created_at", () => {
  const at = local("2026-10-31T16:54:00");
  const [message] = dialogToAgentMessages([{ kind: "user", id: "u1", text: "hi", at }], { live: true });
  assert.equal(message.created_at, new Date(at).toISOString());
  const [untimed] = dialogToAgentMessages([{ kind: "user", id: "u2", text: "hi" }], { live: false });
  assert.equal(untimed.created_at, undefined);
});

test("chatTimeMs reads ISO and epoch seconds / ms; junk is null", () => {
  assert.equal(chatTimeMs("2026-10-31T08:54:00Z"), Date.UTC(2026, 9, 31, 8, 54));
  assert.equal(chatTimeMs(1_790_000_000), 1_790_000_000_000);
  assert.equal(chatTimeMs(1_790_000_000_000), 1_790_000_000_000);
  assert.equal(chatTimeMs(""), null);
  assert.equal(chatTimeMs("nope"), null);
  assert.equal(chatTimeMs(undefined), null);
});

test("labels: today / yesterday / weekday / date, localized by Intl (en + zh)", () => {
  const now = local("2026-10-31T18:00:00"); // a Saturday
  assert.equal(formatChatTime(local("2026-10-31T16:54:00"), { locale: "en", now }), "Today 4:54 PM");
  assert.equal(formatChatTime(local("2026-10-31T16:54:00"), { locale: "zh-CN", now }), "今天 16:54");
  assert.equal(formatChatTime(local("2026-10-30T09:05:00"), { locale: "en", now }), "Yesterday 9:05 AM");
  assert.equal(formatChatTime(local("2026-10-30T09:05:00"), { locale: "zh-CN", now }), "昨天 09:05");
  assert.equal(formatChatTime(local("2026-10-28T16:54:00"), { locale: "en", now }), "Wednesday 4:54 PM");
  assert.equal(formatChatTime(local("2026-10-28T16:54:00"), { locale: "zh-CN", now }), "星期三 16:54");
  assert.equal(formatChatTime(local("2026-10-20T16:54:00"), { locale: "en", now }), "Oct 20 4:54 PM");
  assert.equal(formatChatTime(local("2026-10-20T16:54:00"), { locale: "zh-CN", now }), "10月20日 16:54");
  assert.match(formatChatTime(local("2025-10-20T16:54:00"), { locale: "en", now }), /2025/);
  // A bad locale never throws.
  assert.ok(formatChatTime(local("2026-10-31T16:54:00"), { locale: "!!", now }).length > 0);
});

// ---------------------------------------------------------------------------
// Rendering: task bubble and LeoChat share the separator
// ---------------------------------------------------------------------------

test("task bubble: timeAbove renders the shared centred separator above the user bubble; absent renders none", async () => {
  const at = Date.now();
  const withTime = await render(AgentTranscriptBubble, { message: user(new Date(at).toISOString()), timeAbove: at });
  const without = await render(AgentTranscriptBubble, { message: user(new Date(at).toISOString()) });
  try {
    const sep = withTime.host.querySelector("[data-chat-time-separator]");
    assert.ok(sep, "separator rendered");
    assert.match(sep.className, /text-center/);
    assert.match(sep.className, /text-stone-400/);
    assert.match(sep.textContent, /^Today /);
    assert.equal(sep.querySelector("time").getAttribute("datetime"), new Date(at).toISOString());
    assert.equal(sep.nextElementSibling?.textContent.includes("hi"), true, "time sits above the bubble");
    assert.equal(without.host.querySelector("[data-chat-time-separator]"), null);
  } finally {
    withTime.cleanup();
    without.cleanup();
  }
});

test("LeoChat rows use the same rule and render through the same separator component", () => {
  const rows = buildRows([
    { id: "m1", conversation_id: "c", seq: 1, sender_id: "a", sender_kind: "user", kind: "text", body: "x", created_at: "2026-10-31T16:54:00", recalled_at: null, hidden_reason: null },
    { id: "m2", conversation_id: "c", seq: 2, sender_id: "b", sender_kind: "user", kind: "text", body: "y", created_at: "2026-10-31T16:56:00", recalled_at: null, hidden_reason: null },
    { id: "m3", conversation_id: "c", seq: 3, sender_id: "a", sender_kind: "user", kind: "text", body: "z", created_at: "2026-10-31T17:30:00", recalled_at: null, hidden_reason: null },
  ], []);
  const expected = chatTimeSeparators(["2026-10-31T16:54:00", "2026-10-31T16:56:00", "2026-10-31T17:30:00"], { timeOf: chatTimeMs });
  assert.deepEqual(rows.filter((r) => r.type === "time").map((r) => r.at), [...expected.values()]);
  const list = readFileSync(new URL("../src/shell/messages/conversation/MessageList.tsx", import.meta.url), "utf8");
  assert.match(list, /import \{ ChatTimeSeparator \} from "\.\.\/\.\.\/ChatTimeSeparator"/);
  assert.match(list, /row\.type === "time"\) return <ChatTimeSeparator/);
  assert.doesNotMatch(list, /DayDivider/);
});

// ---------------------------------------------------------------------------
// Step mark
// ---------------------------------------------------------------------------

test("step state: running / waiting / done / failed / stopped", () => {
  const tool = (status) => ({ type: "tool", key: status, status });
  assert.equal(agentStepState([tool("done"), tool("running")], true, 0), "running");
  assert.equal(agentStepState([tool("done"), tool("pending")], true, 0), "waiting");
  assert.equal(agentStepState([tool("done")], false, 0), "done");
  assert.equal(agentStepState([tool("done"), tool("failed")], false, 1), "failed");
  assert.equal(agentStepState([tool("running")], false, 0), "stopped");
});

test("step mark: one element per state, changes shape through data-step-state; css shapes each state, no blue, motion tokens only", async () => {
  for (const state of AGENT_STEP_STATES) {
    const view = await render(AgentStepMark, { state });
    try {
      const mark = view.host.querySelector(".leo-step-mark");
      assert.equal(mark.getAttribute("data-step-state"), state);
      assert.ok(mark.querySelector(".leo-step-mark-core"));
      assert.ok(mark.querySelector(".leo-step-mark-check"));
    } finally {
      view.cleanup();
    }
  }
  const css = readFileSync(new URL("../src/theme/globals.css", import.meta.url), "utf8");
  const start = css.indexOf("/* ---------- 步骤色块");
  const block = css.slice(start, css.indexOf("@media (prefers-reduced-motion: reduce)", start) + 400);
  for (const state of AGENT_STEP_STATES) assert.match(block, new RegExp(`data-step-state="${state}"\\] \\.leo-step-mark-core`));
  assert.match(block, /leo-step-morph/);
  assert.match(block, /rotate\(45deg\)/, "failed = diamond");
  assert.match(block, /prefers-reduced-motion/);
  assert.doesNotMatch(block, /#4f46e5|#3b82f6|#2563eb|#0ea5e9|#6366f1/i, "never blue");
});

test("AgentProgress: the summary row shows the step mark (no accent dot / spinner), running and done", async () => {
  const tool = (status) => ({ id: 1, role: "assistant", kind: "step", content: "", meta: { tool: "shell.exec", title: "ls", tool_status: status } });
  const live = await render(AgentProgress, { messages: [tool("running")], running: true, accent: "#4f46e5" });
  const done = await render(AgentProgress, { messages: [tool("done")], running: false, accent: "#4f46e5" });
  try {
    const liveToggle = live.host.querySelector("[data-agent-process-toggle]");
    assert.ok(liveToggle, "summary row rendered");
    assert.equal(liveToggle.querySelector(".leo-step-mark")?.getAttribute("data-step-state"), "running");
    assert.equal(liveToggle.querySelector(".v-spinner"), null);
    assert.equal(done.host.querySelector("[data-agent-process-toggle] .leo-step-mark")?.getAttribute("data-step-state"), "done");
    assert.doesNotMatch(live.host.innerHTML + done.host.innerHTML, /4f46e5|79, 70, 229/i, "accent never painted");
  } finally {
    live.cleanup();
    done.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Width
// ---------------------------------------------------------------------------

test("reading column: 45rem (at most 47 CJK chars at 15px); transcript and composer share the one constant", () => {
  assert.equal(AGENT_CONVERSATION_MAX_WIDTH_REM, 45);
  assert.equal(AGENT_CONVERSATION_MAX_WIDTH_CLASS, `max-w-[${AGENT_CONVERSATION_MAX_WIDTH_REM}rem]`);
  const source = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /max-w-2xl/, "no literal width left in the task chat");
  const column = source.match(/<div className=\{`([^`]*)`\} data-agent-stream-column="">/);
  assert.ok(column);
  for (const cls of ["mx-auto", "w-full", "min-w-0", "${AGENT_CONVERSATION_MAX_WIDTH_CLASS}"]) assert.ok(column[1].includes(cls), cls);
  assert.match(source, /<div className=\{`mx-auto w-full \$\{AGENT_CONVERSATION_MAX_WIDTH_CLASS\} space-y-2`\}>\s*\{pane\.footer\}/);
});
