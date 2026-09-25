/**
 * W23 · 编辑器打开速度（运行时）
 *
 * 钉的是人侧：点开素材第一帧就是编辑器外框，源文件和路由代码并行，
 * 同一 revision 再开不再下载/解析，悬停 150ms 才预取，chunk 失败重试一次，
 * 五段计时齐全。
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  EDITOR_HOVER_PRELOAD_MS,
  configureEditorHoverSchedulerForTests,
  findLibraryCardElement,
  installEditorHoverPreload,
  libraryItemFromCardElement,
  loadEditorModuleWithRetry,
  preloadEditorFor,
  registerEditorRouteLoader,
  resetEditorPreloadForTests,
  siteHomeEditorRouteId,
} from "../src/shell/editor-preload.ts";
import {
  markEditorOpen,
  readEditorOpenTiming,
  resetEditorOpenTimingForTests,
} from "../src/shell/editor-open-timing.ts";
import {
  configureOfficeSourceCacheForTests,
  loadOfficeSource,
  officeSourceCacheStats,
  resetOfficeSourceCacheForTests,
} from "../src/shell/office-editor/office-source-cache.ts";
import { EDIT_BAR_HEIGHT_PX } from "../src/shell/edit-bar-surface.ts";

const { WorkbenchRouteLoading } = await import(
  await compileModule("src/shell/advanced-routes/WorkbenchRouteLoading.tsx")
);

const require = createRequire(import.meta.url);
const workbenchSource = readFileSync(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);

function pptItem(revision = "rev-1") {
  return {
    key: `deck-${revision}`,
    source: "artifact",
    id: "deck-1",
    title: "路演",
    kind: "ppt",
    siteId: "slides",
    url: `https://asset.oceanleo.com/deck/${revision}.pptx`,
    favorite: false,
    revisionId: revision,
    artifactId: "art-deck-1",
    meta: { advanced_editor_route: "deck", extension: "pptx" },
  };
}

test("首帧工作台源码不再 return null；骨架是编辑器外框", () => {
  assert.doesNotMatch(
    workbenchSource,
    /if\s*\(!mounted\)\s*return\s+null/,
    "AdvancedContentWorkbench 首帧还在 return null",
  );
  const html = renderToStaticMarkup(React.createElement(WorkbenchRouteLoading));
  assert.match(html, /data-workbench-skeleton-header/);
  assert.match(html, /data-workbench-skeleton-edit-bar/);
  assert.match(html, /data-workbench-skeleton-stage/);
  assert.match(html, /aria-busy="true"/);
  // 操作员 P3（09-24）：不要「正在加载编辑器…」这种通栏行，切换中只在舞台里的转圈旁写简短文字。
  assert.match(html, /正在打开/);
  assert.doesNotMatch(html, /正在加载编辑器|正在打开编辑器|编辑器已打开/);
  assert.match(html, /data-workbench-skeleton-stage[^>]*>[\s\S]*animate-spin/);
  assert.match(html, new RegExp(`height:${EDIT_BAR_HEIGHT_PX}px`));
});

test("jsdom 静态首帧就渲染骨架，不是空串", async () => {
  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
  const { AdvancedContentWorkbench } = await import(
    await compileModule("src/shell/AdvancedContentWorkbench.tsx", {
      "next/dynamic": dataModule(`
        import { createElement } from ${JSON.stringify(reactUrl)};
        export default function dynamic(_loader, options) {
          return function DynamicWorkbenchRoute() {
            return options && typeof options.loading === "function"
              ? createElement(options.loading)
              : null;
          };
        }
      `),
      "next/navigation": dataModule(`
        export function useRouter() {
          return { replace() {}, push() {}, prefetch() {} };
        }
      `),
      "./WorkspaceSession": dataModule(`
        const workspace = {
          session: null, sessionId: "w23", taskId: null, availability: "ready",
          ensureActive: async () => null, bindTask: async () => null,
          saveSnapshot: async () => ({ ok: true }),
        };
        export function WorkspaceSessionProvider({ children }) { return children; }
        export function useOptionalWorkspaceSession() { return workspace; }
        export function useWorkspaceSession() { return workspace; }
      `),
      "./workbench-material-provider": dataModule(
        "export function WorkbenchMaterialProvider({ children }){ return children; }",
      ),
      "./AdvancedWorkbenchStage": dataModule(`
        import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
        export function AdvancedWorkbenchBlankStage() {
          return jsx("div", { "data-workbench-blank": "" });
        }
      `),
      "./WorkbenchErrorBoundary": dataModule(`
        export function WorkbenchErrorBoundary({ children }) { return children; }
      `),
      "./advanced-routes/UnsupportedRoute": dataModule(
        `import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
         export function UnsupportedRoute(){ return jsx("div", {"data-workbench-editor":"none"}); }`,
      ),
    })
  );
  const html = renderToStaticMarkup(
    React.createElement(AdvancedContentWorkbench, { item: pptItem() }),
  );
  assert.notEqual(html, "", "首帧还是空的，用户先看到空白");
  assert.match(html, /data-workbench-route-loading|data-workbench-skeleton/);
});

test("源文件请求在路由代码 resolve 之前发出", async () => {
  resetEditorPreloadForTests();
  resetOfficeSourceCacheForTests();
  let fetchStarted = false;
  let routeResolved = false;
  let releaseRoute;
  const routeGate = new Promise((resolve) => {
    releaseRoute = resolve;
  });
  registerEditorRouteLoader("deck", () =>
    routeGate.then(() => {
      routeResolved = true;
      return { DeckRoute() {} };
    }),
  );
  configureOfficeSourceCacheForTests({
    fetchBytes: async () => {
      fetchStarted = true;
      assert.equal(routeResolved, false, "源文件请求时路由代码已经 resolve 了");
      return new ArrayBuffer(16);
    },
    parse: () => "parsed-once",
  });
  const pending = preloadEditorFor(pptItem());
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchStarted, true, "源文件请求还没发出");
  assert.equal(routeResolved, false);
  releaseRoute();
  const result = await pending;
  assert.equal(result.sourceReady, true);
  assert.equal(result.codeReady, true);
  assert.ok(result.routeIds.includes("deck"));
});

test("同一 revision 第二次打开不再发请求、不再解析；换 revision 重新拿", async () => {
  resetOfficeSourceCacheForTests();
  let fetches = 0;
  let parses = 0;
  configureOfficeSourceCacheForTests({
    fetchBytes: async (url) => {
      fetches += 1;
      return new TextEncoder().encode(url).buffer;
    },
    parse: () => {
      parses += 1;
      return { ok: true, n: parses };
    },
  });
  const first = await loadOfficeSource(
    "https://asset.oceanleo.com/deck/rev-1.pptx",
    "rev-1",
  );
  const second = await loadOfficeSource(
    "https://asset.oceanleo.com/deck/rev-1.pptx",
    "rev-1",
  );
  assert.equal(first.fromCache, false);
  assert.equal(second.fromCache, true);
  assert.equal(fetches, 1);
  assert.equal(parses, 1);
  assert.equal(officeSourceCacheStats().fetches, 1);
  assert.equal(officeSourceCacheStats().parses, 1);
  const third = await loadOfficeSource(
    "https://asset.oceanleo.com/deck/rev-2.pptx",
    "rev-2",
  );
  assert.equal(third.fromCache, false);
  assert.equal(fetches, 2);
  assert.equal(parses, 2);
});

test("悬停 150ms 才 preloadEditorFor，不到 150ms 不触发", async () => {
  resetEditorPreloadForTests();
  resetOfficeSourceCacheForTests();
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
    url: "https://oceanleo.com/library",
  });
  const { document } = dom.window;
  let scheduled = [];
  configureEditorHoverSchedulerForTests({
    schedule(fn, ms) {
      scheduled.push({ fn, ms });
      return scheduled.length;
    },
    cancel() {
      scheduled = [];
    },
  });
  let preloads = 0;
  registerEditorRouteLoader("deck", async () => {
    preloads += 1;
    return { DeckRoute() {} };
  });
  configureOfficeSourceCacheForTests({
    fetchBytes: async () => new ArrayBuffer(4),
    parse: () => null,
  });
  const stop = installEditorHoverPreload(document);
  const card = document.createElement("button");
  card.setAttribute("data-cover-artifact-type", "ppt");
  card.setAttribute("data-item-url", "https://asset.oceanleo.com/deck/rev-1.pptx");
  card.setAttribute("data-revision-id", "rev-1");
  card.setAttribute("data-item-kind", "ppt");
  document.body.append(card);
  assert.ok(findLibraryCardElement(card));
  assert.equal(libraryItemFromCardElement(card)?.kind, "ppt");
  card.dispatchEvent(
    new dom.window.MouseEvent("pointerover", {
      bubbles: true,
      relatedTarget: document.body,
    }),
  );
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, EDITOR_HOVER_PRELOAD_MS);
  assert.equal(preloads, 0);
  await scheduled[0].fn();
  assert.equal(preloads, 1);
  stop();
  configureEditorHoverSchedulerForTests();
});

test("代码加载失败一次后重试成功", async () => {
  let attempts = 0;
  const value = await loadEditorModuleWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Loading chunk DeckRoute failed");
      error.name = "ChunkLoadError";
      throw error;
    }
    return { ok: true };
  });
  assert.equal(attempts, 2);
  assert.deepEqual(value, { ok: true });
});

test("计时对象五段齐全", () => {
  resetEditorOpenTimingForTests();
  assert.equal(readEditorOpenTiming(), null);
  markEditorOpen("open-1", "click");
  markEditorOpen("open-1", "code");
  markEditorOpen("open-1", "content");
  markEditorOpen("open-1", "firstFrame");
  markEditorOpen("open-1", "editable");
  const timing = readEditorOpenTiming("open-1");
  assert.ok(timing);
  for (const phase of ["click", "code", "content", "firstFrame", "editable"]) {
    assert.equal(typeof timing[phase], "number", `缺 ${phase}`);
  }
  assert.equal(typeof timing.durations.clickToEditable, "number");
  assert.equal(siteHomeEditorRouteId("slides"), "deck");
  assert.equal(
    siteHomeEditorRouteId("", "/advanced/presentation_editing"),
    "deck",
  );
});
