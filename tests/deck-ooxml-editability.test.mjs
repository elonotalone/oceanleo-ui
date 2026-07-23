import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";
import PptxGenJS from "pptxgenjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

import {
  deckPptxVisualObjectName,
  injectDeckPptxVisuals,
} from "../src/shell/doc-editors/DeckPptxVisuals.ts";
import {
  assertDeckPptxSlideXml,
  injectDeckPptxOoxml,
} from "../src/shell/doc-editors/deck-pptx-ooxml.ts";
import {
  deckElementTextEditability,
  deckPrimaryEditableTextElement,
  deckTextEditKeyStartsEditing,
} from "../src/shell/doc-editors/deck-text-gesture.ts";
import { mapPptxPresentationToDeck } from "../src/shell/doc-editors/pptx-deck-import.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/workspace",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  FocusEvent: window.FocusEvent,
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
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

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function deckElementContentModuleUrl() {
  const sourcePath = new URL(
    "../src/shell/doc-editors/DeckElementContent.tsx",
    import.meta.url,
  );
  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
  const source = readFileSync(sourcePath, "utf8").replaceAll(
    '"react"',
    JSON.stringify(reactUrl),
  );
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath.pathname,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return dataModule(compiled);
}

function slideWith(elements, extra = {}) {
  return {
    id: "slide-focused",
    title: "Focused",
    body: "",
    bullets: [],
    notes: "",
    layout: "blank",
    background: "",
    elements,
    ...extra,
  };
}

function shapeElement(id, extra = {}) {
  return {
    id,
    type: "shape",
    x: 10,
    y: 10,
    width: 30,
    height: 20,
    rotation: 0,
    order: 0,
    shape: "rectangle",
    ...extra,
  };
}

test("missing optional visual target warns and still yields a valid base PPTX", async () => {
  const pptx = new PptxGenJS();
  pptx.addSlide().addText("base remains valid", {
    x: 1,
    y: 1,
    w: 4,
    h: 1,
    objectName: "DifferentTarget",
  });
  const base = await pptx.write({ outputType: "blob" });
  const source = slideWith([
    {
      ...shapeElement("missing-visual"),
      type: "image",
      src: "data:image/png;base64,AA==",
      borderRadius: 18,
    },
  ]);
  const warnings = [];
  const exported = await injectDeckPptxVisuals(base, [source], "16:9", {
    onWarning: (warning) => warnings.push(warning),
  });
  const archive = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  assert.ok(archive["[Content_Types].xml"]);
  assert.ok(archive["ppt/presentation.xml"]);
  const xml = strFromU8(archive["ppt/slides/slide1.xml"]);
  assertDeckPptxSlideXml(xml);
  assert.match(xml, /base remains valid/);
  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ["visual-target-missing"],
  );
});

test("real visual target receives enhancement and duplicate target names are eliminated", async () => {
  const target = deckPptxVisualObjectName("real-target");
  const pptx = new PptxGenJS();
  pptx.addSlide().addShape(pptx.ShapeType.rect, {
    x: 1,
    y: 1,
    w: 3,
    h: 2,
    objectName: target,
  });
  const raw = await pptx.write({ outputType: "blob" });
  const warnings = [];
  const enhanced = await injectDeckPptxVisuals(
    raw,
    [slideWith([shapeElement("real-target", { borderRadius: 20 })])],
    "16:9",
    { onWarning: (warning) => warnings.push(warning) },
  );
  const enhancedXml = strFromU8(
    unzipSync(new Uint8Array(await enhanced.arrayBuffer()))[
      "ppt/slides/slide1.xml"
    ],
  );
  assert.match(enhancedXml, /<a:prstGeom prst="roundRect">/);
  assert.deepEqual(warnings, []);

  const ambiguousPptx = new PptxGenJS();
  const ambiguousSlide = ambiguousPptx.addSlide();
  for (const x of [1, 5]) {
    ambiguousSlide.addShape(ambiguousPptx.ShapeType.rect, {
      x,
      y: 1,
      w: 3,
      h: 2,
      objectName: target,
    });
  }
  const ambiguousRaw = await ambiguousPptx.write({ outputType: "blob" });
  const ambiguousWarnings = [];
  const safe = await injectDeckPptxVisuals(
    ambiguousRaw,
    [slideWith([shapeElement("real-target", { borderRadius: 20 })])],
    "16:9",
    { onWarning: (warning) => ambiguousWarnings.push(warning) },
  );
  const safeXml = strFromU8(
    unzipSync(new Uint8Array(await safe.arrayBuffer()))[
      "ppt/slides/slide1.xml"
    ],
  );
  const names = [...safeXml.matchAll(/<p:cNvPr\b[^>]*\bname="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((name) => name.startsWith("OceanLeoElement-"));
  assert.equal(new Set(names).size, names.length);
  assert.ok(
    ambiguousWarnings.some(
      (warning) => warning.code === "target-name-ambiguous",
    ),
  );
  assert.ok(
    ambiguousWarnings.some(
      (warning) => warning.code === "visual-target-missing",
    ),
  );
  assertDeckPptxSlideXml(safeXml);
});

test("missing animation target skips only animation and preserves transition", async () => {
  const pptx = new PptxGenJS();
  pptx.addSlide().addText("base motion slide", {
    x: 1,
    y: 1,
    w: 4,
    h: 1,
    objectName: "DifferentTarget",
  });
  const raw = await pptx.write({ outputType: "blob" });
  const warnings = [];
  const source = slideWith(
    [
      {
        id: "missing-animation",
        type: "text",
        x: 10,
        y: 10,
        width: 40,
        height: 15,
        rotation: 0,
        order: 0,
        text: "animated",
        animation: { type: "fade", durationMs: 500, delayMs: 0 },
      },
    ],
    { transition: { type: "fade", durationMs: 600 } },
  );
  const exported = await injectDeckPptxOoxml(raw, [source], {
    onWarning: (warning) => warnings.push(warning),
  });
  const xml = strFromU8(
    unzipSync(new Uint8Array(await exported.arrayBuffer()))[
      "ppt/slides/slide1.xml"
    ],
  );
  assert.match(xml, /<p:transition\b/);
  assert.doesNotMatch(xml, /<p:timing\b/);
  assert.ok(
    warnings.some(
      (warning) => warning.code === "animation-target-missing",
    ),
  );
  assertDeckPptxSlideXml(xml);
});

test("common placeholders and safe grouped text import as stable editable elements", () => {
  const parsed = {
    size: { width: 1_000, height: 500 },
    slides: [
      {
        fill: { type: "color", value: "#ffffff" },
        note: "import evidence",
        layoutElements: [
          {
            type: "text",
            name: "Title Placeholder 1",
            left: 50,
            top: 20,
            width: 900,
            height: 60,
            order: 0,
            content:
              '<p style="font-size: 28pt; font-weight: 700">Editable title</p>',
          },
        ],
        elements: [
          {
            type: "group",
            left: 100,
            top: 50,
            width: 500,
            height: 300,
            rotate: 0,
            order: 1,
            isFlipH: false,
            isFlipV: false,
            elements: [
              {
                type: "text",
                name: "Grouped Text",
                left: 10,
                top: 10,
                width: 250,
                height: 60,
                order: 1,
                content: "<p>Editable grouped copy</p>",
              },
              {
                type: "shape",
                name: "Grouped Shape",
                left: 20,
                top: 90,
                width: 200,
                height: 80,
                order: 2,
                shapType: "rect",
                fill: { type: "color", value: "#eef2ff" },
                content: "<p>Editable shape copy</p>",
              },
            ],
          },
          {
            type: "shape",
            name: "OceanLeoElement-shape%20stable-main",
            left: 650,
            top: 80,
            width: 250,
            height: 100,
            order: 3,
            shapType: "rect",
            fill: { type: "color", value: "#ffffff" },
            content: "",
          },
          {
            type: "text",
            name: "OceanLeoElement-shape%20stable-label",
            left: 650,
            top: 80,
            width: 250,
            height: 100,
            order: 4,
            content: "<p>Recovered shape label</p>",
          },
          {
            type: "chart",
            name: "Revenue Chart",
            left: 600,
            top: 220,
            width: 300,
            height: 200,
            order: 5,
          },
          {
            type: "group",
            name: "Complex Mixed Group",
            left: 20,
            top: 350,
            width: 500,
            height: 120,
            rotate: 0,
            order: 6,
            elements: [
              {
                type: "text",
                left: 0,
                top: 0,
                width: 200,
                height: 40,
                content: "<p>Must not be destructively extracted</p>",
              },
              {
                type: "diagram",
                left: 220,
                top: 0,
                width: 200,
                height: 100,
              },
            ],
          },
        ],
      },
    ],
  };
  const first = mapPptxPresentationToDeck(parsed, "Imported");
  const second = mapPptxPresentationToDeck(parsed, "Imported");
  const elements = first.slides[0].elements;
  assert.ok(
    elements.some(
      (element) =>
        element.type === "text" && element.text === "Editable title",
    ),
  );
  const groupedText = elements.find(
    (element) => element.text === "Editable grouped copy",
  );
  assert.equal(groupedText?.type, "text");
  assert.ok(Math.abs(groupedText.x - 11) < 0.01, `x=${groupedText?.x}`);
  assert.ok(Math.abs(groupedText.y - 12) < 0.01, `y=${groupedText?.y}`);
  assert.ok(
    elements.some(
      (element) =>
        element.type === "shape" &&
        element.text === "Editable shape copy" &&
        element.shape === "rectangle",
    ),
  );
  const recovered = elements.find((element) => element.id === "shape stable");
  assert.equal(recovered?.type, "shape");
  assert.equal(recovered?.text, "Recovered shape label");
  assert.equal(
    elements.some((element) =>
      element.text?.includes("Must not be destructively extracted"),
    ),
    false,
  );
  assert.equal(
    elements.filter((element) => element.type === "unsupported").length,
    2,
  );
  assert.ok(
    elements.some(
      (element) =>
        element.type === "unsupported" &&
        element.label.includes("图表"),
    ),
  );
  assert.ok(
    elements.some(
      (element) =>
        element.type === "unsupported" &&
        element.label.includes("复杂组合"),
    ),
  );
  assert.deepEqual(
    second.slides[0].elements.map((element) => element.id),
    elements.map((element) => element.id),
  );
  assert.equal(
    new Set(elements.map((element) => element.id)).size,
    elements.length,
  );
});

test("selected text has explicit keyboard entry, locked reason, and one reliable commit", async () => {
  const element = {
    id: "editable-text",
    type: "text",
    x: 10,
    y: 10,
    width: 40,
    height: 20,
    rotation: 0,
    order: 0,
    text: "Before",
  };
  assert.deepEqual(deckElementTextEditability(element), {
    textBearing: true,
    editable: true,
    actionLabel: "编辑文字",
    reason: "",
  });
  assert.equal(deckTextEditKeyStartsEditing("Enter"), true);
  assert.equal(deckTextEditKeyStartsEditing("F2"), true);
  assert.equal(deckTextEditKeyStartsEditing("Space"), false);
  assert.match(
    deckElementTextEditability({ ...element, locked: true }).reason,
    /先解锁再编辑文字/,
  );
  assert.equal(
    deckPrimaryEditableTextElement([
      {
        id: "image-first",
        type: "image",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        order: 0,
        src: "data:image/png;base64,AA==",
      },
      element,
    ])?.id,
    "editable-text",
  );
  const stage = readFileSync(
    new URL("../src/shell/doc-editors/DeckStage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(stage, /data-deck-edit-text/);
  assert.match(stage, /deckTextEditKeyStartsEditing\(event\.key\)/);
  assert.match(stage, /data-deck-edit-lock-reason/);
  assert.match(stage, /deckPrimaryEditableTextElement/);
  assert.match(stage, /data-deck-text-bearing/);
  assert.match(stage, /编辑幻灯片标题/);

  const { DeckElementContent } = await import(deckElementContentModuleUrl());
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const commits = [];
  await act(async () => {
    root.render(
      React.createElement(DeckElementContent, {
        element,
        editing: true,
        onCommitText: (text) => commits.push(text),
      }),
    );
  });
  const editable = container.querySelector("[data-deck-editable-text]");
  assert.ok(editable);
  editable.textContent = "Committed once";
  await act(async () => {
    editable.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
      }),
    );
  });
  assert.deepEqual(commits, ["Committed once"]);
  await act(async () => root.unmount());
  container.remove();
});

test("image-only PPTX slides still import a discoverable editable text element", () => {
  const parsed = {
    size: { width: 960, height: 540 },
    slides: [
      {
        fill: { type: "color", value: "#0f172a" },
        note: "Fallback title from notes",
        elements: [
          {
            type: "image",
            name: "Hero",
            left: 0,
            top: 0,
            width: 960,
            height: 540,
            order: 0,
            base64: "data:image/png;base64,AA==",
          },
        ],
      },
    ],
  };
  const deck = mapPptxPresentationToDeck(parsed, "Image deck");
  const elements = deck.slides[0].elements;
  assert.ok(elements.some((element) => element.type === "image"));
  const text = elements.find((element) => element.type === "text");
  assert.ok(text);
  assert.equal(text.text, "Fallback title from notes");
  assert.equal(deckElementTextEditability(text).editable, true);
});
