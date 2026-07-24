import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useRef, useState } from "react";
import ts from "typescript";

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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileTsxUrl(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

const popoverUrl = await compileTsxUrl("src/shell/anchored-popover.tsx", {
  react: reactUrl,
  "react-dom": reactDomUrl,
});
const { AnchoredPopover, computeAnchoredPopoverPosition } =
  await import(popoverUrl);

async function createMounted(Component) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function frame() {
  await act(
    () =>
      new Promise((resolveFrame) =>
        window.requestAnimationFrame(resolveFrame),
      ),
  );
}

test("geometry clamps horizontally and flips above when below cannot fit", () => {
  assert.deepEqual(
    computeAnchoredPopoverPosition(
      anchorRect,
      panelSize,
      { left: 0, top: 0, width: 1_024, height: 768 },
      { align: "end" },
    ),
    {
      left: 776,
      top: 574,
      maxWidth: 1_008,
      maxHeight: 686,
      placement: "above",
    },
  );
});

test("portal follows fullscreen, repositions, and owns escape/outside focus", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(true);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        {
          ref: anchorRef,
          type: "button",
          "data-popover-anchor": true,
          onClick: () => setOpen(true),
        },
        "anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open,
          anchorRef,
          onClose: () => setOpen(false),
          role: "dialog",
          ariaLabel: "Anchored tools",
          align: "end",
          attributes: { "data-popover-under-test": true },
        },
        React.createElement(
          "button",
          { type: "button", "data-popover-first-action": true },
          "first",
        ),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    let panel = document.querySelector("[data-popover-under-test]");
    const anchor = mounted.container.querySelector("[data-popover-anchor]");
    assert.ok(panel);
    assert.equal(panel.parentElement, document.body);
    assert.equal(panel.getAttribute("role"), "dialog");
    assert.equal(panel.getAttribute("aria-label"), "Anchored tools");
    assert.equal(panel.dataset.anchoredPlacement, "above");
    assert.equal(panel.style.left, "776px");
    assert.equal(panel.style.top, "574px");
    assert.equal(
      document.activeElement?.hasAttribute("data-popover-first-action"),
      true,
    );

    anchorRect = {
      ...anchorRect,
      x: 20,
      y: 20,
      left: 20,
      top: 20,
      right: 100,
      bottom: 60,
      width: 80,
    };
    await act(async () => {
      PopoverResizeObserver.flush();
    });
    panel = document.querySelector("[data-popover-under-test]");
    assert.equal(panel.dataset.anchoredPlacement, "below");
    assert.equal(panel.style.left, "8px");
    assert.equal(panel.style.top, "66px");

    const fullscreen = document.createElement("div");
    fullscreen.setAttribute("data-fullscreen-root", "");
    document.body.append(fullscreen);
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: fullscreen,
    });
    await act(async () => {
      document.dispatchEvent(new window.Event("fullscreenchange"));
    });
    panel = fullscreen.querySelector("[data-popover-under-test]");
    assert.ok(panel, "open popover moves into the fullscreen root");

    await act(async () => {
      document.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await frame();
    assert.equal(document.querySelector("[data-popover-under-test]"), null);
    assert.equal(document.activeElement, anchor);

    await act(async () => {
      anchor.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    await frame();
    assert.ok(fullscreen.querySelector("[data-popover-under-test]"));
    const outside = document.createElement("button");
    document.body.append(outside);
    await act(async () => {
      outside.dispatchEvent(
        new window.Event("pointerdown", { bubbles: true, cancelable: true }),
      );
    });
    assert.equal(document.querySelector("[data-popover-under-test]"), null);
    outside.remove();
    fullscreen.remove();
  } finally {
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
    await mounted.unmount();
  }
});

test("menu and listbox composites move focus with arrow keys", async () => {
  function Harness() {
    const anchorRef = useRef(null);
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "button",
        { ref: anchorRef, type: "button", "data-popover-anchor": true },
        "anchor",
      ),
      React.createElement(
        AnchoredPopover,
        {
          open: true,
          anchorRef,
          onClose() {},
          role: "menu",
          ariaLabel: "Downloads",
        },
        React.createElement(
          "button",
          { type: "button", role: "menuitem", tabIndex: -1 },
          "first",
        ),
        React.createElement(
          "button",
          { type: "button", role: "menuitem", tabIndex: -1 },
          "second",
        ),
      ),
    );
  }

  const mounted = await createMounted(Harness);
  try {
    await frame();
    const items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.equal(document.activeElement, items[0]);
    await act(async () => {
      items[0].dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(document.activeElement, items[1]);
  } finally {
    await mounted.unmount();
  }
});

test("selection More delegates placement to the portal instead of an in-pane absolute panel", async () => {
  const source = await readFile(
    new URL("../src/shell/SelectionToolbar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /<AnchoredPopover/);
  assert.match(source, /anchorRef=\{moreButtonRef\}/);
  assert.doesNotMatch(source, /className="absolute right-0 top-full/);
});
