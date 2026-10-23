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
