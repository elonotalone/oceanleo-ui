// W3 2026-10-30: one process timeline for the OceanLeo cloud agent and native
// programs (Claude Code / Codex / Cursor / Hermes), and no horizontal scrollbar.
//
// Mounts the REAL AgentProgress and AgentTranscriptBubble in jsdom and pins the
// operator rulings: real order; words to the user never inside a block (10-31);
// the rail darkens on hover and folds the module; full tool detail (native diff / terminal /
// locations, cloud args / result / error); reasoning renders as a thought;
// running = open and live, finished = one summary line; each entry folds on its
// own and selecting text never collapses it; auto-allowed permissions hidden;
// notices neutral; long strings wrap.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/t" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Event: window.Event, MouseEvent: window.MouseEvent,
  HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`);
const { AgentProgress } = await import(await compileModule("src/shell/AgentProgress.tsx", {
  "../i18n/ui/useUI": uiStub,
}));
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": uiStub,
  "./share/share-clipboard": dataModule("export async function writeClipboardText() { return true; }"),
  "../lib/cloud-computer-api": dataModule("export async function cloudComputerRequest() { return {}; } export function computerIdRequestField() { return {}; }"),
}));
const { buildAgentRenderItems } = await import("../src/lib/agent-progress.ts");
const { dialogToAgentMessages } = await import("../src/shell/native-thread/map-dialog.ts");

async function render(Component, props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    async update(next) { await act(async () => root.render(React.createElement(Component, { ...props, ...next }))); },
    cleanup() { act(() => root.unmount()); host.remove(); },
  };
}

async function click(element) {
  assert.ok(element, "missing element");
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function nativeTurn(live = true) {
  return dialogToAgentMessages([
    { kind: "user", id: "u", text: "fix it" },
    {
      kind: "turn", id: "t", acpSession: "s", stop: live ? "" : "end_turn", live, items: [
        { kind: "thought", id: "th", text: "The test fails because of **b**." },
        { kind: "tool", id: "e", tool: { id: "e", kind: "edit", title: "Edit /repo/src/a.ts", status: "completed",
          content: [{ type: "diff", path: "/repo/src/a.ts", old_text: "a\nb", new_text: "a\nc" }],
          locations: [{ path: "/repo/src/a.ts", line: 2 }] } },
        { kind: "assistant", id: "mid", text: "Now running the tests." },
        { kind: "permission", id: "auto", permId: "p-auto", title: "Run", permKind: "execute", options: [], toolTitle: "npm test -- --runInBand", chosen: "", auto: true },
        { kind: "tool", id: "x", tool: { id: "x", kind: "execute", title: "npm test", status: live ? "in_progress" : "failed",
          content: [{ type: "terminal", output: "FAIL a.test.ts\n  expected c" }], locations: [] } },
        { kind: "plan", id: "pl", entries: [{ content: "Patch", priority: "high", status: "completed" }, { content: "Verify", priority: "low", status: "in_progress" }] },
        { kind: "usage", id: "us", used: 42, size: 100 },
        ...(live ? [] : [{ kind: "assistant", id: "fin", text: "Patched; one test still fails." }]),
      ],
    },
  ], { live: true });
}

function progressOf(messages) {
  const items = buildAgentRenderItems(messages);
  const blocks = items.filter((item) => item.type === "progress");
  return { items, blocks, block: blocks[0] };
}

function entryKinds(host) {
  const list = host.querySelector("[data-agent-process-entries]");
  return [...list.children].map((node) =>
    node.hasAttribute("data-agent-process-thought") ? "thought"
      : node.hasAttribute("data-agent-process-tool") ? `tool:${node.getAttribute("data-agent-process-tool")}`
        : node.hasAttribute("data-agent-process-plan") ? "plan" : "?");
}

test("native: order preserved, text between tools is a normal message in place, tools expand to diff / terminal / locations, auto-allowed hidden", async () => {
  const { items, blocks } = progressOf(nativeTurn(true));
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message", "progress"], "text between tools ends the block");
  assert.equal(items[2].message.content, "Now running the tests.");
  const first = await render(AgentProgress, { messages: blocks[0].messages, running: false, accent: "#123456" });
  const live = await render(AgentProgress, { messages: blocks[1].messages, running: true, accent: "#123456" });
  try {
    assert.equal(first.host.querySelector("[data-agent-process]").getAttribute("data-agent-process-state"), "done");
    assert.equal(first.host.querySelector("[data-agent-process-entries]"), null, "the block before the text is folded");
    await click(first.host.querySelector("[data-agent-process-toggle]"));
    assert.deepEqual(entryKinds(first.host), ["thought", "tool:edit"]);
    assert.equal(live.host.querySelector("[data-agent-process]").getAttribute("data-agent-process-state"), "running");
    assert.ok(live.host.querySelector("[data-agent-process-entries]"), "the live block is expanded");
    assert.deepEqual(entryKinds(live.host), ["tool:execute", "plan"]);
    for (const view of [first, live]) {
      assert.equal(view.host.querySelector("[data-agent-process-text]"), null, "no text inside a block");
      assert.doesNotMatch(view.host.textContent, /Now running the tests/);
      assert.doesNotMatch(view.host.textContent, /已自动允许|runInBand/, "auto-allowed permission is hidden");
    }
    // Latest plan open while running, with status marks and priority.
    const plan = live.host.querySelector("[data-agent-process-plan-body]");
    assert.ok(plan, "latest plan is expanded while running");
    assert.deepEqual([...plan.querySelectorAll("[data-plan-status]")].map((li) => li.getAttribute("data-plan-status")), ["completed", "in_progress"]);
    assert.match(plan.textContent, /☑/);
    assert.match(plan.textContent, /优先级高/);
    // Running tool shows its status in words.
    const exec = live.host.querySelector('[data-agent-process-tool="execute"]');
    assert.match(exec.textContent, /运行中/);
    // Expand the edit tool: red/green diff lines and its location.
    const edit = first.host.querySelector('[data-agent-process-tool="edit"]');
    await click(edit.querySelector("button"));
    const ops = [...edit.querySelectorAll("[data-diff-op]")].map((row) => row.getAttribute("data-diff-op"));
    assert.deepEqual(ops, [" ", "-", "+"]);
    assert.match(edit.querySelector('[data-diff-op="-"]').className, /rose/);
    assert.match(edit.querySelector('[data-diff-op="+"]').className, /emerald/);
    assert.match(edit.querySelector("[data-agent-process-locations]").textContent, /\/repo\/src\/a\.ts:2/);
    // Terminal output scrolls inside its own box.
    await click(exec.querySelector("button"));
    const terminal = exec.querySelector("[data-agent-process-terminal]");
    assert.equal(terminal.tagName, "PRE");
    assert.match(terminal.textContent, /expected c/);
    assert.match(terminal.className, /overflow-auto/);
    assert.match(terminal.className, /max-h-/);
  } finally { first.cleanup(); live.cleanup(); }
});

test("finished turn: each block collapses to one summary line with steps, failures and usage; texts stay outside; toggling opens it", async () => {
  const { items, blocks } = progressOf(nativeTurn(false));
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message", "progress", "message"]);
  assert.equal(items[2].message.content, "Now running the tests.");
  assert.equal(items[4].message.content, "Patched; one test still fails.", "final answer outside the fold");
  const first = await render(AgentProgress, { messages: blocks[0].messages, running: false });
  const view = await render(AgentProgress, { messages: blocks[1].messages, running: false });
  try {
    assert.match(first.host.querySelector("[data-agent-process-summary]").textContent, /思考 · 1 个步骤/);
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null, "finished = collapsed");
    const line = view.host.querySelector("[data-agent-process-summary]").textContent;
    assert.match(line, /1 个步骤/);
    assert.match(line, /1 个失败/);
    assert.match(line, /用量 42%/);
    assert.match(view.host.querySelector("[data-agent-process-failed]").className, /rose/);
    await click(view.host.querySelector("[data-agent-process-toggle]"));
    assert.ok(view.host.querySelector("[data-agent-process-entries]"), "click opens the whole process");
    await click(view.host.querySelector("[data-agent-process-toggle]"));
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null);
  } finally { first.cleanup(); view.cleanup(); }
});

test("rail: a 12 px button with a 1 px line that darkens on hover; clicking it folds the whole module and it stays folded", async () => {
  const messages = [
    { id: 1, role: "assistant", kind: "analysis", content: "Look first.", meta: { interim: true } },
    { id: 2, role: "assistant", kind: "step", content: "读取文件", meta: { tool: "read_file", status: "running" } },
  ];
  const view = await render(AgentProgress, { messages, running: true });
  try {
    const rail = view.host.querySelector("[data-agent-process-rail]");
    assert.ok(rail, "the rail is rendered while open");
    assert.equal(rail.tagName, "BUTTON");
    assert.equal(rail.getAttribute("type"), "button");
    assert.equal(rail.getAttribute("aria-label"), "收起");
    assert.equal(rail.getAttribute("aria-expanded"), "true");
    assert.match(rail.className, /(^|\s)group(\s|$)/);
    assert.match(rail.className, /(^|\s)w-3(\s|$)/, "12 px hit area");
    assert.match(rail.className, /inset-y-0/, "spans the whole module height");
    const line = rail.querySelector("span");
    assert.match(line.className, /(^|\s)w-px(\s|$)/, "1 px line");
    assert.match(line.className, /(^|\s)bg-stone-200(\s|$)/);
    assert.match(line.className, /group-hover:bg-stone-400/, "darkens on hover");
    assert.match(line.className, /transition-colors/);
    assert.equal(view.host.querySelector("[data-agent-process-entries]").className.includes("border-l"), false, "the old static border is gone");
    await click(rail);
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null, "click folds the whole module");
    assert.equal(view.host.querySelector("[data-agent-process-rail]"), null);
    assert.equal(view.host.querySelector("[data-agent-process-toggle]").getAttribute("aria-expanded"), "false");
    // The user's fold stands while the block keeps running and when it ends.
    await view.update({ messages: [...messages, { id: 3, role: "assistant", kind: "step", content: "运行", meta: { status: "running" } }], running: true });
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null);
    await view.update({ running: false });
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null);
    await click(view.host.querySelector("[data-agent-process-toggle]"));
    assert.ok(view.host.querySelector("[data-agent-process-rail]"), "the header reopens it");
  } finally { view.cleanup(); }
});

test("live → text starts after the block: running drops and it folds by itself; the text renders as a normal bubble", async () => {
  const { liveAgentProgressKey } = await import("../src/lib/agent-progress.ts");
  const user = { id: 1, role: "user", kind: "text", content: "天气" };
  const streaming = { id: 2, role: "assistant", kind: "text", content: "", meta: { streaming: true, reasoning: "要查一下" } };
  const before = [user, streaming];
  const beforeItems = buildAgentRenderItems(before);
  const key = beforeItems[1].key;
  assert.equal(liveAgentProgressKey(beforeItems, before), key);
  const view = await render(AgentProgress, { messages: beforeItems[1].messages, running: true });
  try {
    assert.ok(view.host.querySelector("[data-agent-process-entries]"));
    const after = [user, { ...streaming, content: "我先查一下上海的天气。" }];
    const afterItems = buildAgentRenderItems(after);
    assert.equal(afterItems[1].key, key, "same block, same key");
    assert.equal(afterItems[2].key, beforeItems[2].key, "same message, same key");
    assert.equal(liveAgentProgressKey(afterItems, after), "");
    await view.update({ messages: afterItems[1].messages, running: false });
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null, "folded once text started");
  } finally { view.cleanup(); }
  // The cloud speech row, after its round ends, is still the same normal bubble.
  const speech = { id: 2, role: "assistant", kind: "analysis", content: "我先查一下上海的天气。", meta: { interim: true, speech: true, reasoning: "要查一下" } };
  const items = buildAgentRenderItems([user, speech]);
  assert.equal(items[2].type, "message");
  const bubble = await render(AgentTranscriptBubble, { message: items[2].message });
  try { assert.match(bubble.host.textContent, /我先查一下上海的天气。/); } finally { bubble.cleanup(); }
});

test("running → finished collapses on its own; a thought opens live and does not collapse while text is selected", async () => {
  const messages = [
    { id: 1, role: "user", kind: "text", content: "hi" },
    { id: 2, role: "assistant", kind: "text", content: "", meta: { streaming: true, reasoning: "Let me think about **this**." } },
  ];
  const { block } = progressOf(messages);
  const view = await render(AgentProgress, { messages: block.messages, running: true });
  try {
    const thought = view.host.querySelector("[data-agent-process-thought]");
    assert.equal(thought.getAttribute("data-streaming"), "true");
    const body = view.host.querySelector("[data-agent-process-thought-body]");
    assert.ok(body, "streaming reasoning is expanded and live");
    assert.match(body.textContent, /Let me think about/);
    // A click while text is selected keeps it open (collapseUnlessSelecting).
    const original = window.getSelection;
    window.getSelection = () => ({ toString: () => "think" });
    try { await click(body); } finally { window.getSelection = original; }
    assert.ok(view.host.querySelector("[data-agent-process-thought-body]"), "selecting text never collapses");

    const done = [messages[0], { ...messages[1], content: "Hello!", meta: { reasoning: "Let me think about **this**.", reasoning_ms: 3400, done: true } }];
    await view.update({ messages: progressOf(done).block.messages, running: false });
    assert.equal(view.host.querySelector("[data-agent-process-entries]"), null, "finished collapses");
    assert.match(view.host.querySelector("[data-agent-process-summary]").textContent, /思考 3 秒/);
    await click(view.host.querySelector("[data-agent-process-toggle]"));
    const row = view.host.querySelector("[data-agent-process-thought] button");
    assert.match(row.textContent, /思考 3 秒/);
  } finally { view.cleanup(); }
});

test("cloud step expands to args, result and the error in red; analysis is the thought before it", async () => {
  const messages = [
    { id: 1, role: "assistant", kind: "analysis", content: "Find the OK button.\n<code>ui.find('OK')</code>", meta: { interim: true, step_index: 1 } },
    { id: 2, role: "assistant", kind: "step", content: "在电脑上查找元素",
      meta: { tool: "computer_ui_find", status: "failed", step_index: 1, args_preview: '{"name":"OK","role":"button"}', result_preview: "no match",
        error: "失败：failed（没有执行）：ui.find: the foreground window is the hand itself" } },
  ];
  const view = await render(AgentProgress, { messages, running: true });
  try {
    const list = view.host.querySelector("[data-agent-process-entries]");
    assert.ok(list.children[0].hasAttribute("data-agent-process-thought"));
    assert.ok(list.children[1].hasAttribute("data-agent-process-tool"));
    const tool = list.children[1];
    assert.match(tool.querySelector("[data-agent-process-tool-status]").textContent, /失败/);
    assert.match(tool.querySelector("[data-agent-process-tool-error-line]").textContent, /foreground window/, "the reason is visible without expanding");
    await click(tool.querySelector("button"));
    assert.match(tool.querySelector("[data-agent-process-args]").textContent, /"role": "button"/, "JSON args are pretty-printed");
    assert.match(tool.querySelector("[data-agent-process-result]").textContent, /no match/);
    const error = tool.querySelector("[data-agent-process-tool-error]");
    assert.match(error.textContent, /the hand itself/);
    assert.match(error.className, /rose/);
    // The thought is not the tool body.
    assert.doesNotMatch(tool.querySelector("[data-agent-process-tool-body]").textContent, /Find the OK button/);
  } finally { view.cleanup(); }
});

test("notices: an exited program is a neutral line; a real failure stays red", async () => {
  const [exited, failed] = dialogToAgentMessages([
    { kind: "notice", id: "a", code: "acp_exited", program: "codex" },
    { kind: "notice", id: "b", code: "provider_needs_credits", program: "hermes", provider: "nous" },
  ], { live: true });
  assert.equal(exited.kind, "notice");
  assert.equal(failed.kind, "error");
  const neutral = await render(AgentTranscriptBubble, { message: exited });
  try {
    const node = neutral.host.querySelector("[data-agent-notice]");
    assert.ok(node);
    assert.doesNotMatch(neutral.host.innerHTML, /rose|red-/);
  } finally { neutral.cleanup(); }
  const red = await render(AgentTranscriptBubble, { message: failed });
  try { assert.match(red.host.innerHTML, /rose/); } finally { red.cleanup(); }
});

test("long unbroken strings wrap: user bubble, gate prompt, error, tool title/body", async () => {
  const long = `/very/long/${"a".repeat(400)}/path.txt`;
  const user = await render(AgentTranscriptBubble, { message: { id: 1, role: "user", kind: "text", content: long } });
  try {
    const bubble = [...user.host.querySelectorAll("div")].find((node) => node.textContent === long && /rounded-2xl/.test(node.className));
    assert.ok(bubble);
    assert.match(bubble.className, /\[overflow-wrap:anywhere\]/);
    assert.match(bubble.className, /break-words/);
    assert.match(bubble.className, /min-w-0/);
  } finally { user.cleanup(); }
  const gate = await render(AgentTranscriptBubble, { message: { id: 2, role: "assistant", kind: "gate", content: long, meta: { gate_prompt: long } } });
  try {
    const prompt = [...gate.host.querySelectorAll("p")].find((node) => node.textContent === long);
    assert.match(prompt.className, /\[overflow-wrap:anywhere\]/);
  } finally { gate.cleanup(); }
  const error = await render(AgentTranscriptBubble, { message: { id: 3, role: "assistant", kind: "error", content: long } });
  try { assert.match(error.host.firstElementChild.className, /\[overflow-wrap:anywhere\]/); } finally { error.cleanup(); }
  const tool = await render(AgentProgress, { messages: [{ id: 4, role: "assistant", kind: "step", content: long, meta: { status: "done" } }], running: false });
  try {
    await click(tool.host.querySelector("[data-agent-process-toggle]"));
    const title = tool.host.querySelector("[data-agent-process-tool-title]");
    assert.match(title.className, /truncate/, "single line, truncated");
    assert.match(title.className, /min-w-0/);
    await click(tool.host.querySelector("[data-agent-process-tool] button"));
    const body = tool.host.querySelector("[data-agent-process-tool-body]");
    assert.match(body.className, /\[overflow-wrap:anywhere\]/);
    assert.ok(body.textContent.includes(long), "full title on expand");
  } finally { tool.cleanup(); }
});

test("stream scroller never scrolls sideways and the column wraps (AgentChat render region)", () => {
  const source = readFileSync(new URL("../src/shell/AgentChat.tsx", import.meta.url), "utf8");
  const scroller = source.match(/className="([^"]*)"\s*\n\s*data-agent-stream-scroller=""/);
  assert.ok(scroller, "scroller is marked");
  assert.match(scroller[1], /overflow-y-auto/);
  assert.match(scroller[1], /overflow-x-hidden/);
  const column = source.match(/<div className="([^"]*)" data-agent-stream-column="">/);
  assert.ok(column, "column is marked");
  for (const cls of ["min-w-0", "break-words", "[overflow-wrap:anywhere]"]) assert.ok(column[1].includes(cls), cls);
});
