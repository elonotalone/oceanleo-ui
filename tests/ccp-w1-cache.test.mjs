import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/computers/cc_1",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;

const cacheKey = "oceanleo.computers.list.v1";
const pc = (extra = {}) => ({ id: "cc_1", name: "Server", source: "byo", status: "active", edition: "com", node_online: true,
  confirmed_at: "t", enrolled_at: "t", created_at: "t", updated_at: "t", ...extra });
let calls = 0, resolveList;
const api = { listComputers() { calls++; return new Promise((resolve) => { resolveList = resolve; }); } };
globalThis.__w1CacheApi = api;
const stub = dataModule(`
  export const cloudComputerApi = globalThis.__w1CacheApi;
  export function isMountable(c) { return !!c.confirmed_at; }
  export function readMountedComputerId() { return null; }
  export function writeMountedComputerId() {}
  export function writeMountedComputerName() {}
`);
const { useCloudComputers } = await import(await compileModule("src/shell/cloud-computer/useCloudComputers.ts", {
  "../../lib/cloud-computer-api": stub,
}));
async function mount(client = api) {
  const frames = [];
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let current;
  function Probe() { current = useCloudComputers({ client }); frames.push(current); return null; }
  await act(async () => root.render(React.createElement(Probe)));
  return { frames, get current() { return current; }, cleanup() { act(() => root.unmount()); host.remove(); } };
}

test("session cache renders first frame before fetch and excludes credentials on write", async () => {
  window.sessionStorage.setItem(cacheKey, JSON.stringify([pc({ access_token: "fake-secret", price_quote: { token: "fake-secret" } })]));
  const view = await mount();
  try {
    assert.equal(view.frames[0].loading, false);
    assert.equal(view.frames[0].computers[0].id, "cc_1");
    assert.equal(view.frames[0].computers[0].access_token, undefined);
    assert.equal(calls, 1);
    const cached = view.current.computers;
    await act(async () => resolveList({ items: [pc()] }));
    assert.equal(view.current.computers, cached);
    const refresh = view.current.refresh();
    await act(async () => { resolveList({ items: [pc({ access_token: "fake-secret", price_quote: { key: "fake-secret" }, node_version: "v2" })] }); await refresh; });
    const persisted = JSON.parse(window.sessionStorage.getItem(cacheKey));
    assert.equal(persisted[0].node_version, "v2");
    assert.equal(persisted[0].access_token, undefined);
    assert.equal(persisted[0].price_quote, undefined);
    assert.equal(window.sessionStorage.getItem(cacheKey).includes("fake-secret"), false);
  } finally { view.cleanup(); }
  // A fresh hook instance uses the module cache without waiting for its own request.
  const next = await mount();
  try {
    assert.equal(next.frames[0].loading, false);
    assert.equal(next.frames[0].computers[0].node_version, "v2");
    await act(async () => resolveList({ items: [] }));
  } finally { next.cleanup(); }
});

test("unchanged lists and rows retain references; changed rows replace only themselves", async () => {
  let rows = [pc(), pc({ id: "cc_2" })];
  const client = { async listComputers() { return { items: structuredClone(rows) }; } };
  const view = await mount(client);
  try {
    assert.equal(view.frames[0].loading, true);
    const first = view.current.computers;
    rows = rows.map((row) => Object.fromEntries(Object.entries(row).reverse()));
    await act(async () => view.current.refresh());
    assert.equal(view.current.computers, first);
    rows[1].name = "Changed";
    await act(async () => view.current.refresh());
    assert.notEqual(view.current.computers, first);
    assert.equal(view.current.computers[0], first[0]);
    assert.notEqual(view.current.computers[1], first[1]);
  } finally { view.cleanup(); }
});

test("hidden pages stop polling and visible pages refresh and restart", async () => {
  const originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
  const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  let visible = true, reads = 0;
  const timers = new Set();
  globalThis.setInterval = (fn) => { timers.add(fn); return fn; };
  globalThis.clearInterval = (fn) => timers.delete(fn);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
  const view = await mount({ async listComputers() { reads++; return { items: [] }; } });
  try {
    assert.equal(timers.size, 1);
    visible = false;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    assert.equal(timers.size, 0);
    assert.equal(reads, 1);
    visible = true;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    assert.equal(reads, 2);
    assert.equal(timers.size, 1);
  } finally {
    view.cleanup();
    assert.equal(timers.size, 0);
    globalThis.setInterval = originalInterval; globalThis.clearInterval = originalClear;
    if (visibility) Object.defineProperty(document, "visibilityState", visibility); else delete document.visibilityState;
  }
});
