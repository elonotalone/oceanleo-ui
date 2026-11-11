import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
// canvas is an optional native dependency of jsdom, unused by these tests.
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://dev.oceanleo.com/tasks/test" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "HTMLInputElement", "HTMLTextAreaElement"])
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : name === "document" ? dom.window.document : dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lacks matchMedia; reduced motion makes streamed text deterministic.
dom.window.matchMedia = (query) => ({ matches: query === "(prefers-reduced-motion: reduce)", media: query });
for (const name of ["attachEvent", "detachEvent", "scrollIntoView"]) dom.window.HTMLElement.prototype[name] = function () {};
const { AcpTranscript } = await import(await compileModule("src/acp/AcpTranscript.tsx"));
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx"));
const { AgentProgress } = await import(await compileModule("src/shell/AgentProgress.tsx"));
const { StepsFoldPreferenceProvider } = await import(await compileModule("src/shell/steps-fold-preference.tsx"));
const { reduceRows } = await import("../src/acp/reduce.ts");

function row(id, direction, message) {
  return { id, direction, node_seq: direction === "agent" ? id : null, received_at: "2026-11-11T01:00:00Z", raw: JSON.stringify({ jsonrpc: "2.0", ...message }) };
}
function update(id, value) { return row(id, "agent", { method: "session/update", params: { sessionId: "s1", update: value } }); }
function prompt(id, text = "Read file") { return row(id, "client", { id: `turn-${id}`, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } }); }
function said(id, text) { return update(id, { sessionUpdate: "agent_message_chunk", content: { type: "text", text } }); }
function permission(id) { return row(id, "agent", { id: `perm-${id}`, method: "session/request_permission", params: { sessionId: "s1", toolCall: { toolCallId: `tool-${id - 3}`, title: "Allow reading?" }, options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }, { optionId: "deny", name: "Deny", kind: "reject_once" }] } }); }
function turn(id) {
  return [prompt(id), update(id + 1, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Inspecting source" } }),
    update(id + 2, { sessionUpdate: "tool_call", toolCallId: `tool-${id + 2}`, title: "Read file", kind: "read", status: "pending" }),
    update(id + 3, { sessionUpdate: "tool_call_update", toolCallId: `tool-${id + 2}`, status: "completed", rawOutput: "File contents" }),
    said(id + 4, "## Findings\n\nExisting **source** remains mounted."), permission(id + 5),
    row(id + 6, "client", { id: `perm-${id + 5}`, result: { outcome: { outcome: "selected", optionId: "allow" } } }),
    said(id + 7, "Completed"), said(id + 8, " review."), row(id + 9, "agent", { id: `turn-${id}`, result: { stopReason: "end_turn" } })];
}
const initial = () => [...Array.from({ length: 20 }, (_, n) => turn(1000 + n * 10)).flat(), prompt(1200), said(1201, "Streaming **source**")];
const older = () => Array.from({ length: 3 }, (_, n) => turn(100 + n * 10)).flat();

const localeMessages = Object.freeze({});
async function mount(Component, props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let current = props;
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  const render = async () => {
    const component = React.createElement(Component, current);
    const content = Component === AcpTranscript ? React.createElement(StepsFoldPreferenceProvider, { taskId: "render-cost" }, component) : component;
    await act(async () => root.render(React.createElement(NextIntlClientProvider, { locale: "zh", messages: localeMessages, timeZone: "Asia/Shanghai" }, content)));
  };
  try { await render(); } catch (error) { console.error = previousError; throw error; }
  return { host, async update(next) { current = { ...current, ...next }; await render(); },
    cleanup() { try { act(() => root.unmount()); host.remove(); assert.deepEqual(errors, [], "real components must not report console.error"); } finally { console.error = previousError; } } };
}
async function click(element) { assert.ok(element, "expected clickable element"); await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }

// Render callbacks are optional instance props: no globals and no component / reducer / markdown stubs.
test("200-row real transcript: history prepend skips every unchanged bubble/process; one streamed row updates only the last bubble", async () => {
  const renders = [];
  const onBlockRender = (kind, id) => renders.push([kind, id]);
  let rows = initial();
  const view = await mount(AcpTranscript, { rows, view: reduceRows(rows, "claude"), program: "claude", onBlockRender });
  try {
    assert.equal(view.host.querySelectorAll("[data-history-key][data-history-item]").length, 102);
    const original = new Set(renders.map(([kind, id]) => `${kind}:${id}`));
    const heading = view.host.querySelector("h2");
    const processElement = view.host.querySelector("[data-agent-process]");
    renders.length = 0;
    rows = [...older(), ...rows];
    await view.update({ rows, view: reduceRows(rows, "claude") });
    const prepend = [...renders];
    const repeated = prepend.filter(([kind, id]) => original.has(`${kind}:${id}`));
    renders.length = 0;
    rows = [...rows, said(1202, " keeps arriving.")];
    await view.update({ rows, view: reduceRows(rows, "claude") });
    const append = [...renders];
    console.log(JSON.stringify({ phase: process.env.HM_RENDER_BASELINE ? "before" : "after", initialBlocks: original.size, prependRenders: prepend.length, prependUnchangedRenders: repeated.length, appendRenders: append.length }));
    if (!process.env.HM_RENDER_BASELINE) {
      assert.equal(repeated.length, 0, "unchanged historical blocks must not run again");
      assert.equal(prepend.length, 15, "only 3 new turns (5 blocks each) render");
      assert.deepEqual(append, [["bubble", 1201]], "only the last streaming bubble renders");
      assert.equal(view.host.querySelectorAll("h2")[3], heading, "markdown DOM survives prepend");
      assert.equal(view.host.querySelectorAll("[data-agent-process]")[3], processElement, "process DOM survives prepend");
    }
    assert.match(view.host.textContent, /keeps arriving/);
  } finally { view.cleanup(); }
});

test("selection affects only the selected block; latest request callback and highlight search stay live", async () => {
  const rows = [prompt(1), said(2, "Read **source**"), permission(3)];
  const selected = [];
  const answers = [];
  const renders = [];
  const onBlockRender = (kind, id) => renders.push([kind, id]);
  const onToggle = (id) => selected.push(id);
  const pickable = new Set([1, 2]);
  const view = await mount(AcpTranscript, { rows, program: "claude", select: { pickable, selected: new Set(), onToggle }, onAnswer: (...args) => answers.push(["old", ...args]), onBlockRender });
  try {
    const checkbox = view.host.querySelector('[role="checkbox"]') || view.host.querySelector('button[aria-checked]');
    await click(checkbox);
    assert.deepEqual(selected, [1]);
    renders.length = 0;
    await view.update({ select: { pickable, selected: new Set([1]), onToggle } });
    assert.deepEqual(renders, [["bubble", 1]], "selection membership is compared per block");
    await view.update({ onAnswer: (...args) => answers.push(["new", ...args]), highlightQuery: "source" });
    assert.ok(view.host.querySelector("mark[data-leo-search-hit]"), "search highlights the real markdown");
    await click(view.host.querySelector('[data-native-permission-option="allow"]'));
    assert.deepEqual(answers, [["new", "perm-3", { outcome: { outcome: "selected", optionId: "allow" } }]]);
    await view.update({ select: undefined, highlightQuery: "" });
    assert.equal(view.host.querySelector('[role="checkbox"]'), null);
    assert.equal(view.host.querySelector("mark[data-leo-search-hit]"), null);
  } finally { view.cleanup(); }
});

test("tool metadata updates one process; an expanded historical process keeps its state when older rows arrive", async () => {
  let rows = [prompt(10), update(11, { sessionUpdate: "tool_call", toolCallId: "t", title: "Read source", kind: "read", status: "pending" })];
  const renders = [];
  const view = await mount(AcpTranscript, { rows, program: "claude", onBlockRender: (kind, id) => renders.push([kind, id]) });
  try {
    renders.length = 0;
    rows = [...rows, update(12, { sessionUpdate: "tool_call_update", toolCallId: "t", title: "Read changed source", status: "completed", rawOutput: "New detail" })];
    await view.update({ rows });
    assert.deepEqual(renders, [["process", 11]]);
    assert.match(view.host.textContent, /Read changed source/);
    await view.update({ highlightQuery: "changed" });
    assert.ok(view.host.querySelector("mark[data-leo-search-hit]"));
    const toggle = view.host.querySelector("[data-agent-process-toggle]");
    // Complete the turn and explicitly expand it before prepending.
    rows = [...rows, said(13, "Done"), row(14, "agent", { id: "turn-10", result: { stopReason: "end_turn" } })];
    await view.update({ rows, highlightQuery: "" });
    if (toggle.getAttribute("aria-expanded") !== "true") await click(toggle);
    rows = [...turn(-10), ...rows];
    renders.length = 0;
    await view.update({ rows });
    assert.equal(toggle.getAttribute("aria-expanded"), "true", "local fold state survives history insertion");
    assert.equal(renders.filter(([, id]) => id === 11).length, 0);
  } finally { view.cleanup(); }
});

test("memoized standalone bubble/progress preserve existing APIs and respond to changed props", async () => {
  const renders = [];
  const onBlockRender = (kind, id) => renders.push([kind, id]);
  const message = { id: 1, role: "assistant", kind: "text", content: "Hello **source**" };
  const view = await mount(AgentTranscriptBubble, { message, onBlockRender });
  try {
    renders.length = 0;
    await view.update({ message });
    assert.deepEqual(renders, []);
    await view.update({ message: { ...message, content: "Changed **source**" }, highlightQuery: "source" });
    assert.match(view.host.textContent, /Changed/);
    assert.ok(view.host.querySelector("mark[data-leo-search-hit]"));
  } finally { view.cleanup(); }
  const messages = [{ id: 5, role: "assistant", kind: "step", content: "Read source", meta: { tool_status: "running" } }];
  const process = await mount(AgentProgress, { messages, running: true, onBlockRender });
  try {
    renders.length = 0;
    await process.update({ messages, running: true });
    assert.deepEqual(renders, []);
    await process.update({ running: false });
    assert.equal(process.host.querySelector("[data-agent-process]").dataset.agentProcessState, "done");
  } finally { process.cleanup(); }
});


test("empty transcript loads, clears, and loads again without hook errors or stale callbacks", async () => {
  const selected = [];
  const view = await mount(AcpTranscript, { rows: [], program: "claude" });
  try {
    assert.equal(view.host.querySelector("[data-acp-transcript]"), null);
    const rows = [prompt(1, "Loaded source")];
    await view.update({ rows, select: { pickable: new Set([1]), selected: new Set(), onToggle: (id) => selected.push(["first", id]) } });
    assert.match(view.host.textContent, /Loaded source/);
    await view.update({ select: { pickable: new Set([1]), selected: new Set(), onToggle: (id) => selected.push(["latest", id]) } });
    await click(view.host.querySelector('[role="checkbox"]') || view.host.querySelector('button[aria-checked]'));
    assert.deepEqual(selected, [["latest", 1]]);
    await view.update({ rows: [] });
    assert.equal(view.host.querySelector("[data-acp-transcript]"), null);
    await view.update({ rows, select: undefined });
    assert.match(view.host.textContent, /Loaded source/);
  } finally { view.cleanup(); }
});
