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

test("加载恢复态不暴露 message 和组件栈，console.error 一次带栈", async () => {
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
    assert.ok(container.querySelector('[data-auto-recovery="temporary"][aria-busy="true"]'));
    assert.equal(container.querySelector("details, pre, button"), null);
    assert.doesNotMatch(container.textContent, /Maximum update depth exceeded|组件栈|Boom/);
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
