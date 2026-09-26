import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { LeoEntryButton } = await import(
  await compileModule("src/shell/LeoEntryButton.tsx", {
    "./LeoAssistant": dataModule(`
      export function useLeoEnabled() { return true; }
      export function openLeoAssistant() {}
    `),
    "../i18n/ui/useUI": dataModule("export function useUI() { return text => text; }"),
  })
);

function buttons() {
  return React.createElement(
    React.StrictMode,
    null,
    React.createElement(LeoEntryButton, { tone: "light", context: { page: "home" } }),
    React.createElement(LeoEntryButton, { tone: "dark", context: { page: "shell" } }),
  );
}

test("D10: earlier SSR requests cannot change the next page's gradient attributes", () => {
  const firstRequest = renderToString(buttons());
  renderToString(buttons());
  assert.equal(renderToString(buttons()), firstRequest);
});

test("D10: the first client render hydrates unique SVG ids and matching fill references", async () => {
  // Warm the server module as real Next dev requests do before a fresh browser.
  renderToString(buttons());
  const html = renderToString(buttons());
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
  const dom = new JSDOM(`<div id="root">${html}</div>`, { url: "https://hydration.test/" });
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  const previousGlobals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let root;
  try {
    const { hydrateRoot } = await import("react-dom/client");
    const host = dom.window.document.getElementById("root");
    const attributes = () => [...host.querySelectorAll("svg")].map(svg => ({
      id: svg.querySelector("linearGradient").id,
      fills: [...svg.querySelectorAll("path")].map(path => path.getAttribute("fill")),
    }));
    const serverAttributes = attributes();
    await act(async () => {
      root = hydrateRoot(host, buttons(), { onRecoverableError: error => errors.push(String(error)) });
    });
    assert.deepEqual(errors, [], "the initial client attributes must match SSR without suppressing warnings");
    assert.deepEqual(attributes(), serverAttributes);
    assert.equal(serverAttributes.length, 2);
    assert.equal(new Set(serverAttributes.map(value => value.id)).size, 2);
    for (const { id, fills } of serverAttributes) {
      assert.deepEqual(fills, [`url(#${id})`, `url(#${id})`]);
    }
    await act(async () => root.render(buttons()));
    assert.deepEqual(attributes(), serverAttributes, "rerendering must preserve each mounted button's gradient");
  } finally {
    if (root) await act(async () => root.unmount());
    console.error = originalError;
    dom.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
