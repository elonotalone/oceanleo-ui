// W2 (2026-10-31 oceanbizs fixes): the composer could not be typed into after
// re-entering a task, and a black focus outline appeared around the chat pane.
//  1. PromptHighlightArea created while disabled must become editable when
//     `disabled` turns false (useEditor never re-applies `editable`).
//  2. An external value that arrives mid-IME-composition is applied after
//     compositionend instead of being dropped.
//  3. SplitWorkspace's focusable left pane never draws an outline, and closing
//     the right pane gives focus back to the composer textbox.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanbizs.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement,
  Element: window.Element, Node: window.Node, Text: window.Text, Event: window.Event, MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent, CompositionEvent: window.CompositionEvent, CustomEvent: window.CustomEvent,
  getSelection: window.getSelection.bind(window), MutationObserver: window.MutationObserver,
  DOMParser: window.DOMParser, localStorage: window.localStorage,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
for (const name of ["innerHeight", "innerWidth", "scrollX", "scrollY", "pageXOffset", "pageYOffset"]) {
  Object.defineProperty(globalThis, name, { configurable: true, get: () => window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.document.elementFromPoint = () => null;
window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });

async function flush(count = 4) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function mount(element) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  await flush();
  return {
    container,
    q: (selector) => container.querySelector(selector),
    async rerender(next) { await act(async () => root.render(next)); await flush(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
async function until(predicate, label) {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  assert.fail(`timed out waiting for ${label}`);
}

// The bench resolves bare packages through require (CJS); tiptap's CJS builds do not expose
// named ESM exports, so point every tiptap entry at its ESM build (one prosemirror instance).
const TIPTAP = ["@tiptap/react", "@tiptap/core", "@tiptap/pm/state", "@tiptap/extension-document", "@tiptap/extension-paragraph",
  "@tiptap/extension-text", "@tiptap/extension-placeholder", "@tiptap/extension-history"];
const tiptapStubs = Object.fromEntries(TIPTAP.map((name) => [name, import.meta.resolve(name)]));
const { PromptHighlightArea } = await import(await compileModule("src/shell/PromptHighlightArea.tsx", tiptapStubs));

test("an editor created while disabled becomes editable (placeholder back) when disabled turns false", async () => {
  const props = { value: "", onChange() {}, placeholder: "继续追问" };
  const m = await mount(React.createElement(PromptHighlightArea, { ...props, disabled: true }));
  try {
    await until(() => m.q('[role="textbox"]'), "editor mount");
    const box = m.q('[role="textbox"]');
    assert.equal(box.getAttribute("contenteditable"), "false", "starts frozen while disabled");
    assert.equal(box.editor.isEditable, false);
    await m.rerender(React.createElement(PromptHighlightArea, { ...props, disabled: false }));
    assert.equal(box.getAttribute("contenteditable"), "true", "re-entry: typing works once the session is usable");
    assert.equal(box.editor.isEditable, true);
    assert.ok(box.querySelector("[data-placeholder]"), "the placeholder (showOnlyWhenEditable) shows again");
    await m.rerender(React.createElement(PromptHighlightArea, { ...props, disabled: true }));
    assert.equal(box.getAttribute("contenteditable"), "false", "and back to read-only when disabled again");
  } finally { await m.unmount(); }
});

test("an external clear that arrives during IME composition is applied after compositionend", async () => {
  const emitted = [];
  let value = "";
  const Host = ({ v }) => React.createElement(PromptHighlightArea, { value: v, onChange: (next) => { value = next; emitted.push(next); } });
  const m = await mount(React.createElement(Host, { v: "" }));
  try {
    await until(() => m.q('[role="textbox"]'), "editor mount");
    const box = m.q('[role="textbox"]');
    const editor = box.editor;
    await act(async () => { editor.commands.insertContent("你好"); });
    assert.equal(value, "你好");
    await m.rerender(React.createElement(Host, { v: "你好" }));
    // Composition in progress; the host clears the box (e.g. a send went out).
    editor.view.input.composing = true;
    await m.rerender(React.createElement(Host, { v: "" }));
    assert.equal(editor.getText(), "你好", "never rebuilt mid-composition");
    editor.view.input.composing = false;
    await act(async () => {
      box.dispatchEvent(new window.CompositionEvent("compositionend", { bubbles: true, data: "" }));
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    assert.equal(editor.getText(), "", "the deferred clear lands once composition ended");
    assert.equal(emitted.at(-1), "", "the host is told the box is empty");
  } finally { await m.unmount(); }
});

// ── SplitWorkspace focus + outline ───────────────────────────────────────────

const splitSource = await readFile(new URL("../src/shell/SplitWorkspace.tsx", import.meta.url), "utf8");
const { SplitWorkspace } = await import(await compileModule("src/shell/SplitWorkspace.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
  "./icons": dataModule("export function IconLibrary(){ return null; }"),
  "./AdvancedEditorIcon": dataModule("export function AdvancedEditorIcon(){ return null; }"),
  "./EditBarDockHost": dataModule("export function EditBarDockHost(){ return null; }"),
}));

test("the focusable left pane never draws a focus outline", async () => {
  const m = await mount(React.createElement(SplitWorkspace, {
    left: React.createElement("div", null, "chat"), right: React.createElement("div", null, "result"),
    library: { open: true, onOpenChange() {} }, fillParent: true,
  }));
  try {
    const pane = m.q('[data-workspace-pane="left"]');
    assert.equal(pane.getAttribute("tabindex"), "-1");
    for (const cls of ["outline-none", "focus:outline-none", "focus-visible:outline-none"]) {
      assert.ok(pane.classList.contains(cls), `left pane has ${cls}`);
    }
  } finally { await m.unmount(); }
  // Every tabIndex={-1} section in the split is outline-free.
  const sections = splitSource.match(/<section[\s\S]*?>/g) || [];
  for (const section of sections.filter((block) => /tabIndex=\{-1\}/.test(block))) {
    assert.match(section, /focus-visible:outline-none/);
  }
});

test("closing the right pane gives focus back to the visible composer textbox, not the pane", async () => {
  const composer = (hidden) => React.createElement("div", { className: hidden ? "hidden" : "flex", "data-oceanleo-leo-entry-root": "" },
    React.createElement("div", { role: "textbox", contentEditable: true, suppressContentEditableWarning: true, "data-box": hidden ? "hidden" : "shown" }, ""));
  function Host() {
    const [open, setOpen] = React.useState(true);
    return React.createElement(SplitWorkspace, {
      left: React.createElement(React.Fragment, null, composer(true), composer(false)),
      right: React.createElement("div", null, "result"), library: { open, onOpenChange: setOpen }, fillParent: true,
    });
  }
  const m = await mount(React.createElement(Host));
  try {
    const close = m.q('[aria-label="关闭右侧面板"]');
    assert.ok(close, "close control");
    await act(async () => { close.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    await flush();
    assert.equal(window.document.activeElement?.getAttribute("data-box"), "shown", "focus lands in the shown composer");
  } finally { await m.unmount(); }
});
