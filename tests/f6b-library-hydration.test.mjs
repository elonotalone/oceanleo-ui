import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { renderToString } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { resetLibraryCurrentIdentityForTests } from "../src/shell/library-current-identity.ts";
import { linkWorkLibraryItem, normalizeLinkWork } from "../src/shell/works/link-work-item.ts";

const require = createRequire(import.meta.url);
const { SearchParamsContext } = require("next/dist/shared/lib/hooks-client-context.shared-runtime.js");
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href)); }
finally {
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
}
await new Promise(resolve => setImmediate(resolve));
const reactUrl = pathToFileURL(require.resolve("react")).href;
const originalProjectModule = pathToFileURL(require.resolve("../src/shell/library-project-membership.ts")).href;
const originalArtifactModule = pathToFileURL(require.resolve("../src/shell/artifact-client.ts")).href;
const ui = dataModule("const tt = text => text; export function useUI() { return tt; }");
const auth = dataModule(`
  export const AUTH_STATE_EVENT = "f6b-auth";
  export async function getUserIdSnapshot() { return { available: true, userId: "owner" }; }
  export async function getUserId() { return "owner"; }
  export async function accessToken() { return null; }
  export function cachedAccessToken() { return null; }
  export function browserClient() { return null; }
`);
const { MyLibrary } = await import(await compileModule("src/shell/MyLibrary.tsx", {
  "../i18n/ui/useUI": ui,
  "next-intl": dataModule("export function useLocale() { return 'en'; }"),
  "../lib/auth/client": auth,
  "./StorageCapacityStrip": dataModule("export function StorageCapacityStrip() { return null; }"),
  "./InheritedTeamLibrary": dataModule("export function InheritedTeamLibrary() { return null; }"),
  "./library-import": dataModule("export function LibraryImportDialog(){return null;} export function LibraryUploadQueue(){return null;} export function LibraryPurchasedUpdates(){return null;}"),
  "./AgentChat": dataModule("export function AgentChat() { return null; }"),
  "./library-standalone-editor-host": dataModule("export function MaterialStandaloneEditor() { throw Error('unexpected editor'); }"),
  "./editor-preload": dataModule("export async function preloadEditorFor() {}"),
  "./artifact-client": dataModule(`
    export * from ${JSON.stringify(originalArtifactModule)};
    export const ARTIFACT_LIBRARY_CHANGE_EVENT = 'f6b-artifacts';
    export async function listMyArtifacts() { return {ok:true,data:{items:[],serverWorks:[globalThis.__f6bWork],nextCursor:null,ownerPrincipalId:'owner'}}; }
    export async function getCurrentArtifactItem() { return {ok:true,data:globalThis.__f6bItem}; }
    export async function listFavoriteArtifacts() { return {ok:true,data:{items:[],nextCursor:null,ownerPrincipalId:'owner'}}; }
  `),
  "./library-project-membership": dataModule(`
    export * from ${JSON.stringify(originalProjectModule)};
    export async function loadProjectMemberships(){return [];}
    export async function loadLinkWorkItem(){return globalThis.__f6bItem;}
  `),
}));

async function hydrate(element, { search = "", storage = {}, origin = "https://hydration.test", retainRoot = true, verify } = {}) {
  assert.equal(typeof window, "undefined");
  element = React.createElement(SearchParamsContext.Provider, { value: new URLSearchParams(search) }, element);
  resetLibraryCurrentIdentityForTests();
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  let dom, root;
  const previousGlobals = new Map();
  try {
    const html = renderToString(element);
    dom = new JSDOM(`<div id="root">${html}</div>`, { url: `${origin}/library${search}`, pretendToBeVisual: true });
    for (const [key, value] of Object.entries(storage)) dom.window.localStorage.setItem(key, value);
    dom.window.scrollTo = () => {};
    // jsdom does not implement CSS @starting-style used by modal transitions.
    const style = dom.window.document.createElement("style"); style.id = "leo-overlay-motion"; dom.window.document.head.append(style);
    for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage"]) {
      previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      const value = key === "window" ? dom.window : key.endsWith("AnimationFrame") ? dom.window[key].bind(dom.window) : dom.window[key];
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    previousGlobals.set("IS_REACT_ACT_ENVIRONMENT", Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT"));
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const { hydrateRoot } = await import("react-dom/client");
    const host = document.getElementById("root");
    const serverRoot = host.firstChild;
    const addedChrome = [];
    const observer = new dom.window.MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1 && (node.matches("[data-library-collection-chrome]") || node.querySelector("[data-library-collection-chrome]"))) addedChrome.push(node);
      }
    });
    observer.observe(host, { childList: true, subtree: true });
    await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: error => errors.push(String(error)) }); });
    if (retainRoot) assert.equal(host.firstChild, serverRoot, "hydration must retain the server root");
    observer.disconnect();
    if (search.includes("item=")) assert.deepEqual(addedChrome, [], "collection chrome must never flash while loading a deep link");
    await verify?.(host, html);
    assert.deepEqual(errors, [], "SSR/hydration must emit no console.error or recoverable hydration error");
  } finally {
    if (root) await act(async () => root.unmount());
    console.error = previousError;
    dom?.window.close();
    for (const [key, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

globalThis.__f6bWork = { id: "link-1", source_type: "link", title: "Dashboard", updated_at: "2026-11-10T08:00:00Z", link_work: { id: "link-1", links: [{ label: "Link", url: "https://example.com/" }] } };
globalThis.__f6bItem = linkWorkLibraryItem(normalizeLinkWork({ id: "link-1", title: "Dashboard", updated_at: "2026-11-10T08:00:00Z", links: [{ label: "Link", url: "https://example.com/" }] }));

test("F6B: real MyLibrary hydrates a direct item URL and opens the real detail without collection chrome", async () => {
  await hydrate(React.createElement(MyLibrary, {
    siteId: "website", pageTitle: "My Library",
    action: { nonce: "direct-link", action: { version: 1, tab: "mine", itemId: "link-work:link-1" } },
  }), {
    search: "?item=link-work%3Alink-1",
    verify(host, html) {
      assert.equal(html.includes("data-library-collection-chrome"), false, "server must already omit collection chrome for this route");
      assert.ok(host.querySelector("[data-asset-detail]"), "the real WorkspaceLibrary must open the requested detail");
      assert.match(host.querySelector("[data-asset-detail]").textContent, /Dashboard/);
      assert.equal(host.querySelector("[data-library-collection-chrome]"), null);
    },
  });
});

test("F6B: real MyLibrary keeps ordinary collection chrome on a bare Library URL", async () => {
  await hydrate(React.createElement(MyLibrary, { siteId: "website", pageTitle: "My Library" }), {
    verify(host, html) {
      assert.match(html, /data-library-collection-chrome/);
      assert.ok(host.querySelector("[data-library-collection-chrome]"));
      assert.equal(host.querySelector("[data-asset-detail]"), null);
    },
  });
});

const { ProgramStrip } = await import(await compileModule("src/shell/cloud-computer/server-page/ProgramStrip.tsx", { "../../../i18n/ui/useUI": ui }));
test("F6B: remembered program-strip collapse hydrates without changing server markup", async () => {
  await hydrate(React.createElement(ProgramStrip, { items: [{ id: "agent", label: "Agent" }], storageKey: "f6b-collapse" }), {
    storage: { "f6b-collapse": "collapsed" },
    verify(host, html) { assert.ok(html); assert.match(host.textContent, /Agent/); },
  });
});

const { ShareLinkButton } = await import(await compileModule("src/shell/bay/appinsights/ShareLinkButton.tsx", { "../../../i18n/ui/useUI": ui }));
test("F6B: share-link text hydrates before restoring the page origin", async () => {
  await hydrate(React.createElement(ShareLinkButton, { appId: "app-1" }), {
    verify(host, html) {
      assert.equal(html.includes("hydration.test"), false);
      assert.match(host.querySelector("[data-bay-share-link]").textContent, /https:\/\/hydration.test/);
    },
  });
});

const { BayDeadlineField } = await import(await compileModule("src/shell/bay/form/BayDeadlineField.tsx", {
  "../../../i18n/ui/useUI": ui,
  "next-intl": dataModule("export function useLocale() { return 'en'; }"),
}));
test("F6B: a deadline hydrates across server and device timezone differences", async () => {
  const previousTZ = process.env.TZ;
  process.env.TZ = "Asia/Shanghai";
  try {
    await hydrate(React.createElement(BayDeadlineField, { value: "2026-11-20T02:00:00Z", onChange() {} }), {
      verify(host, html) {
        assert.match(html, /02:00/);
        assert.match(host.querySelector("[data-bay-deadline-trigger]").textContent, /10:00/);
      },
    });
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});

test("F6B: a URL-only bookmark opens detail without a host action", async () => {
  await hydrate(React.createElement(MyLibrary, { siteId: "website", pageTitle: "My Library" }), {
    search: "?item=link-work%3Alink-1",
    verify(host, html) {
      assert.equal(html.includes("data-library-collection-chrome"), false);
      assert.ok(host.querySelector("[data-asset-detail]"));
      assert.equal(host.querySelector("[data-library-collection-chrome]"), null);
    },
  });
});

const { AppFrame } = await import(await compileModule("src/shell/mcp-apps/AppFrame.tsx"));
for (const hostOrigin of [undefined, "https://p-f6b.dev.oceanleo.com"]) {
  test(`F6B: MCP AppFrame hydrates a stable frame identity (${hostOrigin ? "supplied" : "browser"} host origin)`, async () => {
    await hydrate(React.createElement(AppFrame, {
      resourceUri: "ui://sample/app", html: "<p>Tool UI</p>",
      hostOrigin, sandboxOrigin: "https://mcp-apps.oceanleo.app", allowedOrigins: ["https://mcp-apps.oceanleo.app"],
      title: "Tool UI", onToolCall: async () => ({}),
    }), {
      origin: "https://p-f6b.dev.oceanleo.com",
      retainRoot: Boolean(hostOrigin),
      verify(host) { assert.ok(host.querySelector("iframe"), "valid content must open after the host origin is known"); },
    });
  });
}

const { ApiPage } = await import(await compileModule("src/pages/ApiPage.tsx", {
  "../i18n/ui/useUI": ui,
  "../lib/auth": dataModule(`
    export function oceanleoConfigured() { return true; }
    export function loginUnavailableNotice() { return null; }
    export function browserClient() { return null; }
    export async function getModelCatalog() { return {ok:false}; }
    export function pricingDocUrl() { return ''; }
  `),
  "./ByokKeys": dataModule(`import React from ${JSON.stringify(reactUrl)}; export function ByokKeys(){return React.createElement('div', {'data-byok-keys':''});}`),
  "./ModelCapabilityMarket": dataModule("export function ModelGroupManager(){return null;}"),
}));
for (const search of ["?pane=byok&connection=key-1", "?guide=1"]) {
  test(`F6B: API settings hydrate before restoring ${search}`, async () => {
    await hydrate(React.createElement(ApiPage), {
      search,
      verify(host) { assert.equal(host.querySelector('[data-api-settings-tab="byok"]').getAttribute("aria-selected"), "true"); },
    });
  });
}
