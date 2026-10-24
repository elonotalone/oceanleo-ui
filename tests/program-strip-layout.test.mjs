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
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];
const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://local.test", pretendToBeVisual: true,
});
for (const [name, value] of Object.entries({ window, document: window.document,
  navigator: window.navigator, HTMLElement: window.HTMLElement, localStorage: window.localStorage })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const observers = new Set();
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.add(this); }
  observe() {}
  disconnect() { observers.delete(this); }
};
const { ProgramStrip } = await import(await compileModule(
  "src/shell/cloud-computer/server-page/ProgramStrip.tsx", {
    "../../../i18n/ui/useUI": dataModule('export function useUI() { return (s) => s; }'),
  },
));

// Model flex-wrap + max-w-full. Revealing the controls reduces row width;
// a long item then shrinks, so adding controls' width back cannot recover
// the original layout. JSDOM itself does not perform CSS layout.
let availableWidth = 160;
const controlWidth = 68;
const intrinsicWidths = [140, 20];
function rowWidth(rows) {
  const controls = rows.nextElementSibling?.querySelector("span");
  return availableWidth - (controls && controls.style.display !== "none" ? controlWidth : 0);
}
function positions(rows) {
  const width = rowWidth(rows);
  let used = 0, top = 0;
  const ordered = Array.from(rows.children).sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
  const byChild = new Map(ordered.map((child) => {
    const size = Math.min(width, intrinsicWidths[Number(child.dataset.programId)]);
    if (used && used + 16 + size > width) { top += 40; used = 0; }
    const position = top;
    used += (used ? 16 : 0) + size;
    return [child, position];
  }));
  return Array.from(rows.children, (child) => byChild.get(child));
}
Object.defineProperties(window.HTMLElement.prototype, {
  clientWidth: { configurable: true, get() { return this.hasAttribute("data-program-strip-rows") ? rowWidth(this) : availableWidth; } },
  offsetWidth: { configurable: true, get() {
    if (this.hasAttribute("data-program-id")) return Math.min(rowWidth(this.parentElement), intrinsicWidths[Number(this.dataset.programId)]);
    return controlWidth;
  } },
  offsetHeight: { configurable: true, get() { return 40; } },
  offsetTop: { configurable: true, get() {
    return this.hasAttribute("data-program-id") ? positions(this.parentElement)[Array.from(this.parentElement.children).indexOf(this)] : 0;
  } },
});
const originalStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (node) => node.hasAttribute("data-program-strip-rows")
  ? { columnGap: "16px" } : originalStyle(node);

test("a clamped program label does not make wrap controls oscillate; resizing releases them", async (t) => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  t.after(async () => { await act(async () => root.unmount()); host.remove(); });
  const render = async () => act(async () => root.render(React.createElement(ProgramStrip, {
    items: [{ id: "0", label: "A long program name" }, { id: "1", label: "B" }],
    selected: "1", onSelect() {}, storageKey: "strip-regression",
  })));
  await render();
  assert.equal(host.querySelectorAll("button").length, 4);
  await act(async () => host.querySelector('[aria-label="上移"]').click());
  assert.equal(host.querySelector("[data-program-strip-rows]").dataset.collapsed, "true");
  assert.equal(host.querySelector('[data-program-id="1"]').hasAttribute("aria-hidden"), false);
  assert.equal(host.querySelector('[data-program-id="0"]').getAttribute("aria-hidden"), "true");
  await render();
  availableWidth = 400;
  await act(async () => { for (const observer of observers) observer.callback([]); });
  assert.equal(host.querySelectorAll("button").length, 2);
  assert.equal(host.querySelector("[data-program-strip-rows]").dataset.collapsed, "false");
  availableWidth = 160;
  await act(async () => { for (const observer of observers) observer.callback([]); });
  assert.equal(host.querySelectorAll("button").length, 4);
});
