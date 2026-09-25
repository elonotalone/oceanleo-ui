import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const actionsUrl = dataModule(`
  export const FIXED_WORKSPACE_SLOTS = ["template", "preview", "materials", "mine", "browser"];
  export const WORKSPACE_ACTION_EVENT = "b14-workspace-action";
  export function normalizeWorkspaceAction() { return null; }
  export function isWorkspaceActionConsumed() { return false; }
`);
const slotUrl = await compileModule("src/shell/result-canvas-slot-state.ts", {
  "./workspace-actions": actionsUrl,
});
const { useWorkspaceSlotState } = await import(slotUrl);

function makeHydration(identity = "", rightTab = null, restoredSnapshot = false) {
  return {
    identity,
    rightTab,
    restoredSnapshot,
    snapshotRestoreEpoch: 0,
    setRightTab(tab) { this.rightTab = tab; },
    setDefaultRightTab() {},
  };
}

async function runScenario({ pinIdentity, restoredTab, identityAfter = pinIdentity, switchIdentity = "" }) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.test/workspace",
  });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
  })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const hydration = makeHydration(pinIdentity, null, false);
  let expose;
  function Harness() {
    const [tick, setTick] = useState(0);
    const state = useWorkspaceSlotState({
      showTemplate: true,
      runtimeHydration: hydration,
      slotForId: (id) => id || "preview",
      callerIdForSlot: () => null,
    });
    expose = { state, rerender: () => setTick((value) => value + 1), tick };
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(Harness)));
    if (pinIdentity !== null) {
      await act(async () => expose.state.select("materials"));
    }
    hydration.identity = switchIdentity || identityAfter;
    hydration.rightTab = restoredTab;
    hydration.restoredSnapshot = true;
    hydration.snapshotRestoreEpoch = 1;
    await act(async () => expose.rerender());
    return expose.state.selected;
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("identity 建立前 pin 在 browser/mine/template 恢复后仍保持用户页签", async () => {
  for (const restoredTab of ["browser", "mine", "template"]) {
    assert.equal(await runScenario({ pinIdentity: "", identityAfter: "session-a", restoredTab }), "materials");
  }
});

test("identity 建立后 pin 仍优先，且无 pin 时应用快照", async () => {
  assert.equal(await runScenario({ pinIdentity: "session-a", restoredTab: "browser" }), "materials");
  assert.equal(await runScenario({ pinIdentity: null, restoredTab: "browser" }), "browser");
});

test("切换会话后旧 pin 不阻挡新会话快照", async () => {
  assert.equal(
    await runScenario({ pinIdentity: "session-a", restoredTab: "mine", switchIdentity: "session-b" }),
    "mine",
  );
});

test("外部 active 改变只同步内部页签，不回调 onChange", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.test/workspace",
  });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
  })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const hydration = makeHydration();
  let expose;
  let changes = 0;
  function Harness({ active }) {
    const [tick, setTick] = useState(0);
    const state = useWorkspaceSlotState({
      active,
      showTemplate: true,
      runtimeHydration: hydration,
      slotForId: (id) => id || "preview",
      callerIdForSlot: () => null,
      onChange: () => { changes += 1; },
    });
    expose = { state, rerender: () => setTick((value) => value + 1), tick };
    return null;
  }
  try {
    await act(async () => root.render(React.createElement(Harness, { active: "preview" })));
    await act(async () => root.render(React.createElement(Harness, { active: "materials" })));
    assert.equal(expose.state.selected, "materials");
    assert.equal(changes, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
