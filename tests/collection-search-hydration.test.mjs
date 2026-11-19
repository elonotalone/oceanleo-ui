import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { CollectionSearchField, CollectionMenuSearchField } = await import(
  await compileModule("src/shell/collection-chrome.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI() { return text => text; }"),
  })
);

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
let JSDOM;
try {
  ({ JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href));
} finally {
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
}
// Let Node emit jsdom's dependency deprecation before capturing React errors.
await new Promise(resolve => setImmediate(resolve));

async function hydrateSearch(element, beforeHydrate = () => {}) {
  // Render without browser globals, then hydrate the exact HTML in a browser DOM.
  assert.equal(typeof window, "undefined");
  const html = renderToString(element);
  const dom = new JSDOM(`<div id="root">${html}</div>`, { url: "https://hydration.test/" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previousGlobals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const host = dom.window.document.getElementById("root");
  const input = host.querySelector("input");
  const serverMarkup = host.innerHTML;
  const serverStyle = input.getAttribute("style");
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let root;
  try {
    beforeHydrate(input);
    const styleBeforeHydration = input.getAttribute("style");
    const { hydrateRoot } = await import("react-dom/client");
    await act(async () => {
      root = hydrateRoot(host, element, { onRecoverableError: error => errors.push(String(error)) });
    });
    assert.equal(host.querySelector("input"), input, "hydration must retain the SSR input");
    const hydratedMarkup = host.innerHTML;
    await act(async () => root.render(element));
    assert.equal(host.innerHTML, hydratedMarkup, "the first rerender must preserve the hydrated markup");
    return { errors, serverMarkup, hydratedMarkup, serverStyle, styleBeforeHydration };
  } finally {
    if (root) await act(async () => root.unmount());
    console.error = originalError;
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

for (const Component of [CollectionSearchField, CollectionMenuSearchField]) {
  for (const [placeholder, value, id] of [["搜索", "", undefined], ["Search results", "report", "results-search"]]) {
    test(`${Component.name} hydrates ${placeholder} with matching attributes and no console.error`, async () => {
      const result = await hydrateSearch(React.createElement(React.StrictMode, null,
        React.createElement(Component, { placeholder, value, id, onChange() {} }),
      ));
      assert.deepEqual(result.errors, [], "SSR and the first client render must match without suppressing warnings");
      assert.equal(result.hydratedMarkup, result.serverMarkup);
      assert.equal(result.serverStyle, "padding-left:36px;appearance:none");
    });
  }
}

test("screenshot caret hiding before hydration reproduces the recorded style warning", async () => {
  const element = React.createElement(CollectionSearchField, { placeholder: "搜索", value: "", onChange() {} });
  const result = await hydrateSearch(element, input => {
    // Playwright's screenshot helper hides the caret by default and restores it
    // through CSSOM. This changes style serialization even after the caret is restored.
    const value = input.style.getPropertyValue("caret-color");
    const priority = input.style.getPropertyPriority("caret-color");
    input.style.setProperty("caret-color", "transparent", "important");
    input.style.setProperty("caret-color", value, priority);
    assert.equal(input.style.paddingLeft, "36px");
    assert.equal(input.style.appearance, "none");
    assert.equal(input.style.getPropertyValue("caret-color"), "");
  });
  assert.notEqual(result.styleBeforeHydration, result.serverStyle, "CSSOM rewrites the raw style string");
  assert.equal(result.errors.length, 1, "the negative control must detect the real hydration warning");
  assert.match(result.errors[0], /hydrated but some attributes/);
  assert.match(result.errors[0], /paddingLeft/);
  assert.match(result.errors[0], /padding-left/);
});
