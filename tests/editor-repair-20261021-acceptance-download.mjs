/**
 * V1 independent acceptance: workspace download launcher is ghost, not a
 * filled secondary circle. Share/favorite stay the reference look.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

async function withDom(run) {
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
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/library",
  });
  const { window } = dom;
  Object.defineProperty(window.document, "fullscreenEnabled", {
    configurable: true,
    value: true,
  });
  const restore = [];
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
    KeyboardEvent: window.KeyboardEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run({
      window,
      container,
      render: (element) => act(async () => root.render(element)),
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restore.reverse().forEach((fn) => fn());
  }
}

test("download launcher is not IconButton variant=secondary", async () => {
  const uiStub = dataModule(`
    export function useUI() {
      return (value) => String(value);
    }
  `);
  const toastStub = dataModule(`
    export function useToast() {
      const handle = { id: "t", dismiss() {} };
      return {
        success() { return handle; },
        error() { return handle; },
        info() { return handle; },
        loading() { return handle; },
        show() { return handle; },
        dismiss() {},
        dismissAll() {},
      };
    }
  `);
  const nullComponent = dataModule(`
    export function AdvancedEditorIcon() { return null; }
    export function AnchoredPopover() { return null; }
    export function EditorItemSocialChrome() { return null; }
    export function useEditorItemSocial() { return { shareAvailable: true, favoriteAvailable: false, favorite: false, busy: "", error: "", artifactId: null, revisionId: null, async share() {}, async toggleFavorite() {} }; }
    export function CollabActionSlot() { return null; }
    export function PluginThemeToggle() { return null; }
  `);
  const paneStub = dataModule(`
    export function useRightPaneSlot() {
      return { pane: null };
    }
  `);

  const { AdvancedWorkspaceActionBar, downloadIconButtonProps } = await import(
    await compileModule("src/shell/AdvancedWorkspaceActionBar.tsx", {
      "../i18n/ui/useUI": uiStub,
      "../ui/Toast": toastStub,
      "./AdvancedEditorIcon": nullComponent,
      "./anchored-popover": nullComponent,
      "./editor-item-social-chrome": nullComponent,
      "./collab/CollabActionSlot": nullComponent,
      "./plugin-theme": nullComponent,
      "./SplitWorkspace": paneStub,
    })
  );

  if (typeof downloadIconButtonProps === "function") {
    const props = downloadIconButtonProps();
    assert.notEqual(
      props.variant,
      "secondary",
      "exported download props must not be secondary (filled circle)",
    );
  }

  await withDom(async ({ container, render }) => {
    await render(
      React.createElement(AdvancedWorkspaceActionBar, {
        adapter: {
          id: "image",
          label: "Image",
          stage: null,
          drawers: [],
          actions: [
            {
              id: "download",
              label: "Download PNG",
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
        onUploadFiles() {},
      }),
    );
    // D1（2026-10-23）：下载进 `···` 的「下载 ▸」子菜单；第一行的 `···` 守同一条 ghost 规则。
    const launcher = container.querySelector(
      "[data-workspace-more-launcher]",
    );
    assert.ok(launcher, "··· launcher must render");
    assert.notEqual(
      launcher.getAttribute("data-leo-button"),
      "secondary",
      "download must match share/favorite (ghost), not a filled secondary pill",
    );
  });
});
