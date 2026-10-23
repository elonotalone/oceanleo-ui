/**
 * V1 acceptance: shared edit-bar commands must reach a live handler and keep
 * the current selection when the pointer lands on the bar or a popover.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { dispatchFabricImageCommand } from "../src/shell/image-editor/fabric-image-commands.ts";
import {
  editBarHistoryShortcut,
  isEditBarSurface,
  preserveEditBarSelection,
} from "../src/shell/edit-bar-selection-preserve.ts";
import { SelectionCommandTransaction } from "../src/shell/selection-command-transaction.ts";
import {
  normalizeSelectionCommand,
  normalizeSelectionContext,
} from "../src/shell/selection-context.ts";
import { SelectionCommandGate } from "../src/shell/selection-transactions.ts";

const require = createRequire(import.meta.url);

function selection(id = "block:title") {
  return normalizeSelectionContext({
    version: 1,
    kind: "richdoc-text",
    id,
    revision: 3,
    epoch: 1,
    controls: [
      { id: "bold", kind: "toggle", label: "加粗", value: false },
      { id: "align-left", kind: "action", label: "左对齐" },
    ],
  });
}

function command(patch = {}) {
  return normalizeSelectionCommand({
    requestId: patch.requestId || "req-1",
    selectionId: patch.selectionId || "block:title",
    controlId: patch.controlId || "bold",
    selectionRevision: 3,
    selectionEpoch: 1,
    ...patch,
  });
}

test("live SelectionCommandGate holds a toolbar press and rejects after release or switch", () => {
  const gate = new SelectionCommandGate();
  const context = selection();
  assert.equal(gate.accept(command(), context), true);

  gate.holdInteraction(context);
  gate.reconcile(null);
  assert.equal(
    gate.accept(command({ requestId: "req-2", controlId: "align-left" }), null),
    true,
    "iframe blur during a held press must still address the last selection",
  );

  gate.releaseInteraction();
  assert.equal(
    gate.accept(command({ requestId: "req-3", controlId: "align-left" }), null),
    false,
    "a delayed command after release must not retarget the old object",
  );

  assert.equal(gate.accept(command({ requestId: "req-4" }), context), true);
  gate.reconcile(null);
  assert.equal(
    gate.accept(command({ requestId: "req-5", controlId: "align-left" }), null),
    false,
    "genuine deselection without a hold must not keep lastContext",
  );

  const other = selection("block:other");
  assert.equal(gate.accept(command({ requestId: "req-6" }), context), true);
  assert.equal(gate.reconcile(other).length, 0);
  assert.equal(
    gate.accept(
      command({
        requestId: "req-7",
        selectionId: "block:title",
        controlId: "bold",
      }),
      other,
    ),
    false,
    "document/object switch must reject the previous selection ids",
  );
});

test("gesture transaction mutates on commit and cancels without a document write", () => {
  const tx = new SelectionCommandTransaction();
  const log = [];
  const handlers = {
    begin: (id) => log.push(`begin:${id}`),
    commit: () => log.push("commit"),
    cancel: () => log.push("cancel"),
  };
  tx.run(
    { controlId: "font-size", transactionId: "t1", phase: "start" },
    handlers,
    () => log.push("mutate"),
  );
  tx.run(
    { controlId: "font-size", transactionId: "t1", phase: "update", value: 18 },
    handlers,
    () => log.push("mutate"),
  );
  tx.run(
    { controlId: "font-size", transactionId: "t1", phase: "commit", value: 18 },
    handlers,
    () => log.push("mutate"),
  );
  assert.deepEqual(log, ["begin:font-size", "mutate", "mutate", "commit"]);

  const cancelled = [];
  tx.run(
    { controlId: "font-size", transactionId: "t2", phase: "start" },
    {
      begin: () => cancelled.push("begin"),
      commit: () => cancelled.push("commit"),
      cancel: () => cancelled.push("cancel"),
    },
    () => cancelled.push("mutate"),
  );
  tx.run(
    { controlId: "font-size", transactionId: "t2", phase: "cancel" },
    {
      begin: () => cancelled.push("begin"),
      commit: () => cancelled.push("commit"),
      cancel: () => cancelled.push("cancel"),
    },
    () => cancelled.push("mutate"),
  );
  assert.deepEqual(cancelled, ["begin", "cancel"]);
});

test("pointerdown on the bar preserves selection; history shortcuts map undo/redo", async () => {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const { window } = new JSDOM(
    "<!doctype html><html><body></body></html>",
    { pretendToBeVisual: true },
  );
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
  })) {
    const previous = globalThis[name];
    restore.push(() => {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: previous,
      });
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  try {
    const bar = window.document.createElement("div");
    bar.setAttribute("data-workspace-edit-bar", "true");
    const button = window.document.createElement("button");
    bar.append(button);
    window.document.body.append(bar);
    assert.equal(isEditBarSurface(button), true);

    let prevented = false;
    preserveEditBarSelection({
      target: button,
      preventDefault() {
        prevented = true;
      },
    });
    assert.equal(prevented, true);

    const typing = window.document.createElement("input");
    typing.type = "number";
    let typingPrevented = false;
    preserveEditBarSelection({
      target: typing,
      preventDefault() {
        typingPrevented = true;
      },
    });
    assert.equal(typingPrevented, false);

    assert.equal(
      editBarHistoryShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
      "undo",
    );
    assert.equal(
      editBarHistoryShortcut({
        key: "z",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: true,
      }),
      "redo",
    );
  } finally {
    for (const undo of restore.reverse()) undo();
    window.close();
  }
});

test("document-segment edit action actually fires on click", async () => {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const { window } = new JSDOM(
    "<!doctype html><html><body></body></html>",
    { pretendToBeVisual: true, url: "https://word.oceanleo.com/library" },
  );
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
  const { EditBarDocumentSegment } = await import(
    await compileModule("src/shell/plugin-chrome/EditBarDocumentSegment.tsx", {
      "../../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (value) => value; }",
      ),
      "../AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedEditorIcon({ name }) {
          return jsx("span", { "data-icon": name });
        }
      `),
    })
  );
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const fired = [];
  await act(async () => {
    root.render(
      React.createElement(EditBarDocumentSegment, {
        actions: [
          { id: "recompute", label: "重新计算", group: "edit", icon: "refresh" },
          { id: "export-xlsx", label: "导出", group: "download" },
        ],
        onTrigger: (action) => fired.push(action.id),
      }),
    );
  });
  const button = container.querySelector(
    '[data-workspace-action-id="recompute"]',
  );
  assert.ok(button, "edit action must be in the document segment");
  assert.equal(
    container.querySelector('[data-workspace-action-id="export-xlsx"]'),
    null,
    "download actions must not appear in the edit bar",
  );
  await act(async () => button.click());
  assert.deepEqual(fired, ["recompute"]);
  await act(async () => root.unmount());
});

test("SelectionToolbar bold click mutates Fabric through the live onCommand path", async () => {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/library",
  });
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  class TestPointerEvent extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = TestPointerEvent;
  globalThis.PointerEvent = TestPointerEvent;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  if (typeof globalThis.ResizeObserver !== "function") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
  const { SelectionToolbar } = await import(
    await compileModule("src/shell/SelectionToolbar.tsx", {
      "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
      "./AdvancedEditorIcon": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function AdvancedEditorIcon({ name }) {
          return jsx("span", { "data-icon": name });
        }
      `),
      "./plugin-theme": dataModule(`
        export function pluginWorkbenchStyle() { return {}; }
        export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; }
        export function usePluginThemePortal() { return null; }
        export function PluginThemeScope({ children }) { return children; }
      `),
      "./SelectionAnimationGallery": dataModule(
        "export function SelectionAnimationGallery() { return null; }",
      ),
      "../ui/Button": dataModule(`
        import { jsx } from ${JSON.stringify(jsxUrl)};
        export function Button({ children, ...props }) {
          return jsx("button", props, children);
        }
      `),
    })
  );
  const text = { value: "Hello", bold: false, fontSize: 24 };
  const editor = {
    selected: { locked: false, kind: "text", id: "text:hero" },
    // The dispatcher only acts on a selection that is still a live layer.
    layers: [{ id: "text:hero", locked: false }],
    selectLayer() {},
    setSelectedText(patch) {
      Object.assign(text, patch);
    },
  };
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const gate = new SelectionCommandGate();
  const context = {
    version: 1,
    kind: "text",
    id: "text:hero",
    revision: 4,
    epoch: 2,
    label: "标题",
    controls: [
      { id: "bold", kind: "toggle", label: "粗体", icon: "bold", value: false },
    ],
  };
  await act(async () => {
    root.render(
      React.createElement(SelectionToolbar, {
        context,
        onSelectionInteractionChange(held) {
          if (held) gate.holdInteraction(held);
          else gate.releaseInteraction();
        },
        onCommand(next) {
          assert.equal(gate.accept(next, context), true);
          dispatchFabricImageCommand(editor, next);
        },
      }),
    );
  });
  const bold = container.querySelector(
    '[data-selection-control-id="bold"] button',
  );
  assert.ok(bold, "bold control must render");
  await act(async () => {
    bold.dispatchEvent(
      new TestPointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    bold.click();
  });
  assert.equal(text.bold, true);
  gate.releaseInteraction();
  assert.equal(
    gate.accept(
      command({
        requestId: "after-toolbar",
        selectionId: "text:hero",
        controlId: "bold",
        selectionRevision: 4,
        selectionEpoch: 2,
      }),
      null,
    ),
    false,
  );
  await act(async () => root.unmount());
});
