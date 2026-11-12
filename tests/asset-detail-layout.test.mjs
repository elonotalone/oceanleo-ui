// W2-L5B: shared in-place detail; actions/resolver and type viewers are collaborators.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { ASSET_DETAIL_MESSAGES } from "../src/i18n/ui/messages/asset-detail-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const { createRoot } = await import("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__assetDetailLocale = "en";
globalThis.__assetDetailMessages = ASSET_DETAIL_MESSAGES;
globalThis.__assetDetailViewerProps = null;
const ui = dataModule(`export function useUI() { return (value) => {
  const common = {"返回列表":"Back to list", "免费":"Free", "图片":"Image", "网站":"Website", "内容":"Content"};
  const locale = globalThis.__assetDetailLocale;
  return globalThis.__assetDetailMessages[locale]?.[value] || (locale.startsWith("zh") ? value : common[value]) || value;
}; }`);
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const viewer = dataModule(`import { createElement } from ${JSON.stringify(reactUrl)};
  export function WorkspaceLibraryEntryViewer(props) {
    globalThis.__assetDetailViewerProps = props;
    return createElement("div", {"data-test-viewer": props.entry.id}, props.entry.title);
  }`);
const { AssetDetail } = await import(await compileModule("src/shell/asset-detail/AssetDetail.tsx", {
  "../../i18n/ui/useUI": ui,
  "../workspace-library-view": viewer,
  "../bay/asset/BayListingContent": dataModule(`export function BayListingContent(){ return null; }`),
  "next-intl": dataModule("export function useLocale() { return globalThis.__assetDetailLocale; }"),
}));

const entry = {
  id: "platform:42", title: "Forest", description: "A woodland photograph", kind: "image",
  libraryItem: {key: "platform:42", id: "42", title: "Forest", kind: "image", source: "creation", siteId: "image", favorite: false, meta: {}},
};
function context(surface = "bay", extra = {}) {
  return {
    surface, ref: {kind: "platform", id: "42"}, owned: false,
    rights: {canView:true, canDownload:false, canDownloadSource:false, canEdit:false, canUseInTask:false, canAddToLibrary:false},
    author: {name: "Alex"}, createdAt: "2026-11-01T23:30:00-08:00",
    license: {code: "CC-BY-4.0", commercialOk: true, modifyOk: false, attribution: "Credit Alex"},
    commerce: {priceFen: 1250, currency: "USD", free: false, purchaseState: "none"},
    ...extra,
  };
}
function render(extra = {}) {
  return renderToStaticMarkup(React.createElement(AssetDetail, {entry, onBack() {}, ...extra}));
}

for (const surface of ["library", "bay", "home", "task"]) {
  test(`${surface} uses the same in-place title, information, viewer and action slot`, () => {
    const html = render({actionContext: context(surface), actions: React.createElement("button", {"data-stub-action": surface}, "Host action")});
    assert.match(html, new RegExp(`data-asset-surface="${surface}"`));
    assert.match(html, /<h3[^>]*>Forest<\/h3>/);
    assert.match(html, /Author \/ uploader/);
    assert.match(html, /Alex/);
    assert.match(html, /CC-BY-4.0/);
    assert.match(html, /Commercial use allowed/);
    assert.match(html, /Modifications not allowed/);
    assert.match(html, /Credit Alex/);
    assert.match(html, /\$12\.50/);
    assert.match(html, /data-test-viewer="platform:42"/);
    assert.match(html, new RegExp(`data-stub-action="${surface}"`));
    assert.doesNotMatch(html, /role="dialog"|aria-modal|fixed inset|backdrop|receipt|typed route/);
    assert.equal((html.match(/<button/g) || []).length, 2, "only Back and the supplied action");
    assert.strictEqual(globalThis.__assetDetailViewerProps.entry, entry);
  });
}

test("the shared layout never invents actions for commerce or owned assets", () => {
  for (const owned of [false, true]) {
    const html = render({actionContext: context("bay", {owned})});
    assert.equal((html.match(/<button/g) || []).length, 1);
    assert.doesNotMatch(html, /Edit|Purchase|Download|receipt|typed route/);
  }
});

test("unknown and invalid prices are never advertised as free", () => {
  for (const priceFen of [null, undefined, NaN, -100]) {
    const html = render({actionContext: context("home", {commerce: {priceFen, currency:"USD", free:false, purchaseState:"none"}})});
    assert.match(html, /Price to be confirmed/);
    assert.doesNotMatch(html, /Free|\$0\.00/);
  }
});

test("zero price and CNY are displayed from the supplied commerce", () => {
  assert.match(render({actionContext: context("bay", {commerce: {priceFen:0, currency:"CNY", free:true, purchaseState:"none"}})}), /Free/);
  assert.match(render({actionContext: context("bay", {commerce: {priceFen:9900, currency:"CNY", free:false, purchaseState:"none"}})}), /99\.00/);
});

test("server dates are localized deterministically and retain their semantic ISO time", () => {
  const html = render({actionContext: context()});
  assert.match(html, /datetime="2026-11-02T07:30:00\.000Z"/i);
  assert.match(html, /Nov 2, 2026/);
  assert.match(html, /7:30 AM UTC/);
  assert.doesNotMatch(html, /2026-11-01T23:30:00-08:00|Unknown time/);
});

test("missing and invalid metadata do not invent an author, license, date or empty information row", () => {
  assert.doesNotMatch(render(), /data-asset-info/);
  for (const createdAt of [undefined, "not-a-date"]) {
    const html = render({actionContext: context("home", {author:undefined, createdAt, license:undefined, commerce:undefined})});
    assert.doesNotMatch(html, /data-asset-info|<time|Invalid Date|Unknown time|Free/);
  }
});

test("legacy Library storefront metadata remains visible without granting rights", () => {
  const html = render({entry: {...entry, detail: {uploader:"Morgan", uploadedAt:"2026-10-31T00:00:00Z", priceFen:500, currency:"USD"}}});
  assert.match(html, /Morgan/);
  assert.match(html, /Oct 31, 2026/);
  assert.match(html, /\$5\.00/);
  assert.equal((html.match(/<button/g) || []).length, 1);
});

test("resolved commerce absence supersedes stale legacy price and retains the exact viewer entry", () => {
  const stale = {...entry, detail: {priceFen:0, purchased:true}};
  assert.doesNotMatch(render({entry:stale, actionContext:context("bay", {commerce:undefined})}), /Free|Price to be confirmed/);
  assert.strictEqual(globalThis.__assetDetailViewerProps.entry, stale);
});

test("resolved type labels do not replace the entry passed to the type viewer", () => {
  const html = render({typeItem: {...entry.libraryItem, kind:"website"}, viewerNonce:7, accent:"#123456"});
  assert.match(html, /Website/);
  assert.strictEqual(globalThis.__assetDetailViewerProps.entry, entry);
  assert.equal(globalThis.__assetDetailViewerProps.viewerNonce, 7);
  assert.equal(globalThis.__assetDetailViewerProps.accent, "#123456");
});

test("Back and host action callbacks work, and the detail and viewer refs address their original regions", async () => {
  let backs = 0;
  let actions = 0;
  const rootRef = React.createRef();
  const viewerRef = React.createRef();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(AssetDetail, {
      entry, ref:rootRef, viewerRef, onBack:() => backs++,
      actions:React.createElement("button", {onClick:() => actions++, "data-stub-action":"use"}, "Use in task"),
    })));
    assert.strictEqual(rootRef.current, container.querySelector("[data-asset-detail]"));
    assert.ok(viewerRef.current?.contains(container.querySelector("[data-test-viewer]")));
    await act(async () => container.querySelector('[aria-label="Back to list"]').click());
    await act(async () => container.querySelector("[data-stub-action]").click());
    assert.equal(backs, 1);
    assert.equal(actions, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

test("shared information has complete source, English and Traditional Chinese copy; other locales use English", () => {
  const keys = Object.keys(ASSET_DETAIL_MESSAGES.zh).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(ASSET_DETAIL_MESSAGES[locale]).sort(), keys);
    if (!locale.startsWith("zh")) {
      for (const value of Object.values(ASSET_DETAIL_MESSAGES[locale])) assert.doesNotMatch(value, /[\u3400-\u9fff]/);
    }
  }
  assert.equal(ASSET_DETAIL_MESSAGES["zh-TW"]["授权说明"], "授權說明");
  assert.equal(ASSET_DETAIL_MESSAGES.en["价格待确认"], "Price to be confirmed");
});

test("Chinese variants and English fallback render the same metadata fields", () => {
  try {
    for (const locale of ["zh", "zh-TW", "de"]) {
      globalThis.__assetDetailLocale = locale;
      const html = render({actionContext:context()});
      assert.ok(html.includes(ASSET_DETAIL_MESSAGES[locale]["作者 / 上传者"]));
      assert.ok(html.includes(ASSET_DETAIL_MESSAGES[locale]["授权说明"]));
      if (locale === "de") assert.doesNotMatch(html, /[\u3400-\u9fff]/);
    }
  } finally { globalThis.__assetDetailLocale = "en"; }
});
