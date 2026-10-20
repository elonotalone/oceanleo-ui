/**
 * W4: workspace download launcher is ghost (share/favorite family), not a
 * filled secondary pill.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { downloadIconButtonProps } from "../src/shell/workspace-download-icon-button.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href,
);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const HOST = "https://word.oceanleo.com/workspace/w4-download";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
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
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);

const iconStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedEditorIcon({ name, className }) {
    return jsx("span", { "data-icon": name, className, "aria-hidden": "true" });
  }
`);

test("downloadIconButtonProps is ghost, not secondary", () => {
  assert.equal(downloadIconButtonProps.variant, "ghost");
  assert.notEqual(downloadIconButtonProps.variant, "secondary");
});

test("workspace download launcher renders data-leo-button=ghost", async () => {
  const anchoredPopoverUrl = await compileModule("src/shell/anchored-popover.tsx", {
    react: reactUrl,
    "react-dom": pathToFileURL(require.resolve("react-dom")).href,
  });
  const { AdvancedWorkspaceActionBar, downloadIconButtonProps: fromBar } =
    await import(
      await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
        react: reactUrl,
        "../i18n/ui/useUI": uiStubUrl,
        "../ui/Toast": dataModule(`
          export function useToast() {
            return {
              success() {},
              error() {},
              info() {},
              loading() {},
              show() { return { id: "t", dismiss() {} }; },
              dismiss() {},
              dismissAll() {},
            };
          }
        `),
        "./AdvancedEditorIcon": iconStubUrl,
        "./anchored-popover": anchoredPopoverUrl,
      })
    );
  assert.equal(fromBar.variant, "ghost");
  assert.notEqual(fromBar.variant, "secondary");

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        React.createElement(AdvancedWorkspaceActionBar, {
          adapter: {
            id: "image",
            label: "Image",
            stage: null,
            drawers: [],
            actions: [
              {
                id: "export-png",
                label: "PNG",
                icon: "download",
                group: "download",
                onTrigger() {},
              },
            ],
            directDownload: {
              id: "download",
              label: "Download",
              icon: "download",
              onTrigger() {},
            },
          },
          autoSaveState: "saved",
          activeLibraryPanelId: null,
          onBack() {},
          onOpenLibrary() {},
          onRetrySave() {},
          onTriggerAction(action) {
            return action.onTrigger?.();
          },
        }),
      );
    });
    const launcher = container.querySelector(
      "[data-workspace-download-launcher]",
    );
    assert.ok(launcher, "download launcher missing");
    assert.equal(launcher.getAttribute("data-leo-button"), "ghost");
    assert.notEqual(launcher.getAttribute("data-leo-button"), "secondary");
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
});
