// 崩溃面板「技术细节」必须带 React 组件栈，下一次能直接看出哪一层在转。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://website.oceanleo.com/workspace/corp-site",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { WorkbenchErrorBoundary } = await import(
  await compileModule("src/shell/WorkbenchErrorBoundary.tsx")
);

const ITEM = Object.freeze({
  key: "creation:site-1",
  source: "creation",
  id: "site-1",
  title: "企业站",
  kind: "website",
  siteId: "website",
  url: "https://website.oceanleo.com/assets/site-1",
  favorite: false,
  meta: {},
});

function Boom() {
  throw new Error("Maximum update depth exceeded");
}

function muteConsoleError() {
  const calls = [];
  const original = console.error;
  console.error = (...args) => {
    calls.push(args);
  };
  return { calls, restore: () => (console.error = original) };
}

test("技术细节展开后有 message + 组件栈，console.error 一次带栈", async () => {
  const muted = muteConsoleError();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        React.createElement(
          WorkbenchErrorBoundary,
          { scope: "route", routeId: "website", item: ITEM, onClose() {} },
          React.createElement(Boom),
        ),
      );
    });
    const details = container.querySelector(
      "details[data-workbench-error-details]",
    );
    assert.ok(details, "技术细节折叠不在");
    const pre = details.querySelector("pre");
    assert.ok(pre);
    assert.match(pre.textContent, /Maximum update depth exceeded/);
    assert.match(pre.textContent, /组件栈/);
    assert.match(pre.textContent, /Boom/);
    assert.equal(pre.getAttribute("data-workbench-error-stack"), "true");
    const crashLogs = muted.calls.filter((args) =>
      String(args[0]).includes("[advanced-workbench] editor crashed"),
    );
    assert.equal(crashLogs.length, 1, "console.error 必须正好一次");
    assert.match(String(crashLogs[0][2] || ""), /Boom/);
  } finally {
    muted.restore();
    await act(async () => root.unmount());
    container.remove();
  }
});
