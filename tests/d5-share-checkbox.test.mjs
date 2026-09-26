import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
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

const uiStub = dataModule("export function useUI() { return (text) => text; }");
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": uiStub,
  "../../i18n/ui/useUI": uiStub,
  "./Markdown": dataModule(`
    export function HighlightedText({ text }) { return text; }
    export function Markdown({ content }) { return content; }
    export function TypewriterMarkdown({ content }) { return content; }
  `),
  "./share/share-clipboard": dataModule("export async function writeClipboardText() { return true; }"),
}));

test("message checkbox and its SVG toggle once while the message row remains selectable", async () => {
  const dom = new JSDOM("<!doctype html><body><main></main></body>", { pretendToBeVisual: true });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const host = dom.window.document.querySelector("main");
  const root = createRoot(host);
  let toggles = 0;
  function Transcript() {
    const [selected, setSelected] = useState(false);
    return React.createElement(AgentTranscriptBubble, {
      message: { id: 1, role: "user", kind: "text", content: "Share this message" },
      selectMode: true,
      selected,
      onSelectToggle: () => { toggles += 1; setSelected((value) => !value); },
    });
  }
  try {
    await act(async () => root.render(React.createElement(Transcript)));
    const checkbox = host.querySelector('[role="checkbox"]');
    const click = async (node) => act(async () => {
      node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    await click(checkbox);
    assert.equal(toggles, 1, "checkbox click must not toggle again in the containing row");
    assert.equal(checkbox.getAttribute("aria-checked"), "true");
    await click(checkbox.querySelector("path"));
    assert.equal(toggles, 2, "clicking the checkmark must also toggle exactly once");
    assert.equal(checkbox.getAttribute("aria-checked"), "false");
    await click(checkbox.parentElement);
    assert.equal(toggles, 3, "the rest of the message row still selects the message");
    assert.equal(checkbox.getAttribute("aria-checked"), "true");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
