// 安全矩阵：不适用（填写页预览复用库查看器，无新注入）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { kindFromUrl, slidesFrom } from "../src/shell/bay/form/bay-typed-preview.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://video.oceanleo.com/bay",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const reactHref = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stageStub = dataModule(`
  import { createElement as h } from ${JSON.stringify(reactHref)};
  export function BayImageStage({ urls, emptyLabel }) {
    if (!urls || !urls.length) {
      return h("div", { "data-bay-image-stage": "", "data-bay-gallery-empty": "" }, emptyLabel || "");
    }
    return h(
      "div",
      { "data-bay-image-stage": "", "data-bay-gallery-count": String(urls.length) },
      h("div", { "data-bay-gallery-main": "" }, h("img", { src: urls[0], alt: "" })),
    );
  }
`);
const artifactStub = dataModule(`
  export async function getCurrentArtifactItem(id) {
    const responder = globalThis.__bayGetArtifact;
    if (responder) return responder(id);
    return {
      ok: true,
      data: {
        id,
        key: id,
        source: "artifact",
        title: "桩成品",
        kind: "ppt",
        siteId: "video",
        favorite: false,
        meta: {},
        posterUrl: "https://cdn.example/poster.png",
      },
    };
  }
`);
const viewerStub = dataModule(`
  import { createElement as h } from ${JSON.stringify(reactHref)};
  export function LibraryItemViewer({ item }) {
    return h("div", { "data-stub-library-viewer": item && item.id ? item.id : "" }, item && item.title ? item.title : "viewer");
  }
`);

const { BayTypedPreview } = await import(
  await compileModule("src/shell/bay/form/BayTypedPreview.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "./BayImageGallery": stageStub,
    "../../artifact-client": artifactStub,
    "../../library-viewers": viewerStub,
  }),
);
const h = React.createElement;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(BayTypedPreview, props));
  });
  await flush();
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

test("kindFromUrl 按扩展名分 ppt / 文档 / 表格 / 网站 / 视频 / 图片", () => {
  assert.equal(kindFromUrl("https://cdn.example/deck.pptx"), "ppt");
  assert.equal(kindFromUrl("https://cdn.example/brief.pdf?x=1"), "document");
  assert.equal(kindFromUrl("sheet.xlsx"), "sheet");
  assert.equal(kindFromUrl("page.html"), "website");
  assert.equal(kindFromUrl("clip.mp4"), "video");
  assert.equal(kindFromUrl("cover.png"), "image");
  assert.equal(kindFromUrl("notes.docx"), "document");
  assert.equal(kindFromUrl("book.xls"), "sheet");
});

test("挂载空态", async () => {
  const view = await mount({ imageUrls: [] });
  assert.ok(view.host.querySelector("[data-bay-typed-preview][data-bay-gallery-empty]"));
  await view.unmount();
});

test("slidesFrom：只有图时没有成品档；有成品时成品排第一，丢掉非 https 图", () => {
  assert.deepEqual(
    slidesFrom({ imageUrls: ["https://cdn.example/a.png", "http://cdn.example/b.png"] }),
    [{ type: "image", url: "https://cdn.example/a.png" }],
  );
  assert.deepEqual(
    slidesFrom({
      artifactId: "art-1",
      workTitle: "课件",
      imageUrls: ["https://cdn.example/a.png", "ftp://x", "https://cdn.example/b.png"],
    }),
    [
      { type: "artifact", id: "art-1", title: "课件" },
      { type: "image", url: "https://cdn.example/a.png" },
      { type: "image", url: "https://cdn.example/b.png" },
    ],
  );
});

test("挂载只有图：typed-preview 里是图片舞台", async () => {
  const view = await mount({ imageUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"] });
  assert.ok(view.host.querySelector("[data-bay-typed-preview]"));
  assert.ok(view.host.querySelector("[data-bay-image-stage]"));
  assert.equal(view.host.querySelector('[data-bay-typed-slide="artifact"]'), null);
  await view.unmount();
});

test("挂载带 artifactId：出现成品档，查看器按需加载", async () => {
  const view = await mount({
    artifactId: "art-9",
    workTitle: "课件",
    imageUrls: ["https://cdn.example/a.png"],
  });
  assert.ok(view.host.querySelector("[data-bay-typed-preview]"));
  assert.ok(view.host.querySelector('[data-bay-typed-slide="artifact"]'));
  for (let i = 0; i < 40 && !view.host.querySelector("[data-stub-library-viewer]"); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  assert.ok(view.host.querySelector("[data-stub-library-viewer]"), "打桩的 LibraryItemViewer 应出现在主画面");
  const viewer = view.host.querySelector("[data-stub-library-viewer]");
  const parent = viewer && viewer.parentElement;
  const style = parent ? window.getComputedStyle(parent).pointerEvents : "";
  assert.notEqual(style, "none");
  await view.unmount();
});

test("BayTypedPreview 走懒加载 LibraryItemViewer，源码不新增 iframe / innerHTML", () => {
  const source = readFileSync(new URL("../src/shell/bay/form/BayTypedPreview.tsx", import.meta.url), "utf8");
  assert.match(source, /lazy\(\(\) => import\("\.\.\/\.\.\/library-viewers"\)/);
  assert.doesNotMatch(source, /<iframe/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  const preview = readFileSync(new URL("../src/shell/bay/form/BayListingPreview.tsx", import.meta.url), "utf8");
  assert.match(preview, /BayTypedPreview/);
  const editor = readFileSync(new URL("../src/shell/bay/seller/ServiceEditorPane.tsx", import.meta.url), "utf8");
  assert.match(editor, /previewArtifactId:/);
  assert.match(editor, /draft\.digitalWorks\[0\] \?\? draft\.digitalWork/);
  assert.match(editor, /BayDigitalWorksField/);
  assert.doesNotMatch(editor, /artifactId=\{draft\.digitalWork\.id\}/);
  assert.doesNotMatch(editor, /<BayTypedPreview/);
  assert.match(source, /data-bay-typed-open/);
  assert.match(source, /minHeight: 560/);
  const listing = readFileSync(new URL("../src/shell/bay/form/BayListingPreview.tsx", import.meta.url), "utf8");
  assert.match(listing, /sampleArtifactId/);
  const pane = readFileSync(new URL("../src/shell/bay/supply/ServicePane.tsx", import.meta.url), "utf8");
  assert.match(pane, /BayTypedPreview/);
  assert.match(pane, /getBayServiceWorkPreview/);
});
