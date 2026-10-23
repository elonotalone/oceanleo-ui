// leobay-projects W02：LeoBay「逛」——出售/求购下拉、五个种类的新名字、每一类里显示的就是按这一类发布的东西。
//
// 盯的是：
//   1. 种类合同：六个 URL 值（含 other）、五个种类的中文名、旧地址值照认、种类 → 发布种类（listing_kind）；
//   2. 信息流取数：每一类（含求购侧）都带对 listing_kind；现成文件栏默认不走这条信息流；
//   3. 顶栏：出售/求购是一个下拉，种类是第二个下拉，站点「全部站点」；
//   4. 网站与软件服务 / 课程货架：现成数据之后接上卖家按这一类发布的条目，两边都空才显示空态；
//   5. 现成文件：来源第一项「卖家在售」，有卖家文件时默认它，境内没有；
//   6. 右侧栏：搜索提示不列旧种类名，站点「全部站点」；
//   7. 分表：新词条 16 语齐全。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://video.oceanleo.com/bay" });
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__lbpW02React = React;
const { createRoot } = await import("react-dom/client");

const links = await import("../src/shell/bay/shell/bay-links.ts");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const localeStub = dataModule(`export function useLocale(){ return "zh"; }`);

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(element);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    host,
    async rerender(next) {
      await act(() => {
        root.render(next);
      });
    },
    async unmount() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}

async function click(node) {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

/** 点开一个 BayFilterSelect，返回它的选项单（画在 body 上）。 */
async function openSelect(host, name) {
  const trigger = host.querySelector(`[data-bay-filter="${name}"]`);
  assert.ok(trigger, `应有下拉 ${name}`);
  await click(trigger);
  const menu = document.querySelector(`[data-bay-filter-menu="${name}"]`);
  assert.ok(menu, `点开 ${name} 后应有选项单`);
  return { trigger, menu };
}

const optionValues = (menu) => [...menu.querySelectorAll('[role="option"]')].map((node) => node.getAttribute("data-value"));
const optionTexts = (menu) => [...menu.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim());

// ---------------------------------------------------------------------------
// 1. 种类合同
// ---------------------------------------------------------------------------
test("六个 URL 值含 other；五个种类的顺序与名字就是操作员拍板的那一组", () => {
  assert.deepEqual([...links.BAY_FEED_KINDS], ["service", "asset", "app", "lesson", "other", "request"]);
  assert.deepEqual([...links.BAY_SELL_KINDS], ["service", "asset", "app", "lesson", "other"]);
  assert.deepEqual(links.BAY_SELL_KIND_LABEL, {
    service: "人工服务",
    asset: "现成文件",
    app: "网站与软件服务",
    lesson: "课程",
    other: "其他",
  });
  for (const retired of ["服务", "素材", "作品", "成品文件"]) {
    assert.ok(!Object.values(links.BAY_SELL_KIND_LABEL).includes(retired), `${retired} 不再是种类名`);
  }
});

test("other 认得出来，旧地址值照认", () => {
  assert.equal(links.normalizeBayFeedKind("other"), "other");
  assert.equal(links.canonicalBayFeedKind("other"), "other");
  const legacy = {
    asset: "asset",
    app: "app",
    lesson: "lesson",
    service: "service",
    request: "request",
    supply: "service",
    all: "service",
    consult: "service",
    demand: "request",
    help: "request",
    material: "asset",
  };
  for (const [raw, want] of Object.entries(legacy)) {
    assert.equal(links.normalizeBayFeedKind(raw), want, raw);
  }
  assert.equal(links.normalizeBayFeedKind("bogus"), null);
  assert.equal(links.normalizeBayFeedKind(""), null);
  assert.equal(links.canonicalBayFeedKind("bogus"), "service");
  assert.equal(links.isBaySellKind("other"), true);
  assert.equal(links.isBaySellKind("request"), false);
  assert.equal(links.isBaySellKind(undefined), false);
});

test("种类 → 发布种类：现成文件是 digital，其余同名", () => {
  assert.deepEqual(
    Object.fromEntries(links.BAY_SELL_KINDS.map((kind) => [kind, links.bayListingKindFor(kind)])),
    { service: "service", asset: "digital", app: "app", lesson: "lesson", other: "other" },
  );
});

test("sameBayTarget 把 other 当成不同的栏", () => {
  const feed = (kind, offer) => ({ kind: "feed", filter: { kind, offer } });
  assert.equal(links.sameBayTarget(feed("other"), feed("other")), true);
  assert.equal(links.sameBayTarget(feed("other"), feed("service")), false);
  assert.equal(links.sameBayTarget(feed("request", "other"), feed("request", "service")), false);
  assert.equal(links.sameBayTarget(feed("request", "other"), feed("request", "other")), true);
});

// ---------------------------------------------------------------------------
// 2. 信息流取数
// ---------------------------------------------------------------------------
const feedCalls = [];
globalThis.__lbpW02FeedCalls = feedCalls;
const dataModuleFile = await compileModule("src/shell/bay/shell/use-bay-data.ts", {
  "../../../lib/bay/feed": dataModule(`
    export async function fetchBayFeed(filter) {
      globalThis.__lbpW02FeedCalls.push(filter);
      return { items: [], next_cursor: null };
    }
    export function bayFeedErrorText() { return "加载失败，请稍后再试。"; }
    export function classifyBayFeedCaught() { return "error"; }
  `),
  "../../../lib/bay/categories": dataModule(`
    export function deliveryCategories(data) { return data && data.flat_items || []; }
    export async function fetchBayCategories() { return { items: [], flat_items: [], total: 0, site_defaults: {} }; }
  `),
});
const { useBayFeed, bayFeedRequestFor } = await import(dataModuleFile);

test("bayFeedRequestFor：出售侧每一类带自己的 listing_kind", () => {
  const want = {
    service: "service",
    asset: "digital",
    app: "app",
    lesson: "lesson",
    other: "other",
  };
  for (const [kind, listing] of Object.entries(want)) {
    assert.deepEqual(bayFeedRequestFor({ kind }), { kind: "supply", listing_kind: listing }, kind);
  }
  assert.deepEqual(bayFeedRequestFor({}), { kind: "supply", listing_kind: "service" });
});

test("bayFeedRequestFor：求购侧取 offer 对应的发布种类，没写就是人工服务；other 也行", () => {
  assert.deepEqual(bayFeedRequestFor({ kind: "request" }), { kind: "needs", listing_kind: "service" });
  assert.deepEqual(bayFeedRequestFor({ kind: "request", offer: "asset" }), { kind: "needs", listing_kind: "digital" });
  assert.deepEqual(bayFeedRequestFor({ kind: "request", offer: "app" }), { kind: "needs", listing_kind: "app" });
  assert.deepEqual(bayFeedRequestFor({ kind: "request", offer: "lesson" }), { kind: "needs", listing_kind: "lesson" });
  assert.deepEqual(bayFeedRequestFor({ kind: "request", offer: "other" }), { kind: "needs", listing_kind: "other" });
});

test("bayFeedRequestFor：显式指定的发布种类压过 filter.kind（货架、卖家在售用）", () => {
  assert.deepEqual(bayFeedRequestFor({ kind: "app" }, "lesson"), { kind: "supply", listing_kind: "lesson" });
  assert.deepEqual(bayFeedRequestFor({ kind: "request", offer: "app" }, "digital"), { kind: "supply", listing_kind: "digital" });
});

function FeedProbe({ filter, options }) {
  useBayFeed(filter, false, options);
  return React.createElement("span", { "data-probe": "1" });
}

async function callsFor(filter, options) {
  feedCalls.length = 0;
  const view = await mount(React.createElement(FeedProbe, { filter, options }));
  const made = feedCalls.map((call) => ({ ...call }));
  await view.unmount();
  return made;
}

test("useBayFeed：五个种类各发一次请求，kind=supply 且 listing_kind 对", async () => {
  for (const [kind, listing] of [
    ["service", "service"],
    ["app", "app"],
    ["lesson", "lesson"],
    ["other", "other"],
  ]) {
    const calls = await callsFor({ kind });
    assert.equal(calls.length, 1, kind);
    assert.equal(calls[0].kind, "supply", kind);
    assert.equal(calls[0].listing_kind, listing, kind);
  }
});

test("useBayFeed：现成文件栏默认不走这条信息流；要取时必须显式打开", async () => {
  assert.equal((await callsFor({ kind: "asset" })).length, 0);
  const forced = await callsFor({ kind: "asset" }, { enabled: true });
  assert.equal(forced.length, 1);
  assert.equal(forced[0].kind, "supply");
  assert.equal(forced[0].listing_kind, "digital");
  assert.equal((await callsFor({ kind: "service" }, { enabled: false })).length, 0);
});

test("useBayFeed：listingKind 选项和 limit 选项原样传给接口；搜索词与站点一起带", async () => {
  const calls = await callsFor({ kind: "asset", q: "海报", category: "design" }, { listingKind: "digital", limit: 1 });
  assert.equal(calls.length, 1);
  assert.deepEqual(
    { kind: calls[0].kind, listing_kind: calls[0].listing_kind, limit: calls[0].limit, q: calls[0].q, category: calls[0].category },
    { kind: "supply", listing_kind: "digital", limit: 1, q: "海报", category: "design" },
  );
  const shelf = await callsFor({ kind: "app" }, { listingKind: "app" });
  assert.equal(shelf[0].listing_kind, "app");
});

test("useBayFeed：求购侧 other 请求 kind=needs&listing_kind=other", async () => {
  const calls = await callsFor({ kind: "request", offer: "other" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, "needs");
  assert.equal(calls[0].listing_kind, "other");
});

test("信息流客户端把 other 放进查询串，认不得的值不放", async () => {
  const feed = await import(
    await compileModule("src/lib/bay/feed.ts", {
      "./http": dataModule(`export async function bayGet(){ return { items: [], next_cursor: null }; }`),
    })
  );
  assert.equal(feed.bayFeedPath({ kind: "supply", listing_kind: "other" }), "/v1/talent/bay/feed?kind=supply&listing_kind=other");
  assert.equal(feed.bayFeedPath({ kind: "supply", listing_kind: "digital", limit: 1 }), "/v1/talent/bay/feed?kind=supply&listing_kind=digital&limit=1");
  assert.equal(feed.bayFeedPath({ kind: "needs", listing_kind: "other" }), "/v1/talent/bay/feed?kind=needs&listing_kind=other");
  assert.equal(feed.bayFeedPath({ kind: "supply", listing_kind: "bogus" }), "/v1/talent/bay/feed?kind=supply");
  assert.equal(feed.bayFeedPath({ kind: "supply" }), "/v1/talent/bay/feed?kind=supply");
});

// ---------------------------------------------------------------------------
// 3. 顶栏：出售/求购下拉、种类下拉、全部站点、信息流
// ---------------------------------------------------------------------------
const bayState = { filters: [], opened: [], logins: 0, signedIn: true };
globalThis.__lbpW02Bay = bayState;
const remembered = [];
globalThis.__lbpW02Remembered = remembered;
const listFeed = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
globalThis.__lbpW02ListFeed = { ...listFeed };
const feedHookCalls = [];
globalThis.__lbpW02FeedHookCalls = feedHookCalls;

const stateStub = dataModule(`
  const s = () => globalThis.__lbpW02Bay;
  export function openBay(target){ s().opened.push(target); }
  export function requireBayLogin(){ s().logins += 1; return true; }
  export function setBayFilter(filter){ s().filters.push(filter); const on = globalThis.__lbpW02OnFilter; if (typeof on === "function") on(filter); }
  export function useBaySignedIn(){ return s().signedIn; }
`);
const listDataStub = dataModule(`
  export function useBayFeed(filter, signedIn, options){ globalThis.__lbpW02FeedHookCalls.push({ filter, options }); return globalThis.__lbpW02ListFeed; }
  export function useBayCategories(){
    return { categories: [{ slug: "ppt", name_zh: "LeoSlides", name_en: "LeoSlides", icon: "ppt" }, { slug: "music", name_zh: "LeoMusic", name_en: "LeoMusic", icon: "music" }], loading: false, failed: false };
  }
`);
const publishStub = dataModule(`export function rememberPublishListing(id){ globalThis.__lbpW02Remembered.push(id); }`);

const { BayViewSwitch, BayCategorySelect, BayFeed, startPublish } = await import(
  await compileModule("src/shell/bay/shell/BayList.tsx", {
    "next-intl": localeStub,
    "../../../i18n/ui/useUI": uiStub,
    "./bay-state": stateStub,
    "./use-bay-data": listDataStub,
    "../form/publish-listing": publishStub,
  })
);

function resetBay() {
  bayState.filters.length = 0;
  bayState.opened.length = 0;
  bayState.logins = 0;
  bayState.signedIn = true;
  remembered.length = 0;
  feedHookCalls.length = 0;
  globalThis.__lbpW02ListFeed = { ...listFeed };
  globalThis.__lbpW02OnFilter = null;
}

function Switch({ initial }) {
  const [filter, setFilter] = React.useState(initial);
  React.useLayoutEffect(() => {
    globalThis.__lbpW02OnFilter = setFilter;
    return () => {
      globalThis.__lbpW02OnFilter = null;
    };
  }, []);
  return React.createElement(BayViewSwitch, { filter });
}

async function pick(host, name, value) {
  const { menu } = await openSelect(host, name);
  const option = menu.querySelector(`[data-value="${value}"]`);
  assert.ok(option, `${name} 里应有 ${value}`);
  await click(option);
}

test("种类下拉五个选项，名字是新的一组，当前值只显示一个名字", async () => {
  resetBay();
  const view = await mount(React.createElement(Switch, { initial: { kind: "service" } }));
  const kind = view.host.querySelector('[data-bay-filter="kind"]');
  assert.equal(kind.getAttribute("data-value"), "service");
  assert.match(kind.textContent, /人工服务/);
  const { menu } = await openSelect(view.host, "kind");
  assert.deepEqual(optionValues(menu), ["service", "asset", "app", "lesson", "other"]);
  assert.deepEqual(optionTexts(menu), ["人工服务", "现成文件", "网站与软件服务", "课程", "其他"]);
  for (const retired of ["服务", "素材", "作品"]) {
    assert.ok(!optionTexts(menu).includes(retired), `${retired} 不再是种类名`);
  }
  await view.unmount();
});

test("出售下选每个种类：filter.kind 换成这一类，其余筛选原样带着", async () => {
  resetBay();
  const view = await mount(React.createElement(Switch, { initial: { kind: "service", category: "ppt", q: "海报" } }));
  for (const kind of ["asset", "app", "lesson", "other", "service"]) {
    await pick(view.host, "kind", kind);
    const last = bayState.filters.at(-1);
    assert.equal(last.kind, kind);
    assert.equal(last.category, "ppt");
    assert.equal(last.q, "海报");
    assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), kind);
  }
  await view.unmount();
});

test("离开人工服务时清掉「专业咨询」，其余站点不动", async () => {
  resetBay();
  const view = await mount(React.createElement(Switch, { initial: { kind: "service", category: "advice" } }));
  await pick(view.host, "kind", "other");
  assert.equal(bayState.filters.at(-1).kind, "other");
  assert.equal(bayState.filters.at(-1).category, undefined);
  await view.unmount();
});

test("出售/求购是一个下拉：选求购带上当前种类，选出售回到上次卖的种类", async () => {
  resetBay();
  const view = await mount(React.createElement(Switch, { initial: { kind: "other" } }));
  assert.equal(view.host.querySelector('[data-bay-filter="intent"]').getAttribute("data-value"), "sell");
  assert.equal(view.host.querySelector("[data-bay-browse-intent]").getAttribute("data-bay-browse-intent"), "sell");
  await pick(view.host, "intent", "buy");
  assert.deepEqual(
    { kind: bayState.filters.at(-1).kind, offer: bayState.filters.at(-1).offer },
    { kind: "request", offer: "other" },
  );
  assert.equal(view.host.querySelector('[data-bay-filter="intent"]').getAttribute("data-value"), "buy");
  assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), "other");
  await pick(view.host, "intent", "sell");
  assert.equal(bayState.filters.at(-1).kind, "other");
  await view.unmount();
});

test("求购侧种类下拉改的是 offer，且五个种类（含其他）都能选", async () => {
  resetBay();
  const view = await mount(React.createElement(Switch, { initial: { kind: "request" } }));
  assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), "service");
  for (const offer of ["asset", "app", "lesson", "other", "service"]) {
    await pick(view.host, "kind", offer);
    const last = bayState.filters.at(-1);
    assert.equal(last.kind, "request");
    assert.equal(last.offer, offer);
    assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), offer);
  }
  await view.unmount();
});

test("求购侧显示的种类永远是真正在取的那一类（没有 offer 就是人工服务）", async () => {
  resetBay();
  const view = await mount(React.createElement(BayViewSwitch, { filter: { kind: "request" } }));
  assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), "service");
  await view.rerender(React.createElement(BayViewSwitch, { filter: { kind: "request", offer: "app" } }));
  assert.equal(view.host.querySelector('[data-bay-filter="kind"]').getAttribute("data-value"), "app");
  await view.unmount();
});

test("站点下拉：不选时按键上写「全部站点」，选项单第一条也是「全部站点」", async () => {
  resetBay();
  const view = await mount(React.createElement(BayCategorySelect, { filter: { kind: "service" } }));
  const trigger = view.host.querySelector('[data-bay-filter="category"]');
  assert.ok(trigger.textContent.includes("全部站点"));
  assert.ok(!/(^|[^站])全部(?!站点)/.test(trigger.textContent.replace("全部站点", "")), "按键上不能只剩光秃秃的「全部」");
  const { menu } = await openSelect(view.host, "category");
  assert.deepEqual(optionTexts(menu), ["全部站点", "Slides", "Music", "专业咨询"]);
  await click(menu.querySelector('[data-value="ppt"]'));
  assert.equal(bayState.filters.at(-1).category, "ppt");
  await view.unmount();
});

test("其他栏和求购栏的站点下拉没有「专业咨询」", async () => {
  resetBay();
  for (const filter of [{ kind: "other" }, { kind: "request" }, { kind: "app" }]) {
    const view = await mount(React.createElement(BayCategorySelect, { filter }));
    const { menu } = await openSelect(view.host, "category");
    assert.deepEqual(optionTexts(menu), ["全部站点", "Slides", "Music"]);
    await view.unmount();
  }
});

test("信息流本体：其他栏按 filter 取数，卡片是统一的资料库卡；空了没有「清除筛选」", async () => {
  resetBay();
  const item = {
    kind: "service",
    id: "s-other-1",
    title: "年度账本整理",
    summary: "按月对账",
    category: "excel",
    created_at: "2026-10-20T00:00:00Z",
    price: { min_fen: 9900, max_fen: null, unit: "project", currency: "CNY" },
    cover_url: "https://img.example.test/c.png",
    author: { user_id: "u1", handle: "leo", display_name: "Leo", avatar_url: null, verified_level: 0, rating_avg: null, rating_count: 0 },
    stats: {},
    listing_kind: "other",
  };
  globalThis.__lbpW02ListFeed = { ...listFeed, items: [item] };
  const filter = { kind: "other" };
  const view = await mount(React.createElement(BayFeed, { filter, activeKey: null, variant: "grid" }));
  assert.equal(feedHookCalls.at(-1).filter.kind, "other");
  const card = view.host.querySelector('[data-bay-card="service"]');
  assert.ok(card);
  assert.equal(card.getAttribute("data-bay-id"), "s-other-1");
  assert.match(card.textContent, /年度账本整理/);
  await view.unmount();

  globalThis.__lbpW02ListFeed = { ...listFeed };
  const empty = await mount(React.createElement(BayFeed, { filter, activeKey: null, variant: "grid" }));
  assert.equal(empty.host.querySelector("[data-bay-empty]").getAttribute("data-bay-empty"), "pristine");
  assert.equal(empty.host.querySelector("[data-bay-clear-filters]"), null);
  await empty.unmount();
});

test("清除筛选只清搜索词和站点，种类与 offer 留在原处", async () => {
  resetBay();
  for (const filter of [
    { kind: "other", q: "账本", category: "excel" },
    { kind: "request", offer: "other", q: "账本" },
  ]) {
    bayState.filters.length = 0;
    const view = await mount(React.createElement(BayFeed, { filter, activeKey: null }));
    const clear = view.host.querySelector("[data-bay-clear-filters]");
    assert.ok(clear, "有搜索词或站点时空列表要给清除键");
    await click(clear);
    const last = bayState.filters.at(-1);
    assert.equal(last.kind, filter.kind);
    assert.equal(last.offer, filter.offer);
    assert.equal(last.q, undefined);
    assert.equal(last.category, undefined);
    await view.unmount();
  }
});

test("发布键：当前栏是哪一类就按哪一类发布（含其他、现成文件）", () => {
  resetBay();
  const expected = [
    ["service", "service"],
    ["asset", "digital"],
    ["app", "app"],
    ["lesson", "lesson"],
    ["other", "other"],
    [undefined, "service"],
  ];
  for (const [feedKind, listing] of expected) {
    remembered.length = 0;
    bayState.opened.length = 0;
    startPublish(undefined, feedKind);
    assert.deepEqual(remembered, [listing], String(feedKind));
    assert.deepEqual(bayState.opened.at(-1), { kind: "publish" });
  }
  bayState.opened.length = 0;
  remembered.length = 0;
  startPublish("ppt", "request");
  assert.deepEqual(bayState.opened.at(-1), { kind: "post-need", category: "ppt" });
  assert.deepEqual(remembered, []);
});

// ---------------------------------------------------------------------------
// 4. 网站与软件服务 / 课程货架：现有数据之后接上卖家发布的条目
// ---------------------------------------------------------------------------
const shelf = {
  apps: { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
  lessons: { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
  bundles: { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
  posted: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  postedCalls: [],
  reloads: [],
};
globalThis.__lbpW02Shelf = shelf;

function resetShelf(patch = {}) {
  shelf.apps = { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} };
  shelf.lessons = { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} };
  shelf.bundles = { items: [], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} };
  shelf.posted = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  shelf.postedCalls.length = 0;
  shelf.reloads.length = 0;
  Object.assign(shelf, patch);
}

const shelfCommonStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../collection-chrome": dataModule(`
    const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
    export function CollectionCardGrid({ children, ...props }) { return createElement("div", { ...props, "data-stub-grid": "1" }, children); }
    export function CollectionInfiniteSentinel({ active, loading, onLoadMore }) {
      return createElement("button", { type: "button", "data-stub-sentinel": active ? "active" : "idle", "data-loading": loading ? "1" : undefined, onClick: onLoadMore });
    }
  `),
  "../shell/bay-state": dataModule(`export function useBaySignedIn(){ return true; } export function openBay(){}`),
  "../shell/use-bay-data": dataModule(`
    export function useBayFeed(filter, signedIn, options){ globalThis.__lbpW02Shelf.postedCalls.push({ filter, options }); return globalThis.__lbpW02Shelf.posted; }
  `),
  "../shell/BayFeedItemCard": dataModule(`
    const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
    export function FeedCard({ item, variant }) { return createElement("span", { "data-stub-posted": item.id, "data-variant": variant }, item.title); }
  `),
};

const { BayAppShelf } = await import(
  await compileModule("src/shell/bay/apps/BayAppShelf.tsx", {
    ...shelfCommonStubs,
    "../appinsights/app-source": dataModule(`export function rememberBayAppEntry(){}`),
    "../appinsights/insights-model": dataModule(`export function shelfOpenEntry(){ return {}; }`),
    "./BayAppCard": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayAppCard({ app, view }) { return createElement("span", { "data-stub-app": app.id, "data-variant": view }, app.title); }
    `),
    "./use-bay-apps": dataModule(`export function useBayApps(){ return globalThis.__lbpW02Shelf.apps; }`),
  })
);
const { BayLessonShelf } = await import(
  await compileModule("src/shell/bay/lessons/BayLessonShelf.tsx", {
    ...shelfCommonStubs,
    "./BayLessonCard": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayLessonCard({ lesson, view }) { return createElement("span", { "data-stub-lesson": lesson.id, "data-variant": view }, lesson.title); }
    `),
    "./BayBundleCard": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayBundleCard({ bundle }) { return createElement("span", { "data-stub-bundle": bundle.id }, bundle.title); }
    `),
    "./use-bay-lessons": dataModule(`
      export function useBayLessons(){ return globalThis.__lbpW02Shelf.lessons; }
      export function useBayLessonBundles(){ return globalThis.__lbpW02Shelf.bundles; }
    `),
  })
);

const sellerItem = (id, title) => ({
  kind: "service",
  id,
  title,
  summary: "",
  author: { display_name: "Leo", handle: "leo" },
  price: null,
  listing_kind: "app",
});

test("网站与软件服务货架：站点上架的在前，卖家按这一类发布的在后，同一张网格", async () => {
  resetShelf({
    apps: { items: [{ id: "a1", title: "站内应用" }], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
    posted: { items: [sellerItem("p1", "卖家的小程序")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const view = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.deepEqual(shelf.postedCalls.at(-1).options, { listingKind: "app" });
  const grid = view.host.querySelector("[data-stub-grid]");
  assert.ok(grid);
  const order = [...grid.querySelectorAll("[data-stub-app], [data-stub-posted]")].map(
    (node) => node.getAttribute("data-stub-app") || node.getAttribute("data-stub-posted"),
  );
  assert.deepEqual(order, ["a1", "p1"]);
  assert.equal(grid.querySelector('[data-stub-posted="p1"]').getAttribute("data-variant"), "card");
  assert.equal(view.host.querySelector("[data-bay-app-empty]"), null);
  await view.unmount();
});

test("网站与软件服务货架：只有卖家发布的也会显示；列表视图用行", async () => {
  resetShelf({
    posted: { items: [sellerItem("p1", "卖家的小程序")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const view = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9", view: "list" }));
  const posted = view.host.querySelector('[data-stub-posted="p1"]');
  assert.ok(posted);
  assert.equal(posted.getAttribute("data-variant"), "row");
  assert.equal(view.host.querySelector("[data-bay-app-empty]"), null);
  await view.unmount();
});

test("网站与软件服务货架：两边都空才显示空态；任何一边还在加载都不算空", async () => {
  resetShelf();
  const empty = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.ok(empty.host.querySelector("[data-bay-app-empty]"));
  await empty.unmount();

  resetShelf({ posted: { items: [], loading: true, loaded: false, error: null, hasMore: false, loadMore() {}, retry() {} } });
  const waiting = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.equal(waiting.host.querySelector("[data-bay-app-empty]"), null);
  assert.ok(waiting.host.querySelector("[data-bay-app-loading]"));
  await waiting.unmount();

  resetShelf({ apps: { items: [], loading: true, error: null, hasMore: false, loadMore() {}, reload() {} } });
  const appsWaiting = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.equal(appsWaiting.host.querySelector("[data-bay-app-empty]"), null);
  await appsWaiting.unmount();
});

test("网站与软件服务货架：哪边出错就给重试，重试只重取出错的那边；还有更多时两边一起接着取", async () => {
  const reloads = [];
  resetShelf({
    apps: { items: [], loading: false, error: "作品列表没读出来，请稍后点「重试」。", hasMore: false, loadMore() {}, reload: () => reloads.push("apps") },
    posted: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry: () => reloads.push("posted") },
  });
  const failed = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.ok(failed.host.querySelector("[data-bay-app-error]"));
  assert.equal(failed.host.querySelector("[data-bay-app-empty]"), null);
  await click(failed.host.querySelector("[data-bay-app-error] button"));
  assert.deepEqual(reloads, ["apps"]);
  await failed.unmount();

  const more = [];
  resetShelf({
    apps: { items: [{ id: "a1", title: "x" }], loading: false, error: null, hasMore: true, loadMore: () => more.push("apps"), reload() {} },
    posted: { items: [sellerItem("p1", "y")], loading: false, loaded: true, error: null, hasMore: true, loadMore: () => more.push("posted"), retry() {} },
  });
  const paged = await mount(React.createElement(BayAppShelf, { filter: { kind: "app" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  const sentinel = paged.host.querySelector("[data-stub-sentinel]");
  assert.equal(sentinel.getAttribute("data-stub-sentinel"), "active");
  await click(sentinel);
  assert.deepEqual(more.sort(), ["apps", "posted"]);
  await paged.unmount();
});

test("课程货架：课程页签里先排站点的课、再接卖家按「课程」发布的；套餐页签不掺卖家条目", async () => {
  resetShelf({
    lessons: { items: [{ id: "l1", title: "站内课程" }], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
    posted: { items: [{ ...sellerItem("p9", "卖家的课"), listing_kind: "lesson" }], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
    bundles: { items: [{ id: "b1", title: "套餐一" }], loading: false, error: null, hasMore: false, loadMore() {}, reload() {} },
  });
  const view = await mount(React.createElement(BayLessonShelf, { filter: { kind: "lesson" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.deepEqual(shelf.postedCalls.at(-1).options, { listingKind: "lesson" });
  const order = [...view.host.querySelectorAll("[data-stub-lesson], [data-stub-posted]")].map(
    (node) => node.getAttribute("data-stub-lesson") || node.getAttribute("data-stub-posted"),
  );
  assert.deepEqual(order, ["l1", "p9"]);
  assert.equal(view.host.querySelector("[data-bay-lesson-empty]"), null);

  await click(view.host.querySelector('[data-tab="bundle"]'));
  assert.ok(view.host.querySelector('[data-stub-bundle="b1"]'));
  assert.equal(view.host.querySelector("[data-stub-posted]"), null);
  await view.unmount();
});

test("课程货架：两边都空才显示空态", async () => {
  resetShelf();
  const empty = await mount(React.createElement(BayLessonShelf, { filter: { kind: "lesson" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.ok(empty.host.querySelector("[data-bay-lesson-empty]"));
  await empty.unmount();

  resetShelf({
    posted: { items: [{ ...sellerItem("p9", "卖家的课"), listing_kind: "lesson" }], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const onlyPosted = await mount(React.createElement(BayLessonShelf, { filter: { kind: "lesson" }, siteKey: "oceanleo", accent: "#0ea5e9" }));
  assert.equal(onlyPosted.host.querySelector("[data-bay-lesson-empty]"), null);
  assert.ok(onlyPosted.host.querySelector('[data-stub-posted="p9"]'));
  await onlyPosted.unmount();
});

test("两个货架都不手写接口地址、不 fetch", () => {
  for (const file of ["shell/bay/apps/BayAppShelf.tsx", "shell/bay/lessons/BayLessonShelf.tsx", "shell/bay/shell/BayFeedItemCard.tsx", "shell/bay/asset/BayAssetSellers.tsx"]) {
    const text = src(file);
    assert.doesNotMatch(text, /fetch\(/, file);
    assert.doesNotMatch(text, /\/v1\//, file);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML|innerHTML/, file);
  }
});

// ---------------------------------------------------------------------------
// 5. 现成文件：来源第一项「卖家在售」
// ---------------------------------------------------------------------------
const lib = {
  bayOn: true,
  signedIn: true,
  probe: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  sellers: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  calls: [],
};
globalThis.__lbpW02Lib = lib;

function resetLib(patch = {}) {
  lib.bayOn = true;
  lib.signedIn = true;
  lib.probe = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  lib.sellers = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  lib.calls.length = 0;
  Object.assign(lib, patch);
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=asset");
}

const { BayAssetLibrary } = await import(
  await compileModule("src/shell/bay/asset/BayAssetLibrary.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../shell/bay-state": dataModule(`
      export function bayEnabledHere(){ return globalThis.__lbpW02Lib.bayOn; }
      export function useBaySignedIn(){ return globalThis.__lbpW02Lib.signedIn; }
    `),
    "../shell/BayMine": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BaySignInPrompt({ text }) { return createElement("p", { "data-stub-signin": "1" }, text); }
    `),
    "../shell/use-bay-data": dataModule(`
      export function useBayFeed(filter, signedIn, options){
        const lib = globalThis.__lbpW02Lib;
        lib.calls.push({ filter, options });
        return options && options.limit === 1 ? lib.probe : lib.sellers;
      }
      export function useBayCategories(){
        return { categories: [{ slug: "ppt", name_zh: "LeoSlides", name_en: "LeoSlides", icon: "ppt" }], loading: false, failed: false };
      }
    `),
    "../shell/BayList": dataModule(`export function useBayCategoryName(){ return (category) => category.name_zh.replace(/^Leo/, ""); }`),
    "../shell/BayFeedItemCard": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function FeedCard({ item, variant }) { return createElement("span", { "data-stub-posted": item.id, "data-variant": variant }, item.title); }
    `),
    "./bay-template-shelf": dataModule(`
      export const BAY_OFFICIAL_PREVIEW_COUNT = 4;
      export const BAY_TEMPLATE_PAGE_SIZE = 30;
      export const OFFICIAL_TEMPLATE_CATEGORY = "official-templates";
      export async function listBayOfficialTemplates(){ return { items: [], total: 0, hasMore: false }; }
      export async function listBayMineArtifacts(){ return { items: [], total: 0, hasMore: false, unauthenticated: false }; }
      export function mergeOwnedAssets(a, b){ return [...a, ...b]; }
      export function templateArtifactTypeForBay(){ return null; }
      export function originLibraryTypeForBay(){ return null; }
      export function originShelfOptional(){ return true; }
    `),
    "./BayAssetLive": dataModule(`export function BayAssetLive(){ return null; }`),
    "./BayAssetSeries": dataModule(`export function BayAssetSeries(){ return null; }`),
    "./BayAssetDetail": dataModule(`export function BayAssetDetail(){ return null; }`),
    "./BayArtifactDeepLink": dataModule(`export function BayArtifactDeepLink(){ return null; }`),
    "./BayLicensesView": dataModule(`export function BayLicensesView(){ return null; }`),
    "./BayAssetCard": dataModule(`export function BayAssetCard(){ return null; }`),
    "../../../lib/auth/config": dataModule(`export const GATEWAY_BASE = ""; export function isLeoDevPreviewHost(){ return false; }`),
  })
);

const libraryEl = (props = {}) =>
  React.createElement(BayAssetLibrary, { filter: { kind: "asset" }, siteKey: "word", accent: "#0ea5e9", ...props });

const sellerFile = (id, title) => ({
  kind: "service",
  id,
  title,
  summary: "",
  author: { display_name: "Leo", handle: "leo" },
  price: null,
  listing_kind: "digital",
});

const originOf = (host) => host.querySelector('[data-bay-filter="view"]')?.getAttribute("data-value");

test("来源下拉：第一项「卖家在售」，然后是 OceanLeo 自有 / 我上传的 / 开源专区（已入库）/ 实时搜索", async () => {
  resetLib();
  const view = await mount(libraryEl());
  const { menu } = await openSelect(view.host, "view");
  assert.deepEqual(optionValues(menu), ["sellers", "owned", "mine", "stocked", "live"]);
  const names = [...menu.querySelectorAll('[role="option"]')].map((node) => node.textContent.replace(/\d+$/, "").trim());
  assert.deepEqual(names.slice(0, 3), ["卖家在售", "OceanLeo 自有", "我上传的"]);
  assert.ok(!names.includes("我的"), "来源里的「我的」改名「我上传的」");
  await view.unmount();
});

test("有已发布的卖家现成文件时默认来源就是「卖家在售」：列表是卖家的条目，类型 / 目录 / 授权说明收起，多一个站点下拉", async () => {
  resetLib({
    probe: { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
    sellers: { items: [sellerFile("f1", "年报模板"), sellerFile("f2", "汇报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const view = await mount(libraryEl());
  assert.equal(originOf(view.host), "sellers");
  const list = view.host.querySelector("[data-bay-asset-sellers]");
  assert.ok(list);
  assert.deepEqual(
    [...list.querySelectorAll("[data-stub-posted]")].map((node) => node.getAttribute("data-stub-posted")),
    ["f1", "f2"],
  );
  assert.equal(view.host.querySelector('[data-bay-filter="type"]'), null);
  assert.equal(view.host.querySelector('[data-bay-filter="cat"]'), null);
  assert.equal(view.host.querySelector("[data-bay-asset-licenses-open]"), null);
  const site = view.host.querySelector('[data-bay-filter="seller-site"]');
  assert.ok(site);
  assert.ok(site.textContent.includes("全部站点"));
  // 探测只取一条、与搜索词无关；卖家列表按现成文件（digital）取。
  assert.ok(lib.calls.some((call) => call.options?.limit === 1 && call.options?.listingKind === "digital" && call.options?.enabled === true));
  assert.ok(lib.calls.some((call) => call.options?.listingKind === "digital" && call.options?.limit === undefined));
  await view.unmount();
});

test("没有卖家发布的现成文件时保持原来的默认来源，来源下拉里「卖家在售」仍在", async () => {
  resetLib();
  const view = await mount(libraryEl());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(originOf(view.host), "owned");
  assert.equal(view.host.querySelector("[data-bay-asset-sellers]"), null);
  assert.ok(view.host.querySelector('[data-bay-filter="type"]'));
  await view.unmount();
});

test("探测还没回来时先不下结论（不先画自有再跳去卖家在售）", async () => {
  resetLib({ probe: { items: [], loading: true, loaded: false, error: null, hasMore: false, loadMore() {}, retry() {} } });
  const view = await mount(libraryEl());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(view.host.querySelector("[data-bay-asset-sellers]"), null);
  assert.ok(view.host.querySelector("[data-bay-asset-loading]"), "等探测期间画骨架，不先画自有内容");
  lib.probe = { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  lib.sellers = lib.probe;
  await view.rerender(libraryEl());
  assert.equal(originOf(view.host), "sellers");
  await view.unmount();
});

test("用户换了来源或类型之后，「卖家在售」不再抢默认", async () => {
  resetLib({
    probe: { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
    sellers: { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const view = await mount(libraryEl());
  assert.equal(originOf(view.host), "sellers");
  await pick(view.host, "view", "owned");
  assert.equal(originOf(view.host), "owned");
  assert.equal(view.host.querySelector("[data-bay-asset-sellers]"), null);
  assert.ok(view.host.querySelector('[data-bay-filter="type"]'), "离开卖家在售后类型下拉回来");
  await pick(view.host, "type", "pdf");
  assert.equal(originOf(view.host), "owned", "换类型不会被拉回卖家在售");
  await pick(view.host, "view", "sellers");
  assert.equal(originOf(view.host), "sellers");
  await view.unmount();
});

test("地址里钉住的来源优先于默认：view=owned 不被卖家在售抢走；view=sellers 即使探测为空也停在卖家在售", async () => {
  resetLib({
    probe: { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=asset&view=owned");
  const pinned = await mount(libraryEl());
  assert.equal(originOf(pinned.host), "owned");
  await pinned.unmount();

  resetLib();
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=asset&view=sellers");
  const sellers = await mount(libraryEl());
  assert.equal(originOf(sellers.host), "sellers");
  assert.ok(sellers.host.querySelector("[data-bay-asset-sellers]"));
  assert.ok(sellers.host.querySelector("[data-bay-asset-empty]"));
  await sellers.unmount();
});

test("境内没有交易市场：来源里没有「卖家在售」、不探测、地址里的 view=sellers 也不认", async () => {
  resetLib({ bayOn: false });
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=asset&view=sellers");
  const view = await mount(libraryEl());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.notEqual(originOf(view.host), "sellers");
  assert.equal(view.host.querySelector("[data-bay-asset-sellers]"), null);
  const { menu } = await openSelect(view.host, "view");
  assert.deepEqual(optionValues(menu), ["owned", "mine", "stocked", "live"]);
  assert.ok(lib.calls.every((call) => call.options?.enabled === false), "境内的探测是关着的");
  await view.unmount();
});

test("卖家在售：站点下拉选一个站点，列表按这个站点取；搜索词一起带", async () => {
  resetLib({
    probe: { items: [sellerFile("f1", "年报模板")], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  });
  const view = await mount(libraryEl({ filter: { kind: "asset", q: "年报" } }));
  assert.equal(originOf(view.host), "sellers");
  await pick(view.host, "seller-site", "ppt");
  const last = [...lib.calls].reverse().find((call) => call.options?.listingKind === "digital" && call.options?.limit === undefined);
  assert.equal(last.filter.category, "ppt");
  assert.equal(last.filter.q, "年报");
  await view.unmount();
});

test("素材库各下拉的「全部」都带名词：目录「全部目录」；类型下拉的名字不再和种类下拉同名", async () => {
  resetLib();
  const view = await mount(libraryEl());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const cat = view.host.querySelector('[data-bay-filter="cat"]');
  assert.ok(cat);
  assert.ok(cat.textContent.includes("全部目录"));
  const { menu } = await openSelect(view.host, "cat");
  assert.equal(optionTexts(menu)[0], "全部目录");
  await click(view.host.querySelector('[data-bay-filter="cat"]'));
  const text = src("shell/bay/asset/BayAssetLibrary.tsx");
  assert.doesNotMatch(text, /allLabel=\{tt\("全部"\)\}/);
  assert.match(text, /label=\{tt\("文件类型"\)\}/);
  await view.unmount();
});

// ---------------------------------------------------------------------------
// 6. 右侧栏
// ---------------------------------------------------------------------------
const panel = { filter: { kind: "service" }, filters: [] };
globalThis.__lbpW02Panel = panel;

const { PanelBrowse } = await import(
  await compileModule("src/shell/bay/panel/PanelBrowse.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../apps/BayAppShelf": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayAppShelf(){ return createElement("div", { "data-stub-shelf": "app" }); }
    `),
    "../asset/BayAssetLibrary": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayAssetLibrary(){ return createElement("div", { "data-stub-shelf": "asset" }); }
    `),
    "../lessons/BayLessonShelf": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function BayLessonShelf(){ return createElement("div", { "data-stub-shelf": "lesson" }); }
    `),
    "../shell/BayList": dataModule(`
      const createElement = (...args) => globalThis.__lbpW02React.createElement(...args);
      export function useBaySearchText(filter){ return { text: (filter && filter.q) || "", change(){}, commit(){} }; }
      export function useBayCategoryName(){ return (category) => category.name_zh.replace(/^Leo/, ""); }
      export function BayViewSwitch(){ return createElement("div", { "data-bay-view": "stub" }); }
      export function BayFeed(){ return createElement("div", { "data-stub-shelf": "feed" }); }
      export function openMine(){}
      export function startPublish(){}
    `),
    "../shell/bay-state": dataModule(`
      export function useBayFilter(){ return globalThis.__lbpW02Panel.filter; }
      export function setBayFilter(filter){ globalThis.__lbpW02Panel.filters.push(filter); }
    `),
    "../shell/use-bay-data": dataModule(`
      export function useBayCategories(){
        return { categories: [{ slug: "ppt", name_zh: "LeoSlides", name_en: "LeoSlides", icon: "ppt" }], loading: false, failed: false };
      }
    `),
  })
);

test("右侧栏：搜索提示不再列旧种类名；站点下拉写「全部站点」", async () => {
  panel.filter = { kind: "service" };
  panel.filters.length = 0;
  const view = await mount(React.createElement(PanelBrowse, { siteKey: "ppt" }));
  const input = view.host.querySelector("[data-bay-panel-search] input");
  assert.equal(input.getAttribute("placeholder"), "搜索 LeoBay");
  for (const retired of ["素材", "服务", "作品"]) assert.ok(!input.getAttribute("placeholder").includes(retired));
  const site = view.host.querySelector('[data-bay-filter="category"]');
  assert.ok(site.textContent.includes("全部站点"));
  const { menu } = await openSelect(view.host, "category");
  assert.deepEqual(optionTexts(menu), ["全部站点", "Slides", "专业咨询"]);
  await click(menu.querySelector('[data-value="ppt"]'));
  assert.equal(panel.filters.at(-1).category, "ppt");
  await view.unmount();
});

test("右侧栏：每个种类对应的内容 —— 其他走信息流，现成文件 / 网站与软件服务 / 课程走各自的货架，现成文件栏不放站点", async () => {
  const expected = { service: "feed", other: "feed", request: "feed", asset: "asset", app: "app", lesson: "lesson" };
  for (const [kind, shelfName] of Object.entries(expected)) {
    panel.filter = { kind };
    const view = await mount(React.createElement(PanelBrowse, { siteKey: "ppt" }));
    assert.equal(view.host.querySelector("[data-stub-shelf]").getAttribute("data-stub-shelf"), shelfName, kind);
    assert.equal(Boolean(view.host.querySelector('[data-bay-filter="category"]')), kind !== "asset", kind);
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 7. 分表
// ---------------------------------------------------------------------------
const LOCALES16 = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[一-鿿]/;
const { LBP_W02_MESSAGES } = await import("../src/i18n/ui/messages/lbp-w02-copy.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");

test("lbp-w02-copy：每条 16 语非空、中文站 key 等于值、非中日韩不含汉字、占位符不丢", () => {
  const keys = Object.keys(LBP_W02_MESSAGES.zh);
  assert.deepEqual(keys.sort(), ["卖家在售", "我上传的", "全部目录", "全部站点", "登录后查看你上传的这一类文件。", "网站与软件服务"].sort());
  for (const key of keys) {
    assert.equal(LBP_W02_MESSAGES.zh[key], key);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES16) {
      const value = LBP_W02_MESSAGES[locale]?.[key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
    }
  }
});

test("英文就是操作员拍板的那几句；网站与软件服务的英文与基础词典一致", () => {
  assert.equal(LBP_W02_MESSAGES.en["全部站点"], "All sites");
  assert.equal(LBP_W02_MESSAGES.en["我上传的"], "My uploads");
  assert.equal(LBP_W02_MESSAGES.en["卖家在售"], "From sellers");
  assert.equal(LBP_W02_MESSAGES.en["网站与软件服务"], "Website & software service");
  assert.equal(UI_MESSAGES.en["网站与软件服务"], "Website & software service");
  const english = (key) => UI_MESSAGES.en[key];
  assert.equal(english("人工服务"), "Human service");
  assert.equal(english("现成文件"), "Ready-made files");
  assert.equal(english("出售"), "For sale");
  assert.equal(english("求购"), "Wanted");
});

test("英文界面：五个种类、出售/求购的名字就是约定的那一组；两个下拉的读屏名不再同叫 Type", () => {
  const en = UI_MESSAGES.en;
  assert.deepEqual(
    links.BAY_SELL_KINDS.map((kind) => en[links.BAY_SELL_KIND_LABEL[kind]]),
    ["Human service", "Ready-made files", "Website & software service", "Lessons", "Other"],
  );
  assert.deepEqual([en["出售"], en["求购"]], ["For sale", "Wanted"]);
  assert.deepEqual([en["全部站点"], en["全部类型"], en["全部目录"]], ["All sites", "All types", "All categories"]);
  // 种类下拉（页级）叫 Type，素材库里的类型下拉叫 File type：同屏不再有两个 Type。
  assert.equal(en["种类"], "Type");
  assert.equal(en["文件类型"], "File type");
  const library = src("shell/bay/asset/BayAssetLibrary.tsx");
  assert.doesNotMatch(library, /label=\{tt\("类型"\)\}/);
});

function ttKeysOf(file) {
  const text = src(file);
  const keys = new Set();
  for (const match of text.matchAll(/\btt\(\s*"([^"\n]*[一-鿿][^"\n]*)"/g)) keys.add(match[1]);
  return keys;
}

test("我改动的文件里每一句 tt() 中文都有 16 语译文（五个种类名、站点、来源也是）", () => {
  const files = [
    "shell/bay/shell/BayList.tsx",
    "shell/bay/shell/BayFeedItemCard.tsx",
    "shell/bay/asset/BayAssetSellers.tsx",
    "shell/bay/asset/BayAssetLibrary.tsx",
    "shell/bay/asset/origin-index.ts",
    "shell/bay/panel/PanelBrowse.tsx",
    "shell/bay/apps/BayAppShelf.tsx",
    "shell/bay/lessons/BayLessonShelf.tsx",
  ];
  const keys = new Set(Object.values(links.BAY_SELL_KIND_LABEL));
  for (const file of files) for (const key of ttKeysOf(file)) keys.add(key);
  // 经 tt(ZONE_LABELS[…]) 画出来的来源名。
  for (const label of ["卖家在售", "OceanLeo 自有", "我上传的", "开源专区（已入库）", "实时搜索"]) keys.add(label);
  assert.ok(keys.size >= 20, `只收到 ${keys.size} 条`);
  const missing = [];
  for (const key of keys) {
    for (const locale of LOCALES16) {
      const value = UI_MESSAGES[locale]?.[key];
      if (typeof value !== "string" || !value.trim()) missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------
// 8. 等父 agent 改 bay-state.ts 之后才会绿（交卷「对父 agent 的请求」第 1 条）
// ---------------------------------------------------------------------------
test(
  "bay-state 的求购 offer 白名单认 other：筛选里写 offer=other 不会被丢回人工服务（也认地址 ?offer=other）",
  { todo: "bay-state.ts 不归 W02：normalizeFilter 与 readPageOffer 各加一个 other，见交卷「对父 agent 的请求」" },
  async () => {
    const family = dataModule(`
      export function currentDomainFamily() { return "com"; }
      export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
      export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
    `);
    const state = await import(
      await compileModule("src/shell/bay/shell/bay-state.ts", {
        "../../../contracts/domain-family": family,
        "../../../lib/auth/client": dataModule(`
          export const AUTH_STATE_EVENT = "oceanleo:auth-state";
          export function cachedAccessToken() { return null; }
          export async function accessToken() { return null; }
        `),
        "../../../lib/auth/config": dataModule(`export function isLeoDevPreviewHost() { return false; }`),
        "../../messages/host-state": dataModule(`
          export function hostState() { return { getSnapshot() { return { enabled: false, open: false, conversationId: null }; }, open() {}, subscribe() { return () => {}; } }; }
        `),
      })
    );
    let seen = null;
    function Probe() {
      seen = state.useBayFilter();
      return null;
    }
    const view = await mount(React.createElement(Probe));
    await act(() => {
      state.setBayFilter({ kind: "request", offer: "other" });
    });
    assert.equal(seen.kind, "request");
    assert.equal(seen.offer, "other");
    await act(() => {
      state.setBayFilter({ kind: "service" });
    });
    window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=request&offer=other");
    let off = () => {};
    await act(() => {
      off = state.registerBayPage();
    });
    assert.equal(seen.kind, "request");
    assert.equal(seen.offer, "other");
    off();
    await act(() => {
      state.setBayFilter({ kind: "service" });
    });
    window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay");
    await view.unmount();
  },
);
