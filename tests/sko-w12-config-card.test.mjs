// W12 (skills overhaul 2026-10-24): the shared ProjectConfigCard can open as a
// whole card. The portal's project configuration column passes `onOpen` so a
// click anywhere on the card, Enter/Space on the focused card, or the corner +
// opens the matching large dialog, while controls inside the card (chip remove
// buttons, links) keep their own behaviour.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const uiTranslationStub = dataModule(
  "export function useUI(){ return (value) => value; }",
);

const primitivesUrl = await compileModule("src/shell/project-workspace.tsx", {
  "../i18n/ui/useUI": uiTranslationStub,
  "react-dom": reactDomUrl,
});
const { ProjectConfigCard } = await import(primitivesUrl);

const source = await readFile(resolve("src/shell/project-workspace.tsx"), "utf8");

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
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://agent.oceanleo.com/projects/example",
  });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true;
    },
  });
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
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
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const renderRoot = (props, ...children) =>
    act(async () =>
      root.render(React.createElement(ProjectConfigCard, props, ...children)),
    );
  const find = (selector) => window.document.querySelector(selector);
  const click = (node) =>
    act(async () =>
      node.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      ),
    );
  const keydown = (node, key) =>
    act(async () =>
      node.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
  try {
    await run({ window, renderRoot, find, click, keydown });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("onOpen makes the whole card a keyboard-reachable button", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProjectConfigCard, {
      title: "Skills",
      summary: "2 enabled",
      onOpen() {},
    }),
  );
  assert.match(html, /<section[^>]*role="button"/);
  assert.match(html, /<section[^>]*tabindex="0"/);
  assert.match(html, /data-project-config-card-openable="true"/);
  assert.match(html, /focus-visible:outline-2/);
  assert.match(html, /hover:shadow-md/);
  assert.match(html, /rounded-2xl/, "card radius is 16px per UI-DESIGN");
  // Keyboard only: the ring is drawn on :focus-visible (browsers do not
  // match it for mouse focus). V03 found that `focus:outline-none` next to
  // `focus-visible:outline-2` compiles to outline-style:none on keyboard focus
  // (both pseudo-classes match), so the ring vanished. Guard against that:
  // no outline suppression on the card, and an explicit solid style.
  assert.match(html, /focus-visible:outline-solid/);
  assert.doesNotMatch(html, /(^|[\s"])([\w-]+:)*outline-none\b/);
  assert.doesNotMatch(html, /\bfocus:ring/);
});

test("without onOpen the card stays a plain section (backwards compatible)", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProjectConfigCard, {
      title: "Connectors",
      addAction: { label: "Add", onClick() {} },
    }),
  );
  assert.doesNotMatch(html, /role="button"/);
  assert.doesNotMatch(html, /tabindex=/);
  assert.doesNotMatch(html, /data-project-config-card-openable/);
});

test("click, Enter and Space on the card call onOpen once each", async () => {
  await withDom(async ({ renderRoot, find, click, keydown }) => {
    let opened = 0;
    await renderRoot(
      { title: "Instructions", onOpen: () => (opened += 1) },
      React.createElement("p", { "data-testid": "preview" }, "Line one"),
    );
    const card = find("[data-project-config-card]");
    await click(find('[data-testid="preview"]'));
    assert.equal(opened, 1, "click on non-interactive content opens the card");
    await keydown(card, "Enter");
    assert.equal(opened, 2);
    await keydown(card, " ");
    assert.equal(opened, 3);
    await keydown(card, "a");
    assert.equal(opened, 3, "other keys do nothing");
  });
});

test("the corner + opens the card exactly once and does not run addAction", async () => {
  await withDom(async ({ renderRoot, find, click }) => {
    let opened = 0;
    let added = 0;
    await renderRoot({
      title: "Skills",
      onOpen: () => (opened += 1),
      addAction: { label: "+", ariaLabel: "Add skill", onClick: () => (added += 1) },
    });
    await click(find('[data-project-config-action="add"]'));
    assert.equal(opened, 1, "+ goes through onOpen, not twice via bubbling");
    assert.equal(added, 0);
  });
});

test("controls inside the card do not open it", async () => {
  await withDom(async ({ renderRoot, find, click, keydown }) => {
    let opened = 0;
    let removed = 0;
    await renderRoot(
      { title: "Connectors", onOpen: () => (opened += 1) },
      React.createElement(
        "div",
        null,
        React.createElement(
          "button",
          {
            type: "button",
            "data-testid": "chip-remove",
            onClick: () => (removed += 1),
          },
          "×",
        ),
        React.createElement("a", { href: "/x", "data-testid": "link" }, "link"),
        React.createElement(
          "span",
          { "data-project-config-card-stop": "", "data-testid": "stop" },
          "stop",
        ),
      ),
    );
    await click(find('[data-testid="chip-remove"]'));
    assert.equal(removed, 1);
    assert.equal(opened, 0, "chip × must not open the card");
    await click(find('[data-testid="stop"]'));
    assert.equal(opened, 0);
    await keydown(find('[data-testid="chip-remove"]'), "Enter");
    assert.equal(opened, 0, "Enter on an inner button is that button's");
  });
});

test("addAction keeps working on its own when onOpen is not passed", async () => {
  await withDom(async ({ renderRoot, find, click }) => {
    let added = 0;
    let openedByButton = 0;
    await renderRoot({
      title: "Connectors",
      addAction: { label: "Add", onClick: () => (added += 1) },
      openAction: { label: "Open", onClick: () => (openedByButton += 1) },
    });
    await click(find('[data-project-config-action="add"]'));
    await click(find('[data-project-config-action="open"]'));
    assert.equal(added, 1);
    assert.equal(openedByButton, 1);
  });
});

test("source declares onOpen as an optional prop", () => {
  assert.match(source, /onOpen\?: \(\) => void;/);
});

test("openable card class string keeps a visible keyboard focus ring (V03 A9)", () => {
  const line = source
    .split("\n")
    .find((text) => text.includes("hover:shadow-md") && text.includes("focus-visible:"));
  assert.ok(line, "openable card class string not found");
  assert.doesNotMatch(line, /outline-none/);
  assert.match(line, /focus-visible:outline-2/);
  assert.match(line, /focus-visible:outline-solid/);
  assert.match(line, /focus-visible:outline-\[var\(--accent,#4f46e5\)\]/);
});
