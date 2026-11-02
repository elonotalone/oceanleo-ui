import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule } from "./helpers/module-bench.mjs";

// Keep the repository's node:test entrypoint while allowing the same component
// assertions to run under Vitest without adding a package dependency here.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/tasks/fold" });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const uiStub = `data:text/javascript;base64,${Buffer.from(`
  const tt = (value, vars) => value.replace(/\\\\{(\\\\w+)\\\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  export function useUI() { return tt; }
`).toString("base64")}`;
const preferenceUrl = await compileModule("src/shell/steps-fold-preference.tsx");
const { StepsFoldPreferenceProvider } = await import(preferenceUrl);
const { AgentProgress } = await import(await compileModule("src/shell/AgentProgress.tsx", { "../i18n/ui/useUI": uiStub, "./steps-fold-preference": preferenceUrl }));

function message(id, status = "running") {
  return { id, role: "assistant", kind: "step", content: "", meta: { tool: "shell.exec", title: `step-${id}`, tool_status: status } };
}
async function mount(element) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, async render(next) { await act(async () => root.render(next)); }, cleanup() { act(() => root.unmount()); host.remove(); } };
}
function block(host, index) { return host.querySelectorAll("[data-agent-process]")[index]; }
function expanded(host, index) { return block(host, index)?.querySelector("[data-agent-process-toggle]")?.getAttribute("aria-expanded"); }
function entriesVisible(host, index) { return Boolean(block(host, index)?.querySelector("[data-agent-process-entries]")); }
function provider(taskId, children) { return React.createElement(StepsFoldPreferenceProvider, { taskId }, children); }

function timeline(taskId, ids, running = false) {
  return provider(taskId, React.createElement("div", { "data-agent-stream": "cloud" },
    ...ids.map((id, index) => React.createElement(AgentProgress, {
      key: id,
      messages: [{ id, role: "assistant", kind: "analysis", content: `thinking-${id}` }],
      running: running && index === ids.length - 1,
    })),
  ));
}
async function toggle(view, index, rail = false) {
  await act(async () => block(view.host, index).querySelector(rail ? "[data-agent-process-rail]" : "[data-agent-process-toggle]").click());
}
function expectOpen(view, expected) {
  assert.deepEqual([...view.host.querySelectorAll("[data-agent-process-toggle]")].map((button) => button.getAttribute("aria-expanded") === "true"), expected);
  expected.forEach((open, index) => assert.equal(entriesVisible(view.host, index), open));
}
function saved(taskId) { return window.localStorage.getItem(`oceanleo_steps_fold:v1:${taskId}`); }

test("only the latest thought inherits the task preference; new thoughts fold their predecessors", async () => {
  window.localStorage.clear();
  const view = await mount(timeline("sequence", [1, 2, 3]));
  try {
    expectOpen(view, [false, false, false]);
    await toggle(view, 2);
    expectOpen(view, [false, false, true]);
    assert.equal(saved("sequence"), "1");
    await view.render(timeline("sequence", [1, 2, 3, 4], true));
    expectOpen(view, [false, false, false, true]);
    await toggle(view, 3, true);
    assert.equal(saved("sequence"), "0");
    await view.render(timeline("sequence", [1, 2, 3, 4, 5], true));
    expectOpen(view, [false, false, false, false, false]);
  } finally { view.cleanup(); }
});

test("opening a historical thought is local and preference changes leave it alone", async () => {
  window.localStorage.clear();
  const view = await mount(timeline("local", [1, 2, 3]));
  try {
    await toggle(view, 0);
    expectOpen(view, [true, false, false]);
    assert.equal(saved("local"), null);
    await toggle(view, 2);
    expectOpen(view, [true, false, true]);
    await toggle(view, 1);
    expectOpen(view, [true, true, true]);
    await toggle(view, 0, true);
    expectOpen(view, [false, true, true]);
    assert.equal(saved("local"), "1");
    await view.render(timeline("local", [1, 2, 3, 4]));
    expectOpen(view, [false, true, false, true]);
  } finally { view.cleanup(); }
});

test("reopening a completed task restores only its latest thought and forgets local history toggles", async () => {
  window.localStorage.clear();
  const first = await mount(timeline("reopen", [1, 2, 3]));
  await toggle(first, 2);
  await toggle(first, 0);
  first.cleanup();
  const reopened = await mount(timeline("reopen", [1, 2, 3]));
  try { expectOpen(reopened, [false, false, true]); } finally { reopened.cleanup(); }
});

test("a saved collapsed preference applies to current and future thoughts after reopening", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:collapsed", "false");
  const view = await mount(timeline("collapsed", [1, 2, 3], true));
  try {
    expectOpen(view, [false, false, false]);
    await view.render(timeline("collapsed", [1, 2, 3, 4], true));
    expectOpen(view, [false, false, false, false]);
  } finally { view.cleanup(); }
});

test("prepending older native history does not make it latest; finishing keeps the latest preference", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:prepend", "true");
  const view = await mount(timeline("prepend", [3], true));
  try {
    expectOpen(view, [true]);
    await view.render(timeline("prepend", [1, 2, 3], true));
    expectOpen(view, [false, false, true]);
    await view.render(timeline("prepend", [1, 2, 3]));
    expectOpen(view, [false, false, true]);
  } finally { view.cleanup(); }
});

test("switching tasks in place reads each preference without overwriting the destination", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:one", "1");
  window.localStorage.setItem("oceanleo_steps_fold:v1:two", "0");
  const view = await mount(timeline("one", [1, 2, 3]));
  try {
    expectOpen(view, [false, false, true]);
    await toggle(view, 0);
    await view.render(timeline("two", [1, 2, 3]));
    expectOpen(view, [false, false, false]);
    assert.equal(saved("two"), "0");
    assert.equal(saved("one"), "1");
    await view.render(timeline("one", [1, 2, 3]));
    expectOpen(view, [false, false, true]);
    await view.render(timeline("unset", [1, 2, 3]));
    expectOpen(view, [false, false, false]);
    assert.equal(saved("unset"), null);
  } finally { view.cleanup(); }
});

test("separately mounted cloud and native streams each identify their own latest block", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:streams", "1");
  const stream = (name, ids) => React.createElement("div", { "data-agent-stream": name },
    ...ids.map((id) => React.createElement(AgentProgress, { key: id, messages: [message(id, "done")], running: false })));
  const view = await mount(provider("streams", React.createElement(React.Fragment, null, stream("cloud", [1, 2]), stream("native", [3, 4]))));
  try {
    expectOpen(view, [false, true, false, true]);
    await toggle(view, 0);
    expectOpen(view, [true, true, false, true]);
    assert.equal(saved("streams"), "1");
  } finally { view.cleanup(); }
});

test("reordering existing blocks recomputes the latest without remounting them", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:reorder", "1");
  const view = await mount(timeline("reorder", [1, 2, 3]));
  try {
    expectOpen(view, [false, false, true]);
    await view.render(timeline("reorder", [3, 1, 2]));
    expectOpen(view, [false, false, true]);
    assert.equal(saved("reorder"), "1");
  } finally { view.cleanup(); }
});

test("StrictMode registration leaves only the latest block expanded", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("oceanleo_steps_fold:v1:strict", "1");
  const view = await mount(React.createElement(React.StrictMode, null, timeline("strict", [1, 2, 3])));
  try {
    expectOpen(view, [false, false, true]);
    await view.render(React.createElement(React.StrictMode, null, timeline("strict", [1, 2, 3, 4])));
    expectOpen(view, [false, false, false, true]);
  } finally { view.cleanup(); }
});

test("without a provider, live blocks keep the legacy auto-open then collapse behavior", async () => {
  const view = await mount(React.createElement(AgentProgress, { messages: [message(9)], running: true }));
  try { assert.equal(expanded(view.host, 0), "true"); await view.render(React.createElement(AgentProgress, { messages: [message(9, "done")], running: false })); assert.equal(expanded(view.host, 0), "false"); } finally { view.cleanup(); }
});
