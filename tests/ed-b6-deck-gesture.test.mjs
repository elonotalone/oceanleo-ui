import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test, { afterEach, beforeEach } from "node:test";
import React, { act, useCallback, useState } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Use the repository's jsdom without loading its optional native canvas binary.
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator,
  HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
  Event: window.Event, MouseEvent: window.MouseEvent,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.scrollIntoView = function () {};

class PointerEvent extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, { bubbles: true, cancelable: true, ...init });
    Object.defineProperties(this, {
      pointerId: { value: init.pointerId ?? 7 },
      pointerType: { value: "mouse" },
      isPrimary: { value: true },
    });
  }
}
window.PointerEvent = globalThis.PointerEvent = PointerEvent;
const captures = new Map();
const captureCalls = [];
window.Element.prototype.setPointerCapture = function (pointerId) {
  captures.set(pointerId, this);
  captureCalls.push(pointerId);
};
window.Element.prototype.hasPointerCapture = function (pointerId) {
  return captures.get(pointerId) === this;
};
window.Element.prototype.releasePointerCapture = function (pointerId) {
  if (captures.get(pointerId) !== this) return;
  captures.delete(pointerId);
  this.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId }));
};

const { createRoot } = await import("react-dom/client");
const { DeckStage } = await import(await compileModule("src/shell/doc-editors/DeckStage.tsx", {
  "../../i18n/ui/useUI": dataModule("export function useUI() { return (text) => text; }"),
}));

let consoleErrors;
let originalConsoleError;
beforeEach(() => {
  captures.clear();
  captureCalls.length = 0;
  consoleErrors = [];
  originalConsoleError = console.error;
  console.error = (...args) => consoleErrors.push(args.map(String).join(" "));
});
afterEach(() => {
  console.error = originalConsoleError;
  assert.deepEqual(consoleErrors, [], "real DeckStage must mount and update without React errors");
});

function element(overrides = {}) {
  return { id: "text", type: "text", text: "可编辑文字", x: 10, y: 10, width: 40, height: 20, rotation: 0, order: 0, fontSize: 18, ...overrides };
}

async function mountStage(options = {}) {
  const calls = { edits: [], patches: [] };
  const slide = { id: "slide", title: "示例", body: "", bullets: [], notes: "", layout: "blank", elements: options.elements || [element()] };
  let update;
  function Harness() {
    const [state, setState] = useState({
      deck: { version: 2, title: "演示", aspect: "16:9", theme: "ocean", masters: [], slides: [slide] },
      selectedElementId: "", textEditingElementId: "", readOnly: false, loading: false, sourceFailed: false,
      ...options.flags,
    });
    update = setState;
    const selectElement = useCallback((id) => setState((current) => ({
      ...current, selectedElementId: id,
      textEditingElementId: current.textEditingElementId === id ? id : "",
    })), []);
    const beginTextEditing = useCallback((id) => {
      calls.edits.push(id);
      setState((current) => ({ ...current, selectedElementId: id, textEditingElementId: id }));
    }, []);
    const endTextEditing = useCallback(() => setState((current) => ({ ...current, textEditingElementId: "" })), []);
    const patchElement = useCallback((id, patch) => {
      calls.patches.push({ id, patch });
      setState((current) => ({ ...current, deck: {
        ...current.deck, slides: current.deck.slides.map((candidate) => ({ ...candidate,
          elements: candidate.elements.map((item) => item.id === id ? { ...item, ...patch } : item),
        })),
      } }));
    }, []);
    const setCanvasElement = useCallback(() => {}, []);
    const activeSlide = state.deck.slides[0];
    const editor = {
      ...state, activeSlide, activeIndex: 0, dirty: calls.patches.length > 0, editRevision: calls.patches.length,
      selectedElement: activeSlide.elements.find((item) => item.id === state.selectedElementId) || null,
      selectElement, beginTextEditing, endTextEditing, patchElement, setCanvasElement,
      error: "", selectSlide() {}, addSlide() {}, reload() {}, beginGesture() {}, endGesture() {},
    };
    return React.createElement(DeckStage, { editor });
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
  const canvas = host.querySelector("[data-deck-canvas]");
  assert.ok(canvas, "real stage must render its canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500 });
  return {
    host, canvas, calls,
    element: (id = "text") => host.querySelector(`[data-deck-element="${id}"]`),
    async flags(flags) { await act(async () => update((current) => ({ ...current, ...flags }))); },
    async close() { await act(async () => root.unmount()); host.remove(); },
  };
}

async function pointer(target, type, init = {}) {
  const event = new PointerEvent(type, { pointerId: 7, clientX: 100, clientY: 100, buttons: type === "pointerup" ? 0 : 1, ...init });
  // Captured pointer events go to the capturing canvas, as they do in a browser.
  const destination = type === "pointerdown" ? target : captures.get(event.pointerId) || target;
  await act(async () => destination.dispatchEvent(event));
  return event;
}
async function key(target, value) {
  await act(async () => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })));
}
async function doubleClick(target) {
  await act(async () => target.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 })));
}
async function click(view, init = {}) {
  const down = await pointer(view.element(), "pointerdown", init);
  await pointer(view.element(), "pointerup", init);
  await act(async () => view.element().dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 1 })));
  return down;
}

test("clicks and movement through 4px retain the text target without capture or a position commit", async () => {
  const view = await mountStage();
  try {
    assert.equal((await click(view)).defaultPrevented, false);
    assert.equal(view.element().getAttribute("aria-pressed"), "true");
    assert.match(view.element().title, /双击编辑/);
    assert.match(view.element().className, /cursor-text/);
    assert.deepEqual(view.calls.edits, []);
    await pointer(view.element(), "pointerdown");
    await pointer(view.element(), "pointermove", { clientX: 104 });
    assert.equal(view.element().style.left, "10%");
    assert.deepEqual(captureCalls, []);
    await pointer(view.element(), "pointerup", { clientX: 104 });
    assert.deepEqual(view.calls.patches, []);
  } finally { await view.close(); }
});

test("two stationary clicks then a real dblclick handler mount editable text", async () => {
  const view = await mountStage();
  try {
    await click(view);
    await click(view); // pointerdown.detail stays 0; dblclick is the reliable entry.
    assert.deepEqual(captureCalls, []);
    await doubleClick(view.element());
    assert.deepEqual(view.calls.edits, ["text"]);
    assert.ok(view.element().querySelector('[contenteditable="true"]'));
    assert.deepEqual(view.calls.patches, []);
  } finally { await view.close(); }
});

test("Enter and F2 still enter the actual inline editor; Escape exits it", async () => {
  const view = await mountStage();
  try {
    await click(view);
    await key(view.element(), "a");
    assert.deepEqual(view.calls.edits, []);
    for (const value of ["Enter", "F2"]) {
      await key(view.element(), value);
      const editable = view.element().querySelector('[contenteditable="true"]');
      assert.ok(editable);
      await key(editable, "Escape");
      assert.equal(Boolean(view.element().querySelector('[contenteditable="true"]')), false);
    }
    assert.deepEqual(view.calls.edits, ["text", "text"]);
    assert.deepEqual(view.calls.patches, []);
  } finally { await view.close(); }
});

test("pointerdown double-click fallback also clears pending movement", async () => {
  const view = await mountStage();
  try {
    await pointer(view.element(), "pointerdown", { detail: 2 });
    await pointer(view.element(), "pointermove", { clientX: 160 });
    await pointer(view.element(), "pointerup", { clientX: 160 });
    assert.ok(view.element().querySelector('[contenteditable="true"]'));
    assert.deepEqual(captureCalls, []);
    assert.deepEqual(view.calls.patches, []);
  } finally { await view.close(); }
});

test("drag captures only beyond the threshold, previews movement and commits once on release", async () => {
  const view = await mountStage();
  try {
    await pointer(view.element(), "pointerdown");
    await pointer(view.element(), "pointermove", { clientX: 103, clientY: 103 });
    assert.deepEqual(captureCalls, [7], "diagonal distance is measured in CSS pixels");
    assert.equal(view.canvas.hasPointerCapture(7), true);
    await pointer(view.element(), "pointermove", { clientX: 150, clientY: 125 });
    assert.equal(view.element().style.left, "15%");
    assert.equal(view.element().style.top, "15%");
    assert.deepEqual(view.calls.patches, []);
    await pointer(view.element(), "pointerup", { clientX: 150, clientY: 125 });
    await pointer(view.element(), "pointerup");
    assert.deepEqual(view.calls.patches, [{ id: "text", patch: { x: 15, y: 15 } }]);
    assert.equal(view.canvas.hasPointerCapture(7), false);
  } finally { await view.close(); }
});

test("resize and rotate keep their geometry and a single commit after delayed capture", async () => {
  for (const mode of ["resize", "rotate"]) {
    const view = await mountStage();
    try {
      await click(view);
      const handle = view.element().querySelector(mode === "resize" ? '[data-deck-resize-handle="se"]' : "[data-deck-rotate-handle]");
      assert.ok(handle);
      await pointer(handle, "pointerdown", { clientX: 500, clientY: 150 });
      const priorCaptures = captureCalls.length;
      await pointer(handle, "pointermove", { clientX: 503, clientY: 150 });
      assert.equal(captureCalls.length, priorCaptures);
      const end = mode === "resize" ? { clientX: 600, clientY: 200 } : { clientX: 300, clientY: 300, shiftKey: true };
      await pointer(handle, "pointermove", end);
      assert.equal(view.canvas.hasPointerCapture(7), true);
      await pointer(handle, "pointerup", end);
      assert.equal(view.calls.patches.length, 1);
      const patch = view.calls.patches[0].patch;
      if (mode === "resize") {
        assert.equal(patch.width, 50);
        assert.equal(patch.height, 30);
      } else {
        assert.notEqual(patch.rotation, 0);
        assert.equal(patch.rotation % 15, 0);
      }
    } finally { await view.close(); }
  }
});

test("cancel and lost capture discard a drag and allow the next click to edit", async () => {
  for (const cancellation of ["pointercancel", "lostpointercapture"]) {
    const view = await mountStage();
    try {
      await pointer(view.element(), "pointerdown");
      await pointer(view.element(), "pointermove", { clientX: 150 });
      if (cancellation === "lostpointercapture") {
        await act(async () => view.canvas.releasePointerCapture(7));
      } else await pointer(view.element(), cancellation);
      assert.equal(view.canvas.hasPointerCapture(7), false);
      assert.equal(view.element().style.left, "10%");
      await pointer(view.element(), "pointerup");
      assert.deepEqual(view.calls.patches, []);
      await click(view);
      await doubleClick(view.element());
      assert.ok(view.element().querySelector('[contenteditable="true"]'));
    } finally { await view.close(); }
  }
});

test("pending gestures finish outside the canvas and ignore unrelated pointers", async () => {
  const view = await mountStage();
  try {
    await pointer(view.element(), "pointerdown");
    await pointer(document.body, "pointermove", { pointerId: 8, clientX: 160 });
    await pointer(document.body, "pointerup", { pointerId: 8 });
    assert.deepEqual(captureCalls, []);
    await pointer(document.body, "pointerup");
    await pointer(view.element(), "pointermove", { clientX: 160 });
    assert.deepEqual(view.calls.patches, []);
    assert.deepEqual(captureCalls, []);
    await pointer(view.element(), "pointerdown");
    await pointer(document.body, "pointermove", { clientX: 160 });
    await pointer(document.body, "pointerup", { clientX: 160 });
    assert.equal(view.calls.patches.length, 1);
    assert.equal(view.calls.patches[0].patch.x, 16);
  } finally { await view.close(); }
});

test("locked, read-only and source-loading elements cannot edit text or commit gestures", async () => {
  for (const options of [
    { elements: [element({ locked: true }), element({ id: "other", y: 50, order: 1 })] },
    { flags: { readOnly: true } },
    { flags: { loading: true } },
    { flags: { sourceFailed: true } },
  ]) {
    const view = await mountStage(options);
    try {
      await click(view);
      await pointer(view.element(), "pointerdown");
      await pointer(view.element(), "pointermove", { clientX: 160 });
      await pointer(view.element(), "pointerup");
      await doubleClick(view.element());
      await key(view.element(), "Enter");
      await key(view.element(), "F2");
      assert.deepEqual(view.calls.edits, []);
      assert.deepEqual(view.calls.patches, []);
      assert.equal(Boolean(view.element().querySelector('[contenteditable="true"]')), false);
      assert.equal(view.element().title.includes("双击编辑"), false);
      if (options.flags?.loading) {
        await view.flags({ loading: false });
        await click(view);
        await doubleClick(view.element());
        assert.deepEqual(view.calls.edits, ["text"], "loading → loaded restores text editing");
        assert.ok(view.element().querySelector('[contenteditable="true"]'));
      }
    } finally { await view.close(); }
  }
});

test("becoming read-only during a drag discards its preview and capture", async () => {
  const view = await mountStage();
  try {
    await pointer(view.element(), "pointerdown");
    await pointer(view.element(), "pointermove", { clientX: 160 });
    await view.flags({ readOnly: true });
    assert.equal(view.canvas.hasPointerCapture(7), false);
    assert.equal(view.element().style.left, "10%");
    await pointer(view.element(), "pointerup");
    assert.deepEqual(view.calls.patches, []);
  } finally { await view.close(); }
});
