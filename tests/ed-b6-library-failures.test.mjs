import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasPath = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasPath];
require.cache[canvasPath] = { id: canvasPath, filename: canvasPath, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasPath] = previousCanvas;
else delete require.cache[canvasPath];
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://p-test.dev.oceanleo.com/library", pretendToBeVisual: true });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const reactUrl = pathToFileURL(require.resolve("react")).href;
const hImport = `import {createElement as h} from ${JSON.stringify(reactUrl)};`;
const { MyLibrary } = await import(await compileModule("src/shell/MyLibrary.tsx", {
  "./StorageCapacityStrip": dataModule("export const StorageCapacityStrip=()=>null;"),
  "./library-import": dataModule("export const LibraryImportDialog=()=>null; export const LibraryUploadQueue=()=>null; export const LibraryPurchasedUpdates=()=>null;"),
  "../i18n/ui/useUI": dataModule("const tt=text=>text; export const useUI=()=>tt;"),
  "../lib/auth/client": dataModule(`
    export const AUTH_STATE_EVENT="oceanleo:auth-state";
    export async function accessToken(){return null;}
    export function cachedAccessToken(){return null;}
    export function browserClient(){return null;}
    export async function getUserId(){return globalThis.__edB6.user;}
    export async function getUserIdSnapshot(){return {available:true,userId:globalThis.__edB6.user};}
  `),
  "./AppPageHeader": dataModule('export const APP_PAGE_TITLE_CLASS="";'),
  "./LibraryLayout": dataModule(`${hImport} export const LibraryToolbar=({actions})=>h('div',null,actions);`),
  "./collection-chrome": dataModule('export const COLLECTION_ACTION_BTN_PRIMARY=""; export const COLLECTION_ACTION_BTN_GHOST=""; export const CollectionFilterRow=()=>null; export const CollectionFilterSelect=()=>null;'),
  "../lib/database": dataModule('export const humanLibraryUploadError=String; export async function normalizeUploadIdempotencyKey(){return "key";} export async function uploadFile(){throw Error("unexpected upload");}'),
  "./library-data": dataModule(`
    export const artifactProjectionToLibraryItem=x=>x;
    export const artifactTypeForLibraryKind=()=>"document";
    export const inferLibraryKind=()=>"document";
    export const isDurableLibraryItem=x=>Boolean(x?.artifactId&&x?.revisionId&&x?.artifact);
    export const isUploadedLibraryItem=()=>false;
    export const libraryItemIdentityKey=x=>x.artifactId||x.key;
    export const libraryItemSection=x=>x.artifact?.librarySource||"creation";
    export const sortLibraryItems=x=>[...x];
  `),
  "./library-scope": dataModule(`${hImport} export const LibraryScope=({header,children})=>h('div',null,header,children);`),
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT="oceanleo:artifact-library-change";
    export const ensureArtifact=async()=>{throw Error("unexpected write");};
    export const retireArtifact=async()=>{throw Error("unexpected write");};
    export const listMyArtifacts=async(options={})=>globalThis.__edB6.list("mine",options);
    export const listFavoriteArtifacts=async(options={})=>globalThis.__edB6.list("favorites",options);
    export const getCurrentArtifactItem=async(id,signal)=>globalThis.__edB6.detail(id,signal);
  `),
  "./library-current-identity": dataModule(`
    export const clearLibraryCurrentIdentity=()=>{};
    export const setLibraryCurrentIdentity=()=>{};
    export const getLibraryCurrentIdentity=()=>null;
    export const rememberOpenedLibraryItem=()=>{};
    export const libraryCurrentIdentityFromSearch=search=>{const id=new URLSearchParams(search).get("item");return id?{artifactId:id,entryId:""}:null;};
  `),
  "./library-drop": dataModule("export const LibraryDropOverlay=()=>null; export const useLibraryDrop=()=>({dragging:false,dropProps:{}});"),
  "./dropped-entries": dataModule("export const canPickFolder=()=>false; export const foldersFromDirectoryInput=()=>[];"),
  "./library-edit-landing": dataModule('export const libraryStandaloneEditorBinding=()=>({siteId:"home",appId:"library"});'),
  "./artifact-contract": dataModule("export const artifactIsVisible=()=>true; export const isEnsureableTransient=()=>false; export const normalizeArtifactProjectionResult=()=>({ok:false}); export const ADVANCED_CAPABILITY_MATRIX=[];"),
  "./WorkspaceLibrary": dataModule(`${hImport}
    export const workspaceEntryFromLibraryItem=(item,options={})=>({id:item.artifactId||item.key,title:item.title,category:options.category,libraryItem:item});
    export function WorkspaceLibrary({entries=[],emptyTitle,emptyDescription,emptyCta,hasMore,onLoadMore,loadingMore}){
      return h('div',{'data-shelf':true},
        entries.length?null:h('div',{'data-empty':true},emptyTitle,emptyDescription,emptyCta),
        ...entries.map(entry=>h('p',{key:entry.id,'data-entry':entry.id},entry.title)),
        hasMore?h('button',{'data-next':true,onClick:onLoadMore,disabled:loadingMore},'next'):null);
    }
  `),
  "./advanced-session": dataModule("export const adoptSavedEditorItem=(_current,saved)=>saved;"),
  "./library-standalone-editor-host": dataModule(`${hImport} export const MaterialStandaloneEditor=({item})=>h('div',{'data-editor':item.artifactId});`),
  "./editor-preload": dataModule("export const preloadEditorFor=async()=>{};"),
  "./library-project-membership": dataModule(`
    import {createContext} from ${JSON.stringify(reactUrl)};
    export const LibraryProjectContext=createContext(new Map());
    export const loadProjectMemberships=async()=>[];
    export const projectNames=()=>[];
    export const loadLinkWorkItem=async(id,signal)=>globalThis.__edB6.link(id,signal);
  `),
  "./works/LinkWorkDialog": dataModule("export const LinkWorkDialog=()=>null;"),
  "../ui/menu/FloatingMenu": dataModule("export const FloatingMenu=()=>null; export const FloatingMenuItem=()=>null;"),
  "./library-chat-files": dataModule("export const listLibraryChatFiles=async()=>({ok:true,items:[]}); export const chatFileMatches=()=>false; export const chatFileLibraryItem=x=>x;"),
}));

function item(id, owner = "user-1") {
  return {
    id, artifactId: id, revisionId: `${id}-r1`, key: `artifact:${id}`, source: "artifact", title: id,
    artifactType: "document", kind: "document", siteId: "home", favorite: false, meta: {},
    artifact: { artifactId: id, revisionId: `${id}-r1`, librarySource: "creation", owner: { principalId: owner, visibility: "private" }, renditions: {} },
  };
}
const failure = status => ({ ok: false, status, code: status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "network-error", error: "read unavailable", retryable: true });
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
async function flush() { await act(pause); await act(pause); }
function newState() {
  return {
    user: "user-1", items: [item("saved")], favorites: [], calls: [], detailCalls: [], linkCalls: [],
    mineFailure: null, favoriteFailure: null, pageFailure: null, detailItem: null,
    async list(collection, options) {
      this.calls.push({ collection, ...options });
      const offset = Number(options.offset ?? options.cursor ?? 0);
      if (offset && this.pageFailure === collection && !options.artifactType) return failure(503);
      if (!offset && !options.artifactType && (collection === "mine" ? this.mineFailure : this.favoriteFailure)) return failure(collection === "mine" ? this.mineFailure : this.favoriteFailure);
      const all = collection === "mine" ? this.items : this.favorites;
      const filtered = options.artifactType ? all.filter(row => row.artifactType === options.artifactType) : all;
      const rows = filtered.slice(offset, offset + 100);
      return { ok: true, status: 200, data: { items: rows, ownerPrincipalId: this.user, nextCursor: offset + rows.length < filtered.length ? String(offset + rows.length) : null, total: filtered.length, invalidItems: [] } };
    },
    async detail(id) { this.detailCalls.push(id); return this.detailItem ? { ok: true, data: this.detailItem } : failure(404); },
    async link(id) { this.linkCalls.push(id); if (!this.detailItem) throw Error("项目更新失败，请重试。"); return this.detailItem; },
  };
}
async function mounted(run, props = {}, configure = () => {}) {
  const state = newState();
  configure(state);
  globalThis.__edB6 = state;
  window.history.replaceState(null, "", "/library");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    await act(async () => root.render(React.createElement(MyLibrary, props)));
    await flush();
    await run({ host, state, root });
  } finally {
    await act(async () => root.unmount());
    host.remove(); console.error = previousError; delete globalThis.__edB6;
  }
  assert.deepEqual(errors, [], "the real MyLibrary must render without console.error through every transition");
}
const stage = (host, value) => host.querySelector(`[data-library-failure-stage="${value}"]`);
async function retry(host, value) {
  const button = host.querySelector(`[data-library-retry="${value}"]`);
  assert.ok(button, `${value} has a retry action`);
  await act(async () => { button.click(); await pause(); });
  await flush();
}
async function refresh() {
  await act(async () => { window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change", { detail: { action: "changed" } })); await pause(); });
  await flush();
}

test("mine first-load failure exposes the list retry and recovers", () => mounted(async ({ host, state }) => {
  assert.match(host.querySelector("[data-empty]").textContent, /暂时无法加载我的库/);
  assert.equal(stage(host, "intent"), null);
  state.mineFailure = null;
  await retry(host, "mine");
  assert.ok(host.querySelector('[data-entry="saved"]'));
  assert.equal(host.querySelector('[data-library-retry="mine"]'), null);
}, {}, state => { state.mineFailure = 503; }));

test("mine refresh retains the verified snapshot and names only list refresh", () => mounted(async ({ host, state }) => {
  state.mineFailure = 503; await refresh();
  assert.ok(host.querySelector('[data-entry="saved"]'));
  assert.match(stage(host, "mine").textContent, /显示上次成功加载的作品/);
  assert.equal(stage(host, "pagination"), null);
  state.mineFailure = null; await retry(host, "mine");
  assert.equal(stage(host, "mine"), null);
}));

test("favorites failure keeps mine usable and recovers independently of an entry error", () => mounted(async ({ host, state }) => {
  assert.ok(host.querySelector('[data-entry="saved"]'));
  assert.match(stage(host, "favorites").textContent, /收藏素材服务暂时不可用/);
  assert.equal(stage(host, "mine"), null);
  assert.ok(stage(host, "intent"));
  state.favoriteFailure = null; await retry(host, "favorites");
  assert.equal(stage(host, "favorites"), null);
  assert.ok(stage(host, "intent"), "successful list reads cannot clear the missing-entry error");
}, { pageTitle: "我的库", action: { nonce: "favorite-and-intent", action: { version: 1, tab: "mine", intent: "open", itemId: "missing" } } }, state => { state.favoriteFailure = 503; }));

for (const collection of ["mine", "favorites"]) {
  test(`${collection} page failure names page 2, retries its cursor, and keeps entry errors`, () => mounted(async ({ host, state }) => {
    await act(async () => { host.querySelector("[data-next]").click(); await pause(); }); await flush();
    const banner = stage(host, "pagination");
    assert.match(banner.textContent, collection === "mine" ? /作品第 2 页/ : /收藏第 2 页/);
    assert.equal(banner.dataset.libraryFailurePage, "2");
    assert.equal(stage(host, "mine"), null);
    assert.doesNotMatch(banner.textContent, /列表暂未刷新/);
    assert.ok(stage(host, "intent"));
    const callsBeforeRetry = state.calls.length;
    state.pageFailure = null; await retry(host, "pagination");
    const retried = state.calls.slice(callsBeforeRetry).filter(call => call.collection === collection && !call.artifactType);
    assert.equal(retried[0].cursor, "100");
    assert.ok(host.querySelector(`[data-entry="${collection}-100"]`));
    assert.equal(stage(host, "pagination"), null);
    assert.ok(stage(host, "intent"));
  }, { action: { nonce: `page-and-intent-${collection}`, action: { version: 1, tab: "mine", intent: "open", itemId: "missing" } } }, state => {
    const rows = Array.from({ length: 101 }, (_, index) => item(`${collection}-${index}`));
    rows.forEach(row => { row.artifactType = "image"; row.kind = "image"; });
    if (collection === "mine") state.items = rows; else state.favorites = rows;
    state.pageFailure = collection;
  }));
}

for (const intent of ["open", undefined]) {
  test(`${intent || "plain"} artifact 404 stays entry-scoped and retries without reloading the list`, () => mounted(async ({ host, state }) => {
    assert.match(stage(host, "intent").textContent, /这份条目已不存在或无法访问/);
    assert.ok(host.querySelector('[data-library-entry-error]'));
    assert.equal(host.querySelector('[data-library-list-failures] [data-library-failure-stage="intent"]'), null);
    assert.equal(stage(host, "mine"), null);
    assert.doesNotMatch(host.textContent, /显示上次成功加载|列表暂未刷新/);
    const listCalls = state.calls.length;
    state.detailItem = item("recovered"); await retry(host, "intent");
    assert.equal(stage(host, "intent"), null);
    assert.ok(host.querySelector('[data-entry="recovered"]'));
    assert.equal(state.calls.length, listCalls, "entry retry only reads the entry");
    assert.equal(state.detailCalls.length, 2);
  }, { pageTitle: "我的库", action: { nonce: `missing-${intent}`, action: { version: 1, tab: "mine", itemId: "missing", ...(intent ? { intent } : {}) } } }));
}

test("link-work read error stays entry-scoped and recovers through the same link route", () => mounted(async ({ host, state }) => {
  assert.ok(stage(host, "intent")); assert.equal(stage(host, "mine"), null);
  assert.doesNotMatch(host.textContent, /显示上次成功加载|列表暂未刷新/);
  state.detailItem = item("recovered-link"); await retry(host, "intent");
  assert.equal(stage(host, "intent"), null);
  assert.ok(host.querySelector('[data-entry="recovered-link"]'));
  assert.deepEqual(state.linkCalls, ["missing", "missing"]);
  assert.deepEqual(state.detailCalls, []);
}, { pageTitle: "我的库", action: { nonce: "missing-link", action: { version: 1, tab: "mine", itemId: "link-work:missing" } } }));

test("successful list refresh preserves the unresolved intent error and successful intent retry preserves list failure", () => mounted(async ({ host, state }) => {
  await refresh(); assert.ok(stage(host, "intent"));
  state.mineFailure = 503; await refresh();
  assert.ok(stage(host, "mine")); assert.ok(stage(host, "intent"));
  state.detailItem = item("recovered"); await retry(host, "intent");
  assert.equal(stage(host, "intent"), null);
  assert.ok(stage(host, "mine"), "opening an item does not claim that a failed list refresh recovered");
}, { action: { nonce: "independent-errors", action: { version: 1, tab: "mine", intent: "open", itemId: "missing" } } }));

for (const [status, expected] of [[403, /当前账号暂时无法读取/], [503, /维护或过载/]]) {
  test(`mine ${status} explains the service or account failure`, () => mounted(async ({ host }) => {
    assert.match(host.querySelector("[data-empty]").textContent, expected);
  }, {}, state => { state.mineFailure = status; }));
}

test("short pages count successful requests and a network failure never claims owner mismatch", () => mounted(async ({ host, state }) => {
  for (let page = 2; page <= 3; page += 1) {
    await act(async () => { host.querySelector("[data-next]").click(); await pause(); });
    await flush();
    if (page === 2) continue;
    assert.equal(stage(host, "pagination").dataset.libraryFailurePage, "3");
    assert.doesNotMatch(stage(host, "pagination").textContent, /归属/);
  }
  state.pageFailure = null;
  await retry(host, "pagination");
  assert.equal(stage(host, "pagination"), null);
}, {}, state => {
  const original = state.list;
  state.pageFailure = "mine";
  state.list = async function(collection, options) {
    if (collection !== "mine" || options.artifactType) return original.call(this, collection, options);
    const offset = Number(options.cursor || 0);
    if (offset === 2 && this.pageFailure) return failure(503);
    const row = item(`short-${offset}`); row.artifactType = "image"; row.kind = "image";
    return { ok: true, status: 200, data: { items: [row], ownerPrincipalId: this.user, nextCursor: offset < 2 ? String(offset + 1) : null, total: 3, invalidItems: [] } };
  };
}));
