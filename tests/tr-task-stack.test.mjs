// The right panel's task stack (task rooms wave, TU2): the real `result-canvas-slot-state.ts` +
// `result-canvas-view-state.ts` + `workspace-actions.ts`, wired by a minimal harness (same style as
// `workspace-view-state.test.mjs`). Pins:
//   - a request from inside the panel pushes; from the main column (or in code, or the host) replaces and reveals;
//   - Back pops; the last Back returns to the cards; a click that belongs to another workspace is left alone;
//   - a request made before the panel mounted (a lazy right pane) is taken once on mount, and the split's own
//     opener opens a pane that has no ResultCanvas yet;
//   - `tab: "task"` only reveals a pane: it never parses as a workspace action.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act, useEffect, useRef, useState } from "react";
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
const { OPEN_TASK_CHILD_EVENT, WORKSPACE_ACTION_EVENT, normalizeTaskEntry, normalizeWorkspaceAction } = await import(
  "../src/shell/workspace-actions.ts"
);

const SLOTS = ["template", "preview", "materials", "mine", "browser"];
const slotForId = (id) => (SLOTS.includes(id) ? id : "preview");
const SUB = { kind: "agent_task", id: "task-1", title: "Draft the plan" };
const ROOM = { kind: "room", id: "room-2", title: "Launch" };
const SUB3 = { kind: "agent_task", id: "task-3", title: "Check numbers" };

function installDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/tasks/1" });
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

/** Panel / main column / elsewhere buttons; the harness classifies clicks by which box they are in. */
async function withHarness(initial, run) {
  const restore = installDom();
  const doc = globalThis.document;
  const split = doc.createElement("div");
  split.setAttribute("data-workspace-split", "");
  const main = doc.createElement("button");
  main.setAttribute("data-main", "");
  const panel = doc.createElement("div");
  const panelButton = doc.createElement("button");
  panel.append(panelButton);
  split.append(main, panel);
  const elsewhere = doc.createElement("button");
  const container = doc.createElement("div");
  doc.body.append(split, elsewhere, container);
  const root = createRoot(container);
  const props = { taskRequest: null, panels: { bay: true, leochat: true }, ...initial };
  const homeCalls = [];
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
      panels: props.panels, onHome: () => homeCalls.push("home"),
      taskOrigin: (target) => !target ? "main" : panel.contains(target) ? "panel" : split.contains(target) ? "main" : null,
      taskRequest: props.taskRequest,
      onTaskReveal: () => reveals.push(true),
    });
    expose = { view, rerender: () => setTick((value) => value + 1) };
    return null;
  }
  // A click whose handler opens a child, exactly as a card does (`openTaskChild` inside onClick).
  const clickOpening = (button, detail) => {
    let handled = null;
    const onClick = () => {
      handled = !window.dispatchEvent(new CustomEvent(OPEN_TASK_CHILD_EVENT, { detail, cancelable: true }));
    };
    button.addEventListener("click", onClick, { once: true });
    button.click();
    return handled;
  };
  const api = {
    get view() { return expose.view.view; },
    get stack() { return expose.view.taskStack.map((entry) => entry.id); },
    homeCalls, reveals, main, panelButton, elsewhere,
    async set(patch) { Object.assign(props, patch); await act(async () => expose.rerender()); },
    async call(fn) { await act(async () => fn(expose)); },
    async click(button, detail) {
      let handled;
      await act(async () => { handled = clickOpening(button, detail); });
      return handled;
    },
    async request(detail) {
      let handled;
      await act(async () => { handled = !window.dispatchEvent(new CustomEvent(OPEN_TASK_CHILD_EVENT, { detail, cancelable: true })); });
      return handled;
    },
    mount: async () => act(async () => root.render(React.createElement(Harness))),
  };
  try {
    if (!initial.deferMount) await api.mount();
    await run(api);
  } finally {
    await act(async () => root.unmount());
    // Let the click-origin reset timer run before the window goes away.
    await new Promise((resolve) => setTimeout(resolve, 5));
    restore();
  }
}

test("a card in the main column replaces the stack and shows the panel; inside the panel it pushes; Back pops to the cards", async () => {
  await withHarness({}, async (api) => {
    assert.equal(api.view, "home");
    assert.equal(await api.click(api.main, SUB), true, "the workspace marks the request handled");
    assert.equal(api.view, "task");
    assert.deepEqual(api.stack, ["task-1"]);
    assert.equal(api.reveals.length, 1);
    assert.equal(await api.click(api.panelButton, ROOM), true);
    assert.deepEqual(api.stack, ["task-1", "room-2"]);
    await api.click(api.panelButton, ROOM);
    assert.deepEqual(api.stack, ["task-1", "room-2"], "the shown entry is not pushed twice");
    assert.equal(api.reveals.length, 1, "a push inside the panel does not reveal again");
    await api.click(api.main, SUB3);
    assert.deepEqual(api.stack, ["task-3"], "the main column replaces the whole stack");
    await api.click(api.panelButton, ROOM);
    await api.call(({ view }) => view.popTask());
    assert.deepEqual(api.stack, ["task-3"]);
    assert.equal(api.view, "task");
    await api.call(({ view }) => view.popTask());
    assert.equal(api.view, "home");
    assert.deepEqual(api.homeCalls, ["home"]);
    await api.call(({ view }) => view.openPanel("task"));
    assert.equal(api.view, "home", "an empty stack cannot be reopened");
  });
});

test("a click that belongs to another workspace is left alone (not handled, nothing opens)", async () => {
  await withHarness({}, async (api) => {
    assert.equal(await api.click(api.elsewhere, SUB), false);
    assert.equal(api.view, "home");
    assert.deepEqual(api.stack, []);
  });
});

test("a request made in code counts as the main column; bad details are ignored", async () => {
  await withHarness({}, async (api) => {
    assert.equal(await api.request({ kind: "agent_task", id: "../x", title: "bad" }), false);
    assert.equal(await api.request({ kind: "project", id: "p1", title: "bad" }), false);
    assert.equal(api.view, "home");
    assert.equal(await api.request(ROOM), true);
    assert.equal(api.view, "task");
    assert.deepEqual(api.stack, ["room-2"]);
  });
});

test("host request (task page): the sub task opens beside its parent once per nonce", async () => {
  await withHarness({ taskRequest: { nonce: "page:0", entries: [SUB] } }, async (api) => {
    assert.equal(api.view, "task");
    assert.deepEqual(api.stack, ["task-1"]);
    assert.equal(api.reveals.length, 1);
    await api.call(({ view }) => view.popTask());
    assert.equal(api.view, "home");
    await api.set({});
    assert.equal(api.view, "home", "the same request does not pull the person back");
    await api.set({ taskRequest: { nonce: "page:1", entries: [ROOM] } });
    assert.deepEqual(api.stack, ["room-2"]);
    assert.equal(api.view, "task");
  });
});

test("the task stack can be turned off by the host", async () => {
  await withHarness({ panels: { bay: true, leochat: true, task: false } }, async (api) => {
    assert.equal(await api.request(SUB), false);
    assert.equal(api.view, "home");
  });
});

test("a request made just before the panel mounted (lazy right pane) is taken once on mount", async () => {
  await withHarness({ deferMount: true }, async (api) => {
    // Nothing is listening yet except the window-level record (in the browser it is installed at import).
    installTaskChildRecorder();
    assert.equal(await api.request(SUB), false, "not handled yet: no workspace is mounted");
    await api.mount();
    assert.equal(api.view, "task");
    assert.deepEqual(api.stack, ["task-1"]);
  });
});

test("the split's opener opens a right pane that has no ResultCanvas yet, and only for its own clicks", async () => {
  const restore = installDom();
  try {
    const doc = globalThis.document;
    const split = doc.createElement("div");
    split.setAttribute("data-workspace-split", "");
    const card = doc.createElement("button");
    const other = doc.createElement("button");
    const container = doc.createElement("div");
    split.append(card, container);
    doc.body.append(split, other);
    const opened = [];
    function Host() {
      const anchor = useRef(null);
      useTaskChildPaneOpener(anchor, () => opened.push(true));
      return React.createElement("span", { ref: anchor, hidden: true });
    }
    const root = createRoot(container);
    await act(async () => root.render(React.createElement(Host)));
    const clickOpening = (button) => {
      let handled = null;
      button.addEventListener("click", () => {
        handled = !window.dispatchEvent(new CustomEvent(OPEN_TASK_CHILD_EVENT, { detail: SUB, cancelable: true }));
      }, { once: true });
      button.click();
      return handled;
    };
    assert.equal(clickOpening(other), false);
    assert.equal(opened.length, 0);
    assert.equal(clickOpening(card), true);
    assert.equal(opened.length, 1);
    // With a ResultCanvas mounted in the split, that canvas handles requests; the opener stays out.
    const canvas = doc.createElement("div");
    canvas.setAttribute("data-workspace-view", "home");
    split.append(canvas);
    clickOpening(card);
    assert.equal(opened.length, 1);
    await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    restore();
  }
});

test("task entries are trusted data; `tab: task` only reveals and never parses as an action", () => {
  assert.deepEqual(normalizeTaskEntry({ kind: "agent_task", id: " t-1 ", title: "  Plan " }), { kind: "agent_task", id: "t-1", title: "Plan" });
  assert.deepEqual(normalizeTaskEntry({ kind: "room", id: "r1" }), { kind: "room", id: "r1", title: "" });
  assert.equal(normalizeTaskEntry({ kind: "room", id: "a/b" }), null);
  assert.equal(normalizeTaskEntry({ kind: "agent", id: "a" }), null);
  assert.equal(normalizeTaskEntry(null), null);
  assert.equal(normalizeTaskEntry({ kind: "room", id: "x".repeat(81) }), null);
  assert.equal(normalizeTaskEntry({ kind: "room", id: "r", title: "t".repeat(300) }).title.length, 200);
  assert.equal(normalizeWorkspaceAction({ version: 2, tab: "task" }), null);
  assert.equal(normalizeWorkspaceAction({ version: 1, tab: "task" }), null);
  assert.equal(typeof WORKSPACE_ACTION_EVENT, "string");
});
