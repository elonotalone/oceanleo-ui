import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
const { createRoot } = await import("react-dom/client");
import { NavigatorLockAcquireTimeoutError } from "@supabase/supabase-js";
import { browserAuthLock } from "../src/lib/auth/refresh-lock.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasPath = fabricRequire.resolve("canvas");
const oldCanvas = require.cache[canvasPath];
require.cache[canvasPath] = {
  id: canvasPath,
  filename: canvasPath,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (oldCanvas) require.cache[canvasPath] = oldCanvas;
else delete require.cache[canvasPath];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://p-test.dev.oceanleo.com/library",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const libraryDataUrl = await compileModule("src/shell/library-data.ts", {
  "./artifact-contract": dataModule(`
    export function isArtifactSourceTreeUrl(){ return false; }
    export const POPULARITY_META_KEY = "popularity";
    export function popularityMetricsFromWire(){ return null; }
  `),
  "./workbench-capability-registry": dataModule(`
    export function editorRouteHintForArtifactCapability(){ return ""; }
  `),
});
const { libraryItemSourceBytes, sortLibraryItems } = await import(libraryDataUrl);

const editorPreloadUrl = await compileModule("src/shell/editor-preload.ts", {
  "./office-editor/office-source-cache": dataModule(`
    export function sourceHintForItem(item){ return {url:"https://source.example/" + item.artifactId,revision:item.revisionId}; }
    export async function prefetchOfficeSource(item){ globalThis.__preloadEvents.push("source:" + item.artifactId); return {ok:true}; }
  `),
  "./workbench-routes": dataModule(`
    export function editorCapabilityFor(){ return {adapter:"richdoc",route:{type:"richdoc"}}; }
  `),
  "./hosted-editor-origins": dataModule(`export function hostedEditorOrigins(){ return []; }`),
});
const editorPreload = await import(editorPreloadUrl);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function installLocks(locks) {
  const previous = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { ...window.navigator, locks },
  });
  return () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: previous,
    });
  };
}

test("refresh operation failure is propagated without stealing or replaying it", async () => {
  const requests = [];
  const restoreNavigator = installLocks({
    request(name, options, callback) {
      requests.push({ name, options });
      return Promise.resolve().then(() => callback({ name }));
    },
  });
  let executions = 0;
  const refreshFailure = new Error("refresh response rejected");
  try {
    await assert.rejects(
      browserAuthLock("auth-token", 100, async () => {
        executions += 1;
        throw refreshFailure;
      }),
      (error) => error === refreshFailure,
    );
    assert.equal(executions, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests.some(({ options }) => options.steal), false);
  } finally {
    restoreNavigator();
  }
});

test("busy zero-wait acquisition is a Supabase lock-timeout error, not an unlocked refresh", async () => {
  let requestOptions;
  let executions = 0;
  const restoreNavigator = installLocks({
    request(_name, options, callback) {
      requestOptions = options;
      return Promise.resolve().then(() => callback(null));
    },
  });
  try {
    await assert.rejects(
      browserAuthLock("auth-token", 0, async () => {
        executions += 1;
      }),
      (error) => error instanceof NavigatorLockAcquireTimeoutError,
    );
    assert.equal(requestOptions.ifAvailable, true);
    assert.equal(executions, 0);
  } finally {
    restoreNavigator();
  }
});

test("positive acquire timeout is normalized for Supabase without running unlocked", async () => {
  let executions = 0;
  const restoreNavigator = installLocks({
    request(_name, options) {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("lock request aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    },
  });
  try {
    await assert.rejects(
      browserAuthLock("auth-token", 5, async () => {
        executions += 1;
      }),
      (error) => error instanceof NavigatorLockAcquireTimeoutError,
    );
    assert.equal(executions, 0);
  } finally {
    restoreNavigator();
  }
});

test("acquire timeout stops when the lock callback starts", async () => {
  let optionsSeen;
  const restoreNavigator = installLocks({
    request(_name, options, callback) {
      optionsSeen = options;
      return Promise.resolve().then(() => callback({ name: "auth-token" }));
    },
  });
  try {
    assert.equal(
      await browserAuthLock("auth-token", 5, async () => {
        await delay(25);
        return "done";
      }),
      "done",
    );
    assert.equal(optionsSeen.signal.aborted, false);
  } finally {
    restoreNavigator();
  }
});

test("separate callers hold the same refresh lock one at a time", async () => {
  const tails = new Map();
  let active = 0;
  let peak = 0;
  const order = [];
  const restoreNavigator = installLocks({
    request(name, options, callback) {
      const previous = tails.get(name) || Promise.resolve();
      let release;
      const turn = new Promise((resolve) => {
        release = resolve;
      });
      const tail = previous.catch(() => undefined).then(() => turn);
      tails.set(name, tail);
      return previous
        .catch(() => undefined)
        .then(async () => {
          if (options.signal?.aborted) {
            const error = new Error("lock request aborted");
            error.name = "AbortError";
            throw error;
          }
          active += 1;
          peak = Math.max(peak, active);
          try {
            return await callback({ name });
          } finally {
            active -= 1;
            release();
            if (tails.get(name) === tail) tails.delete(name);
          }
        });
    },
  });
  try {
    await Promise.all([
      browserAuthLock("auth-token", 250, async () => {
        order.push("first-start");
        await delay(25);
        order.push("first-end");
      }),
      browserAuthLock("auth-token", 250, async () => {
        order.push("second-start");
        await delay(5);
        order.push("second-end");
      }),
    ]);
    assert.equal(peak, 1);
    assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
  } finally {
    restoreNavigator();
  }
});

const collectionChromeUrl = await compileModule("src/shell/collection-chrome.tsx", {
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "./AppPageHeader": dataModule(`export const APP_PAGE_HEADER_ROW_CLASS=""; export const APP_PAGE_TITLE_CLASS="";`),
});
const { CollectionViewOptions } = await import(collectionChromeUrl);

test("sort controls expose favorite/time/size and a direction toggle", async () => {
  const { useState, createElement: h } = await import(reactUrl);
  function Harness() {
    const [sort, setSort] = useState({ by: "none", direction: "desc" });
    return h(CollectionViewOptions, {
      options: [],
      sort,
      onSortChange: setSort,
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(h(Harness)));
    await act(async () => container.querySelector("[data-collection-view-options]").click());
    const select = container.querySelector("[data-collection-sort]");
    assert.deepEqual(
      [...select.querySelectorAll("option")].map((option) => option.value),
      ["none", "favorite", "time", "size"],
    );
    await act(async () => {
      select.value = "favorite";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(container.querySelector("[data-collection-sort]").value, "favorite");
    assert.equal(container.querySelector("[data-collection-sort-direction]")?.textContent, "降序");
    await act(async () => container.querySelector("[data-collection-sort-direction]").click());
    assert.equal(container.querySelector("[data-collection-sort-direction]")?.textContent, "升序");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("library sort uses favorite, created time, and source/upload bytes only", () => {
  const source = item("source-size", "user-1", "Source size");
  source.artifact.renditions.source = { byteSize: 50 };
  source.artifact.renditions.thumbnail = { byteSize: 999_999 };
  source.meta.bytes = 1_000_000;
  const upload = item("uploaded-size", "user-1", "Uploaded size");
  upload.meta.file_size = 100;
  const genericUpload = item("generic-upload-size", "user-1", "Generic upload");
  genericUpload.meta.bytes = 10;
  const oldest = item("oldest", "user-1", "Oldest");
  oldest.createdAt = "2026-01-01T00:00:00.000Z";
  const newest = item("newest", "user-1", "Newest");
  newest.createdAt = "2026-10-01T00:00:00.000Z";
  const unknownTime = item("unknown-time", "user-1", "Unknown time");
  unknownTime.createdAt = undefined;
  const favorite = item("favorite", "user-1", "Favorite");
  favorite.favorite = true;

  assert.equal(libraryItemSourceBytes(source), 50);
  assert.deepEqual(
    sortLibraryItems([source, upload, genericUpload], { by: "size", direction: "asc" })
      .map((entry) => entry.artifactId),
    ["generic-upload-size", "source-size", "uploaded-size"],
  );
  assert.deepEqual(
    sortLibraryItems([oldest, newest, unknownTime], { by: "time", direction: "desc" })
      .map((entry) => entry.artifactId),
    ["newest", "oldest", "unknown-time"],
  );
  assert.deepEqual(
    sortLibraryItems([oldest, favorite], { by: "favorite", direction: "desc" })
      .map((entry) => entry.artifactId),
    ["favorite", "oldest"],
  );
});

const myLibraryUrl = await compileModule("src/shell/MyLibrary.tsx", {
  "./AgentChat": dataModule(`export function AgentChat({workspaceContent}) { return workspaceContent; }`),
  "./WorkspaceSession": dataModule(`export function useOptionalWorkspaceSession(){return null;} export function WorkspaceSessionProvider({children}){return children;}`),
  "../i18n/ui/useUI": dataModule(`export function useUI(){ return (value) => value; }`),
  "../lib/auth/client": dataModule(`
    export const AUTH_STATE_EVENT = "oceanleo:auth-state";
    export async function getUserId(){ return globalThis.__libraryUserId ?? null; }
    export async function getUserIdSnapshot(){ return {available:globalThis.__libraryAuthAvailable !== false,userId:globalThis.__libraryUserId ?? null}; }
  `),
  "./AppPageHeader": dataModule(`export const APP_PAGE_TITLE_CLASS = "";`),
  "./LibraryLayout": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function LibraryToolbar({placeholder,sort,onSortChange,actions}){
      return h("div", null,
        h("input", {"data-library-search":"", placeholder}),
        actions,
        h("span", {"data-current-sort":sort?.by || "none"}),
        h("button", {"data-sort-size":"", onClick:()=>onSortChange?.({by:"size",direction:"asc"})}, "size"),
        h("button", {"data-sort-time":"", onClick:()=>onSortChange?.({by:"time",direction:"desc"})}, "time")
      );
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
    export async function uploadFile(file,options){
      globalThis.__uploadCalls.push({name:file.name,size:file.size,...options});
      return globalThis.__uploadResponses.shift() || {ok:false,status:503,error:"temporary",retryable:true};
    }
  `),
  "./library-data": dataModule(`
    export function artifactProjectionToLibraryItem(value){ return value; }
    export function artifactTypeForLibraryKind(){ return "document"; }
    export function inferLibraryKind(){ return "document"; }
    export function isDurableLibraryItem(item){ return Boolean(item?.artifactId && item?.revisionId && item?.artifact); }
    export function libraryItemIdentityKey(item){ return String(item?.artifactId || item?.id || ""); }
    export function sortLibraryItems(items){ return [...items]; }
  `),
  "./library-scope": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function LibraryScope({header,children}){ return h("div",null,header,children); }
  `),
  "./artifact-client": dataModule(`
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
    export async function ensureArtifact(){ globalThis.__ensureCalls += 1; return {ok:false}; }
    export async function retireArtifact(){ return {ok:true}; }
    export async function listMyArtifacts(options={}){
      const state = globalThis.__libraryRequestState;
      state.calls += 1;
      if (state.failMine && !options.artifactType) return {ok:false,status:state.mineFailureStatus || 503,code:state.mineFailureStatus === 401 ? "unauthorized" : "network-error",error:"temporary auth refresh failure",retryable:true};
      const items = globalThis.__libraryItems || [];
      const filtered = options.artifactType ? items.filter((item) => item.artifactType === options.artifactType) : items;
      const offset = Number(options.offset ?? options.cursor ?? 0);
      const pageSize = Number(options.limit ?? 100);
      let page = filtered.slice(offset, offset + pageSize);
      if (state.duplicateAtOffset === offset && filtered.length > offset) page = [filtered[0]];
      const nextOffset = offset + page.length;
      const nextCursor = state.stopAtOffset === offset || nextOffset >= filtered.length ? null : String(nextOffset);
      return {ok:true,status:200,data:{items:page,nextCursor,total:filtered.length,ownerPrincipalId:globalThis.__libraryOwnerId,invalidItems:[]}};
    }
    export async function listFavoriteArtifacts(options={}){
      const items = globalThis.__libraryFavorites || [];
      const offset = Number(options.offset ?? options.cursor ?? 0);
      const pageSize = Number(options.limit ?? 100);
      const page = items.slice(offset, offset + pageSize);
      const nextOffset = offset + page.length;
      const nextCursor = nextOffset >= items.length ? null : String(nextOffset);
      return {ok:true,status:200,data:{items:page,nextCursor,total:items.length,ownerPrincipalId:globalThis.__libraryOwnerId,invalidItems:[]}};
    }
  `),
  "./library-current-identity": dataModule(`
    export function clearLibraryCurrentIdentity(){}
    export function getLibraryCurrentIdentity(){ return null; }
    export function rememberOpenedLibraryItem(){}
  `),
  "./library-edit-intent": dataModule(`
    import { useEffect, useRef } from "${reactUrl}";
    export function useLibraryEditIntent({action,onFailure}){
      const handled = useRef("");
      useEffect(() => {
        if (!action?.nonce || handled.current === action.nonce || !globalThis.__detailFailureEnabled) return;
        const timer = setTimeout(() => {
          handled.current = action.nonce;
          onFailure({status:0,message:"detail request failed"});
        }, 10);
        return () => clearTimeout(timer);
      }, [action?.nonce, onFailure]);
    }
  `),
  "./library-edit-landing": dataModule(`export function libraryStandaloneEditorBinding(){ return {siteId:"home",appId:"library"}; }`),
  "./artifact-contract": dataModule(`
    export function artifactIsVisible(){ return true; }
    export function isEnsureableTransient(){ return false; }
    export function normalizeArtifactProjectionResult(){ return {ok:false}; }
    export const ADVANCED_CAPABILITY_MATRIX = [];
  `),
  "./editor-preload": editorPreloadUrl,
  "./WorkspaceLibrary": dataModule(`
    import { createElement as h } from "${reactUrl}";
    export function workspaceEntryFromLibraryItem(item, options={}){
      return {id:item.artifactId,title:item.title,kind:item.kind,category:options.category,description:options.description,keywords:options.keywords,libraryItem:item};
    }
    export function WorkspaceLibrary({entries=[],onOpenItem,onDetailItemChange,onLoadMore,hasMore,loadingMore,searchPlaceholder,emptyTitle,emptyCta}){
      return h("div",{"data-library-items":entries.length},
        h("input", {"data-workspace-search":"", placeholder:searchPlaceholder}),
        entries.length === 0 ? h("div", {"data-empty-title":""}, emptyTitle, emptyCta) : null,
        ...entries.map((entry) => h("button",{key:entry.id,"data-library-item":entry.id,onClick:()=>onOpenItem?.(entry.libraryItem)},entry.title)),
        ...entries.map((entry) => h("button",{key:"preview-" + entry.id,"data-preview-item":entry.id,onClick:()=>onDetailItemChange?.(entry.libraryItem)},"preview")),
        hasMore ? h("button",{"data-library-next":"",onClick:onLoadMore,disabled:loadingMore},"next") : null
      );
    }
  `),
  "./advanced-session": dataModule(`export function adoptSavedEditorItem(_current,saved){ return saved; }`),
  "./AdvancedContentWorkbench": dataModule(`
    import { createElement as h, useEffect } from "${reactUrl}";
    export function AdvancedContentWorkbench({item}){
      useEffect(() => { globalThis.__editorMounts += 1; globalThis.__preloadEvents.push("editor-mounted"); return () => { globalThis.__editorUnmounts += 1; }; }, []);
      return h("div",{"data-editor":item.artifactId || item.id});
    }
  `),
});
const { MyLibrary } = await import(myLibraryUrl);

function item(artifactId, ownerId, title = artifactId, options = {}) {
  const revisionId = `${artifactId}-r1`;
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title,
    kind: "document",
    artifactType: "document",
    siteId: "home",
    favorite: options.favorite ?? false,
    createdAt: options.createdAt ?? "2026-10-21T08:00:00.000Z",
    meta: options.uploadedBytes === undefined ? {} : { bytes: options.uploadedBytes },
    artifactId,
    revisionId,
    artifact: {
      schema: "oceanleo.artifact.v1",
      artifactId,
      revisionId,
      owner: { principalId: ownerId, visibility: "private" },
      renditions: {
        ...(options.sourceBytes === undefined ? {} : { source: { byteSize: options.sourceBytes } }),
        ...(options.thumbnailBytes === undefined ? {} : { thumbnail: { byteSize: options.thumbnailBytes } }),
      },
    },
  };
}

async function flushReact() {
  await act(async () => {
    await delay(0);
  });
  await act(async () => {
    await delay(0);
  });
}

async function withLibrary(run, { items = null, favorites = [], failMine = false, action = null, detailFailure = false } = {}) {
  globalThis.__libraryUserId = "user-1";
  globalThis.__libraryOwnerId = "user-1";
  globalThis.__libraryAuthAvailable = true;
  globalThis.__libraryItems = items || [item("artifact-a", "user-1", "Saved document")];
  globalThis.__libraryFavorites = favorites;
  globalThis.__detailFailureEnabled = detailFailure;
  globalThis.__libraryRequestState = { calls: 0, failMine };
  globalThis.__uploadCalls = [];
  globalThis.__uploadResponses = [];
  globalThis.__preloadEvents = [];
  globalThis.__ensureCalls = 0;
  globalThis.__editorMounts = 0;
  globalThis.__editorUnmounts = 0;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(MyLibrary, { action })));
    await flushReact();
    await run(container);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    delete globalThis.__libraryUserId;
    delete globalThis.__libraryOwnerId;
    delete globalThis.__libraryAuthAvailable;
    delete globalThis.__libraryItems;
    delete globalThis.__libraryFavorites;
    delete globalThis.__detailFailureEnabled;
    delete globalThis.__libraryRequestState;
    delete globalThis.__uploadCalls;
    delete globalThis.__uploadResponses;
    delete globalThis.__preloadEvents;
    delete globalThis.__ensureCalls;
    delete globalThis.__editorMounts;
    delete globalThis.__editorUnmounts;
  }
}

test("same-user token refresh keeps the loaded list and active editor mounted", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    const requestCount = globalThis.__libraryRequestState.calls;

    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:auth-state", {
        detail: { event: "TOKEN_REFRESHED", userId: "user-1" },
      }));
      await delay(0);
    });

    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    assert.equal(globalThis.__editorMounts, 1);
    assert.equal(globalThis.__editorUnmounts, 0);
    assert.equal(globalThis.__libraryRequestState.calls, requestCount);
  });
});

test("legacy identity-free auth announcements preserve same-user editor state", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    const requestCount = globalThis.__libraryRequestState.calls;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:auth-state", {
        detail: { event: "USER_UPDATED" },
      }));
      await delay(0);
    });
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    assert.equal(globalThis.__editorUnmounts, 0);
    assert.equal(globalThis.__libraryRequestState.calls, requestCount);
  });
});

test("an unavailable auth snapshot is not proof of sign-out", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    globalThis.__libraryAuthAvailable = false;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:auth-state", {
        detail: { event: "SIGNED_OUT" },
      }));
      await delay(0);
    });
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    assert.equal(globalThis.__editorUnmounts, 0);
  });
});

test("a confirmed account switch clears the previous user's active editor", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");

    globalThis.__libraryUserId = "user-2";
    globalThis.__libraryOwnerId = "user-2";
    globalThis.__libraryItems = [item("artifact-b", "user-2", "Other account document")];
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:auth-state", {
        detail: { event: "SIGNED_IN", userId: "user-2" },
      }));
      await delay(0);
    });
    await flushReact();

    assert.equal(container.querySelector("[data-editor]"), null);
    assert.equal(container.querySelector("[data-library-item]")?.dataset.libraryItem, "artifact-b");
    assert.equal(container.textContent.includes("Saved document"), false);
  });
});

test("preview preloads the matching editor route/source before Edit without mutation", async () => {
  editorPreload.resetEditorPreloadForTests();
  editorPreload.registerEditorRouteLoader("richdoc", async () => {
    globalThis.__preloadEvents.push("route:richdoc");
    return { ready: true };
  });
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-preview-item]").click());
    await flushReact();
    assert.ok(globalThis.__preloadEvents.includes("route:richdoc"));
    assert.ok(globalThis.__preloadEvents.includes("source:artifact-a"));
    assert.equal(globalThis.__ensureCalls, 0);
    await act(async () => container.querySelector("[data-library-item]").click());
    assert.equal(globalThis.__preloadEvents.at(-1), "editor-mounted");
    assert.equal(globalThis.__ensureCalls, 0);
  });
});

test("retryable 503 refresh preserves the existing full list and active editor", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    globalThis.__libraryRequestState.failMine = true;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change", {
        detail: { action: "changed" },
      }));
      await delay(0);
    });
    await flushReact();
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    assert.equal(globalThis.__editorMounts, 1);
    assert.equal(globalThis.__editorUnmounts, 0);
  });
});

test("detail-only failure leaves the usable Library list with a compact status", async () => {
  await withLibrary(async (container) => {
    await act(async () => delay(20));
    await flushReact();
    assert.equal(container.querySelectorAll("[data-library-item]").length, 1);
    assert.ok(container.querySelector('[role="status"]'));
    assert.equal(container.querySelector('[role="alert"]'), null);
  }, { action: { nonce: "detail-only-failure" }, detailFailure: true });
});

test("retryable private upload exposes a retry using the same file and idempotency identity", async () => {
  await withLibrary(async (container) => {
    const file = new window.File(["payload"], "draft.txt", {
      type: "text/plain",
      lastModified: 123,
    });
    const input = container.querySelector('input[type="file"]');
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
      await delay(0);
    });
    assert.equal(globalThis.__uploadCalls.length, 1);
    assert.equal(globalThis.__uploadCalls[0].privateUpload, true);
    assert.equal(globalThis.__uploadCalls[0].idempotencyKey, "stable-key");
    assert.match(container.querySelector('[data-library-upload-retry]')?.textContent || "", /1/);

    globalThis.__uploadResponses.push({ ok: false, status: 503, error: "still temporary", retryable: true });
    await act(async () => {
      container.querySelector("[data-library-upload-retry]").click();
      await delay(0);
    });
    assert.equal(globalThis.__uploadCalls.length, 2);
    assert.equal(globalThis.__uploadCalls[1].name, "draft.txt");
    assert.equal(globalThis.__uploadCalls[1].privateUpload, true);
    assert.equal(globalThis.__uploadCalls[1].idempotencyKey, globalThis.__uploadCalls[0].idempotencyKey);
  });
});

test("same-user 401 during token refresh keeps the loaded editor", async () => {
  await withLibrary(async (container) => {
    await act(async () => container.querySelector("[data-library-item]").click());
    globalThis.__libraryRequestState.failMine = true;
    globalThis.__libraryRequestState.mineFailureStatus = 401;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change", {
        detail: { action: "changed" },
      }));
      await delay(0);
    });
    await flushReact();
    assert.equal(container.querySelector("[data-editor]")?.dataset.editor, "artifact-a");
    assert.equal(globalThis.__editorUnmounts, 0);
  });
});

test("category fallback alone cannot become a usable Library snapshot", async () => {
  await withLibrary(async (container) => {
    assert.equal(container.querySelectorAll("[data-library-item]").length, 0);
    assert.match(container.querySelector("[data-empty-title]")?.textContent || "", /暂时|登录/);
  }, { failMine: true });
});

test("size sort hydrates every page before replacing the visible result set", async () => {
  const rows = Array.from({ length: 235 }, (_value, index) =>
    item(`artifact-${String(index).padStart(3, "0")}`, "user-1", `File ${index}`, {
      sourceBytes: index + 1,
      thumbnailBytes: 10_000 - index,
    }),
  );
  await withLibrary(async (container) => {
    assert.equal(container.querySelectorAll("[data-library-item]").length, 100);
    await act(async () => {
      container.querySelector("[data-sort-size]").click();
      await delay(0);
      await delay(0);
    });
    await flushReact();
    const visible = [...container.querySelectorAll("[data-library-item]")];
    assert.equal(visible.length, 235);
    assert.equal(visible[0].dataset.libraryItem, "artifact-000");
    assert.equal(visible.at(-1).dataset.libraryItem, "artifact-234");
    assert.equal(container.querySelector("[data-current-sort]")?.dataset.currentSort, "size");
  }, { items: rows });
});

test("same-account refresh preserves the selected sort and rebuilds the complete set", async () => {
  const rows = Array.from({ length: 235 }, (_value, index) =>
    item(`refresh-${String(index).padStart(3, "0")}`, "user-1", `File ${index}`, {
      sourceBytes: index + 1,
    }),
  );
  await withLibrary(async (container) => {
    await act(async () => {
      container.querySelector("[data-sort-size]").click();
      await delay(0);
      await delay(0);
    });
    await flushReact();
    assert.equal(container.querySelectorAll("[data-library-item]").length, 235);
    const callsBeforeRefresh = globalThis.__libraryRequestState.calls;
    await act(async () => {
      window.dispatchEvent(new CustomEvent("oceanleo:artifact-library-change", {
        detail: { action: "changed" },
      }));
      await delay(0);
      await delay(0);
      await delay(0);
    });
    await flushReact();
    assert.ok(globalThis.__libraryRequestState.calls > callsBeforeRefresh);
    assert.equal(container.querySelectorAll("[data-library-item]").length, 235);
    assert.equal(container.querySelector("[data-current-sort]")?.dataset.currentSort, "size");
  }, { items: rows });
});

test("overlapping pages are rejected without deduping into a false complete sort", async () => {
  const rows = Array.from({ length: 101 }, (_value, index) =>
    item(`overlap-${String(index).padStart(3, "0")}`, "user-1"),
  );
  await withLibrary(async (container) => {
    globalThis.__libraryRequestState.duplicateAtOffset = 100;
    await act(async () => {
      container.querySelector("[data-sort-size]").click();
      await delay(0);
      await delay(0);
    });
    await flushReact();
    assert.equal(container.querySelectorAll("[data-library-item]").length, 100);
    assert.equal(container.querySelector("[data-current-sort]")?.dataset.currentSort, "none");
    assert.match(container.textContent, /重叠条目/);
  }, { items: rows });
});

test("early page termination is rejected instead of claiming a complete set", async () => {
  const rows = Array.from({ length: 205 }, (_value, index) =>
    item(`short-${String(index).padStart(3, "0")}`, "user-1"),
  );
  await withLibrary(async (container) => {
    globalThis.__libraryRequestState.stopAtOffset = 100;
    await act(async () => {
      container.querySelector("[data-sort-size]").click();
      await delay(0);
      await delay(0);
    });
    await flushReact();
    assert.equal(container.querySelectorAll("[data-library-item]").length, 100);
    assert.equal(container.querySelector("[data-current-sort]")?.dataset.currentSort, "none");
    assert.match(container.textContent, /提前结束/);
  }, { items: rows });
});

test("both Library search fields use the exact placeholder `search`", async () => {
  await withLibrary(async (container) => {
    assert.equal(container.querySelector("[data-library-search]")?.getAttribute("placeholder"), "search");
    assert.equal(container.querySelector("[data-workspace-search]")?.getAttribute("placeholder"), "search");
  });
});
