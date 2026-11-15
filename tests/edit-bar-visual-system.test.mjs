import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import * as surface from "../src/shell/edit-bar-surface.ts";

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  innerHeight: window.innerHeight,
  innerWidth: window.innerWidth,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  getComputedStyle: window.getComputedStyle.bind(window),
});
// ProseMirror's scroll helper needs range geometry, which jsdom doesn't lay out.
window.Range.prototype.getClientRects ||= () => [];
window.Range.prototype.getBoundingClientRect ||= () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
// jsdom 20 cannot parse @starting-style. Geometry/interaction tests don't use CSS;
// reserve the motion sheet id so every console.error still fails these tests.
const motionStyle = document.createElement("style");
motionStyle.id = "leo-overlay-motion";
document.head.append(motionStyle);
const { createRoot } = await import("react-dom/client");
const stubs = {
  "./SelectionAnimationGallery": dataModule("export function SelectionAnimationGallery() { return null; }"),
  "./plugin-theme": dataModule('export function pluginWorkbenchStyle() { return {}; } export function usePluginTheme() { return { theme: "light", accent: "#6d5dfc" }; } export function usePluginThemePortal() { return {}; } export function PluginThemeScope({children}) { return children; }'),
};
const load = async (path) => import(await compileModule(path, stubs));
const { SelectionToolbarControl } = await load("src/shell/SelectionToolbarControl.tsx");
const { EditBarIcon } = await load("src/shell/EditBarIcon.tsx");
const { readEditBarTextStyle } = await load("src/shell/selection-toolbar-canon-controls.tsx");
const commands = [];
const defaults = { selectionId: "text:1-6", selectionRevision: 7, selectionEpoch: 3, accent: "#7c3aed", onCommand: (command) => commands.push(command) };
const font = { id: "font-family", canonId: "font-family", kind: "select", label: "字体", value: "default", options: [
  { value: "default", label: "默认字体" }, { value: "Poppins", label: "Poppins" }, { value: "Georgia", label: "Georgia" },
] };
const size = { id: "font-size", canonId: "font-size", kind: "number", label: "字号", value: 18, min: 6, max: 96, step: 1 };
const click = async (element, keyboard = false) => {
  assert.ok(element, "expected a live control");
  await act(async () => {
    if (!keyboard) element.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: keyboard ? 0 : 1 }));
  });
};
const key = async (element, value) => act(async () => {
  element.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: value }));
});
const frames = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 45)); });
function selectText(element, from = 0, to = element.textContent.length) {
  const walker = document.createTreeWalker(element, 4);
  const text = walker.nextNode();
  element.closest('[contenteditable="true"]').focus();
  const range = document.createRange();
  range.setStart(text, from); range.setEnd(text, to);
  document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
}
async function harness(fn, html = '<p style="font-family: Poppins; font-size: 18px">hello world</p>') {
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" ").slice(0, 350));
  commands.length = 0;
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.setAttribute("contenteditable", "true");
  editor.innerHTML = html;
  document.body.append(editor);
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-workspace-edit-bar-toolbar", "");
  document.body.append(toolbar);
  const root = createRoot(toolbar);
  const render = (control, extra = {}) => act(async () => root.render(React.createElement(SelectionToolbarControl, { ...defaults, control, ...extra })));
  try { await fn({ editor, toolbar, render }); }
  finally {
    await act(async () => root.unmount());
    editor.remove(); toolbar.remove();
    console.error = previousError;
    assert.deepEqual(errors, [], "real component must not log React errors");
  }
}

test("edit bar uses 24px icons, 2.4 strokes, 32px buttons and theme ink throughout", () => {
  const names = ["replace", "flip-horizontal", "flip-vertical", "radius", "border", "opacity", "adjust", "arrange", "position", "crop", "rotate"];
  const fingerprints = names.map((name) => {
    const markup = renderToStaticMarkup(React.createElement(EditBarIcon, { name }));
    assert.match(markup, /class="h-6 w-6 shrink-0"/);
    assert.match(markup, /stroke-width="2.4"/);
    assert.match(markup, /stroke="currentColor"/);
    assert.doesNotMatch(markup, /data-icon-fallback/);
    return markup.replace(/ data-icon="[^"]+"/, "");
  });
  assert.equal(new Set(fingerprints).size, names.length, "image tools must have distinct glyphs");
  assert.equal(surface.EDIT_BAR_CONTROL_SIZE_PX, 32);
  assert.equal(surface.EDIT_BAR_HEIGHT_PX, 42);
  assert.equal(surface.editBarPillStyle().gap, 4);
  assert.match(surface.EDIT_BAR_BUTTON_CLASS, /h-8 w-8/);
  assert.match(surface.EDIT_BAR_INK_CLASS, /awb-text/);
  assert.match(surface.editBarSurfaceStyle().color, /pchrome-ink.*awb-text.*fg/);
  for (const file of ["SelectionToolbarControl.tsx", "SelectionToolbarSelectControl.tsx", "selection-toolbar-chrome.tsx", "plugin-chrome/EditBarDocumentSegment.tsx"]) {
    const source = readFileSync(`src/shell/${file}`, "utf8");
    assert.match(source, /EditBarIcon/);
    assert.doesNotMatch(source, /h-4 w-4/);
  }
  assert.doesNotMatch(readFileSync("src/shell/SelectionToolbarControl.tsx", "utf8"), /SelectionToolbarFontSizeControl/);
});

test("font field resolves paragraph and heading inheritance, and mixed ranges", async () => {
  await harness(async ({ editor, toolbar, render }) => {
    selectText(editor.querySelector("p"));
    await render(font);
    const trigger = toolbar.querySelector("[data-edit-bar-font-family]");
    assert.match(trigger.textContent, /Poppins/);
    assert.doesNotMatch(trigger.textContent, /默认|default/);
    assert.match(trigger.className, /border/);
    selectText(editor.querySelector("h1"));
    await act(async () => document.dispatchEvent(new window.Event("selectionchange")));
    assert.match(trigger.textContent, /Georgia/);
    const range = document.createRange(); range.selectNodeContents(editor);
    document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    await act(async () => document.dispatchEvent(new window.Event("selectionchange")));
    assert.match(trigger.textContent, /多种/);
    await render({ ...size, value: null });
    assert.equal(toolbar.querySelector('input[type="number"]').placeholder, "多种");
  }, '<p style="font-family: Poppins; font-size:18px">one</p><h1 style="font-family:Georgia; font-size:32px"><span>two</span></h1>');
});

test("font search previews choices, restores the selected text before commit and keeps editor focus", async () => {
  await harness(async ({ editor, toolbar, render }) => {
    selectText(editor.querySelector("p"), 1, 5);
    await render(font, { onCommand(command) {
      commands.push(command);
      assert.equal(document.getSelection().toString(), "ello");
      assert.equal(document.activeElement === editor, true);
      editor.querySelector("p").style.fontFamily = command.value;
    } });
    const trigger = toolbar.querySelector("[data-edit-bar-font-family]");
    await click(trigger);
    const search = document.querySelector('input[type="search"]');
    assert.ok(search);
    // Search focus can collapse the native DOM range; the saved bookmark survives.
    document.getSelection().removeAllRanges();
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(search, "Geor");
      search.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const option = document.querySelector('[data-selection-option="Georgia"]');
    assert.equal(option.querySelector("span span").style.fontFamily, "Georgia");
    assert.equal(document.querySelector('[data-selection-option="Poppins"]'), null);
    await click(option);
    await frames();
    assert.equal(commands[0].value, "Georgia");
    assert.equal(commands[0].selectionRevision, 7);
    assert.equal(commands[0].selectionEpoch, 3);
    assert.equal(document.activeElement === editor, true, "commit must not refocus the toolbar on the next frame");
    assert.equal(readEditBarTextStyle().fontFamily, "Georgia");
  });
});

test("font-size number and legacy select both use minus/value/plus and emit number px", async () => {
  await harness(async ({ editor, toolbar, render }) => {
    selectText(editor.querySelector("p"));
    for (const control of [size, { ...size, kind: "select", value: "18px", options: [{ value: "default", label: "默认" }, { value: "24px", label: "24" }] }]) {
      await render(control);
      const buttons = toolbar.querySelectorAll("button");
      assert.equal(buttons.length, 2);
      assert.equal(buttons[0].textContent.trim(), "−");
      assert.equal(buttons[1].textContent.trim(), "+");
      await click(buttons[0]); assert.equal(commands.at(-1).value, 17);
      await click(buttons[1]); assert.equal(commands.at(-1).value, 19);
      await click(toolbar.querySelector('input[type="number"]'));
      document.getSelection().removeAllRanges();
      const preset = [...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === "24");
      await click(preset);
      assert.equal(commands.at(-1).value, 24);
      assert.equal(typeof commands.at(-1).value, "number");
      assert.equal(document.getSelection().toString(), "hello world");
      assert.equal(document.activeElement === editor, true);
    }
    await render({ ...size, value: 96 });
    const plus = [...toolbar.querySelectorAll("button")].find((node) => node.getAttribute("aria-label") === "字号 +");
    assert.ok(plus, JSON.stringify([...toolbar.querySelectorAll("button")].map((node) => node.getAttribute("aria-label"))));
    await click(plus);
    assert.equal(commands.at(-1).value, 96);
    await render({ ...size, icon: "font-size" }, { presentation: "menu" });
    assert.match(toolbar.textContent, /字号/);
    assert.equal(toolbar.querySelector("svg")?.getAttribute("data-icon"), "font-size");
  });
});

test("keyboard menus support ArrowDown, Escape and commit without a deferred focus steal", async () => {
  await harness(async ({ editor, toolbar, render }) => {
    selectText(editor.querySelector("p"));
    await render(font);
    const trigger = toolbar.querySelector("button");
    await act(async () => trigger.focus());
    await key(trigger, "ArrowDown");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    await key(document.activeElement, "ArrowDown");
    assert.equal(document.activeElement.getAttribute("role"), "option");
    await key(document.activeElement, "Escape");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement === trigger, true);
    await key(trigger, "ArrowDown");
    await click(document.querySelector('[data-selection-option="Georgia"]'), true);
    await frames();
    assert.equal(commands.at(-1).value, "Georgia");
    assert.equal(document.activeElement === editor, true);
    await render(size);
    const input = toolbar.querySelector('input[type="number"]');
    await click(input);
    await key(input, "ArrowDown");
    assert.equal(document.activeElement.getAttribute("role"), "option");
    await key(document.activeElement, "Escape");
    assert.equal(document.activeElement === input, true);
    assert.equal(input.getAttribute("aria-expanded"), "false");
  });
});

test("font and size dropdowns apply to a real Tiptap selection after the search field takes focus", async () => {
  await harness(async ({ editor: host, toolbar, render }) => {
    const tiptap = new Editor({ element: host, extensions: [StarterKit, TextStyle, FontFamily, FontSize], content: "<p>hello world</p>" });
    try {
      tiptap.commands.setTextSelection({ from: 2, to: 6 });
      tiptap.commands.focus();
      await frames();
      await render(font, { onCommand: (command) => tiptap.chain().focus().setFontFamily(command.value).run() });
      await click(toolbar.querySelector("button"));
      document.getSelection().removeAllRanges();
      await click(document.querySelector('[data-selection-option="Georgia"]'));
      await frames();
      assert.equal(tiptap.getAttributes("textStyle").fontFamily, "Georgia");
      assert.equal(tiptap.state.doc.textBetween(tiptap.state.selection.from, tiptap.state.selection.to), "ello");
      await render(size, { onCommand: (command) => tiptap.chain().focus().setFontSize(`${command.value}px`).run() });
      await click(toolbar.querySelector('input[type="number"]'));
      document.getSelection().removeAllRanges();
      await click([...document.querySelectorAll('[role="option"]')].find((node) => node.textContent === "24"));
      await frames();
      assert.match(tiptap.getHTML(), /font-family: Georgia; font-size: 24px/);
      assert.equal(tiptap.state.selection.from, 2);
      assert.equal(tiptap.state.selection.to, 6);
    } finally { tiptap.destroy(); }
  });
});
