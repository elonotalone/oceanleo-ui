import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

test("document covers render fetched text, honest errors and bounded pending requests", async () => {
  const require = createRequire(import.meta.url);
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvas = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvas];
  require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvas] = previousCanvas; else delete require.cache[canvas];
  const dom = new JSDOM("<!doctype html><body></body>");
  for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event"]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { DocumentShelfCover } = await import(await compileModule("src/shell/document-shelf-cover.tsx", {
    "../i18n/ui/useUI": dataModule('export function useUI() { return value => value; }'),
    "../lib/media-proxy": dataModule('export function fetchMediaBlob(...args) { return globalThis.__documentCoverFetch(...args); }'),
    "./doc-editors/office-file": dataModule('export function officePackageKindForItem(){return null;} export async function fetchValidatedOfficePackage(){throw new Error("unused");}'),
  }));
  const { WorkspaceThumbnail } = await import(await compileModule("src/shell/workspace-library-thumbnail.tsx", {
    "../i18n/ui/useUI": dataModule('export function useUI() { return value => value; }'),
    "../lib/database": dataModule('export async function ensureDatabaseThumbnail(){return {ok:false};}'),
    "./advanced-features": dataModule('export function advancedLibraryReferenceFor(){return null;}'),
    "./ArtifactRendition": dataModule('export function useArtifactRendition(){return globalThis.__documentCoverRendition;}'),
  }));
  const { createRoot } = await import("react-dom/client");
  const node = dom.window.document.createElement("div");
  const root = createRoot(node);
  const realSetTimeout = globalThis.setTimeout;
  let expireRead;
  let expireCover;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms === 12_000) { expireRead = callback; return realSetTimeout(() => {}, 0); }
    if (ms === 15_000) { expireCover = callback; return realSetTimeout(() => {}, 0); }
    return realSetTimeout(callback, ms, ...args);
  };
  const item = (id) => ({ id, key: id, source: "artifact", title: "Notes", kind: "document", artifactType: "document", url: `https://example.test/${id}.txt`, meta: { mime: "text/plain" } });
  const render = async (id) => act(async () => root.render(React.createElement(DocumentShelfCover, { item: item(id), kind: "document", alt: "Notes" })));
  try {
    globalThis.__documentCoverFetch = async () => new Blob(["# Real heading\nActual document paragraph"]);
    await render("real");
    assert.equal(node.querySelector('[data-document-cover="excerpt"]') !== null, true);
    assert.match(node.textContent, /Real heading\s*Actual document paragraph/);
    assert.equal(node.querySelector('[aria-hidden="true"]'), null);
    globalThis.__documentCoverFetch = async () => { throw new Error("network unavailable"); };
    await render("failure");
    assert.match(node.textContent, /暂无内容预览，打开查看素材/);
    globalThis.__documentCoverFetch = () => new Promise(() => {});
    await render("pending");
    assert.match(node.textContent, /正在读取内容预览/);
    await act(async () => expireRead());
    assert.match(node.textContent, /暂无内容预览，打开查看素材/);

    globalThis.__documentCoverRendition = { loading: true, url: "", version: 0, error: "", resourceFailed() {} };
    await act(async () => root.render(React.createElement(WorkspaceThumbnail, {
      item: { ...item("image"), kind: "image", artifactType: "single_file_image" },
      kind: "image", alt: "Photo", accent: "#123456", imageClassName: "",
    })));
    assert.equal(node.querySelector('[data-cover-state="loading"]') !== null, true);
    await act(async () => expireCover());
    assert.equal(node.querySelector('[data-cover-state="error"]') !== null, true);
    assert.match(node.textContent, /预览加载超时/);
    assert.equal(node.querySelector('[role="status"]'), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.setTimeout = realSetTimeout;
    delete globalThis.__documentCoverFetch;
    delete globalThis.__documentCoverRendition;
    dom.window.close();
  }
});
