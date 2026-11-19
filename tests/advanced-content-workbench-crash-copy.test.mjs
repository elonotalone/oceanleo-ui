// Editor crashes keep a loading surface, recover automatically, and preserve private telemetry.
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
  url: "https://website.oceanleo.com/history/session-1",
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
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ⑤ 的判据就藏在这一行：**不打 useUI / intl 桩**，边界必须自己活下来。
const { WorkbenchErrorBoundary } = await import(
  await compileModule("src/shell/WorkbenchErrorBoundary.tsx")
);
const telemetry = await import("../src/lib/telemetry/index.ts");
const { UIMessageProvider } = await import(
  await compileModule("src/i18n/ui/messages/context.tsx")
);
const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
const englishMessages = await loadUiMessages("en");

const ITEM = Object.freeze({
  key: "creation:poster-1",
  source: "creation",
  id: "poster-1",
  title: "季度汇报海报",
  kind: "image",
  siteId: "website",
  url: "https://website.oceanleo.com/assets/poster-1.png",
  favorite: false,
  meta: {},
});
const RAW_MESSAGE =
  "Minified React error #185; visit https://react.dev/errors/185 for the full message";

function Boom() {
  throw new Error(RAW_MESSAGE);
}
function Editor() {
  return React.createElement("div", { "data-real-editor": true }, "editor body");
}

function Harness({ crash, scope, contained, messages }) {
  const tree = React.createElement(
    WorkbenchErrorBoundary,
    {
      ...(scope ? { scope } : {}),
      ...(contained === undefined ? {} : { contained }),
      routeId: "image",
      item: ITEM,
      onClose() {},
    },
    crash ? React.createElement(Boom) : React.createElement(Editor),
  );
  return messages
    ? React.createElement(UIMessageProvider, { messages }, tree)
    : tree;
}

async function mount(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Harness, props));
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(React.createElement(Harness, next));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function muteConsoleError() {
  const original = console.error;
  console.error = () => {};
  return { restore: () => (console.error = original) };
}

function collectTelemetry() {
  const events = [];
  telemetry.resetTelemetry();
  telemetry.configureTelemetry({ consoleSeverity: "off" });
  telemetry.registerTelemetrySink({
    id: "crash-copy-test",
    receive: (event) => events.push(event),
  });
  return { events, stop: () => telemetry.resetTelemetry() };
}

test("route crashes stay in the pane and recover on connectivity without a retry control", async () => {
  const muted = muteConsoleError();
  const mounted = await mount({ crash: true, scope: "route" });
  try {
    const box = mounted.container.querySelector("[data-workbench-route-error]");
    assert.ok(box);
    assert.equal(box.querySelector('[role="status"]').getAttribute("aria-busy"), "true");
    assert.match(box.textContent, /正在加载/);
    assert.equal(box.querySelector("button, details, a"), null);
    assert.doesNotMatch(box.textContent, /Minified React error|185|出错/);
    await mounted.rerender({ crash: false, scope: "route" });
    assert.ok(mounted.container.querySelector("[data-workbench-route-error]"));
    await act(async () => window.dispatchEvent(new window.Event("online")));
    assert.ok(mounted.container.querySelector("[data-real-editor]"));
    assert.equal(mounted.container.querySelector("[data-workbench-route-error]"), null);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});

test("contained workbench crashes keep loading inside their host and report private telemetry", async () => {
  const muted = muteConsoleError();
  const collected = collectTelemetry();
  const mounted = await mount({ crash: true, contained: true });
  try {
    const status = mounted.container.querySelector('[role="status"][aria-busy="true"]');
    assert.ok(status, "contained recovery remains inside its host");
    assert.equal(mounted.container.querySelector("button, details, a"), null);
    assert.doesNotMatch(mounted.container.textContent, /Minified React error|185|出错/);
    const caught = collected.events.filter(event => event.name === "boundary.catch");
    assert.equal(caught.length, 1);
    assert.doesNotMatch(JSON.stringify(caught[0]), /Minified React error/);
    await mounted.rerender({ crash: false, contained: true });
    await act(async () => window.dispatchEvent(new window.Event("focus")));
    assert.ok(mounted.container.querySelector("[data-real-editor]"));
  } finally {
    collected.stop();
    muted.restore();
    await mounted.unmount();
  }
});

test("English dictionaries translate the automatic loading state without exposing the exception", async () => {
  const muted = muteConsoleError();
  const mounted = await mount({ crash: true, scope: "route", messages: englishMessages });
  try {
    const box = mounted.container.querySelector("[data-workbench-route-error]");
    assert.match(box.textContent, /Loading/);
    assert.doesNotMatch(box.textContent, /正在加载|Minified React error|Reload|Retry/);
    assert.equal(box.querySelector("button"), null);
    assert.equal(box.querySelector('[role="status"]').getAttribute("aria-busy"), "true");
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});
