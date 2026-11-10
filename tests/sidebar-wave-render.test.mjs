import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas; else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"]) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] || dom.window });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ui = dataModule(`export function useUI(){return (value, vars) => String(value).replace(/\\{(\\w+)\\}/g, (_, k) => vars?.[k] ?? k);}`);
const view = await compileModule("src/shell/workspace-library-view.tsx", {
  "../i18n/ui/useUI": ui,
  "./collection-items": dataModule(`export function CollectionItemCard(){return null;} export function CollectionItemRow(){return null;}`),
  "./library-viewers": dataModule(`export function LibraryItemViewer({item}){return React.createElement("article", {"data-viewer": item.title}, item.content || item.title);}`),
  "./workspace-library-model": dataModule(`export const WORKSPACE_KIND_LABELS={};`),
  "./workspace-library-thumbnail": dataModule(`export function WorkspaceThumbnail(){return null;}`),
  "./works/link-work-item": dataModule(`export function linkWorkFromLibraryItem(){return null;}`),
  "./library-sections": dataModule(`export function librarySourceLabel(){return "项目文件";}`),
  "./library-editor-category": dataModule(`export function libraryEditorLabel(){return "文档";} export function libraryCategoryLabel(){return "文档";} export function translateLibraryTypeLabel(_tt,v){return v;}`),
});
const { WorkspaceLibraryEmpty, WorkspaceLibraryEntryViewer } = await import(view);
const { createRoot } = await import("react-dom/client");

async function render(element) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root };
}

test("real sidebar viewer renders project markdown content and empty copy", async () => {
  const entry = { id: "a1", title: "notes.md", content: "hello from project", libraryItem: null };
  const mounted = await render(React.createElement(WorkspaceLibraryEntryViewer, { entry }));
  try { assert.match(mounted.host.textContent, /hello from project/); } finally { await act(async () => mounted.root.unmount()); mounted.host.remove(); }
  const empty = await render(React.createElement(WorkspaceLibraryEmpty, { title: "这个项目还没有素材", description: "上传素材后会显示在这里" }));
  try { assert.match(empty.host.textContent, /这个项目还没有素材/); } finally { await act(async () => empty.root.unmount()); empty.host.remove(); }
});

test("MyLibrary keeps the unified list and project scope render path", () => {
  const source = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.equal(source.includes("data-library-sections"), false);
  assert.match(source, /projectScope\.items/);
  assert.match(source, /WorkspaceLibrary/);
});

test("project scope loader hydrates markdown and link references", async () => {
  const scopeUrl = await compileModule("src/shell/library-project-scope.ts", { "../lib/auth/client": dataModule(`export async function accessToken(){return "test-token";}`), "../lib/auth/config": dataModule(`export function gatewayBase(){return "";}`) });
  const scope = await import(scopeUrl);
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.endsWith("/library-items")) return new Response(JSON.stringify({ items: [{ kind: "work", id: "w1", item: { id: "w1", title: "Live", link_work: { id: "w1", title: "Live", links: [{ label: "Live", url: "https://example.com" }] } } }] }));
    if (path.includes("/assets?")) return new Response(JSON.stringify({ items: [{ id: "a1", kind: "file", name: "notes.md", mime_type: "text/markdown", path: "docs/notes.md" }] }));
    if (path.endsWith("/access")) return new Response(JSON.stringify({ role: "edit" }));
    if (path.endsWith("/a1/file")) return new Response(JSON.stringify({ path: "docs/notes.md", kind: "markdown", text: "hello" }));
    return new Response("{}", { status: 200 });
  };
  try { const result = await scope.loadProjectLibraryScope("550e8400-e29b-41d4-a716-446655440000"); assert.equal(result.items.length, 2); assert.equal(result.items[1].content, "hello"); assert.equal(result.items[1].meta.library_source_label, "项目文件"); }
  finally { globalThis.fetch = original; }
});
