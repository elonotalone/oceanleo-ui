import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule } from "./helpers/module-bench.mjs";

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
function expanded(host, id) { return block(host, id)?.querySelector("[data-agent-process-toggle]")?.getAttribute("aria-expanded"); }
function provider(taskId, children) { return React.createElement(StepsFoldPreferenceProvider, { taskId }, children); }

test("expanding a running block opens later blocks and keeps them open after completion", async () => {
  window.localStorage.clear(); window.localStorage.setItem("oceanleo_steps_fold:v1:expand", "0");
  const view = await mount(provider("expand", React.createElement(React.Fragment, null, React.createElement(AgentProgress, { messages: [message(1)], running: true }), React.createElement(AgentProgress, { messages: [message(2)], running: true }))));
  try {
    assert.equal(expanded(view.host, 0), "false"); assert.equal(expanded(view.host, 1), "false");
    await act(async () => block(view.host, 0).querySelector("[data-agent-process-toggle]").click());
    assert.equal(expanded(view.host, 0), "true"); assert.equal(expanded(view.host, 1), "true");
    await view.render(provider("expand", React.createElement(React.Fragment, null, React.createElement(AgentProgress, { messages: [message(1, "done")], running: false }), React.createElement(AgentProgress, { messages: [message(2)], running: true }))));
    assert.equal(expanded(view.host, 0), "true"); assert.equal(expanded(view.host, 1), "true");
  } finally { view.cleanup(); }
});

test("collapsing a running block makes the next live block start collapsed", async () => {
  window.localStorage.clear();
  const view = await mount(provider("collapse", React.createElement(React.Fragment, null, React.createElement(AgentProgress, { messages: [message(3)], running: true }))));
  try {
    await act(async () => block(view.host, 0).querySelector("[data-agent-process-toggle]").click());
    await view.render(provider("collapse", React.createElement(React.Fragment, null, React.createElement(AgentProgress, { messages: [message(3, "done")], running: false }), React.createElement(AgentProgress, { messages: [message(4)], running: true }))));
    assert.equal(expanded(view.host, 1), "false");
  } finally { view.cleanup(); }
});

test("finished block toggles do not set a task preference", async () => {
  window.localStorage.clear();
  const view = await mount(provider("finished", React.createElement(AgentProgress, { messages: [message(5, "done")], running: false })));
  try { await act(async () => block(view.host, 0).querySelector("[data-agent-process-toggle]").click()); assert.equal(window.localStorage.getItem("oceanleo_steps_fold:v1:finished"), null); } finally { view.cleanup(); }
});

test("preferences are isolated by task and survive unmount/remount", async () => {
  window.localStorage.clear();
  const first = await mount(provider("one", React.createElement(AgentProgress, { messages: [message(6)], running: true })));
  await act(async () => block(first.host, 0).querySelector("[data-agent-process-toggle]").click()); first.cleanup();
  const second = await mount(provider("two", React.createElement(AgentProgress, { messages: [message(7)], running: true })));
  try { assert.equal(expanded(second.host, 0), "true"); } finally { second.cleanup(); }
  const remount = await mount(provider("one", React.createElement(AgentProgress, { messages: [message(8)], running: true })));
  try { assert.equal(expanded(remount.host, 0), "false"); } finally { remount.cleanup(); }
});

test("without a provider, live blocks keep the legacy auto-open then collapse behavior", async () => {
  const view = await mount(React.createElement(AgentProgress, { messages: [message(9)], running: true }));
  try { assert.equal(expanded(view.host, 0), "true"); await view.render(React.createElement(AgentProgress, { messages: [message(9, "done")], running: false })); assert.equal(expanded(view.host, 0), "false"); } finally { view.cleanup(); }
});

