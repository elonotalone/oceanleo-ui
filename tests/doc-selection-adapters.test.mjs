import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, FontSize, FontFamily, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { RichDocTypography } from "../src/shell/doc-editors/rich-doc-model.ts";
import { normalizeDeckDocument } from "../src/shell/doc-editors/deck-schema.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.innerHeight = window.innerHeight;
globalThis.innerWidth = window.innerWidth;

const stubs = { "../../i18n/ui/useUI": dataModule("const tt=(s)=>s; export function useUI(){return tt;}") };
const { useDeckSelectionAdapter } = await import(await compileModule("src/shell/doc-editors/use-deck-selection-adapter.ts", stubs));
const { useRichDocSelectionAdapter } = await import(await compileModule("src/shell/doc-editors/use-rich-doc-selection-adapter.ts", stubs));

async function mount(useAdapter, props) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let adapter;
  function Harness(input) {
    adapter = useAdapter(input);
    return React.createElement("button", {
      onClick: () => adapter.dispatch({ requestId: "click", selectionId: adapter.context.id, controlId: "bold", value: true }),
    }, "Bold");
  }
  const render = async (input) => act(async () => root.render(React.createElement(Harness, input)));
  await render(props);
  return {
    get adapter() { return adapter; },
    render,
    click: async () => act(async () => container.querySelector("button").click()),
    async close() {
      await act(async () => root.unmount());
      container.remove();
      console.error = previousError;
      assert.deepEqual(errors, [], "adapter mounts and state changes must not emit React errors");
    },
  };
}

function send(adapter, controlId, value, rest = {}) {
  adapter.dispatch({ requestId: "test", selectionId: adapter.context.id, controlId, value, ...rest });
}

test("Deck hook survives loading, selection and readonly changes and keeps gesture commands", async () => {
  const deck = normalizeDeckDocument({ slides: [{ id: "slide", elements: [{ id: "text", type: "text", text: "Hello", fontSize: 24, lineHeight: 1.5 }] }] });
  const calls = [];
  let editor = {
    deck, activeSlide: deck.slides[0], activeMaster: deck.masters[0], activeIndex: 0,
    selectedElement: deck.slides[0].elements[0], loading: true, sourceFailed: false, readOnly: false,
    patchElement: (id, patch) => calls.push(["patch", id, patch]),
    patchElementTransient: (id, patch) => calls.push(["preview", id, patch]),
    beginGesture: () => calls.push(["begin"]), endGesture: () => calls.push(["end"]), cancelGesture: () => calls.push(["cancel"]),
  };
  const mounted = await mount(useDeckSelectionAdapter, { editor });
  try {
    assert.equal(mounted.adapter.context, null);
    editor = { ...editor, loading: false };
    await mounted.render({ editor });
    const metrics = mounted.adapter.context.controls.find((control) => control.id === "line-height");
    assert.equal(metrics.value, 36);
    assert.equal(Object.hasOwn(metrics, "label"), false, "shell owns canon presentation");
    const dispatchBeforeReadonly = mounted.adapter.dispatch;
    await mounted.click();
    assert.deepEqual(calls.pop(), ["patch", "text", { bold: true }]);
    for (const phase of ["start", "update", "commit"]) send(mounted.adapter, "line-height", 37, { transactionId: "height", phase });
    assert.deepEqual(calls, [["begin"], ["preview", "text", { lineHeight: 37 / 24 }], ["preview", "text", { lineHeight: 37 / 24 }], ["end"]]);
    calls.length = 0;
    await mounted.render({ editor, readOnly: true });
    assert.ok(mounted.adapter.context.controls.every((control) => control.disabled && control.unavailableReason));
    dispatchBeforeReadonly({ requestId: "stale", selectionId: "text", controlId: "bold", value: false });
    assert.deepEqual(calls, [], "a retained dispatcher must obey the latest readonly gate");
    await mounted.render({ editor: { ...editor, selectedElement: null } });
    dispatchBeforeReadonly({ requestId: "stale", selectionId: "text", controlId: "bold", value: false });
    assert.deepEqual(calls, [], "commands for a previous selection must not modify the slide");
  } finally { await mounted.close(); }
});

test("RichDoc hook uses real Tiptap text metrics, revision checks, commit and clear format", async () => {
  const editor = new Editor({
    extensions: [StarterKit, TextStyle, FontSize, FontFamily, Color, Highlight.configure({ multicolor: true }), RichDocTypography],
    content: '<p style="line-height:1.5"><span style="font-size:20px;color:#123456;font-family:Georgia"><strong><em><u><s><mark data-color="#ffff00">Hello</mark></s></u></em></strong></span></p>',
    editorProps: { handleScrollToSelection: () => true },
  });
  editor.commands.setTextSelection({ from: 1, to: 6 });
  let state = { editor, editRevision: 1, sourceReady: true, loading: false, sourceFailed: false, collabReadOnly: false,
    clearFormat: () => editor.chain().clearNodes().unsetAllMarks().run() };
  const mounted = await mount(useRichDocSelectionAdapter, { editor: state });
  try {
    const byId = (id) => mounted.adapter.context.controls.find((control) => control.id === id);
    assert.equal(byId("font-size").value, 20);
    assert.equal(byId("line-height").value, 30);
    assert.equal(Object.hasOwn(byId("font-size"), "kind"), false);
    await act(async () => send(mounted.adapter, "font-size", 22, { selectionRevision: 0 }));
    assert.equal(editor.getAttributes("textStyle").fontSize, "20px");
    await act(async () => send(mounted.adapter, "font-size", 22, { selectionRevision: 1, transactionId: "size", phase: "update" }));
    assert.equal(editor.getAttributes("textStyle").fontSize, "20px", "transient RichDoc phases do not create undo records");
    await act(async () => send(mounted.adapter, "font-size", 22, { selectionRevision: 1, transactionId: "size", phase: "commit" }));
    assert.equal(editor.getAttributes("textStyle").fontSize, "22px");
    await act(async () => send(mounted.adapter, "line-height", 32));
    assert.equal(editor.getAttributes("paragraph").lineHeight, "24pt");
    assert.equal(byId("line-height").value, 32, "stored pt must return as px");
    const oldDispatch = mounted.adapter.dispatch;
    state = { ...state, editRevision: 2, collabReadOnly: true };
    await mounted.render({ editor: state });
    await act(async () => oldDispatch({ requestId: "old", selectionId: mounted.adapter.context.id, controlId: "font-size", value: 48 }));
    assert.equal(editor.getAttributes("textStyle").fontSize, "22px");
    await mounted.render({ editor: { ...state, collabReadOnly: false } });
    await act(async () => send(mounted.adapter, "clear-format"));
    assert.deepEqual(editor.getJSON().content[0].content[0].marks ?? [], [], "every inline mark is cleared by the engine");
    await act(async () => {
      editor.commands.setContent('<h3>Heading</h3>');
      editor.commands.setTextSelection({ from: 1, to: 8 });
    });
    assert.equal(byId("font-size").value, 17.5, "heading 3 inherits the actual rich document font size");
    await act(async () => {
      editor.commands.setContent('<p><span style="font-size:18pt">Imported</span></p>');
      editor.commands.setTextSelection({ from: 1, to: 9 });
    });
    assert.equal(byId("font-size").value, 24, "imported pt sizes enter the px controls");
  } finally { await mounted.close(); editor.destroy(); }
});
