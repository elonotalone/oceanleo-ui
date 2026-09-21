import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
  url: "https://oceanleo.com/",
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
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value() {},
});

class PopoverResizeObserver {
  constructor() {
    this.targets = new Set();
  }
  observe(target) {
    this.targets.add(target);
  }
  disconnect() {
    this.targets.clear();
  }
}
globalThis.ResizeObserver = PopoverResizeObserver;
window.ResizeObserver = PopoverResizeObserver;

window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
  if (this.hasAttribute("data-anchored-popover")) {
    const left = Number.parseFloat(this.style.left || "0");
    const top = Number.parseFloat(this.style.top || "0");
    return {
      x: left,
      y: top,
      left,
      top,
      right: left + 240,
      bottom: top + 200,
      width: 240,
      height: 200,
      toJSON() {
        return this;
      },
    };
  }
  return {
    x: 800,
    y: 40,
    left: 800,
    top: 40,
    right: 920,
    bottom: 72,
    width: 120,
    height: 32,
    toJSON() {
      return this;
    },
  };
};

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const { ModelGroupPicker } = await import(
  await compileModule(
    "src/shell/ModelPicker.tsx",
    {
      "../i18n/ui/useUI": dataModule(
        "export function useUI(){ return (s) => String(s); }",
      ),
      "../lib/auth/account": dataModule(`
        export const MODEL_GROUP_CHANGED_EVENT = "x";
        export async function getModelGroups(){
          return {
            ok: true,
            data: {
              active_group_key: "preset:pro",
              groups: [
                { key: "preset:lite", id: "lite", kind: "preset", name: "Lite", editable: false, selection: {} },
                { key: "preset:pro", id: "pro", kind: "preset", name: "Pro", editable: false, selection: {} },
                { key: "preset:max", id: "max", kind: "preset", name: "Max", editable: false, selection: {} },
              ],
            },
          };
        }
        export async function setActiveModelGroup(){ return { ok: false }; }
      `),
      "./workbench-open-store": dataModule(
        "export function useWorkbenchOpen(){ return false; }",
      ),
      "./icons": dataModule(
        "export function IconCheck(){ return null; }\nexport function IconChevronDown(){ return null; }",
      ),
      "./byok-status": dataModule(
        "export async function fetchByokStatusLite(){ return null; }",
      ),
    },
    { missingPackageStub: lazyStub },
  )
);

async function frame() {
  await act(
    () =>
      new Promise((resolve) => window.requestAnimationFrame(resolve)),
  );
}

test("ModelPicker 打开后面板在 document.body 下且 position:fixed；Esc / 外部点击关闭", async () => {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ModelGroupPicker, { apiHref: "/api" }));
  });
  await frame();
  try {
    const trigger = container.querySelector("button");
    assert.ok(trigger);
    await act(async () => {
      trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await frame();
    await frame();

    const panel = document.querySelector("[data-model-picker-popover]");
    assert.ok(panel);
    assert.equal(panel.parentElement, document.body);
    assert.equal(panel.style.position, "fixed");
    assert.equal(panel.getAttribute("data-leo-overlay-state"), "open");

    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    assert.equal(
      document.querySelector("[data-model-picker-popover]")?.getAttribute(
        "data-leo-overlay-state",
      ),
      "closed",
    );

    await act(async () => {
      trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await frame();
    assert.equal(
      document.querySelector("[data-model-picker-popover]")?.getAttribute(
        "data-leo-overlay-state",
      ),
      "open",
    );

    const outside = document.createElement("div");
    document.body.append(outside);
    await act(async () => {
      outside.dispatchEvent(
        new window.MouseEvent("pointerdown", { bubbles: true }),
      );
    });
    assert.equal(
      document.querySelector("[data-model-picker-popover]")?.getAttribute(
        "data-leo-overlay-state",
      ),
      "closed",
    );
    outside.remove();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
