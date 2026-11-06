import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/library" });
const { window } = dom;
for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement, Element: window.Element, Node: window.Node })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.attachEvent = () => {};
Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value) => { globalThis.__copied = value; } } });
globalThis.__opened = [];
window.open = (...args) => { globalThis.__opened.push(args); return null; };
window.HTMLAnchorElement.prototype.click = function click() { globalThis.__download = { href: this.href, download: this.download }; };

const state = {
  lists: 0,
  deleted: [],
  uploads: [],
  rows: [
    { id: "old", kind: "text", text: "old text", created_at: "2026-11-06T00:00:00Z" },
    { id: "new", kind: "text", text: "new text", created_at: "2026-11-07T00:00:00Z" },
  ],
};
const apiStub = dataModule(`
  export async function listLibraryMemoItems() { globalThis.__memo.lists++; return { items: globalThis.__memo.rows }; }
  export async function addLibraryMemoText(text) { const item = { id: "text-added", kind: "text", text, created_at: "2026-11-08T00:00:00Z" }; globalThis.__memo.rows.unshift(item); return { item }; }
  export async function addLibraryMemoArtifact(id, revisionId) { const item = { id: "artifact-added", kind: "artifact", artifact: { id, revision_id: revisionId || "rev-1", name: "photo.png", mime: "image/png", media_type: "image/png" }, created_at: "2026-11-09T00:00:00Z" }; globalThis.__memo.rows.unshift(item); return { item }; }
  export async function deleteLibraryMemoItem(id) { globalThis.__memo.deleted.push(id); globalThis.__memo.rows = globalThis.__memo.rows.filter((row) => row.id !== id); }
`);
const uploadStub = dataModule(`export async function uploadFile(file, options) { globalThis.__memo.uploads.push({ file, options }); return { ok: true, data: { file: { artifact_id: "uploaded-artifact", revision_id: "uploaded-revision" } } }; }`);
const urlStub = dataModule(`export async function resolveAttachmentDisplayUrl() { return "https://files.example.test/photo.png"; }`);
const uiStub = dataModule(`export function useUI() { return (text) => text; }`);
const copyStub = dataModule(`export const LIBRARY_MEMO_MESSAGES = { zh: {}, en: {} };`);
const chromeStub = dataModule(`export const COLLECTION_ACTION_BTN_PRIMARY = "memo-action";`);
globalThis.__memo = state;
const mod = await import(await compileModule("src/shell/library-memo/LibraryMemoPage.tsx", {
  "../../lib/library-memo-api": apiStub,
  "../../lib/database": uploadStub,
  "../../lib/attachment-url": urlStub,
  "../../i18n/ui/useUI": uiStub,
  "../../i18n/ui/messages/library-memo-copy": copyStub,
  "../collection-chrome": chromeStub,
}));

async function settle() { for (let i = 0; i < 4; i += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
function button(container, label) { return [...container.querySelectorAll("button")].find((entry) => entry.textContent === label); }
function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root, render: () => act(async () => root.render(React.createElement(mod.LibraryMemoPage))), unmount: () => act(async () => root.unmount()) };
}

test("Memo renders newest first, adds text, copies and deletes", async () => {
  state.lists = 0; state.deleted.length = 0; state.rows = [
    { id: "old", kind: "text", text: "old text", created_at: "2026-11-06T00:00:00Z" },
    { id: "new", kind: "text", text: "new text", created_at: "2026-11-07T00:00:00Z" },
  ];
  const view = mount(); await view.render(); await settle();
  assert.deepEqual([...view.container.querySelectorAll("li p")].map((node) => node.textContent), ["new text", "old text"]);
  const area = view.container.querySelector("textarea");
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(area, "hello");
  area._valueTracker?.setValue("");
  await act(async () => { area.dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: "hello" })); });
  await settle();
  await act(async () => button(view.container, "保存").click()); await settle();
  assert.ok(state.rows.some((row) => row.id === "text-added" && row.text === "hello"));
  await act(async () => navigator.clipboard.writeText("new text"));
  assert.equal(globalThis.__copied, "new text");
  await act(async () => button(view.container, "删除").click()); await settle();
  assert.ok(state.deleted.length > 0);
  await view.unmount(); view.container.remove();
});

test("Memo uploads privately, adds artifact, refreshes on focus, and opens/downloads files", async () => {
  state.rows = [{ id: "file", kind: "artifact", artifact: { id: "a", revision_id: "r", name: "photo.png", mime: "image/png", media_type: "image/png" }, created_at: "2026-11-07T00:00:00Z" }];
  state.uploads.length = 0; state.lists = 0;
  const view = mount(); await view.render(); await settle();
  const input = view.container.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["x"], "x.png", { type: "image/png" })] });
  await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true }))); await settle();
  assert.equal(state.uploads[0].options.privateUpload, true);
  assert.ok(state.rows.some((row) => row.id === "artifact-added"));
  const before = state.lists; window.dispatchEvent(new window.Event("focus")); await settle(); assert.ok(state.lists > before);
  await act(async () => button(view.container, "打开").click()); assert.equal(globalThis.__opened[0][0], "https://files.example.test/photo.png");
  await act(async () => button(view.container, "下载").click()); assert.equal(globalThis.__download.download, "photo.png");
  await view.unmount(); view.container.remove();
});

test("MyLibrary opens Memo from the capability-pack mine action", () => {
  const source = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.match(source, /action\?\.action\.tab === "mine" && action\.action\.itemId === "memo"/);
});
