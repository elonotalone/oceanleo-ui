// 2026-11-07 UX wave, unit LU: the 文件包 page uploads a real folder where the browser can pick one (zip only where
// it cannot), takes drops, and shows a 文件包 that landed from anywhere on the page (LIBRARY_FOLDERS_CHANGE_EVENT).
// Operator ruling (rulings §4 "Computer-task UX wave" (6)). jsdom; the zip/upload module is a stub here (its own
// behaviour is tests/ux-lu-folder-upload.test.mjs).

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasPath = fabricRequire.resolve("canvas");
const oldCanvas = require.cache[canvasPath];
require.cache[canvasPath] = { id: canvasPath, filename: canvasPath, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (oldCanvas) require.cache[canvasPath] = oldCanvas;
else delete require.cache[canvasPath];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/library" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle() {
  for (let round = 0; round < 4; round += 1) await act(async () => delay(0));
}

const CHANGE_EVENT = "oceanleo:library-folders-change";
const mod = await import(
  await compileModule("src/shell/library-folders.tsx", {
    "../i18n/ui/useUI": dataModule(`export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }`),
    "../lib/auth/client": dataModule(`export async function accessToken(){ return null; }`),
    "./LibraryLayout": dataModule(`
      import { createElement as h } from "${reactUrl}";
      export function LibraryToolbar({ actions }){ return h("div", null, actions); }
    `),
    "./skills/kit": dataModule(`
      import { createElement as h } from "${reactUrl}";
      export const folderApi = {
        gatewayAbsoluteUrl: (p) => p,
        folderDownloadUrl: (id) => "/v1/folders/" + id + "/download",
        async listFolders(){ return { ok: true, data: globalThis.__fp.rows }; },
        async updateFolder(){ return { ok: false, error: "no" }; },
        async importFolderZip(file){ globalThis.__fp.zipImports.push(file.name); return { ok: true, data: { id: "zip-1", title: "zipped", skill: null, file_count: 1, source: "upload" } }; },
      };
      export function ConfigDialogShell(p){ return h("section", null, p.children); }
      export function FolderTreeViewer(){ return null; }
      export function SkillCover(){ return null; }
      export function ConfigToggle(){ return null; }
    `),
    "./dropped-entries": dataModule(`
      export function canPickFolder(){ return globalThis.__fp.pickable; }
      export function foldersFromDirectoryInput(files){
        const by = new Map();
        for (const file of Array.from(files)) {
          const [name, ...rest] = (file.webkitRelativePath || "").split("/");
          if (!rest.length) continue;
          if (!by.has(name)) by.set(name, { name, entries: [] });
          by.get(name).entries.push({ path: rest.join("/"), file });
        }
        return [...by.values()];
      }
      export async function readDataTransfer(transfer){ return globalThis.__fp.nextDrop; }
    `),
    "./library-folder-upload": dataModule(`
      export const FOLDER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
      export const LIBRARY_FOLDERS_CHANGE_EVENT = "${CHANGE_EVENT}";
      export async function uploadDroppedFolder(folder, { onPhase } = {}){
        onPhase?.("zipping");
        globalThis.__fp.folderUploads.push({ name: folder.name, paths: folder.entries.map((entry) => entry.path) });
        const landed = { id: "pkg-" + folder.name, title: folder.name, skill: null, file_count: folder.entries.length, source: "upload" };
        window.dispatchEvent(new CustomEvent("${CHANGE_EVENT}", { detail: { folder: landed } }));
        return { ok: true, folder: landed };
      }
    `),
  })
);

const row = (id, title) => ({ id, title, source: "upload", origin: {}, project_id: null, skill: null, cover_url: null, file_count: 2, total_bytes: 10, created_at: "2026-10-20T08:00:00Z", updated_at: "2026-10-21T08:00:00Z", can_edit: true, official: null });

async function mount(Component, props = {}, { pickable = false, rows = [row("old", "Old bundle")] } = {}) {
  globalThis.__fp = { pickable, rows, zipImports: [], folderUploads: [], nextDrop: { files: [], folders: [] } };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Component, props)));
  await settle();
  return {
    container,
    titles: () => [...container.querySelectorAll("[data-library-folder-card], [data-library-folder-strip] button")].map((n) => n.textContent),
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("desktop: 「上传文件夹」 picks a real folder and uploads it as a 文件包 (no .zip accept)", async () => {
  const view = await mount(mod.LibraryFoldersPage, { pageTitle: "我的库" }, { pickable: true });
  try {
    const label = view.container.querySelector("[data-library-folder-upload]");
    assert.match(label.textContent, /上传文件夹/);
    const input = label.querySelector("input");
    assert.equal(input.hasAttribute("webkitdirectory"), true);
    assert.equal(input.getAttribute("accept"), null);
    const a = new window.File(["a"], "a.md");
    Object.defineProperty(a, "webkitRelativePath", { value: "Brand kit/a.md" });
    const b = new window.File(["b"], "b.md");
    Object.defineProperty(b, "webkitRelativePath", { value: "Brand kit/assets/b.md" });
    Object.defineProperty(input, "files", { configurable: true, value: [a, b] });
    await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
    await settle();
    assert.deepEqual(globalThis.__fp.folderUploads, [{ name: "Brand kit", paths: ["a.md", "assets/b.md"] }]);
    assert.ok(view.container.textContent.includes("Brand kit"), "the landed 文件包 is in the list");
    assert.match(view.container.querySelector("[data-library-folder-notice]").textContent, /文件包已上传/);
  } finally {
    await view.unmount();
  }
});

test("where a folder cannot be picked the .zip / .skill picker stays", async () => {
  const view = await mount(mod.LibraryFoldersPage, { pageTitle: "我的库" }, { pickable: false });
  try {
    const label = view.container.querySelector("[data-library-folder-upload]");
    assert.match(label.textContent, /上传压缩包（\.zip）/);
    const input = label.querySelector("input");
    assert.equal(input.hasAttribute("webkitdirectory"), false);
    assert.match(input.getAttribute("accept"), /\.zip/);
  } finally {
    await view.unmount();
  }
});

test("an empty picked folder says so instead of uploading", async () => {
  const view = await mount(mod.LibraryFoldersPage, {}, { pickable: true });
  try {
    const input = view.container.querySelector("[data-library-folder-upload] input");
    Object.defineProperty(input, "files", { configurable: true, value: [] });
    await act(async () => input.dispatchEvent(new window.Event("change", { bubbles: true })));
    await settle();
    assert.equal(globalThis.__fp.folderUploads.length, 0);
    assert.match(view.container.querySelector('[role="alert"]').textContent, /这个文件夹是空的/);
  } finally {
    await view.unmount();
  }
});

test("dropping on the 文件包 page: a folder is zipped and imported, a .zip goes to the zip import", async () => {
  const view = await mount(mod.LibraryFoldersPage, {});
  try {
    const page = view.container.querySelector("[data-library-folders]");
    const zip = new window.File(["PK"], "kit.zip", { type: "application/zip" });
    globalThis.__fp.nextDrop = {
      files: [zip],
      folders: [{ name: "Dropped", entries: [{ path: "x.txt", file: new window.File(["x"], "x.txt") }] }],
    };
    const drop = new window.Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"], items: [], files: [] } });
    await act(async () => page.dispatchEvent(drop));
    await settle();
    assert.equal(drop.defaultPrevented, true);
    assert.deepEqual(globalThis.__fp.zipImports, ["kit.zip"]);
    assert.deepEqual(globalThis.__fp.folderUploads, [{ name: "Dropped", paths: ["x.txt"] }]);
  } finally {
    await view.unmount();
  }
});

test("the 文件包 strip shows a 文件包 that landed from elsewhere on the page", async () => {
  const view = await mount(mod.LibraryFoldersStrip, { onViewAll: () => {} });
  try {
    await act(async () => {
      window.dispatchEvent(new window.CustomEvent(CHANGE_EVENT, { detail: { folder: row("new", "New bundle") } }));
    });
    await settle();
    const text = view.container.querySelector("[data-library-folder-strip]").textContent;
    assert.ok(text.indexOf("New bundle") >= 0 && text.indexOf("New bundle") < text.indexOf("Old bundle"), text);
  } finally {
    await view.unmount();
  }
});
