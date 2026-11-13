// Library provenance (creation / upload / LeoBay / LeoChat) and drag-drop upload.
// The current unified shelf shows those sources together; source filters remain a wire contract. Operator ruling (rulings §4 "Computer-task UX wave" (6)); contract §2.4: every Library list
// item carries `librarySource`, the list route filters with `source=`. No browser (ruling 2026-11-06): jsdom +
// stubbed neighbours, the real MyLibrary / library-sections / library-drop / dropped-entries.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/library",
});
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
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await delay(0);
    });
  }
}

const myLibraryUrl = await compileModule("src/shell/MyLibrary.tsx", {
  "./library-import": dataModule(`
    export function LibraryImportDialog(){ throw new Error("unexpected import dialog"); }
    export function LibraryUploadQueue(){ return null; }
    export function LibraryPurchasedUpdates(){ return null; }
  `),
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "../lib/auth/client": dataModule(`
    export const AUTH_STATE_EVENT = "oceanleo:auth-state";
    export async function accessToken(){ return null; }
    export function cachedAccessToken(){ return null; }
    export async function getUserId(){ return "user-1"; }
    export async function getUserIdSnapshot(){ return {available:true,userId:"user-1"}; }
  `),
  "./AppPageHeader": dataModule(`export const APP_PAGE_TITLE_CLASS = "";`),
  "./LibraryLayout": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function LibraryToolbar({actions,viewOptions=[]}){
      return h("div", null, actions,
        h("span", {"data-view-options": viewOptions.map((option) => option.label).join("|")}));
    }
  `),
  "./collection-chrome": dataModule(`
    export const COLLECTION_ACTION_BTN_PRIMARY = "";
    export function CollectionFilterRow(){ return null; }
    export function CollectionFilterSelect(){ return null; }
  `),
  "../lib/database": dataModule(`
    export async function getStorageUsage(){ return {ok:false,error:"storage usage not part of this fixture"}; }
    export async function changeStoragePacks(){ throw new Error("unexpected storage purchase"); }
    export function humanLibraryUploadError(value){ return String(value || "upload failed"); }
    export async function normalizeUploadIdempotencyKey(){ return "stable-key"; }
    export async function uploadFile(file, options){
      globalThis.__lu.uploads.push({ name: file.name, ...options });
      return globalThis.__lu.uploadResponses.shift() || { ok: false, status: 503, error: "temporary", retryable: false };
    }
  `),
  "./library-scope": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function LibraryScope({header,children}){ return h("div",{"data-library-scope":""},header,children); }
  `),
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export async function getCurrentArtifactItem(id){
      globalThis.__lu.detailReads.push(id);
      const value = globalThis.__lu.items.find(item => item.artifactId === id);
      return value ? {ok:true,data:value} : {ok:false,status:404};
    }
    export async function ensureArtifact(){ return {ok:false}; }
    export async function retireArtifact(){ return {ok:true}; }
    // The server side of contract §2.4: \`source=\` keeps only that section's items.
    export async function listMyArtifacts(options = {}){
      globalThis.__lu.mineCalls.push({ source: options.source ?? null, artifactType: options.artifactType ?? null });
      const items = globalThis.__lu.items.filter((item) =>
        (!options.source || item.artifact.librarySource === options.source) &&
        (!options.artifactType || item.artifactType === options.artifactType));
      return {ok:true,status:200,data:{items,nextCursor:null,total:items.length,ownerPrincipalId:"user-1",invalidItems:[]}};
    }
    export async function listFavoriteArtifacts(options = {}){
      globalThis.__lu.favoriteCalls.push({ source: options.source ?? null });
      const items = globalThis.__lu.favorites;
      return {ok:true,status:200,data:{items,nextCursor:null,total:items.length,ownerPrincipalId:"user-1",invalidItems:[]}};
    }
  `),
  "./library-current-identity": dataModule(`
    export function clearLibraryCurrentIdentity(){}
    export function getLibraryCurrentIdentity(){ return null; }
    export function rememberOpenedLibraryItem(){}
  `),
  "./library-edit-intent": dataModule(`export function useLibraryEditIntent(){}`),
  "./library-edit-landing": dataModule(`export function libraryStandaloneEditorBinding(){ return {siteId:"home",appId:"library"}; }`),
  "./WorkspaceLibrary": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function workspaceEntryFromLibraryItem(item, options = {}){
      return { id: item.artifactId, title: item.title, kind: item.kind, category: options.category, libraryItem: item };
    }
    export function WorkspaceLibrary({entries = [], emptyTitle, onOpenItem, action}){
      return h("div", {"data-grid": "", "data-action-item":action?.action?.itemId || ""},
        entries.length === 0 ? h("div", {"data-empty-title": ""}, emptyTitle) : null,
        ...entries.map((entry) => h("button", {key: entry.id, "data-library-item": entry.id, onClick:()=>onOpenItem?.(entry.libraryItem)}, entry.title)));
    }
  `),
  "./library-chat-files": dataModule(`
    export async function listLibraryChatFiles(){ return {ok:true,items:[],next:null}; }
    export function chatFileMatches(){ throw new Error("unexpected chat file in empty transport fixture"); }
    export function chatFileLibraryItem(){ throw new Error("unexpected chat file in empty transport fixture"); }
  `),
  "./library-folder-upload": dataModule(`
    export async function uploadDroppedFolder(folder, { onPhase } = {}){
      onPhase?.("creating");
      globalThis.__lu.folderUploads.push({ name: folder.name, paths: folder.entries.map((entry) => entry.path) });
      return globalThis.__lu.folderResponses.shift() || { ok: true, folder: { id: "pkg-1" } };
    }
  `),
  "./library-standalone-editor-host": dataModule(`export function MaterialStandaloneEditor(){ return null; }`),
  "./editor-preload": dataModule(`export function preloadEditorFor(){}`),
  "./advanced-session": dataModule(`export function adoptSavedEditorItem(_current, saved){ return saved; }`),
});
const { MyLibrary } = await import(myLibraryUrl);

function item(id, librarySource, extra = {}) {
  const revisionId = `${id}-r1`;
  return {
    key: `artifact:${id}:${revisionId}`,
    source: "artifact",
    id,
    title: id,
    kind: "document",
    artifactType: "document",
    siteId: "home",
    favorite: false,
    meta: {},
    artifactId: id,
    revisionId,
    ...extra,
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId: id,
      revisionId,
      owner: { principalId: "user-1", visibility: "private" },
      renditions: {},
      roles: [],
      ...(librarySource === undefined ? {} : { librarySource }),
      ...(extra.artifact || {}),
    },
  };
}

const ITEMS = [
  item("made-1", "creation"),
  item("made-2", "creation"),
  item("up-1", "upload"),
  item("bay-1", "leobay"),
  item("no-section", null),
];

async function mount(props = {}, { items = ITEMS, favorites = [] } = {}) {
  globalThis.__lu = {
    items,
    favorites,
    mineCalls: [],
    detailReads: [],
    favoriteCalls: [],
    uploads: [],
    uploadResponses: [],
    folderUploads: [],
    folderResponses: [],
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (next) => {
    await act(async () => root.render(React.createElement(MyLibrary, { siteId: "oceanleo", ...next })));
    await settle();
  };
  await render(props);
  return {
    container,
    render,
    shown: () => [...container.querySelectorAll("[data-library-item]")].map((node) => node.getAttribute("data-library-item")),
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** jsdom has no DataTransfer: a stand-in with the parts the Library reads (types, items → entries). */
function fileEntry(file) {
  return { name: file.name, isFile: true, isDirectory: false, file: (ok) => ok(file) };
}
function dirEntry(name, children) {
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let done = false;
      return { readEntries(ok) { ok(done ? [] : children); done = true; } };
    },
  };
}
function transfer(entries, types = ["Files"]) {
  return {
    types,
    dropEffect: "",
    files: entries.filter((entry) => entry.isFile).map((entry) => entry.__file),
    items: entries.map((entry) => ({ kind: "file", webkitGetAsEntry: () => entry })),
  };
}
async function dispatchDrag(target, type, dataTransfer) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

test("the unified Library shows every provenance in one shelf and reads mine without source=", async () => {
  const view = await mount();
  try {
    assert.equal(view.container.querySelectorAll("[data-library-section]").length, 0);
    assert.deepEqual(view.shown(), ITEMS.map(item => item.artifactId));
    assert.ok(globalThis.__lu.mineCalls.length > 0);
    assert.ok(globalThis.__lu.mineCalls.every(call => call.source === null));
  } finally { await view.unmount(); }
});

test("the unified Library view menu offers favorites without an uploaded-only section toggle", async () => {
  const view = await mount();
  try {
    assert.equal(view.container.querySelector("[data-view-options]").getAttribute("data-view-options"), "仅看收藏");
  } finally { await view.unmount(); }
});

test("legacy section props cannot hide other sources from the unified shelf", async () => {
  const view = await mount({ section: "upload" });
  try {
    assert.deepEqual(view.shown(), ITEMS.map(item => item.artifactId));
    await view.render({ section: "leobay" });
    assert.deepEqual(view.shown(), ITEMS.map(item => item.artifactId));
    assert.ok(globalThis.__lu.mineCalls.every(call => call.source === null));
  } finally { await view.unmount(); }
});

test("unknown provenance remains visible without being guessed into a source", async () => {
  const view = await mount();
  try {
    assert.ok(view.shown().includes("no-section"));
    assert.equal(ITEMS.find(item => item.artifactId === "no-section").artifact.librarySource, null);
    assert.equal(view.container.querySelectorAll("[data-library-section]").length, 0);
  } finally { await view.unmount(); }
});

test("favorites from different sources share the shelf and are read without source=", async () => {
  const favorites = [item("fav-bay", "leobay", { favorite: true }), item("fav-made", "creation", { favorite: true })];
  const view = await mount({}, { items: [], favorites });
  try {
    assert.ok(globalThis.__lu.favoriteCalls.every(call => call.source === null));
    assert.deepEqual(view.shown(), ["fav-bay", "fav-made"]);
  } finally { await view.unmount(); }
});

test("an empty unified shelf keeps the same empty state across legacy section props", async () => {
  const view = await mount({ section: "upload" }, { items: [] });
  try {
    assert.equal(view.container.querySelector("[data-empty-title]").textContent, "还没有创作");
    await view.render({ section: "leobay" });
    assert.equal(view.container.querySelector("[data-empty-title]").textContent, "还没有创作");
  } finally { await view.unmount(); }
});

test("LeoChat Library artifacts appear in the same grid as other provenance", async () => {
  const view = await mount({}, { items: [...ITEMS, item("chat-card", "leochat")] });
  try {
    assert.ok(view.container.querySelector("[data-grid]"));
    assert.ok(view.shown().includes("chat-card"));
    assert.ok(view.shown().includes("made-1"));
    assert.equal(view.container.querySelector("[data-chat-files-stub]"), null);
    assert.ok(globalThis.__lu.mineCalls.every(call => call.source === null));
  } finally { await view.unmount(); }
});

test("opening a LeoChat Library artifact preserves its exact identity", async () => {
  const opened = [];
  const view = await mount({ onOpenItem: picked => opened.push(picked.artifactId) }, { items: [...ITEMS, item("chat-card", "leochat")] });
  try {
    await act(async () => view.container.querySelector('[data-library-item="chat-card"]').click());
    assert.deepEqual(opened, ["chat-card"]);
  } finally { await view.unmount(); }
});

test("a legacy uploaded receipt preserves the requested item without filtering away the shelf", async () => {
  const view = await mount({ action: { nonce: "chat-upload-1", action: { version: 1, tab: "mine", filter: "uploaded", itemId: "up-1" } } });
  try {
    assert.ok(globalThis.__lu.detailReads.length > 0);
    assert.ok(globalThis.__lu.detailReads.every(id => id === "up-1"));
    assert.equal(view.container.querySelector("[data-grid]").getAttribute("data-action-item"), "up-1");
    assert.ok(view.shown().includes("up-1"));
    assert.ok(view.shown().includes("made-1"));
  } finally { await view.unmount(); }
});

test("supplemental content receives unified context and legacy section props do not select a tab", async () => {
  const reported = [];
  const seen = [];
  const supplementalSection = ({ section }) => {
    seen.push(section);
    return React.createElement("div", { "data-unified-section": section });
  };
  const view = await mount({ section: "creation", onSectionChange: next => reported.push(next), supplementalSection });
  try {
    await view.render({ section: "upload", onSectionChange: next => reported.push(next), supplementalSection });
    assert.deepEqual(reported, []);
    assert.ok(seen.length > 0 && seen.every(section => section === "creation"));
    assert.equal(view.container.querySelector("[data-unified-section]").getAttribute("data-unified-section"), "creation");
    assert.deepEqual(view.shown(), ITEMS.map(item => item.artifactId));
  } finally { await view.unmount(); }
});

test("dragging files over the page shows 「松手即可添加文件」; dragging a Library card does not", async () => {
  const view = await mount();
  try {
    const zone = view.container.querySelector("[data-library-drop-zone]");
    const cardDrag = await dispatchDrag(zone, "dragenter", transfer([], ["text/plain", "application/x-oceanleo-material"]));
    assert.equal(cardDrag.defaultPrevented, false);
    assert.equal(view.container.querySelector("[data-library-drop-overlay]"), null);
    const fileDrag = await dispatchDrag(zone, "dragenter", transfer([], ["Files"]));
    assert.equal(fileDrag.defaultPrevented, true);
    assert.equal(view.container.querySelector("[data-library-drop-overlay]").textContent, "松手即可添加文件");
    await dispatchDrag(zone, "dragleave", transfer([], ["Files"]));
    assert.equal(view.container.querySelector("[data-library-drop-overlay]"), null);
  } finally {
    await view.unmount();
  }
});

test("dropped files retain private upload identity and notify a legacy host without adding section tabs", async () => {
  const sections = [];
  const view = await mount({onSectionChange: section => sections.push(section)});
  try {
    const file = new window.File(["hello"], "notes.txt", { type: "text/plain", lastModified: 7 });
    const entry = Object.assign(fileEntry(file), { __file: file });
    const zone = view.container.querySelector("[data-library-drop-zone]");
    await dispatchDrag(zone, "dragenter", transfer([entry]));
    const drop = await dispatchDrag(zone, "drop", transfer([entry]));
    assert.equal(drop.defaultPrevented, true);
    await settle();
    assert.deepEqual(globalThis.__lu.uploads.map((upload) => [upload.name, upload.privateUpload, upload.siteId]), [
      ["notes.txt", true, "oceanleo"],
    ]);
    assert.ok(sections.includes("upload"));
    assert.equal(view.container.querySelectorAll("[data-library-section]").length, 0);
    assert.equal(view.container.querySelector("[data-library-drop-overlay]"), null);
  } finally {
    await view.unmount();
  }
});

test("a dropped folder keeps its relative paths and uses the folder upload boundary", async () => {
  const sections = [];
  const view = await mount({onSectionChange: section => sections.push(section)});
  try {
    const a = new window.File(["a"], "a.md");
    const b = new window.File(["b"], "b.md");
    const folder = dirEntry("Brand kit", [fileEntry(a), dirEntry("assets", [fileEntry(b)])]);
    const zone = view.container.querySelector("[data-library-drop-zone]");
    await dispatchDrag(zone, "drop", transfer([folder]));
    await settle();
    assert.deepEqual(globalThis.__lu.folderUploads, [{ name: "Brand kit", paths: ["a.md", "assets/b.md"] }]);
    assert.equal(globalThis.__lu.uploads.length, 0);
    assert.ok(sections.includes("upload"));
    assert.equal(view.container.querySelectorAll("[data-library-section]").length, 0);
  } finally {
    await view.unmount();
  }
});

test("a folder upload error is shown as returned", async () => {
  const view = await mount();
  try {
    globalThis.__lu.folderResponses.push({ ok: false, error: "文件夹上传失败：空间不足" });
    const zone = view.container.querySelector("[data-library-drop-zone]");
    await dispatchDrag(zone, "drop", transfer([dirEntry("Huge", [fileEntry(new window.File(["x"], "x.bin"))])]));
    await settle();
    const alert = view.container.querySelector('[role="alert"]');
    assert.equal(alert?.firstChild?.textContent, "文件夹上传失败：空间不足");
    assert.equal(alert?.querySelector("a")?.getAttribute("href"), "/library#storage-capacity");
  } finally {
    await view.unmount();
  }
});

test("an upload answer without librarySource is never guessed: the complete shelf is refreshed", async () => {
  const view = await mount();
  try {
    // A complete private upload receipt may lack provenance; refresh the shelf instead of guessing it.
    const artifact = structuredClone(JSON.parse(readFileSync(new URL("./fixtures/oceanleo-artifact-library-pages.json", import.meta.url), "utf8")).mineOwnerAPage.items[0]);
    artifact.artifact_id = "fresh";
    artifact.revision_id = "fresh-r1";
    artifact.title = "fresh";
    artifact.owner.principal_id = "user-1";
    delete artifact.library_source;
    delete artifact.librarySource;
    for (const rendition of Object.values(artifact.renditions)) rendition.revision_id = "fresh-r1";
    globalThis.__lu.uploadResponses.push({
      ok: true, data: { file: { artifact_id: "fresh", revision_id: "fresh-r1", artifact } },
    });
    globalThis.__lu.items = [...ITEMS, item("fresh", "upload")];
    globalThis.__lu.mineCalls = [];
    const input = view.container.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { configurable: true, value: [new window.File(["z"], "fresh.txt")] });
    await act(async () => {
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await settle();
    assert.equal(view.container.querySelectorAll("[data-library-section]").length, 0);
    assert.equal(view.container.querySelector('[role="alert"]'), null, view.container.textContent);
    assert.ok(globalThis.__lu.mineCalls.length > 0);
    assert.equal(globalThis.__lu.items.find(item => item.artifactId === "fresh").artifact.librarySource, "upload");
    assert.ok(globalThis.__lu.mineCalls.every(call => call.source === null));
    assert.ok(view.shown().includes("fresh"), view.shown().join(","));
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// The data path below MyLibrary: the projection normalizer keeps `librarySource`, the client sends `source=`.
// ---------------------------------------------------------------------------

const contractUrl = await compileModule("src/shell/artifact-contract.ts", {});
const { librarySourceFromWire, LIBRARY_SOURCES, normalizeArtifactProjection } = await import(contractUrl);

test("librarySource on the wire: the four values pass, anything else is null", () => {
  assert.deepEqual([...LIBRARY_SOURCES], ["creation", "upload", "leobay", "leochat"]);
  for (const value of LIBRARY_SOURCES) assert.equal(librarySourceFromWire(value), value);
  for (const value of [undefined, null, "", "Upload", "bay", 3]) assert.equal(librarySourceFromWire(value), null);
});

test("the projection normalizer keeps librarySource (camel or snake) and says null when absent", () => {
  const raw = {
    schema: "oceanleo.artifact.v1",
    artifactId: "doc-1",
    revisionId: "doc-1-r1",
    artifactType: "document",
    roles: [],
    owner: { principalId: "user-1", visibility: "private", originSiteKey: "home" },
    access: { canRead: true, canPreview: true, canEdit: true, canFork: true, canInsert: true, canReplace: true, canFavorite: true, canBind: true, canExportSource: true },
    editability: "native",
    sourceFormat: "docx",
    title: "doc-1",
    favorite: false,
    renditions: {},
    provenance: { id: "prov-doc-1", sourceKind: "owned", licenseCode: "owned", licenseUrl: "", attribution: "" },
    bindings: [],
    integrity: { ok: true, code: "ok", reason: "" },
  };
  assert.equal(normalizeArtifactProjection({ ...raw, librarySource: "upload" }).librarySource, "upload");
  assert.equal(normalizeArtifactProjection({ ...raw, library_source: "leobay" }).librarySource, "leobay");
  assert.equal(normalizeArtifactProjection(raw).librarySource, null);
  assert.equal(normalizeArtifactProjection({ ...raw, librarySource: "elsewhere" }).librarySource, null);
});

const clientUrl = await compileModule("src/shell/artifact-client.ts", {
  "../lib/auth/client": dataModule(`export async function accessToken(){ return "lu-token"; }`),
  "../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://api.test";`),
});
const { listMyArtifacts } = await import(clientUrl);

test("listMyArtifacts sends source= for a section and leaves the request unchanged without one", async () => {
  const seen = [];
  globalThis.fetch = async (input) => {
    seen.push(new URL(String(input)));
    return {
      ok: true,
      status: 200,
      json: async () => ({ scope: "mine", ownerPrincipalId: "user-1", total: 0, invalidCount: 0, items: [] }),
    };
  };
  const result = await listMyArtifacts({ source: "upload", limit: 10 });
  assert.equal(result.ok, true, result.error);
  assert.equal(seen[0].pathname, "/v1/library/mine");
  assert.deepEqual(Object.fromEntries(seen[0].searchParams), { limit: "10", source: "upload" });
  await listMyArtifacts({ limit: 10 });
  assert.deepEqual(Object.fromEntries(seen[1].searchParams), { limit: "10" });
});
