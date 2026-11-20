// Session / sites wave, unit US: the right panel's task / quote view. The real `result-canvas-slot-state.ts` +
// `result-canvas-view-state.ts` + `workspace-actions.ts`, wired by a minimal harness (same style as
// `workspace-view-state.test.mjs`). Pins:
//   - `oceanleo:open-task-panel` with a task id shows that one task; without one, a new task draft — in the project
//     the host names (project session / project page) or standalone; a new request replaces (no stack);
//   - `oceanleo:open-quote-panel` shows the quote view; malformed details are ignored;
//   - a click in another workspace is left alone; a click outside every split (portalled menu) counts as code;
//   - Back returns to the cards; a request made before a lazy pane mounted is taken on mount; the split's own
//     opener opens a pane that has no ResultCanvas yet.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const { useWorkspaceSlotState } = await import(await compileModule("src/shell/result-canvas-slot-state.ts"));
const { useWorkspaceViewState, useTaskChildPaneOpener, installTaskChildRecorder } = await import(await compileModule("src/shell/result-canvas-view-state.ts"));
const { normalizeTaskEntry, normalizeWorkspaceAction } = await import("../src/shell/workspace-actions.ts");

const TASK_EVENT = "oceanleo:open-task-panel";
const QUOTE_EVENT = "oceanleo:open-quote-panel";
const SLOTS = ["template", "preview", "materials", "mine", "browser"];
const slotForId = (id) => (SLOTS.includes(id) ? id : "preview");
const QUOTE = { id: "q1", card: { type: "quote", source_title: "Design", count: 2, items: [] } };

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/projects/p1" });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, CustomEvent: dom.window.CustomEvent,
  })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return () => {
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  };
}

async function withHarness(initial, run) {
  const restore = installDom();
  const doc = globalThis.document;
  const split = doc.createElement("div");
  split.setAttribute("data-workspace-split", "");
  const main = doc.createElement("button");
  const panel = doc.createElement("div");
  const panelButton = doc.createElement("button");
  panel.append(panelButton);
  split.append(main, panel);
  const otherSplit = doc.createElement("div");
  otherSplit.setAttribute("data-workspace-split", "");
  const elsewhere = doc.createElement("button");
  otherSplit.append(elsewhere);
  const portalled = doc.createElement("button");
  const container = doc.createElement("div");
  doc.body.append(split, otherSplit, portalled, container);
  const root = createRoot(container);
  const props = { panels: { bay: true, leochat: true }, projectId: null, ...initial };
  const reveals = [];
  let expose;
  function Harness() {
    const [, setTick] = useState(0);
    const slot = useWorkspaceSlotState({
      active: "home", showTemplate: false, focusNonce: 0, externalAction: null, runtimeHydration: null,
      slotForId, callerIdForSlot: (id) => id,
    });
    const view = useWorkspaceViewState({
      selected: slot.selected, layer: slot.layer, setLayer: slot.setLayer, panelAction: slot.panelAction, select: slot.select,
      panels: props.panels, onHome: () => {},
      taskOrigin: (target) => !target ? "main" : panel.contains(target) ? "panel" : split.contains(target) ? "main" : null,
      draftProjectId: () => props.projectId,
      onTaskReveal: () => reveals.push(true),
    });
    expose = { view, rerender: () => setTick((value) => value + 1) };
    return null;
  }
  const dispatch = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const api = {
    get view() { return expose.view.view; },
    get entry() { return expose.view.taskPanel; },
    reveals, main, panelButton, elsewhere, portalled,
    async call(fn) { await act(async () => fn(expose)); },
    async click(button, name, detail) {
      await act(async () => {
        button.addEventListener("click", () => dispatch(name, detail), { once: true });
        button.click();
      });
    },
    async request(name, detail) { await act(async () => { dispatch(name, detail); }); },
    mount: async () => act(async () => root.render(React.createElement(Harness))),
  };
  try {
    if (!initial.deferMount) await api.mount();
    await run(api);
  } finally {
    await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 5));
    restore();
  }
}

test("open-task-panel with a task id shows that one task; a new request replaces it (no stack); Back → cards", async () => {
  await withHarness({}, async (api) => {
    assert.equal(api.view, "home");
    await api.click(api.main, TASK_EVENT, { taskId: "task-1", title: "Draft the plan" });
    assert.equal(api.view, "task");
    assert.deepEqual({ ...api.entry, key: 0 }, { kind: "task", key: 0, id: "task-1", title: "Draft the plan" });
    assert.equal(api.reveals.length, 1);
    await api.click(api.panelButton, TASK_EVENT, { taskId: "task-2", title: "Check" });
    assert.equal(api.entry.id, "task-2", "inside the panel it replaces too");
    await api.call(({ view }) => view.closeTask());
    assert.equal(api.view, "home");
    assert.equal(api.entry, null);
  });
});

test("open-task-panel without a task id opens a draft: in the host's project, or standalone", async () => {
  await withHarness({ projectId: "p1" }, async (api) => {
    await api.request(TASK_EVENT, {});
    assert.equal(api.view, "task");
    assert.equal(api.entry.kind, "draft");
    assert.equal(api.entry.projectId, "p1");
    const key = api.entry.key;
    await api.call(({ view }) => view.draftCreated("task-9"));
    assert.deepEqual(api.entry, { kind: "task", key, id: "task-9", title: "" }, "the draft becomes the task in the same view");
  });
  await withHarness({}, async (api) => {
    await api.request(TASK_EVENT, { title: "x" });
    assert.equal(api.entry.kind, "draft");
    assert.equal(api.entry.projectId, null, "from LeoChat / home: a standalone task");
  });
});

// VU (integration): a forward to the task / draft already in the panel is taken by that mounted AgentChat on the event
// itself (takePendingForward), so the view must not remount (new key) or the chip would be lost.
test("open-task-panel for the task or draft already shown keeps the same view mounted (same key)", async () => {
  await withHarness({}, async (api) => {
    await api.request(TASK_EVENT, { taskId: "task-1", title: "Draft the plan" });
    const key = api.entry.key;
    await api.request(TASK_EVENT, { taskId: "task-1", title: "Draft the plan" });
    assert.equal(api.entry.key, key, "same task: same view");
    await api.request(TASK_EVENT, { taskId: "task-2", title: "Check" });
    assert.notEqual(api.entry.key, key, "another task: a new view");
    await api.request(TASK_EVENT, {});
    const draftKey = api.entry.key;
    await api.request(TASK_EVENT, {});
    assert.equal(api.entry.kind, "draft");
    assert.equal(api.entry.key, draftKey, "draft while a draft is open: same view");
  });
});

test("open-quote-panel shows the quote view with that message; bad details are ignored", async () => {
  await withHarness({}, async (api) => {
    await api.request(QUOTE_EVENT, { message: { id: "m", card: { type: "task", child_id: "t" } } });
    await api.request(TASK_EVENT, { taskId: "../x" });
    assert.equal(api.view, "home");
    await api.request(QUOTE_EVENT, { message: QUOTE });
    assert.equal(api.view, "quote");
    assert.equal(api.entry.kind, "quote");
    assert.equal(api.entry.message, QUOTE);
    await api.call(({ view }) => view.openPanel("bay"));
    await api.call(({ view }) => view.openPanel("task"));
    assert.equal(api.view, "quote", "returning to the task view shows the quote again");
  });
});

test("a click in another workspace's split is left alone; a portalled menu click counts as a request in code", async () => {
  await withHarness({}, async (api) => {
    await api.click(api.elsewhere, TASK_EVENT, { taskId: "task-1" });
    assert.equal(api.view, "home");
    await api.click(api.portalled, TASK_EVENT, { taskId: "task-1" });
    assert.equal(api.view, "task");
  });
});

test("the host can turn the task view off", async () => {
  await withHarness({ panels: { bay: true, leochat: true, task: false } }, async (api) => {
    await api.request(TASK_EVENT, { taskId: "task-1" });
    await api.request(QUOTE_EVENT, { message: QUOTE });
    assert.equal(api.view, "home");
  });
});

test("a request made just before the panel mounted (lazy right pane) is taken once on mount", async () => {
  await withHarness({ deferMount: true }, async (api) => {
    installTaskChildRecorder();
    await api.request(QUOTE_EVENT, { message: QUOTE });
    await api.mount();
    assert.equal(api.view, "quote");
  });
});

test("the split's opener opens a right pane that has no ResultCanvas yet, for both events and only for its own clicks", async () => {
  const restore = installDom();
  try {
    const doc = globalThis.document;
    const split = doc.createElement("div");
    split.setAttribute("data-workspace-split", "");
    const card = doc.createElement("button");
    const otherSplit = doc.createElement("div");
    otherSplit.setAttribute("data-workspace-split", "");
    const other = doc.createElement("button");
    otherSplit.append(other);
    const container = doc.createElement("div");
    split.append(card, container);
    doc.body.append(split, otherSplit);
    const opened = [];
    function Host() {
      const anchor = useRef(null);
      useTaskChildPaneOpener(anchor, () => opened.push(true));
      return React.createElement("span", { ref: anchor, hidden: true });
    }
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Host)));
    const clickOpening = (button, name, detail) => {
      button.addEventListener("click", () => window.dispatchEvent(new CustomEvent(name, { detail })), { once: true });
      button.click();
    };
    clickOpening(other, TASK_EVENT, { taskId: "t1" });
    assert.equal(opened.length, 0);
    clickOpening(card, TASK_EVENT, { taskId: "t1" });
    assert.equal(opened.length, 1);
    clickOpening(card, QUOTE_EVENT, { message: QUOTE });
    assert.equal(opened.length, 2);
    window.dispatchEvent(new CustomEvent(TASK_EVENT, { detail: {} }));
    assert.equal(opened.length, 3, "a request made in code (Forward picker) opens the pane");
    const canvas = doc.createElement("div");
    canvas.setAttribute("data-workspace-view", "home");
    split.append(canvas);
    clickOpening(card, TASK_EVENT, { taskId: "t1" });
    assert.equal(opened.length, 3, "with a ResultCanvas mounted, that canvas handles requests");
    await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    restore();
  }
});

test("task entries are trusted data (agent tasks only); `tab: task` never parses as an action", () => {
  assert.deepEqual(normalizeTaskEntry({ kind: "agent_task", id: " t-1 ", title: "  Plan " }), { kind: "agent_task", id: "t-1", title: "Plan" });
  assert.deepEqual(normalizeTaskEntry({ id: "t2" }), { kind: "agent_task", id: "t2", title: "" });
  assert.equal(normalizeTaskEntry({ kind: "room", id: "r1" }), null);
  assert.equal(normalizeTaskEntry({ id: "a/b" }), null);
  assert.equal(normalizeTaskEntry({ id: "x".repeat(81) }), null);
  assert.equal(normalizeWorkspaceAction({ version: 2, tab: "task" }), null);
});
