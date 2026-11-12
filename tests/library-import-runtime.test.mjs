import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const apiStub = dataModule(`
export async function libraryRequest(path,body){return globalThis.__luRequest(path,body);}
export const LIBRARY_UPLOAD_EVENT="test-upload";
export class LibraryUploadError extends Error {}
export async function createLibraryFolder(){throw Error("unexpected folder creation");}
export async function uploadLibraryFile(){throw Error("unexpected file upload");}
export async function queueLibraryFile(){throw Error("unexpected file queue");}
export async function pendingLibraryUploads(){return globalThis.__luPending || [];}
export function pauseLibraryUpload(key){globalThis.__luPaused=key;}
export async function resumeLibraryUpload(key){globalThis.__luResumed=key;return {id:"ready"};}
`);
const mod = await import(await compileModule("src/shell/library-import.tsx", {
  "../lib/library-uploads": apiStub,
  "./StorageCapacityStrip": dataModule(`import {createElement as h} from "${reactUrl}"; export function StorageCapacityStrip(){return h("div",{"data-storage-capacity":""},"storage plans");}`),
  "./library-folder-upload": dataModule('export const LIBRARY_FOLDERS_CHANGE_EVENT="folder-change";'),
  "../i18n/ui/useUI": dataModule('const tt=(s)=>s; export function useUI(){return tt;}'),
  "../ui": dataModule(`import {createElement as h} from "${reactUrl}"; export function Modal(p){return h("div",{role:"dialog"},p.children);}`),
}));
async function domTest(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas; else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://ui.test", pretendToBeVisual: true });
  const restore = [];
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restore.push(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const errors = []; const oldError = console.error; console.error = (...args) => errors.push(args.map(String).join(" "));
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try { await run({ root, container, window: dom.window }); }
  finally {
    await act(async () => root.unmount());
    console.error = oldError;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT; dom.window.close();
  }
  assert.deepEqual(errors, [], "changed components must not emit React errors");
}
async function render(root, component, props) { await act(async () => { root.render(React.createElement(component, props)); }); }
async function change(window, element, value) {
  await act(async () => {
    const prototype = element.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}
async function submit(window, container) { await act(async () => container.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); }

test("from-computer dialog loads paired computers, submits chosen computer and path, refreshes only on success", async () => {
  const requests = []; let imported = 0; let closed = 0;
  globalThis.__luRequest = async (path, body) => { requests.push({ path, body }); return path === "/v1/computers" ? { items: [{ id: "one", name: "Mac" }, { id: "two", name: "PC" }] } : { status: "complete", folder: { id: "folder" } }; };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "computer", onClose: () => closed++, onImported: () => imported++ });
    await change(window, container.querySelector("select"), "two");
    await change(window, container.querySelector("input"), "C:\\Work\\photos");
    await submit(window, container);
    assert.deepEqual(requests.at(-1), { path: "/v1/library/uploads/from-computer", body: { computerId: "two", path: "C:\\Work\\photos" } });
    assert.equal(imported, 1); assert.equal(closed, 1);
  });
});

test("GitHub public import accepts a URL without a connector", async () => {
  const requests = []; let done = 0;
  globalThis.__luRequest = async (path, body) => { requests.push({ path, body }); return body ? { folder: { id: "public" } } : { connected: false, repositories: [] }; };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "github", onClose() {}, onImported: () => done++ });
    assert.match(container.textContent, /私有仓库请先连接 GitHub/);
    await change(window, container.querySelector("input"), "https://github.com/owner/public");
    await submit(window, container);
    assert.deepEqual(requests.at(-1), { path: "/v1/folders/import-github", body: { url: "https://github.com/owner/public" } });
    assert.equal(done, 1);
  });
});

test("GitHub private picker uses connected account's repository URL", async () => {
  const requests = [];
  globalThis.__luRequest = async (path, body) => { requests.push({ path, body }); return body ? { folder: { id: "private" } } : { connected: true, repositories: [{ full_name: "owner/private", html_url: "https://github.com/owner/private", private: true }] }; };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "github", onClose() {}, onImported() {} });
    assert.match(container.querySelector("select").textContent, /owner\/private.*私有/);
    await change(window, container.querySelector("select"), "https://github.com/owner/private");
    assert.equal(container.querySelector("input").value, "https://github.com/owner/private");
    await submit(window, container);
    assert.equal(requests.at(-1).body.url, "https://github.com/owner/private");
  });
});

test("import failure displays quota numbers and storage link without announcing success", async () => {
  let done = 0;
  globalThis.__luRequest = async (_path, body) => { if (body) throw Error("已用 100 B，总量 110 B，本次 20 B"); return { connected: false, repositories: [] }; };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "github", onClose() {}, onImported: () => done++ });
    await change(window, container.querySelector("input"), "https://github.com/owner/repo"); await submit(window, container);
    assert.match(container.querySelector('[role="alert"]').textContent, /100 B.*110 B.*20 B/);
    assert.equal(container.querySelector('[role="alert"] a').getAttribute("href"), "/library#storage-capacity");
    assert.equal(done, 0);
    await act(async () => container.querySelector('[role="alert"] a').dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })));
    assert.ok(container.querySelector("[data-storage-capacity]"), "quota link opens real storage controls");
  });
});

test("purchased Library item shows 有新版本 from entitlement; updating reloads the Library", async () => {
  const requests = []; let updated = 0;
  globalThis.__luRequest = async (path, body) => { requests.push({ path, body }); return body ? { entitled: true, updateAvailable: false } : { items: [{ listing_id: "listing-1", title: "设计素材", entitled: true, updateAvailable: true, libraryIdentity: { id: "art-1" } }] }; };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryPurchasedUpdates, { items: [], onUpdated: () => updated++ });
    assert.match(container.textContent, /来自 LeoBay.*设计素材.*有新版本/);
    await act(async () => container.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(requests.at(-1).path, "/v1/bay/assets/listing-1/update");
    assert.equal(updated, 1); assert.doesNotMatch(container.textContent, /有新版本/);
    assert.match(container.textContent, /设计素材/, "purchase remains in 来自 LeoBay after updating");
  });
});

test("upload queue renders progress, pauses an active upload, and resumes a saved one", async () => {
  globalThis.__luPending = [{ key: "upload-1", name: "video.mp4", size: 1000, loaded: 400, state: "uploading", persisted: true }];
  globalThis.__luResumed = undefined;
  await domTest(async ({ root, container, window }) => {
    const onCompleted = () => {};
    await render(root, mod.LibraryUploadQueue, { onCompleted });
    assert.equal(container.querySelector("progress").value, 400);
    await act(async () => container.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(globalThis.__luPaused, "upload-1");
    globalThis.__luPending[0].state = "paused";
    await act(async () => { window.dispatchEvent(new window.Event("test-upload")); await new Promise((resolve) => setTimeout(resolve, 170)); });
    await act(async () => container.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(globalThis.__luResumed, "upload-1");
  });
  delete globalThis.__luPending;
});

test("real MyLibrary loads, enables upload menu, opens its computer import dialog and refreshes after import", async () => {
  globalThis.__luPending = [];
  let listCalls = 0; const requests = [];
  globalThis.__luMyLibraryPage = async () => { listCalls++; return { ok: true, data: { items: [], ownerPrincipalId: "owner-1", nextCursor: null, total: 0, invalidItems: [] } }; };
  globalThis.__luRequest = async (path, body) => { requests.push({ path, body }); return path === "/v1/computers" ? { items: [{ id: "paired-1", name: "工作电脑" }] } : path === "/v1/bay/assets/purchases" ? { items: [] } : { folder: { id: "imported-folder" } }; };
  const ttStub = dataModule('const tt=s=>s; export function useUI(){return tt;}');
  const own = await import(await compileModule("src/shell/MyLibrary.tsx", {
    "../i18n/ui/useUI": ttStub,
    "../ui": dataModule(`
      export * from ${JSON.stringify(await compileModule("src/ui/index.tsx"))};
      import {createElement as h} from "${reactUrl}";
      export function Modal(p){return h("div",{role:"dialog"},p.children);}
    `),
    "../lib/library-uploads": apiStub,
    "./StorageCapacityStrip": dataModule('export function StorageCapacityStrip(){return null;}'),
    "./artifact-client": dataModule(`
      export * from ${JSON.stringify(new URL("../src/shell/artifact-client.ts", import.meta.url).href)};
      export async function listMyArtifacts(){return globalThis.__luMyLibraryPage();}
      export const listFavoriteArtifacts=listMyArtifacts;
    `),
    "../lib/auth/client": dataModule(`
      export * from ${JSON.stringify(new URL("../src/lib/auth/client.ts", import.meta.url).href)};
      export async function accessToken(){return "owner-1";}
      export async function getUserIdSnapshot(){return {available:true,userId:"owner-1"};}
    `),
    "./WorkspaceLibrary": dataModule(`import {createElement as h} from "${reactUrl}";
      export function WorkspaceLibrary(p){return h("div",{"data-library-fixture":""},p.toolbarActions);}
      export function workspaceEntryFromLibraryItem(item,opts){return {...item,...opts};}
    `),
    "../ui/menu/FloatingMenu": dataModule(`import {createElement as h} from "${reactUrl}";
      export function FloatingMenu(p){return p.open?h("div",{role:"menu"},p.children):null;}
      export function FloatingMenuItem(p){return h("button",{type:"button",disabled:p.disabled,onClick:p.onSelect},p.label);}
      export function FloatingMenuSeparator(){return null;}
      export function FloatingMenuLabel(p){return h("span",null,p.children);}
    `),
    "./library-standalone-editor-host": dataModule('export function MaterialStandaloneEditor(){return null;}'),
    "./editor-preload": dataModule('export async function preloadEditorFor(){return {};}'),
    "./library-project-membership": dataModule(`
      export * from ${JSON.stringify(new URL("../src/shell/library-project-membership.ts", import.meta.url).href)};
      export async function loadProjectMemberships(){return [];}
    `),
  }));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [], works: [], files: [] }), { status: 200 });
  try {
    await domTest(async ({ root, container, window }) => {
      await render(root, own.MyLibrary, { siteId: "home", pageTitle: "我的库" });
      const uploadButton = container.querySelector("[data-library-upload-menu] button");
      assert.equal(uploadButton.disabled, false);
      await act(async () => uploadButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      const computerButton = [...container.querySelectorAll('[role="menu"] button')].find((button) => button.textContent === "从我的电脑添加");
      assert.ok(computerButton);
      await act(async () => computerButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      const input = window.document.querySelector('input[aria-label="文件或文件夹路径"]');
      assert.ok(input);
      await change(window, input, "/Users/me/project");
      const before = listCalls;
      await submit(window, window.document.body);
      assert.ok(requests.some((row) => row.path === "/v1/library/uploads/from-computer" && row.body.computerId === "paired-1"));
      assert.ok(listCalls > before, "MyLibrary rereads authoritative items after import");
    });
  } finally { globalThis.fetch = oldFetch; delete globalThis.__luPending; }
});

test("private repository picker loads further connector pages and keeps earlier repositories", async () => {
  globalThis.__luRequest = async (path) => path.endsWith("page=2")
    ? { connected: true, repositories: [{ full_name: "owner/second", html_url: "https://github.com/owner/second", private: true }], nextPage: null }
    : { connected: true, repositories: [{ full_name: "owner/first", html_url: "https://github.com/owner/first", private: true }], nextPage: 2 };
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "github", onClose() {}, onImported() {} });
    const more = [...container.querySelectorAll("button")].find((button) => button.textContent === "加载更多仓库");
    await act(async () => more.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.match(container.querySelector("select").textContent, /owner\/first.*owner\/second/);
    assert.equal([...container.querySelectorAll("button")].some((button) => button.textContent === "加载更多仓库"), false);
  });
});

test("computer import shows progress until a real typed-file receipt arrives", async () => {
  let finish; let imported = 0;
  globalThis.__luRequest = async (path) => path === "/v1/computers" ? { items: [{ id: "paired", name: "My computer" }] } : new Promise((resolve) => { finish = resolve; });
  await domTest(async ({ root, container, window }) => {
    await render(root, mod.LibraryImportDialog, { mode: "computer", onClose() {}, onImported: () => imported++ });
    await change(window, container.querySelector("input"), "/home/me/movie.mp4");
    await submit(window, container);
    assert.ok(container.querySelector('progress[aria-label="导入进度"]'));
    assert.equal(imported, 0, "pending transfer is not reported as imported");
    await act(async () => finish({ ok: true, file: { artifact_id: "art-1", revision_id: "rev-1" } }));
    assert.equal(imported, 1);
    assert.equal(container.querySelector("progress"), null);
  });
});

test("recovering 1,000 queued folder files refreshes the Library and folder once per batch", async () => {
  globalThis.__luPending = Array.from({ length: 1000 }, (_, index) => ({ key: `file-${index}`, name: `file-${index}`, folderId: "folder-1", size: 1, loaded: 0, state: "queued", persisted: true }));
  let reads = 0; let folderReads = 0;
  globalThis.__luRequest = async (path) => { assert.equal(path, "/v1/folders/folder-1"); folderReads++; return { folder: { id: "folder-1", file_count: 1000 } }; };
  try {
    await domTest(async ({ root, container }) => {
      await render(root, mod.LibraryUploadQueue, { onCompleted: () => reads++ });
      assert.equal(reads, 1);
      assert.equal(folderReads, 1);
      assert.equal(container.querySelectorAll("progress").length, 10, "large queues do not mount a thousand progress bars");
    });
  } finally { delete globalThis.__luPending; }
});
