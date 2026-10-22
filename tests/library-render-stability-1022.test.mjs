import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act, useRef } from "react";

import { useVirtualList } from "../src/lib/virtual/use-virtual-list.ts";
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
  url: "https://image.oceanleo.com/workspace",
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

const scrollTops = new WeakMap();
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return this.hasAttribute("data-render-test-scroller") ? 120 : 0;
  },
});
Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
  configurable: true,
  get() {
    return scrollTops.get(this) || 0;
  },
  set(value) {
    scrollTops.set(this, Math.max(0, Number(value) || 0));
  },
});
window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
  const height = this.hasAttribute("data-render-test-scroller") ? 120 : 0;
  const top = this.hasAttribute("data-render-test-scroller")
    ? 0
    : -(this.parentElement?.scrollTop || 0);
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
};

const { createRoot } = await import("react-dom/client");

test("inline measureRow with unchanged row heights settles after bounded renders", async () => {
  const node = document.createElement("div");
  const root = createRoot(node);
  let renderCount = 0;
  let measureCount = 0;

  function VirtualProbe() {
    renderCount += 1;
    const scrollerRef = useRef(null);
    const listRef = useRef(null);
    const list = useVirtualList({
      rowCount: 24,
      containerRef: listRef,
      scrollRef: scrollerRef,
      estimatedRowHeight: 30,
      // Intentionally inline: the hook must tolerate ordinary caller usage. The
      // final null is a harness fuse so the pre-fix infinite update is measured
      // and reported instead of keeping the node:test worker alive forever.
      measureRow: () => {
        measureCount += 1;
        return renderCount <= 3 ? 30 : null;
      },
    });
    return React.createElement(
      "div",
      { ref: scrollerRef, "data-render-test-scroller": "true" },
      React.createElement("div", {
        ref: listRef,
        "data-render-test-list": "true",
        "data-window": `${list.startRow}:${list.endRow}`,
      }),
    );
  }

  let renderError;
  try {
    try {
      await act(async () => root.render(React.createElement(VirtualProbe)));
    } catch (error) {
      renderError = error;
    }
    assert.equal(
      renderError,
      undefined,
      `mounted useVirtualList threw while measuring stable rows: ${String(renderError)}`,
    );
    assert.ok(measureCount > 0, "the mounted hook must measure rows");
    assert.ok(
      renderCount <= 3,
      `stable measurements should settle within 3 renders; observed ${renderCount}`,
    );
  } finally {
    try {
      await act(async () => root.unmount());
    } catch {
      // Keep the original loop assertion when React has already hit its limit.
    }
    node.remove();
  }
});

test("a ready document fallback stays mounted after its primary cover failed", async () => {
  const uiModule = dataModule("export function useUI(){ return (value) => value; }");
  const thumbnailModuleUrl = await compileModule(
    "src/shell/workspace-library-thumbnail.tsx",
    {
      "../i18n/ui/useUI": uiModule,
      "../lib/database": dataModule(
        "export async function ensureDatabaseThumbnail(){ return {ok:false}; }",
      ),
      "../lib/media-proxy": dataModule(
        "export async function fetchMediaBlob(...args){ return globalThis.__renderStabilityFetch(...args); }",
      ),
      "./advanced-features": dataModule(
        "export function advancedLibraryReferenceFor(){ return null; }",
      ),
      "./ArtifactRendition": dataModule(
        "export function useArtifactRendition(){ return globalThis.__renderStabilityRendition; }",
      ),
      "./doc-editors/office-file": dataModule(
        "export function officePackageKindForItem(){ return null; } export async function fetchValidatedOfficePackage(){ throw new Error('unused'); }",
      ),
    },
  );
  const { WorkspaceThumbnail } = await import(thumbnailModuleUrl);
  const node = document.createElement("div");
  const root = createRoot(node);
  const sourceRendition = {
    purpose: "source",
    url: "https://example.test/notes.txt",
    mediaType: "text/plain",
    format: "txt",
  };
  const thumbnailRendition = {
    purpose: "thumbnail",
    url: "https://example.test/failed-cover.png",
    mediaType: "image/png",
    format: "png",
    width: 640,
    height: 480,
  };
  const item = {
    key: "document-cover-loop",
    source: "artifact",
    id: "document-cover-loop",
    artifactId: "document-cover-loop",
    revisionId: "revision-1",
    artifactType: "document",
    title: "Notes",
    kind: "document",
    siteId: "oceanleo",
    favorite: false,
    url: sourceRendition.url,
    meta: { mime: "text/plain", filename: "notes.txt" },
    artifact: {
      artifactId: "document-cover-loop",
      revisionId: "revision-1",
      artifactType: "document",
      renditions: {
        source: sourceRendition,
        thumbnail: thumbnailRendition,
      },
    },
  };
  let resolveSource;
  let fetchCount = 0;
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms === 12_000 || ms === 15_000) {
      return realSetTimeout(() => {}, 0);
    }
    return realSetTimeout(callback, ms, ...args);
  };
  globalThis.clearTimeout = (timer) => realClearTimeout(timer);
  globalThis.__renderStabilityFetch = () => {
    fetchCount += 1;
    return new Promise((resolve) => {
      resolveSource = resolve;
    });
  };
  globalThis.__renderStabilityRendition = {
    loading: false,
    url: thumbnailRendition.url,
    version: 1,
    error: "",
    rendition: thumbnailRendition,
    resourceFailed() {},
  };

  try {
    await act(async () =>
      root.render(
        React.createElement(WorkspaceThumbnail, {
          item,
          kind: "document",
          alt: "Notes",
          accent: "#123456",
          imageClassName: "",
        }),
      ),
    );
    const primaryCover = node.querySelector('img[data-cover-renderer="image"]');
    assert.ok(primaryCover, "the primary thumbnail should render initially");

    await act(async () => {
      primaryCover.dispatchEvent(new window.Event("error"));
    });
    assert.equal(fetchCount, 1, "the fallback should read the document once");
    assert.ok(resolveSource, "the document fallback should be awaiting source text");
    assert.ok(
      node.querySelector('[data-document-cover="unavailable"]'),
      "the document fallback should stay visible while its source is pending",
    );

    await act(async () => {
      resolveSource(new Blob(["# Stable fallback\nActual document text"]));
      await new Promise((resolve) => realSetTimeout(resolve, 0));
    });

    assert.equal(
      node.querySelector('img[data-cover-renderer="image"]'),
      null,
      "a ready fallback must not remount the primary cover that already failed",
    );
    assert.ok(
      node.querySelector('[data-document-cover="excerpt"]'),
      "the rendered excerpt should remain visible after it becomes ready",
    );
    assert.equal(fetchCount, 1, "settling the fallback must not restart its fetch");
  } finally {
    try {
      await act(async () => root.unmount());
    } finally {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
      delete globalThis.__renderStabilityFetch;
      delete globalThis.__renderStabilityRendition;
      node.remove();
    }
  }
});

test.after(() => {
  dom.window.close();
});
