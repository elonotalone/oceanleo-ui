import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ASSET_ACTIONS_MESSAGES } from "../src/i18n/ui/messages/asset-actions-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dictionary = ASSET_ACTIONS_MESSAGES.en;
const client = dataModule(`
  export function artifactDownloadEvidence(item){return {visible:true, available:!!item.artifact, reason:"当前 revision 缺少 rendition。", purpose:item.kind === "website" ? "source" : "full", mode:item.kind === "website" ? "source" : "export"};}
  export async function getArtifactDownload(item){return globalThis.__assetActions.download(item);}
  export async function prepareArtifactForAction(action,item){return {ok:true,data:{...item,preparedAction:action}};}
  export async function forkArtifact(item){return globalThis.__assetActions.fork(item);}
  export async function setArtifactFavorite(){return {ok:false};}
`);
const stubs = {
  "../../i18n/ui/useUI": dataModule(`export function useUI(){const dict=${JSON.stringify(dictionary)};return (key,vars)=>{let text=dict[key]||key;for(const [k,v] of Object.entries(vars||{}))text=text.replaceAll('{'+k+'}',String(v));return text;};}`),
  "../i18n/ui/useUI": dataModule(`export function useUI(){const dict=${JSON.stringify(dictionary)};return key=>dict[key]||key;}`),
  "next-intl": dataModule('export function useLocale(){return "en";}'),
  "../../lib/bay/http": dataModule('export async function bayPost(path,body){return globalThis.__assetActions.post(path,body);}'),
  "./resolve": dataModule('export async function resolveAssetDetail(ref,options){return globalThis.__assetActions.resolve(ref,options);}'),
  "../bay/shell/bay-state": dataModule('export function openBay(target){globalThis.__assetActions.checkout(target);}'),
  "../../lib/bay/assets": dataModule('export async function purchaseBayAsset(id){return globalThis.__assetActions.purchase(id);}'),
  "../bay/asset/library-client": dataModule('export function bayAssetDownloadHref(id){return "https://gateway.invalid/v1/assets/download?id="+encodeURIComponent(id);}'),
  "../artifact-client": client,
  "./artifact-client": client,
  "./library-data": dataModule('export function isDurableLibraryItem(item){return !!item.artifact;} export function isTemplateMaterialDetailItem(){return false;}'),
  "./artifact-contract": dataModule('export function isEnsureableTransient(item){return !!item?.receipt;}'),
  "./workbench-routes": dataModule('export function editorCapabilityFor(){return {available:true};}'),
  "./deck-delivery-family": dataModule('export function deckHtmlOpenPlan(){return {family:"other",edit:{visible:false},view:{visible:false}};}'),
  "./DeckHtmlAction": dataModule('export function DeckHtmlActionButton(){return null;} export function deckHtmlEvidence(){return {visible:false,available:false,reason:""};}'),
  "./library-document-export": dataModule('export const LIBRARY_DOCUMENT_DOWNLOAD_FORMATS=[];export function libraryItemOffersDocumentFormats(){return false;}'),
  "../ui/menu/FloatingMenu": dataModule('export function FloatingMenu(){return null;}export function FloatingMenuItem(){return null;}'),
};
const { useAssetActions, assetToolbarItems, claimedLibraryRef } = await import(await compileModule("src/shell/asset-detail/useAssetActions.ts", stubs));
const { BayAssetActions, assetPriceText } = await import(await compileModule("src/shell/asset-detail/BayAssetActions.tsx", stubs));
const { ArtifactActionButtons, artifactActionMatrix } = await import(await compileModule("src/shell/ArtifactActions.tsx", stubs));
const noRights = { canView: true, canDownload: false, canDownloadSource: false, canEdit: false, canUseInTask: false, canAddToLibrary: false };
function context(extra = {}) {
  return { surface: "bay", ref: { kind: "platform", id: "platform-1" }, owned: false, rights: { ...noRights }, commerce: { priceFen: 0, currency: "USD", free: true, purchaseState: "none" }, author: { name: "Author" }, license: { code: "CC-BY-4.0" }, ...extra };
}
function item(extra = {}) {
  return { key: "artifact:owned-1:r1", artifactId: "owned-1", revisionId: "r1", kind: "image", title: "Sample", meta: {}, favorite: false,
    artifact: { access: { canRead: true, canPreview: true, canEdit: true, canFork: false, canFavorite: true }, integrity: { ok: true }, editorCapability: { editorId: "image" }, renditions: { full: { url: "https://example.invalid/image.png" } } }, ...extra };
}
const entry = { id: "public-1", title: "Sample", libraryItem: { key: "public-1", title: "Sample", kind: "image", meta: {} } };
function owned(extra = {}) {
  return { entry: { id: "owned-1", title: "Sample", libraryItem: item() }, actionContext: context({ ref: { kind: "artifact", artifactId: "owned-1", revisionId: "r1" }, owned: true, commerce: undefined, rights: { ...noRights, canDownload: true, canUseInTask: true, canEdit: true }, ...extra }) };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function mount(Component, props) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Component, props)));
  return { container, async render(next) { await act(async () => root.render(React.createElement(Component, next))); }, async close() { await act(async () => root.unmount()); container.remove(); } };
}
async function click(container, id) {
  const button = container.querySelector(`[data-asset-action="${id}"]`);
  assert.ok(button, `action ${id} exists`);
  await act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
}
async function until(predicate) {
  for (let attempt = 0; attempt < 40 && !predicate(); attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2)); });
  }
  assert.ok(predicate(), "asynchronous action finished");
}
let state;
function Hook(props) { state = useAssetActions(props); return null; }

test("not-owned free and paid actions stay separate from Library rights", () => {
  assert.deepEqual(assetToolbarItems(context()).map((x) => x.id), ["get"]);
  const paid = context({ ref: { kind: "listing", id: "listing-1" }, commerce: { priceFen: 1299, currency: "USD", free: false, purchaseState: "none", listingId: "listing-1" }, rights: { ...noRights, canEdit: true, canDownload: true } });
  assert.deepEqual(assetToolbarItems(paid).map((x) => x.id), ["buy"]);
  assert.deepEqual(assetToolbarItems({ ...paid, commerce: { ...paid.commerce, listingId: "wrong-id" } }).map((x) => x.id), ["refresh"]);
});

test("missing, negative, fractional or contradictory price never creates a free claim", () => {
  for (const priceFen of [null, -1, NaN, 1.2, 10]) {
    const ctx = context({ commerce: { priceFen, free: true, currency: "USD", purchaseState: "none" } });
    assert.deepEqual(assetToolbarItems(ctx).map((x) => x.id), ["refresh"]);
  }
  assert.equal(assetPriceText(context({ commerce: { priceFen: null } }), "en", (key) => dictionary[key]), "Price unavailable");
  assert.equal(assetPriceText(context(), "en", (key) => dictionary[key]), "Free");
  assert.equal(assetPriceText(context({ commerce: { priceFen: 1299, currency: "USD", free: false } }), "en-US", (key) => key), "$12.99");
});

test("pending and refunded purchases cannot expose stale editing or download rights", () => {
  const rights = { ...noRights, canEdit: true, canDownload: true, canUseInTask: true };
  assert.deepEqual(assetToolbarItems(context({ owned: true, rights, commerce: { priceFen: 0, free: true, currency: "USD", purchaseState: "pending" } })).map((x) => x.id), ["refresh"]);
  assert.deepEqual(assetToolbarItems(context({ owned: true, rights, commerce: { priceFen: 0, free: true, currency: "USD", purchaseState: "refunded" } })).map((x) => x.id), ["get"]);
  assert.deepEqual(assetToolbarItems(owned().actionContext).map((x) => x.id), ["use", "download", "edit"]);
  assert.deepEqual(assetToolbarItems(context({ surface: "library", rights })).map((x) => x.id), ["refresh"]);
});

test("a server-confirmed seller owner does not have to purchase their own listing", () => {
  const ctx = context({ ref: { kind: "listing", id: "own-listing" }, owned: true,
    commerce: { priceFen: 1999, currency: "USD", free: false, purchaseState: "none", listingId: "own-listing" },
    rights: { ...noRights, canEdit: true, canDownload: true } });
  assert.deepEqual(assetToolbarItems(ctx).map((action) => action.id), ["download", "edit"]);
});

test("claim identities accept explicit server artifact or platform Library identities", () => {
  assert.deepEqual(claimedLibraryRef({ library_ref: { kind: "artifact", artifactId: "owned", revisionId: "r2" } }), { kind: "artifact", artifactId: "owned", revisionId: "r2" });
  assert.deepEqual(claimedLibraryRef({ artifact_id: "owned", revision_id: "r2" }), { kind: "artifact", artifactId: "owned", revisionId: "r2" });
  assert.deepEqual(claimedLibraryRef({ libraryIdentity: { kind: "platform", id: "stock-1" } }), { kind: "platform", id: "stock-1" });
  for (const input of [null, { purchased: true }, { ref: { kind: "platform", id: "public" } }, { artifact_id: " " }]) assert.equal(claimedLibraryRef(input), null);
});

test("the real platform claim response stays a Library collection item, supports download/use, and never invents edit rights", async () => {
  const libraryContext = context({ owned: true, surface: "library", commerce: { priceFen: 0, currency: "USD", free: true, purchaseState: "settled" }, rights: { ...noRights, canDownload: true, canUseInTask: true } });
  const libraryEntry = { ...entry, id: "bay:library:platform-1", libraryItem: { ...entry.libraryItem, url: "https://media.invalid/image.png", meta: { bay_asset_id: "library:platform-1" } } };
  const calls = [];
  globalThis.__assetActions = {
    post: async () => ({ claim: { status: "settled" }, libraryIdentity: { kind: "platform", id: "platform-1" }, collectionAssetId: "library:platform-1" }),
    resolve: async (ref) => { calls.push(ref); return { entry: libraryEntry, actionContext: libraryContext }; },
  };
  const used = [], links = [];
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { links.push(this.href); };
  const mounted = await mount(BayAssetActions, { entry, actionContext: context(), onUseInTask: (next) => used.push(next) });
  try {
    await click(mounted.container, "get");
    await until(() => Boolean(mounted.container.querySelector('[data-asset-action="download"]')));
    assert.deepEqual(calls, [{ kind: "platform", id: "platform-1" }]);
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="edit"]')), false);
    await click(mounted.container, "use");
    assert.equal(used[0].id, libraryEntry.id);
    await click(mounted.container, "download");
    await until(() => links.length === 1);
    assert.equal(links[0], "https://gateway.invalid/v1/assets/download?id=library%3Aplatform-1");
  } finally { window.HTMLAnchorElement.prototype.click = originalClick; await mounted.close(); }
});

test("free seller acquisition preserves settled access to the seller root, then Add to Library resolves the server-created buyer copy", async () => {
  const ctx = context({ ref: { kind: "listing", id: "listing-1" }, commerce: { priceFen: 0, free: true, currency: "USD", purchaseState: "none", listingId: "listing-1" } });
  const purchases = [], forks = [], updates = [];
  const sellerItem = item({ artifactId: "seller-root", revisionId: "seller-r1" });
  const sellerEntry = { ...entry, libraryItem: sellerItem };
  globalThis.__assetActions = {
    purchase: async (id) => { purchases.push(id); return { purchase: { status: "settled", artifact_id: "seller-root", revision_id: "seller-r1" } }; },
    fork: async (source) => { forks.push(source); return { ok: true, data: item() }; },
    resolve: async (ref) => {
      if (ref.kind === "listing") return { entry: sellerEntry, actionContext: { ...ctx, owned: true, commerce: { ...ctx.commerce, purchaseState: "settled" }, rights: { ...noRights, canAddToLibrary: true, canDownload: true } } };
      if (ref.artifactId === "seller-root") return { entry: sellerEntry, actionContext: context({ ref, owned: false, commerce: undefined, rights: { ...noRights, canAddToLibrary: true } }) };
      return owned();
    },
  };
  const mounted = await mount(BayAssetActions, { entry, actionContext: ctx, onResolved: (next) => updates.push(next) });
  try {
    await click(mounted.container, "get");
    await until(() => updates.length === 1);
    assert.deepEqual(purchases, ["listing-1"]);
    assert.equal(updates[0].actionContext.ref.kind, "listing");
    assert.equal(updates[0].entry.libraryItem.artifactId, "seller-root");
    await click(mounted.container, "add");
    await until(() => updates.length === 2);
    assert.equal(forks[0].artifactId, "seller-root");
    assert.deepEqual(updates[1].actionContext.ref, { kind: "artifact", artifactId: "owned-1", revisionId: "r1" });
  } finally { await mounted.close(); }
});

test("retry after a created Library copy fails to resolve uses that returned identity without creating a second copy", async () => {
  const refs = [];
  let copies = 0;
  const ctx = context({ owned: false, commerce: undefined, rights: { ...noRights, canAddToLibrary: true } });
  const mounted = await mount(BayAssetActions, { entry, actionContext: ctx, services: {
    addToLibrary: async () => { copies++; return { kind: "artifact", artifactId: "new-copy", revisionId: "new-r1" }; },
    resolve: async (ref) => { refs.push(ref); if (refs.length === 1) throw new Error("temporary failure"); return owned(); },
  } });
  try {
    await click(mounted.container, "add");
    await click(mounted.container, "retry");
    assert.equal(copies, 1);
    assert.deepEqual(refs, [{ kind: "artifact", artifactId: "new-copy", revisionId: "new-r1" }, { kind: "artifact", artifactId: "new-copy", revisionId: "new-r1" }]);
  } finally { await mounted.close(); }
});

test("free claim posts the typed ref, waits for confirmation, and switches to the owned Library identity", async () => {
  const response = deferred();
  const posts = [], refs = [], updates = [];
  globalThis.__assetActions = { post(path, body) { posts.push([path, body]); return response.promise; }, resolve(ref) { refs.push(ref); return owned(); } };
  const mounted = await mount(BayAssetActions, { entry, actionContext: context(), onResolved: (next) => updates.push(next), onEdit() {}, onUseInTask() {} });
  try {
    assert.match(mounted.container.textContent, /Free/);
    assert.doesNotMatch(mounted.container.innerHTML, /receipt|typed route|data-asset-action="edit"/i);
    await click(mounted.container, "get");
    assert.deepEqual(posts, [["/v1/bay/assets/claim", { ref: { kind: "platform", id: "platform-1" } }]]);
    assert.equal(updates.length, 0);
    assert.equal(mounted.container.querySelector('[data-asset-action="get"]').disabled, true);
    await act(async () => response.resolve({ artifact_id: "owned-1", revision_id: "r1" }));
    await until(() => updates.length === 1);
    assert.deepEqual(refs, [{ kind: "artifact", artifactId: "owned-1", revisionId: "r1" }]);
    assert.equal(updates[0].entry.libraryItem.artifactId, "owned-1");
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="get"]')), false);
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="edit"]')), true);
  } finally { await mounted.close(); }
});

test("paid Buy uses existing checkout without flipping ownership; focus refresh resolves settlement to Library", async () => {
  const ctx = context({ ref: { kind: "listing", id: "listing-1" }, commerce: { priceFen: 1299, free: false, currency: "USD", purchaseState: "none", listingId: "listing-1" } });
  const targets = [], refs = [], updates = [];
  globalThis.__assetActions = { checkout(target) { targets.push(target); }, resolve(ref) { refs.push(ref); return owned({ ref, commerce: ref.kind === "listing" ? { ...ctx.commerce, purchaseState: "settled" } : undefined }); } };
  const mounted = await mount(BayAssetActions, { entry, actionContext: ctx, onResolved: (next) => updates.push(next) });
  try {
    await click(mounted.container, "buy");
    await until(() => targets.length === 1);
    assert.deepEqual(targets, [{ kind: "checkout", serviceId: "listing-1" }]);
    assert.equal(updates.length, 0);
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), false);
    await act(async () => window.dispatchEvent(new window.Event("focus")));
    await until(() => updates.length === 1);
    assert.equal(refs[0].kind, "listing");
    assert.deepEqual(refs[1], { kind: "artifact", artifactId: "owned-1", revisionId: "r1" });
    assert.equal(updates.at(-1).actionContext.ref.kind, "artifact");
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), true);
  } finally { await mounted.close(); }
});

test("a pending purchase refresh exposes no owned action until the resolver confirms settled rights", async () => {
  const ctx = context({ commerce: { priceFen: 100, free: false, currency: "USD", purchaseState: "pending" } });
  const wait = deferred();
  const mounted = await mount(BayAssetActions, { entry, actionContext: ctx, services: { resolve: () => wait.promise } });
  try {
    assert.match(mounted.container.textContent, /Awaiting payment confirmation/);
    await click(mounted.container, "refresh");
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), false);
    await act(async () => wait.resolve(owned()));
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), true);
  } finally { await mounted.close(); }
});

test("failed claim retries resolution before repeating the mutation, and never renders internal errors", async () => {
  let claims = 0, resolves = 0;
  const mounted = await mount(BayAssetActions, { entry, actionContext: context(), services: {
    claim: async () => { claims++; throw new Error("临时 receipt typed route failed"); },
    resolve: async () => { resolves++; return owned(); },
  } });
  try {
    await click(mounted.container, "get");
    assert.match(mounted.container.textContent, /Could not add to My Library/);
    assert.doesNotMatch(mounted.container.innerHTML, /receipt|typed|临时/);
    await click(mounted.container, "retry");
    assert.equal(claims, 1);
    assert.equal(resolves, 2);
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), true);
  } finally { await mounted.close(); }
});

test("claim 200 without owned Library identity does not unlock edit", async () => {
  const mounted = await mount(BayAssetActions, { entry, actionContext: context(), services: { claim: async () => null, resolve: async () => ({ entry, actionContext: context() }) } });
  try {
    await click(mounted.container, "get");
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="edit"]')), false);
    assert.match(mounted.container.textContent, /Could not add/);
  } finally { await mounted.close(); }
});

test("a mismatched platform Library identity is rejected and retry rechecks the selected asset", async () => {
  const refs = [], updates = [];
  const mounted = await mount(BayAssetActions, { entry, actionContext: context(), onResolved: (next) => updates.push(next), services: {
    claim: async () => ({ kind: "platform", id: "wrong-platform" }),
    resolve: async (ref) => { refs.push(ref); return { entry, actionContext: context() }; },
  } });
  try {
    await click(mounted.container, "get");
    assert.equal(refs.length, 0);
    assert.equal(updates.length, 0);
    await click(mounted.container, "retry");
    assert.deepEqual(refs, [{ kind: "platform", id: "platform-1" }]);
  } finally { await mounted.close(); }
});

test("changing asset ignores an older claim result and does not block the next asset", async () => {
  const wait = deferred(), published = [];
  const services = { claim: () => wait.promise, resolve: async () => owned() };
  const first = { entry, actionContext: context(), services, onResolved: (next) => published.push(next) };
  const mounted = await mount(Hook, first);
  try {
    let firstRun;
    await act(async () => { firstRun = state.run("get"); });
    const secondContext = context({ ref: { kind: "platform", id: "platform-2" } });
    await mounted.render({ ...first, actionContext: secondContext });
    assert.equal(state.pending, null);
    await act(async () => { wait.resolve({ kind: "artifact", artifactId: "owned-1" }); await firstRun; });
    assert.equal(published.length, 0);
    assert.equal(state.actionContext.ref.id, "platform-2");
  } finally { await mounted.close(); }
});

test("duplicate same-tick Get dispatches only one claim", async () => {
  const wait = deferred();
  let count = 0;
  const mounted = await mount(Hook, { entry, actionContext: context(), services: { claim: () => { count++; return wait.promise; }, resolve: async () => owned() } });
  try {
    let firstRun;
    await act(async () => { firstRun = state.run("get"); void state.run("get"); });
    assert.equal(count, 1);
    await act(async () => { wait.resolve({ kind: "artifact", artifactId: "owned-1" }); await firstRun; });
  } finally { await mounted.close(); }
});

test("Library-owned keeps share/download/favorite/edit and obeys server edit/source rights", async () => {
  const detail = owned({ surface: "library" });
  const mounted = await mount(BayAssetActions, { ...detail, onEdit() {}, onUseInTask() {} });
  try {
    for (const action of ["share", "download", "favorite", "edit"]) assert.ok(mounted.container.querySelector(`[data-artifact-action="${action}"]`), action);
    const denied = { ...detail.actionContext, rights: { ...detail.actionContext.rights, canEdit: false, canDownloadSource: false } };
    const website = { ...detail.entry, libraryItem: item({ kind: "website" }) };
    await mounted.render({ entry: website, actionContext: denied, onEdit() {} });
    assert.equal(Boolean(mounted.container.querySelector('[data-artifact-action="edit"]')), false);
    assert.equal(Boolean(mounted.container.querySelector('[data-artifact-action="download"]')), false);
  } finally { await mounted.close(); }
});

test("a refunded server refresh removes owned actions even if the old rights flags are still true", async () => {
  const detail = owned();
  const props = { ...detail, onEdit() {}, onUseInTask() {} };
  const mounted = await mount(BayAssetActions, props);
  try {
    assert.ok(mounted.container.querySelector('[data-asset-action="edit"]'));
    await mounted.render({ ...props, actionContext: { ...detail.actionContext, ref: { kind: "listing", id: "listing-1" }, commerce: { priceFen: 1299, free: false, currency: "USD", purchaseState: "refunded", listingId: "listing-1" } } });
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="edit"]')), false);
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), false);
    assert.match(mounted.container.textContent, /Refunded/);
    assert.ok(mounted.container.querySelector('[data-asset-action="buy"]'));
  } finally { await mounted.close(); }
});

test("Edit uses the existing prepared typed action and passes the exact Library version to the host", async () => {
  const edited = [];
  const mounted = await mount(BayAssetActions, { ...owned(), onEdit: (next) => edited.push(next) });
  try {
    await click(mounted.container, "edit");
    await until(() => edited.length === 1);
    assert.equal(edited[0].libraryItem.artifactId, "owned-1");
    assert.equal(edited[0].libraryItem.revisionId, "r1");
    assert.equal(edited[0].libraryItem.preparedAction, "edit");
  } finally { await mounted.close(); }
});

test("source download is hidden when forbidden, and a wrong-version grant never starts a download", async () => {
  const links = [];
  let requests = 0;
  const originalClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { links.push(this.href); };
  globalThis.__assetActions = { download: async () => { requests++; return { ok: true, data: { artifactId: "other", revisionId: "r1", url: "https://private.invalid/grant", filename: "wrong.png", mediaType: "image/png" } }; } };
  const denied = owned();
  denied.entry.libraryItem = item({ kind: "website" });
  const mounted = await mount(BayAssetActions, denied);
  try {
    assert.equal(Boolean(mounted.container.querySelector('[data-asset-action="download"]')), false);
    assert.equal(requests, 0);
    await mounted.render(owned());
    await click(mounted.container, "download");
    await until(() => Boolean(mounted.container.querySelector('[role="alert"]')));
    assert.equal(requests, 1);
    assert.equal(links.length, 0);
    assert.doesNotMatch(mounted.container.innerHTML, /identity_mismatch|private.invalid/);
  } finally { window.HTMLAnchorElement.prototype.click = originalClick; await mounted.close(); }
});

test("legacy Library eligibility evidence never appears in text, title, aria labels, or failure messages", async () => {
  const transient = { key: "temp", title: "Preview", kind: "image", meta: {}, url: "https://example.invalid/preview.png" };
  const matrix = artifactActionMatrix(transient);
  assert.match(matrix.edit.reason, /receipt/);
  const mounted = await mount(ArtifactActionButtons, { item: transient, matrix, onEdit() {}, identity: { resolving: false, failed: true, reason: "缺少 artifact revision identity", failure: "typed route receipt 不存在" } });
  try {
    assert.doesNotMatch(mounted.container.innerHTML, /receipt|typed|transient|revision|rendition|幂等/i);
    assert.match(mounted.container.textContent, /Editing is unavailable/);
  } finally { await mounted.close(); }
});

test("all supported non-Chinese locales have English fallback for every new source key", () => {
  const keys = Object.keys(ASSET_ACTIONS_MESSAGES.zh);
  for (const locale of LOCALES) {
    assert.equal(Object.keys(ASSET_ACTIONS_MESSAGES[locale]).length, keys.length);
    if (locale === "zh" || locale === "zh-TW") continue;
    for (const key of keys) assert.doesNotMatch(ASSET_ACTIONS_MESSAGES[locale][key], /[\u3400-\u9fff]/, `${locale}: ${key}`);
  }
});
