// 2026-11-07 UX wave, unit LU: Library's four sections (我的创作 / 上传的 / 来自 LeoBay / 来自 LeoChat) and
// drag-drop upload. Operator ruling (rulings §4 "Computer-task UX wave" (6)); contract §2.4: every Library list
// item carries `librarySource`, the list route filters with `source=`. No browser (ruling 2026-11-06): jsdom +
// stubbed neighbours, the real MyLibrary / library-sections / library-drop / dropped-entries.

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
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "../lib/auth/client": dataModule(`
    export const AUTH_STATE_EVENT = "oceanleo:auth-state";
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
    export function WorkspaceLibrary({entries = [], emptyTitle}){
      return h("div", {"data-grid": ""},
        entries.length === 0 ? h("div", {"data-empty-title": ""}, emptyTitle) : null,
        ...entries.map((entry) => h("span", {key: entry.id, "data-library-item": entry.id}, entry.title)));
    }
  `),
  "./LibraryChatFiles": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function LibraryChatFiles({query, category, view, artifacts = [], onOpenArtifact}){
      return h("div", {"data-chat-files-stub": "", "data-query": query, "data-category": category, "data-view": view,
        "data-artifacts": artifacts.map((item) => item.artifactId).join(",")},
        ...artifacts.map((item) => h("button", {key: item.artifactId, "data-open-artifact": item.artifactId, onClick: () => onOpenArtifact?.(item)})));
    }
  `),
  "./library-folder-upload": dataModule(`
    export async function uploadDroppedFolder(folder, { onPhase } = {}){
      onPhase?.("zipping");
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
    selected: () => container.querySelector('[data-library-section][aria-selected="true"]')?.getAttribute("data-library-section"),
    click: async (section) => {
      await act(async () => container.querySelector(`[data-library-section="${section}"]`).click());
      await settle();
    },
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

test("four sections in order; 我的创作 is the default and the list is read with source=creation", async () => {
  const view = await mount();
  try {
    const labels = [...view.container.querySelectorAll("[data-library-section]")].map((node) => node.textContent);
    assert.deepEqual(labels, ["我的创作", "上传的", "来自 LeoBay", "来自 LeoChat"]);
    assert.equal(view.selected(), "creation");
    assert.deepEqual(view.shown(), ["made-1", "made-2"]);
    // Every /v1/library/mine read (documents, pdfs, mixed page) asks for the section.
    assert.ok(view.mineCalls?.length !== 0);
    assert.deepEqual([...new Set(globalThis.__lu.mineCalls.map((call) => call.source))], ["creation"]);
  } finally {
    await view.unmount();
  }
});

test("the old 「仅看上传」 view toggle is gone (上传的 is the section)", async () => {
  const view = await mount();
  try {
    const options = view.container.querySelector("[data-view-options]").getAttribute("data-view-options");
    assert.equal(options, "仅看收藏");
  } finally {
    await view.unmount();
  }
});

test("clicking a section re-reads that section and shows only its items", async () => {
  const view = await mount();
  try {
    globalThis.__lu.mineCalls = [];
    await view.click("upload");
    assert.equal(view.selected(), "upload");
    assert.deepEqual(view.shown(), ["up-1"]);
    assert.ok(globalThis.__lu.mineCalls.length > 0);
    assert.ok(globalThis.__lu.mineCalls.every((call) => call.source === "upload"));
    await view.click("leobay");
    assert.deepEqual(view.shown(), ["bay-1"]);
    assert.equal(view.container.querySelector("[data-empty-title]"), null);
  } finally {
    await view.unmount();
  }
});

test("an item without librarySource is placed in no section (the client never guesses one)", async () => {
  const view = await mount();
  try {
    for (const section of ["creation", "upload", "leobay"]) {
      await view.click(section);
      assert.ok(!view.shown().includes("no-section"), section);
    }
  } finally {
    await view.unmount();
  }
});

test("favorites are read without source= and sorted into sections by their own librarySource", async () => {
  const favorites = [item("fav-bay", "leobay", { favorite: true }), item("fav-made", "creation", { favorite: true })];
  const view = await mount({}, { items: [], favorites });
  try {
    assert.ok(globalThis.__lu.favoriteCalls.every((call) => call.source === null));
    assert.deepEqual(view.shown(), ["fav-made"]);
    await view.click("leobay");
    assert.deepEqual(view.shown(), ["fav-bay"]);
  } finally {
    await view.unmount();
  }
});

test("empty sections say which section is empty", async () => {
  const view = await mount({}, { items: [item("made-1", "creation")] });
  try {
    await view.click("upload");
    assert.equal(view.container.querySelector("[data-empty-title]").textContent, "还没有上传的文件");
    await view.click("leobay");
    assert.equal(view.container.querySelector("[data-empty-title]").textContent, "还没有来自 LeoBay 的内容");
  } finally {
    await view.unmount();
  }
});

test("来自 LeoChat shows the chat files view with the page's search, type and view; no artifact grid", async () => {
  const view = await mount();
  try {
    await view.click("leochat");
    const chat = view.container.querySelector("[data-chat-files-stub]");
    assert.ok(chat, view.container.innerHTML.slice(0, 600));
    assert.equal(chat.getAttribute("data-category"), "all");
    assert.equal(chat.getAttribute("data-view"), "grid");
    assert.equal(view.container.querySelector("[data-grid]"), null);
  } finally {
    await view.unmount();
  }
});

test("来自 LeoChat also lists Library artifacts tagged leochat (ANSWER LU-1) and opens them like any Library item", async () => {
  const opened = [];
  const view = await mount({ onOpenItem: (picked) => opened.push(picked.artifactId) }, { items: [...ITEMS, item("chat-card", "leochat")] });
  try {
    await view.click("leochat");
    assert.ok(globalThis.__lu.mineCalls.some((call) => call.source === "leochat"));
    const chat = view.container.querySelector("[data-chat-files-stub]");
    assert.equal(chat.getAttribute("data-artifacts"), "chat-card");
    await act(async () => view.container.querySelector('[data-open-artifact="chat-card"]').click());
    assert.deepEqual(opened, ["chat-card"]);
  } finally {
    await view.unmount();
  }
});

test("a chat upload that opens Library with filter=uploaded lands on 上传的", async () => {
  const view = await mount({
    action: { nonce: "chat-upload-1", action: { version: 1, tab: "mine", filter: "uploaded", itemId: "up-1" } },
  });
  try {
    assert.equal(view.selected(), "upload");
    assert.deepEqual(view.shown(), ["up-1"]);
  } finally {
    await view.unmount();
  }
});

test("controlled section: the host owns it, a click reports it, and supplementalSection gets the section", async () => {
  const reported = [];
  const seen = [];
  const supplementalSection = ({ section }) => {
    seen.push(section);
    return section === "upload" ? React.createElement("div", { "data-strip": "" }) : null;
  };
  const view = await mount({ section: "creation", onSectionChange: (next) => reported.push(next), supplementalSection });
  try {
    assert.equal(view.container.querySelector("[data-strip]"), null);
    await view.click("upload");
    assert.deepEqual(reported, ["upload"]);
    // Still the host's value until it changes the prop.
    assert.equal(view.selected(), "creation");
    await view.render({ section: "upload", onSectionChange: (next) => reported.push(next), supplementalSection });
    assert.equal(view.selected(), "upload");
    assert.ok(view.container.querySelector("[data-strip]"));
    assert.ok(seen.includes("upload"));
  } finally {
    await view.unmount();
  }
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

test("dropped files are uploaded with the existing private upload and the page moves to 上传的", async () => {
  const view = await mount();
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
    assert.equal(view.selected(), "upload");
    assert.equal(view.container.querySelector("[data-library-drop-overlay]"), null);
  } finally {
    await view.unmount();
  }
});

test("a dropped folder goes to the folder upload (zip → 文件包), not to the file upload", async () => {
  const view = await mount();
  try {
    const a = new window.File(["a"], "a.md");
    const b = new window.File(["b"], "b.md");
    const folder = dirEntry("Brand kit", [fileEntry(a), dirEntry("assets", [fileEntry(b)])]);
    const zone = view.container.querySelector("[data-library-drop-zone]");
    await dispatchDrag(zone, "drop", transfer([folder]));
    await settle();
    assert.deepEqual(globalThis.__lu.folderUploads, [{ name: "Brand kit", paths: ["a.md", "assets/b.md"] }]);
    assert.equal(globalThis.__lu.uploads.length, 0);
    assert.equal(view.selected(), "upload");
  } finally {
    await view.unmount();
  }
});

test("a folder upload error is shown as returned", async () => {
  const view = await mount();
  try {
    globalThis.__lu.folderResponses.push({ ok: false, error: "文件夹太大：压缩后超过 20 MB" });
    const zone = view.container.querySelector("[data-library-drop-zone]");
    await dispatchDrag(zone, "drop", transfer([dirEntry("Huge", [fileEntry(new window.File(["x"], "x.bin"))])]));
    await settle();
    assert.equal(view.container.querySelector('[role="alert"]')?.textContent, "文件夹太大：压缩后超过 20 MB");
  } finally {
    await view.unmount();
  }
});

test("an upload answer without librarySource is not guessed into a section: the list is re-read", async () => {
  const view = await mount();
  try {
    // The upload answer is canonical but carries no section; the re-read places it (server says upload).
    globalThis.__lu.uploadResponses.push({
      ok: true,
      data: { file: { artifact_id: "fresh", revision_id: "fresh-r1" } },
    });
    globalThis.__lu.items = [...ITEMS, item("fresh", "upload")];
    globalThis.__lu.mineCalls = [];
    const input = view.container.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { configurable: true, value: [new window.File(["z"], "fresh.txt")] });
    await act(async () => {
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await settle();
    assert.equal(view.selected(), "upload");
    assert.ok(globalThis.__lu.mineCalls.some((call) => call.source === "upload"));
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
