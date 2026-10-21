import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { GLOBAL_ROW_SLOTS } from "../src/shell/plugin-chrome/plugin-pages.ts";
import { AdvancedPersistenceController } from "../src/shell/advanced-persistence-controller.ts";

const require = createRequire(import.meta.url);

const actionBarUrl = await compileModule(
  "src/shell/AdvancedWorkspaceActionBar.tsx",
  {
    "../i18n/ui/useUI": dataModule(
      `export function useUI() { return (text) => text; }`,
    ),
    "./SplitWorkspace": dataModule(
      `export function useRightPaneSlot() { return null; }`,
    ),
  },
);
const { AdvancedWorkspaceActionBar } = await import(actionBarUrl);
const statusUrl = await compileModule("src/shell/plugin-chrome/PluginChromeStatus.tsx", {
  "../../i18n/ui/useUI": dataModule(
    `export function useUI() { return (text) => text; }`,
  ),
});
const { PluginChromeStatus } = await import(statusUrl);

const noop = () => {};
const historyCalls = { undo: 0, redo: 0 };
const history = {
  canUndo: true,
  canRedo: true,
  undo() { historyCalls.undo += 1; },
  redo() { historyCalls.redo += 1; },
};

function actionBarProps(overrides = {}) {
  const { adapter: adapterOverrides, ...rest } = overrides;
  return {
    adapter: {
      id: "image",
      label: "图片",
      stage: null,
      persistence: { dirty: false, editRevision: 0, flush: noop },
      history,
      ...adapterOverrides,
    },
    autoSaveState: "saved",
    activeLibraryPanelId: null,
    onBack: noop,
    onOpenLibrary: noop,
    onRetrySave: noop,
    onTriggerAction: noop,
    ...rest,
  };
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (element) => act(async () => root.render(element));
  try {
    await run({ window, render, container });
  } finally {
    await act(async () => root.unmount());
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    window.close();
  }
}

test("global history shares the first row and sits immediately before save", () => {
  assert.equal(GLOBAL_ROW_SLOTS[GLOBAL_ROW_SLOTS.indexOf("history") + 1], "save-state");
});

test("plugin global row renders undo and redo ahead of save/download/share/favorite", async () => {
  await withDom(async ({ render, container }) => {
    await render(React.createElement(AdvancedWorkspaceActionBar, actionBarProps({
      item: { id: "doc-1", title: "文档", url: "https://example.test/doc-1", favorite: false },
      adapter: {
        actions: [{ id: "download", label: "下载", group: "download", onTrigger: noop }],
      },
    })));

    const row = container.querySelector("[data-advanced-action-row]");
    assert.ok(row, "shared first row should render");
    const historyRow = row.querySelector('[data-global-row-slot="history"]');
    const save = row.querySelector('[data-global-row-slot="save-state"]');
    const download = row.querySelector('[data-global-row-slot="download"]');
    const share = row.querySelector('[data-global-row-slot="share"]');
    const favorite = row.querySelector('[data-global-row-slot="favorite"]');
    assert.ok(historyRow, "history slot should render");
    assert.ok(save, "save slot should render");
    assert.ok(download, "download slot should render");
    assert.ok(share, "share slot should render");
    assert.ok(favorite, "favorite slot should render");
    assert.ok(historyRow.compareDocumentPosition(save) & 4);
    assert.ok(historyRow.compareDocumentPosition(download) & 4);
    assert.ok(historyRow.compareDocumentPosition(share) & 4);
    assert.ok(historyRow.compareDocumentPosition(favorite) & 4);
    assert.equal(historyRow.querySelectorAll("button").length, 2);
    assert.equal(container.querySelector("[data-edit-bar-history]"), null);
  });
});

test("history shortcuts edit the canvas and leave typing surfaces alone", async () => {
  historyCalls.undo = 0;
  historyCalls.redo = 0;
  await withDom(async ({ window, render, container }) => {
    await render(React.createElement(AdvancedWorkspaceActionBar, actionBarProps()));
    assert.ok(container.querySelector('[data-global-row-slot="history"]'));

    const canvas = window.document.createElement("canvas");
    window.document.body.append(canvas);
    const undo = new window.KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true, cancelable: true,
    });
    canvas.dispatchEvent(undo);
    assert.equal(undo.defaultPrevented, true);
    assert.equal(historyCalls.undo, 1);

    const input = window.document.createElement("input");
    window.document.body.append(input);
    const nativeInputUndo = new window.KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true, cancelable: true,
    });
    input.dispatchEvent(nativeInputUndo);
    assert.equal(nativeInputUndo.defaultPrevented, false);
    assert.equal(historyCalls.undo, 1);

    const editorText = window.document.createElement("span");
    const editable = window.document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    editable.append(editorText);
    window.document.body.append(editable);
    const nativeEditorUndo = new window.KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, bubbles: true, cancelable: true,
    });
    editorText.dispatchEvent(nativeEditorUndo);
    assert.equal(nativeEditorUndo.defaultPrevented, false);
    assert.equal(historyCalls.undo, 1);

    const redo = new window.KeyboardEvent("keydown", {
      key: "z", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
    });
    canvas.dispatchEvent(redo);
    assert.equal(redo.defaultPrevented, true);
    assert.equal(historyCalls.redo, 1);
  });
});

test("save icon renders yellow while saving and green after confirmation", async () => {
  await withDom(async ({ render, container }) => {
    const props = actionBarProps();
    await render(React.createElement(AdvancedWorkspaceActionBar, {
      ...props,
      autoSaveState: "saving",
    }));
    const save = container.querySelector("[data-workspace-save-launcher]");
    assert.equal(save?.getAttribute("data-save-state"), "saving");
    assert.match(save?.getAttribute("style") || "", /rgb\(217, 119, 6\)/);

    await render(React.createElement(AdvancedWorkspaceActionBar, {
      ...props,
      autoSaveState: "saved",
    }));
    assert.equal(save?.getAttribute("data-save-state"), "saved");
    assert.match(save?.getAttribute("style") || "", /rgb\(5, 150, 105\)/);
  });
});

test("standalone chrome uses yellow for dirty/saving and green for saved", () => {
  const renderStatus = (kind) => renderToStaticMarkup(
    React.createElement(PluginChromeStatus, {
      state: kind === "error" ? { kind, message: "save failed" } : { kind },
    }),
  );
  const dirty = renderStatus("dirty");
  const saving = renderStatus("saving");
  const saved = renderStatus("saved");
  assert.match(dirty, /data-plugin-chrome-status="dirty"/);
  assert.match(dirty, /pchrome-warn/);
  assert.match(saving, /data-plugin-chrome-status="saving"/);
  assert.match(saving, /pchrome-warn/);
  assert.match(saved, /data-plugin-chrome-status="saved"/);
  assert.match(saved, /pchrome-ok/);
});

test("save stays yellow through debounce and turns green only after latest revision is acknowledged", async () => {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const states = [];
  const flushResolvers = [];
  const controller = new AdvancedPersistenceController({
    debounceMs: 400,
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    flushRevision: () => new Promise((resolve) => { flushResolvers.push(resolve); }),
    recordSavedItem: () => true,
    onStateChange: (state) => states.push(state),
  });
  const advanceTo = async (target) => {
    now = target;
    const due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
    for (const [id, timer] of due) {
      timers.delete(id);
      timer.callback();
    }
    await Promise.resolve();
  };

  controller.observe({ revision: 1, dirty: true, userEdited: true });
  assert.equal(controller.snapshot().state, "saving");
  await advanceTo(399);
  assert.equal(controller.snapshot().state, "saving");
  await advanceTo(400);
  assert.equal(controller.snapshot().state, "saving");
  assert.equal(flushResolvers.length, 1);
  controller.observe({ revision: 2, dirty: true, userEdited: true });
  flushResolvers.shift()({ ok: true });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(controller.snapshot().acknowledgedRevision, 1);
  assert.equal(controller.snapshot().state, "saving");
  assert.equal(flushResolvers.length, 1, "newest revision should flush after the older one");
  flushResolvers.shift()({ ok: true });
  await controller.whenIdle();
  assert.equal(controller.snapshot().acknowledgedRevision, 2);
  assert.equal(controller.snapshot().state, "saved");
  assert.deepEqual(states, ["saving", "saved"]);
  controller.dispose();
});
