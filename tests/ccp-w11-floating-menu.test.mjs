import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef, useState } from "react";

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://word.oceanleo.com/",
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
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
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

const visualViewport = new window.EventTarget();
Object.assign(visualViewport, {
  width: 1_024,
  height: 768,
  offsetLeft: 0,
  offsetTop: 0,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: visualViewport,
});
Object.defineProperty(window, "innerWidth", {
  configurable: true,
  value: 1_024,
});
Object.defineProperty(window, "innerHeight", {
  configurable: true,
  value: 768,
});

class PopoverResizeObserver {
  static instances = new Set();

  constructor(callback) {
    this.callback = callback;
    this.targets = new Set();
    PopoverResizeObserver.instances.add(this);
  }

  observe(target) {
    this.targets.add(target);
  }

  disconnect() {
    this.targets.clear();
    PopoverResizeObserver.instances.delete(this);
  }

  static flush() {
    for (const observer of PopoverResizeObserver.instances) {
      observer.callback(
        [...observer.targets].map((target) => ({
          target,
          contentRect: target.getBoundingClientRect(),
        })),
        observer,
      );
    }
  }
}
globalThis.ResizeObserver = PopoverResizeObserver;
window.ResizeObserver = PopoverResizeObserver;

let anchorRect = {
  x: 980,
  y: 700,
  left: 980,
  top: 700,
  right: 1_020,
  bottom: 740,
  width: 40,
  height: 40,
  toJSON() {
    return this;
  },
};
const panelSize = { width: 240, height: 120 };
const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
  if (this.hasAttribute("data-popover-anchor")) return anchorRect;
  if (this.hasAttribute("data-anchored-popover")) {
    const left = Number.parseFloat(this.style.left || "0");
    const top = Number.parseFloat(this.style.top || "0");
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + panelSize.width,
      bottom: top + panelSize.height,
      width: panelSize.width,
      height: panelSize.height,
      toJSON() {
        return this;
      },
    };
  }
  return originalRect.call(this);
};

const { FloatingMenu, FloatingMenuItem } = await import(
  await compileModule("src/ui/menu/FloatingMenu.tsx")
);
const { computeAnchoredPopoverPosition } = await import(
  await compileModule("src/shell/anchored-popover.tsx")
);
globalThis.__w11Toasts = [];
const { HistoryRowMenu } = await import(await compileModule("src/shell/HistoryRowActions.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){return value => value}`),
  "../lib/auth/client": dataModule(`export function browserClient(){return null}`),
  "../ui/Toast": dataModule(`export function useToast(){return {success(value){globalThis.__w11Toasts.push(value)}}}`),
}));
const h = React.createElement;
async function mount(Component) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("aside");
  container.style.overflow = "hidden";
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(h(Component)));
  return { container, async unmount() {
    await act(async () => root.unmount());
    container.remove();
  }};
}
async function click(node) { await act(async () => node.click()); }
async function key(node, value) {
  await act(async () => node.dispatchEvent(new window.KeyboardEvent("keydown", {key: value, bubbles: true, cancelable: true})));
}
function menu() { return document.querySelector('[role="menu"]:not([hidden])'); }
function item(label) { return [...menu().querySelectorAll('[role="menuitem"]')].find(node => node.textContent === label); }
function closed(panel) {
  assert.equal(panel.dataset.leoOverlayState, "closed");
  assert.equal(panel.hasAttribute("hidden"), true);
  assert.equal(panel.hasAttribute("inert"), true);
}

test("body portal flips above bottom anchor, clamps right edge, follows viewport changes", async () => {
  function Bed() {
    const anchorRef = useRef(null);
    return h(React.Fragment, null,
      h("button", {ref: anchorRef, "data-popover-anchor": true}, "Open"),
      h(FloatingMenu, {open: true, anchorRef, onClose(){}}, h(FloatingMenuItem, {label: "First"})));
  }
  const bed = await mount(Bed);
  try {
    const panel = menu();
    assert.ok(document.body.contains(panel));
    assert.equal(bed.container.contains(panel), false);
    assert.equal(panel.parentElement, document.body);
    assert.ok(parseFloat(panel.style.top) + panelSize.height <= anchorRect.top);
    assert.ok(parseFloat(panel.style.left) + panelSize.width <= window.innerWidth - 8);
    const before = panel.style.left;
    anchorRect = {...anchorRect, left: 400, right: 440, top: 200, bottom: 240};
    await act(async () => {
      window.dispatchEvent(new window.Event("scroll"));
      window.dispatchEvent(new window.Event("resize"));
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    });
    assert.notEqual(panel.style.left, before);
    assert.ok(parseFloat(panel.style.top) >= anchorRect.bottom);
  } finally { await bed.unmount(); }
});

test("first enabled focus, arrows/Home/End skip disabled, Escape restores trigger, outside closes", async () => {
  let selected = 0;
  function Bed() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    return h(React.Fragment, null,
      h("button", {ref: anchorRef, onClick: () => setOpen(true)}, "Open"),
      h(FloatingMenu, {open, anchorRef, onClose: () => setOpen(false)},
        h(FloatingMenuItem, {label: "Disabled first", disabled: true}),
        h(FloatingMenuItem, {label: "First", href: "#first", onSelect: () => selected++}),
        h(FloatingMenuItem, {label: "Disabled", disabled: true}),
        h(FloatingMenuItem, {label: "Last", danger: true})));
  }
  const bed = await mount(Bed);
  try {
    const trigger = bed.container.querySelector("button");
    trigger.focus();
    await click(trigger);
    assert.equal(document.activeElement, item("First"));
    await key(document.activeElement, "ArrowDown");
    assert.equal(document.activeElement, item("Last"));
    await key(document.activeElement, "ArrowUp");
    assert.equal(document.activeElement, item("First"));
    await key(document.activeElement, "End");
    assert.equal(document.activeElement, item("Last"));
    await key(document.activeElement, "Home");
    assert.equal(document.activeElement, item("First"));
    await key(document.activeElement, " ");
    assert.equal(selected, 1, "Space activates a link menu item");
    assert.match(item("Last").className, /text-rose-600/);
    const panel = menu();
    await key(document.activeElement, "Escape");
    closed(panel);
    assert.equal(document.activeElement, trigger);
    await click(trigger);
    await act(async () => document.body.dispatchEvent(new window.MouseEvent("pointerdown", {bubbles: true})));
    closed(panel);
  } finally { await bed.unmount(); }
});

test("side placement fits beside anchor and falls back to unchanged vertical result", () => {
  const anchor = {left: 400, right: 440, top: 700, bottom: 740, width: 40, height: 40};
  const viewport = {left: 0, top: 0, width: 1024, height: 768};
  for (const side of ["left", "right"]) {
    const pos = computeAnchoredPopoverPosition(anchor, panelSize, viewport, {side});
    if (side === "left") assert.ok(pos.left + panelSize.width < anchor.left);
    else assert.ok(pos.left > anchor.right);
    assert.ok(pos.top + panelSize.height <= 760);
  }
  for (const side of ["left", "right"]) {
    const edge = {...anchor, left: side === "left" ? 0 : 980, right: side === "left" ? 40 : 1020};
    assert.deepEqual(
      computeAnchoredPopoverPosition(edge, panelSize, viewport, {side}),
      computeAnchoredPopoverPosition(edge, panelSize, viewport),
    );
  }
});

test("HistoryRowMenu preserves callbacks, grouping, external link, copy feedback and visibility", async () => {
  const calls = [];
  let copied = "";
  let denyClipboard = false;
  Object.defineProperty(navigator, "clipboard", {configurable: true, value: {async writeText(value) {
    if (denyClipboard) throw new Error("denied");
    copied = value;
  }}});
  function Bed() {
    const [open, onOpenChange] = useState(false);
    return h(HistoryRowMenu, {
      open, onOpenChange, href: "/tasks/one", active: false, pinned: false, favorite: false, canDelete: true,
      onRename: () => calls.push("rename"), onTogglePin: () => calls.push("pin"),
      onToggleFavorite: () => calls.push("favorite"), onMove: () => calls.push("move"), onDelete: () => calls.push("delete"),
    });
  }
  const bed = await mount(Bed);
  try {
    const trigger = bed.container.querySelector("button");
    await click(trigger);
    assert.match(trigger.className, /opacity-100/);
    assert.doesNotMatch(trigger.className, /(?:^| )opacity-0(?: |$)/);
    assert.equal(menu().querySelectorAll('[role="separator"]').length, 2);
    const external = menu().querySelector("a");
    assert.equal(external.getAttribute("target"), "_blank");
    assert.equal(external.getAttribute("rel"), "noreferrer");
    assert.match(external.textContent, /↗/);
    assert.equal(menu().querySelectorAll('[role="menuitem"] svg').length, 8);
    const labels = ["重命名", "置顶", "收藏", "移动到项目", "删除"];
    for (const label of labels) {
      if (!menu()) await click(trigger);
      const panel = menu();
      await click(item(label));
      closed(panel);
    }
    assert.deepEqual(calls, ["rename", "pin", "favorite", "move", "delete"]);
    await click(trigger);
    const panel = menu();
    await click(item("复制链接"));
    assert.equal(copied, "https://word.oceanleo.com/tasks/one");
    assert.deepEqual(globalThis.__w11Toasts, ["已复制"]);
    closed(panel);
    await click(trigger);
    denyClipboard = true;
    await click(item("复制链接"));
    assert.deepEqual(globalThis.__w11Toasts, ["已复制"], "denied clipboard must not announce success");
    assert.ok(menu());
    denyClipboard = false;
    await click(item("分享"));
    assert.equal(globalThis.__w11Toasts.length, 2, "share fallback copies and confirms");
  } finally { await bed.unmount(); }
});
