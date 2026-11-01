import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const ui = dataModule('export function useUI(){ return (text, vars = {}) => text.replace(/\\{(\\w+)\\}/g, (_, k) => vars[k] ?? k); }');
const state = dataModule('export function openBay(){}');
const stubs = {
  "../../../i18n/ui/useUI": ui,
  "next-intl": dataModule('export function useLocale(){ return "en"; }'),
  "../shell/bay-state": state,
  "../../../lib/bay/services": dataModule('export function formatBayMoney(fen){return "$" + (fen / 100).toFixed(2);}'),
  "../../../lib/money": dataModule('export function ledgerCurrency(){return "USD";}'),
};
const { BayAssetCard } = await import(await compileModule("src/shell/bay/asset/BayAssetCard.tsx", stubs));
const { BayAppCard } = await import(await compileModule("src/shell/bay/apps/BayAppCard.tsx", stubs));
const { BayLessonCard } = await import(await compileModule("src/shell/bay/lessons/BayLessonCard.tsx", stubs));
const { BayBundleCard } = await import(await compileModule("src/shell/bay/lessons/BayBundleCard.tsx", stubs));

const asset = { id: "asset-1", type: "image", title: "Asset title", thumb_url: "https://example.test/asset.jpg", author: "Author", source: "oceanleo", license: { code: "CC0", name: "CC0", commercial_ok: true, modify_ok: true } };
const app = { id: "app-1", title: "App title", cover_url: "https://example.test/app.jpg", source_kind: "hosted", open_count: 12, author: { display_name: "Author" } };
const lesson = { id: "lesson-1", title: "Lesson title", cover_url: "https://example.test/lesson.jpg", price_fen: 1234, chapter_count: 4, sales_count: 2, author: { display_name: "Author" } };
const bundle = { id: "bundle-1", title: "Bundle title", cover_url: "https://example.test/bundle.jpg", price_fen: 1000, lessons_total_fen: 1500, lessons: [lesson] };

for (const [Component, props] of [[BayAssetCard, { asset, onOpen() {} }], [BayAppCard, { app }], [BayLessonCard, { lesson }], [BayBundleCard, { bundle }]]) {
  test(`${Component.name}: list renders the compact Library row; grid renders the Library cover`, () => {
    const row = renderToStaticMarkup(React.createElement(Component, { ...props, view: "list" }));
    const grid = renderToStaticMarkup(React.createElement(Component, { ...props, view: "grid" }));
    assert.match(row, /h-9 w-9/);
    assert.match(row, /px-4 py-3/);
    assert.match(row, /text-\[13px\]/);
    assert.match(row, /text-\[11px\]/);
    assert.doesNotMatch(row, /aspect-video|aspect-\[4\/3\]/);
    assert.match(grid, /aspect-video/);
    assert.doesNotMatch(grid, /aspect-\[4\/3\]/);
  });
}

test("paid lesson and bundle metadata survives compact rendering", () => {
  const row = renderToStaticMarkup(React.createElement(BayLessonCard, { lesson, view: "list" }));
  assert.match(row, /\$12\.34/);
  assert.match(row, /4 节/);
  assert.match(row, /已售 2/);
  const bundleRow = renderToStaticMarkup(React.createElement(BayBundleCard, { bundle, view: "list" }));
  assert.match(bundleRow, /\$10\.00/);
  assert.match(bundleRow, /line-through/);
  assert.match(bundleRow, /\$15\.00/);
  assert.match(bundleRow, /省 \$5\.00/);
});

test("asset cards open the shared detail with a button in both collection views", () => {
  for (const view of ["list", "grid"]) {
    const html = renderToStaticMarkup(React.createElement(BayAssetCard, { asset: { ...asset, openHref: "/en/library?asset=asset-1" }, view, onOpen() {} }));
    assert.match(html, /data-bay-asset-card="asset-1"/);
    assert.match(html, /<button[^>]*aria-label="预览「Asset title」"/);
    assert.doesNotMatch(html, /<a[^>]*href=/);
  }
});

globalThis.__bayCollectionFeed = { items: [], loading: false, loaded: true, error: null, hasMore: false };
const feedStubs = {
  "../../../i18n/ui/useUI": ui,
  "next-intl": stubs["next-intl"],
  "./bay-state": dataModule('export function openBay(){}; export function requireBayLogin(){return true;} export function setBayFilter(){} export function useBaySignedIn(){return true;}'),
  "./use-bay-data": dataModule('export function useBayFeed(){ return globalThis.__bayCollectionFeed; } export function useBayCategories(){return {categories: []};}'),
};
const { BayFeed } = await import(await compileModule("src/shell/bay/shell/BayList.tsx", feedStubs));

test("every feed kind uses a bordered compact list with prices, and the same Library grid cards", () => {
  globalThis.__bayCollectionFeed.items = ["demand", "help", "service", "consult"].map((kind) => ({
    id: kind, kind, title: `Title ${kind}`, summary: "Summary", author: { display_name: "Seller" },
    price: { min_fen: 1200, max_fen: null, unit: null, currency: "USD" },
  }));
  const list = renderToStaticMarkup(React.createElement(BayFeed, { filter: { kind: "service" }, activeKey: null, variant: "list" }));
  assert.equal((list.match(/h-9 w-9/g) || []).length, 4);
  assert.match(list, /divide-y divide-neutral-100/);
  assert.match(list, /\$12/);
  for (const kind of ["demand", "help", "service", "consult"]) assert.match(list, new RegExp(`data-bay-card="${kind}"`));
  assert.doesNotMatch(list, /aspect-video|aspect-\[4\/3\]/);
  const grid = renderToStaticMarkup(React.createElement(BayFeed, { filter: { kind: "service" }, activeKey: null, variant: "grid" }));
  assert.equal((grid.match(/aspect-video/g) || []).length, 4);
});
