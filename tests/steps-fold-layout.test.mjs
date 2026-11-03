import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://example.test/tasks/reopen" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const reactUrl = pathToFileURL(require.resolve("react")).href;
// Count actual React state dispatches during layout, including no-op dispatches.
// These are unsafe during a host's nested task hydration commits even when the
// updater would return the same value. An unchanged DOM registry needs none.
const react = dataModule(`
  export * from ${JSON.stringify(reactUrl)};
  import * as React from ${JSON.stringify(reactUrl)};
  let layout = false;
  export function useState(initial) {
    const [value, dispatch] = React.useState(initial);
    return [value, next => { if (layout) globalThis.__foldLayoutWrites += 1; dispatch(next); }];
  }
  export function useLayoutEffect(callback, deps) {
    React.useLayoutEffect(() => { layout = true; try { return callback(); } finally { layout = false; } }, deps);
  }
`);
const { StepsFoldPreferenceProvider } = await import(await compileModule("src/shell/steps-fold-preference.tsx", { react }));

test("saved text-only task hydration does not schedule unchanged fold state from layout", async () => {
  globalThis.__foldLayoutWrites = 0;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const view = () => React.createElement(StepsFoldPreferenceProvider, { taskId: "text-only-reopen" },
    React.createElement("div", { "data-agent-stream": "native" }, "saved user and assistant text"));
  try {
    await act(async () => root.render(view()));
    for (let i = 0; i < 5; i++) await act(async () => root.render(view()));
    assert.equal(host.textContent, "saved user and assistant text");
    assert.equal(globalThis.__foldLayoutWrites, 0, "no layout update is needed when the latest block set stays empty");
  } finally { act(() => root.unmount()); host.remove(); }
});
