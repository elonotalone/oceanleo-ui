/**
 * W5: real edit-bar command effects. Clicks, keyboard, and hosted-blur hold
 * must change a document through the existing Fabric image command core.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { dispatchFabricImageCommand } from "../src/shell/image-editor/fabric-image-commands.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://website.oceanleo.com/workspace/w5-edit-bar",
});
const { window } = dom;
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
  PointerEvent: window.PointerEvent || window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class ResizeObserverProbe {
  static instances = new Set();
  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    ResizeObserverProbe.instances.add(this);
  }
  observe(target) {
    this.targets.add(target);
  }
  unobserve(target) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    ResizeObserverProbe.instances.delete(this);
  }
}
globalThis.ResizeObserver = window.ResizeObserver = ResizeObserverProbe;

const jsxUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const stubs = {
  "./AdvancedEditorIcon": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function AdvancedEditorIcon({name}) { return jsx("span", {"data-icon": name}); }`,
  ),
  "../i18n/ui/useUI": dataModule("export function useUI() { return (s) => s; }"),
  "./plugin-theme": dataModule(
    'export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return null; } export function PluginThemeScope({children}) { return children; }',
  ),
  "./SelectionAnimationGallery": dataModule(
    "export function SelectionAnimationGallery() { return null; }",
  ),
  "../ui/Button": dataModule(
    `import { jsx } from ${JSON.stringify(jsxUrl)}; export function Button({children, ...props}) { return jsx("button", props, children); }`,
  ),
};
const load = async (path) => import(await compileModule(path, stubs));
const { SelectionToolbar } = await load("src/shell/SelectionToolbar.tsx");
const { isOwnEditBarSession, ownEditBarSessionOpen } = await load(
  "src/shell/edit-bar-selection-session.tsx",
);
const { EditBarHistoryControls } = await load("src/shell/EditBarDockControls.tsx");
const { EditBarDocumentSegment } = await load(
  "src/shell/plugin-chrome/EditBarDocumentSegment.tsx",
);
const { createRoot } = await import("react-dom/client");

function makeImageEditor(initial = { value: "Hello", bold: false, fontSize: 24 }) {
  const text = { ...initial };
  const stack = [{ ...text }];
  return {
    selected: { locked: false, kind: "text", id: "text:hero" },
    text,
    stack,
    setSelectedText(patch) {
      Object.assign(text, patch);
      stack.push({ ...text });
    },
    undo() {
      if (stack.length < 2) return;
      stack.pop();
      Object.assign(text, stack[stack.length - 1]);
    },
  };
}

const context = {
  version: 1,
  kind: "text",
  id: "text:hero",
  revision: 4,
  epoch: 2,
  label: "标题",
  controls: [
    { id: "bold", kind: "toggle", label: "粗体", icon: "bold", value: false },
    { id: "font-size", kind: "number", label: "字号", value: 24, min: 8, max: 200, step: 1 },
  ],
};

class TestPointerEvent extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
window.PointerEvent = TestPointerEvent;
globalThis.PointerEvent = TestPointerEvent;

function firePointer(target, type) {
  const event = new TestPointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  target.dispatchEvent(event);
  return event;
}

async function mountToolbar(editor, live = context) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const api = { commands: [], container, setLive: null };
  function Host() {
    const [current, setCurrent] = React.useState(live);
    api.setLive = setCurrent;
    return React.createElement(SelectionToolbar, {
      context: current,
      onCommand: (command) => {
        api.commands.push(command);
        dispatchFabricImageCommand(editor, command);
      },
    });
  }
  await act(async () => root.render(React.createElement(Host)));
  api.unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return api;
}

test("W5-toolbar bold click preserves selection and toggles Fabric text", async () => {
  const editor = makeImageEditor();
  const stage = document.createElement("div");
  stage.contentEditable = "true";
  stage.textContent = "Hello";
  document.body.append(stage);
  stage.focus();
  const range = document.createRange();
  range.selectNodeContents(stage);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const api = await mountToolbar(editor);
  try {
    const bold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(bold, "bold control must render");
    let pointer;
    await act(async () => {
      pointer = firePointer(bold, "pointerdown");
    });
    assert.equal(pointer.defaultPrevented, true);
    assert.equal(window.getSelection()?.toString(), "Hello");
    await act(async () => bold.click());
    assert.equal(api.commands.at(-1)?.controlId, "bold");
    assert.equal(api.commands.at(-1)?.selectionId, "text:hero");
    assert.equal(editor.text.bold, true);
    assert.equal(editor.stack.length, 2);
  } finally {
    await api.unmount();
    stage.remove();
  }
});

test("W5-toolbar keeps the command after hosted selection blurs mid-press", async () => {
  const editor = makeImageEditor();
  const api = await mountToolbar(editor);
  try {
    const bold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    await act(async () => firePointer(bold, "pointerdown"));
    await act(async () => api.setLive(null));
    const held = api.container.querySelector(
      "[data-edit-bar-selection-session='held']",
    );
    assert.equal(held?.getAttribute("data-selection-id"), "text:hero");
    const stillBold = api.container.querySelector(
      '[data-selection-control-id="bold"] button',
    );
    assert.ok(stillBold, "held session must keep the compact control");
    await act(async () => stillBold.click());
    assert.equal(editor.text.bold, true);
    assert.equal(api.commands.at(-1)?.selectionRevision, 4);
  } finally {
    await api.unmount();
  }
});

test("W5-number stepper changes Fabric font size", async () => {
  const editor = makeImageEditor();
  const api = await mountToolbar(editor);
  try {
    const steppers = api.container.querySelectorAll(
      '[data-selection-control-id="font-size"] button',
    );
    assert.equal(steppers.length >= 2, true, "font-size stepper must render");
    await act(async () => steppers[steppers.length - 1].click());
    assert.equal(editor.text.fontSize, 25);
  } finally {
    await api.unmount();
  }
});

test("W5-history Ctrl+Z from the bar undoes the Fabric document, not a no-op", async () => {
  const editor = makeImageEditor();
  dispatchFabricImageCommand(editor, {
    requestId: "seed",
    selectionId: "text:hero",
    controlId: "bold",
    value: true,
  });
  assert.equal(editor.text.bold, true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(EditBarHistoryControls, {
        canUndo: true,
        canRedo: false,
        onUndo: () => editor.undo(),
        onRedo: () => {},
      }),
    ),
  );
  try {
    const undo = container.querySelector("[data-edit-bar-history-undo]");
    const key = new window.KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    undo.dispatchEvent(key);
    assert.equal(key.defaultPrevented, true);
    assert.equal(editor.text.bold, false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("W5-r2-session helpers ignore a foreign overlay", () => {
  document.body.innerHTML = `
    <div data-edit-bar-session="mine" data-anchored-popover data-leo-overlay-state="closed"></div>
    <div data-edit-bar-session="other" data-anchored-popover data-leo-overlay-state="open"></div>
  `;
  assert.equal(ownEditBarSessionOpen("mine"), false);
  assert.equal(ownEditBarSessionOpen("other"), true);
  const foreign = document.querySelector('[data-edit-bar-session="other"]');
  assert.equal(isOwnEditBarSession(foreign, "mine"), false);
  assert.equal(isOwnEditBarSession(foreign, "other"), true);
  document.body.innerHTML = "";
});

test("W5-document segment trigger stays a real action", async () => {
  const fired = [];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(EditBarDocumentSegment, {
        actions: [
          { id: "run-all", label: "运行全部", group: "edit" },
          { id: "save", label: "保存", group: "save" },
        ],
        onTrigger: (action) => fired.push(action.id),
      }),
    ),
  );
  try {
    const run = container.querySelector('[data-workspace-action-id="run-all"]');
    assert.ok(run);
    let pointer;
    await act(async () => {
      pointer = firePointer(run, "pointerdown");
    });
    assert.equal(pointer.defaultPrevented, true);
    await act(async () => run.click());
    assert.deepEqual(fired, ["run-all"]);
    assert.equal(container.querySelector('[data-workspace-action-id="save"]'), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
