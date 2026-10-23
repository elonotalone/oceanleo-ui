// LeoBay 第三波 W1：逛页只有「我的 / 发布」、供给/需求切换、专业咨询专区、素材货架只走深链。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
globalThis.__bay4React = React;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

const pageState = {
  current: { kind: "feed" },
  filter: { kind: "service" },
  signedIn: true,
  enabled: true,
  feed: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  categories: {
    categories: [
      { slug: "ppt", name_zh: "LeoSlides", name_en: "LeoSlides", icon: "ppt" },
      { slug: "music", name_zh: "LeoMusic", name_en: "LeoMusic", icon: "music" },
      { slug: "other", name_zh: "其他", name_en: "Other", icon: "dots" },
    ],
    loading: false,
    failed: false,
  },
};
globalThis.__bay4Page = pageState;

function reset(patch = {}) {
  pageState.current = { kind: "feed" };
  pageState.filter = { kind: "service" };
  pageState.signedIn = true;
  pageState.enabled = true;
  pageState.feed = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  globalThis.__bay4Filters = [];
  globalThis.__bay4OnFilter = null;
  Object.assign(pageState, patch);
}

const stateStub = dataModule(`
  const s = () => globalThis.__bay4Page;
  export function openBay(){}
  export function replaceBay(){}
  export function bayBack(){}
  export function requireBayLogin(){ return true; }
  export function setBayFilter(filter){
    (globalThis.__bay4Filters ||= []).push(filter);
    const on = globalThis.__bay4OnFilter;
    if (typeof on === "function") on(filter);
  }
  export function setBaySiteKey(){}
  export function registerBayPage(){ return () => {}; }
  export function bayEnabledHere(){ return s().enabled; }
  export function useBayFilter(){ return s().filter; }
  export function useBaySignedIn(){ return s().signedIn; }
  export function useBaySiteKey(){ return "oceanleo"; }
  export function useBayState(){ return { current: s().current, canGoBack: s().current.kind !== "feed" }; }
`);
const dataStub = dataModule(`
  export function useBayFeed(){ return globalThis.__bay4Page.feed; }
  export function useBayCategories(){ return globalThis.__bay4Page.categories; }
`);
const cardStub = (names) =>
  names
    .map(
      (name) =>
        `export function ${name}({ item, variant }){ return createElement("button", { type: "button", "data-stub-card": "${name}", "data-variant": variant || "row" }, item.title); }`,
    )
    .join("\n");
const needsStub = dataModule(`
  const createElement = (...args) => globalThis.__bay4React.createElement(...args);
  ${cardStub(["DemandCard", "HelpRequestCard"])}
  export function LibraryWorkPickerHost(){ return null; }
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CallHumanPane = pane("call-human"), DemandPane = pane("demand"), HelpRequestPane = pane("help"), PostNeedPane = pane("post-need"), ProposePane = pane("propose");
  export const MyHelpRequestsPane = pane("mine-help"), MyNeedsPane = pane("mine-needs"), MyProposalsPane = pane("mine-proposals");
`);
const supplyStub = dataModule(`
  const createElement = (...args) => globalThis.__bay4React.createElement(...args);
  ${cardStub(["ServiceCard", "ConsultCard"])}
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CheckoutPane = pane("checkout"), ConsultPane = pane("consult"), ProfilePane = pane("profile"), ServicePane = pane("service");
`);
const paneModule = (exports) =>
  dataModule(`
    const createElement = (...args) => globalThis.__bay4React.createElement(...args);
    ${Object.entries(exports)
      .map(([name, label]) => `export function ${name}(){ return createElement("section", { "data-stub-pane": "${label}" }); }`)
      .join("\n")}
  `);
const exploreStub = dataModule(`
  const createElement = (...args) => globalThis.__bay4React.createElement(...args);
  export function ExplorePage(props){
    return createElement("div", { "data-explore-embedded": props.embedded ? "true" : undefined, "data-explore-stub": "1" });
  }
`);

const stubs = {
  "next-intl": dataModule(`export function useLocale(){ return "zh"; }`),
  "../../../i18n/ui/useUI": uiStub,
  "../../ExplorePage": exploreStub,
  "../asset/BayAssetLibrary": dataModule(`
    const createElement = (...args) => globalThis.__bay4React.createElement(...args);
    export function BayAssetLibrary(){ return createElement("div", { "data-bay-asset-library": "1" }); }
  `),
  "../needs/LibraryWorkPicker": dataModule(`export function LibraryWorkPickerHost(){ return null; }`),
  "./bay-auth-host": dataModule(`export function BayAuthHost(){ return null; }`),
  "./bay-state": stateStub,
  "./use-bay-data": dataStub,
  "../needs": needsStub,
  "../supply": supplyStub,
  "../deal": dataModule(`export function DealConversationView(){ return null; }`),
  "../orders": paneModule({ OrderPane: "order", MyOrdersPane: "mine-orders" }),
  "../seller": paneModule({ ServiceEditorPane: "service-editor", MyServicesPane: "mine-services" }),
  "../settings": paneModule({ BaySettingsPane: "settings" }),
  "./BayMine": paneModule({ BayMine: "mine" }),
};

const { LeoBayPage } = await import(await compileModule("src/shell/bay/shell/LeoBayPage.tsx", stubs));
const { BayViewSwitch, BayFeed } = await import(await compileModule("src/shell/bay/shell/BayList.tsx", stubs));

globalThis.__bay4FeedCalls = [];
const { useBayFeed } = await import(
  await compileModule("src/shell/bay/shell/use-bay-data.ts", {
    "../../../lib/bay/feed": dataModule(`
      export async function fetchBayFeed(filter) {
        (globalThis.__bay4FeedCalls ||= []).push(filter);
        return { items: [], next_cursor: null };
      }
      export function bayFeedErrorText() { return "加载失败，请稍后再试。"; }
      export function classifyBayFeedCaught() { return "error"; }
    `),
    "../../../lib/bay/categories": dataModule(`
      export function deliveryCategories(data) { return data && data.flat_items || []; }
      export async function fetchBayCategories() { return { items: [], flat_items: [], total: 0, site_defaults: {} }; }
    `),
  })
);

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
    async unmount() {
      await act(() => root.unmount());
      host.remove();
    },
  };
}

test("页头只有两个 data-bay-action：mine 和 publish；没有 data-bay-kinds", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const actions = [...view.host.querySelectorAll("[data-bay-page-actions] [data-bay-action]")].map((node) =>
    node.getAttribute("data-bay-action"),
  );
  assert.deepEqual(actions, ["mine", "publish"]);
  assert.equal(view.host.querySelector("[data-bay-kinds]"), null);
  await view.unmount();
});

test("逛页顶栏是出售/求购、种类两个下拉，五个种类在第二个里", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const bar = view.host.querySelector("[data-bay-view]");
  assert.ok(bar);
  assert.equal(bar.querySelectorAll('[role="tab"]').length, 0);
  assert.equal(bar.querySelector("[data-bay-browse-intent]").getAttribute("data-bay-browse-intent"), "sell");
  const intentTrigger = bar.querySelector('[data-bay-filter="intent"]');
  assert.ok(intentTrigger);
  await act(async () => {
    intentTrigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const intentMenu = document.querySelector('[data-bay-filter-menu="intent"]');
  assert.ok(intentMenu);
  assert.deepEqual(
    [...intentMenu.querySelectorAll("[data-view]")].map((node) => node.getAttribute("data-view")),
    ["sell", "buy"],
  );
  assert.deepEqual(
    [...intentMenu.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim()),
    ["出售", "求购"],
  );
  await act(async () => {
    intentTrigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const kind = bar.querySelector("[data-bay-browse-kind]");
  assert.ok(kind);
  assert.ok(kind.querySelector('[data-bay-filter="kind"]'));
  assert.equal(kind.querySelector("select"), null);
  const trigger = kind.querySelector('[data-bay-filter="kind"]');
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const menu = document.querySelector('[data-bay-filter-menu="kind"]');
  assert.ok(menu);
  const views = [...menu.querySelectorAll("[data-view]")].map((node) => node.getAttribute("data-view"));
  assert.deepEqual(views, ["service", "asset", "app", "lesson", "other"]);
  const names = [...menu.querySelectorAll('[role="option"]')].map((node) => node.textContent.trim());
  assert.deepEqual(names, ["人工服务", "现成文件", "网站与软件服务", "课程", "其他"]);
  await view.unmount();
});

function SwitchProbe({ initialKind = "service" }) {
  const [filter, setFilter] = React.useState({ kind: initialKind });
  React.useLayoutEffect(() => {
    globalThis.__bay4OnFilter = (next) => setFilter(next);
    return () => {
      globalThis.__bay4OnFilter = null;
    };
  }, []);
  return React.createElement(BayViewSwitch, { filter, accent: "#0ea5e9" });
}

async function pickIntent(host, value) {
  const trigger = host.querySelector('[data-bay-filter="intent"]');
  assert.ok(trigger, "应有「出售 / 求购」下拉");
  if (!document.querySelector('[data-bay-filter-menu="intent"]')) {
    await act(async () => {
      trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
  }
  const option = document.querySelector(`[data-bay-filter-menu="intent"] [data-value="${value}"]`);
  assert.ok(option, `意向选项 ${value} 应在菜单里`);
  await act(async () => {
    option.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

test("选求购落到 request；选出售从 request 回到上次卖的种类，没有则 service", async () => {
  reset();
  const fresh = await mount(React.createElement(SwitchProbe, { initialKind: "request" }));
  await pickIntent(fresh.host, "sell");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "service");
  await fresh.unmount();

  reset();
  const view = await mount(React.createElement(SwitchProbe, { initialKind: "asset" }));
  await pickIntent(view.host, "buy");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "request");
  assert.equal(globalThis.__bay4Filters.at(-1)?.offer, "asset");
  assert.ok(view.host.querySelector("[data-bay-browse-kind]"));
  assert.equal(view.host.querySelector("[data-bay-browse-intent]").getAttribute("data-bay-browse-intent"), "buy");
  await pickIntent(view.host, "sell");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "asset");
  await view.unmount();
});

test("求购改种类只改 offer，不离开 request", async () => {
  reset();
  const view = await mount(React.createElement(SwitchProbe, { initialKind: "request" }));
  assert.ok(view.host.querySelector("[data-bay-browse-kind]"));
  const trigger = view.host.querySelector('[data-bay-filter="kind"]');
  assert.ok(trigger);
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const option = document.querySelector('[data-bay-filter-menu="kind"] [data-value="app"]');
  assert.ok(option);
  await act(async () => {
    option.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const last = globalThis.__bay4Filters.at(-1);
  assert.equal(last?.kind, "request");
  assert.equal(last?.offer, "app");
  await view.unmount();
});

test("种类下拉能切到现成文件 / 网站与软件服务 / 课程 / 其他", async () => {
  reset();
  const view = await mount(React.createElement(SwitchProbe, { initialKind: "service" }));
  const trigger = view.host.querySelector('[data-bay-filter="kind"]');
  assert.ok(trigger);
  async function pickKind(kind) {
    if (!document.querySelector('[data-bay-filter-menu="kind"]')) {
      await act(async () => {
        trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
    }
    const option = document.querySelector(`[data-bay-filter-menu="kind"] [data-value="${kind}"]`);
    assert.ok(option, `种类选项 ${kind} 应在菜单里`);
    await act(async () => {
      option.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
  }
  await pickKind("app");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "app");
  await pickKind("lesson");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "lesson");
  await pickKind("asset");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "asset");
  await pickKind("other");
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "other");
  await view.unmount();
});

// 站点收进了工具条上的一个下拉：点开「站点」才看得到选项（选项画在 body 上的浮层里）。
async function openSiteMenu(host) {
  const trigger = host.querySelector('[data-bay-filter="category"]');
  assert.ok(trigger, "工具条上应有「站点」下拉");
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  const menu = document.querySelector('[data-bay-filter-menu="category"]');
  assert.ok(menu, "点开后应出现选项单");
  return { trigger, menu };
}

test("服务下「站点」下拉里有专业咨询，需求下没有", async () => {
  reset({ filter: { kind: "service" } });
  const supply = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const supplyMenu = await openSiteMenu(supply.host);
  assert.ok(supplyMenu.menu.querySelector('[data-value="advice"]'));
  await supply.unmount();

  reset({ filter: { kind: "request" } });
  const demand = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const demandMenu = await openSiteMenu(demand.host);
  assert.equal(demandMenu.menu.querySelector('[data-value="advice"]'), null);
  assert.ok(demandMenu.menu.querySelector('[data-value="ppt"]'));
  await demand.unmount();
});

test("需求视图请求 kind=needs，服务视图请求 kind=supply", async () => {
  function Probe({ filter }) {
    useBayFeed(filter, false);
    return React.createElement("span", { "data-feed-probe": filter.kind ?? "service" });
  }

  globalThis.__bay4FeedCalls = [];
  const supply = await mount(React.createElement(Probe, { filter: { kind: "service" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.kind === "supply"));
  await supply.unmount();

  globalThis.__bay4FeedCalls = [];
  const demand = await mount(React.createElement(Probe, { filter: { kind: "request" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.kind === "needs"));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.listing_kind === "service"));
  assert.equal(
    globalThis.__bay4FeedCalls.some((call) => call.kind === "demand" || call.kind === "request"),
    false,
  );
  await demand.unmount();

  globalThis.__bay4FeedCalls = [];
  const wantedApp = await mount(React.createElement(Probe, { filter: { kind: "request", offer: "app" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.kind === "needs" && call.listing_kind === "app"));
  await wantedApp.unmount();

  globalThis.__bay4FeedCalls = [];
  const wantedAsset = await mount(React.createElement(Probe, { filter: { kind: "request", offer: "asset" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.listing_kind === "digital"));
  await wantedAsset.unmount();

  globalThis.__bay4FeedCalls = [];
  const asset = await mount(React.createElement(Probe, { filter: { kind: "asset" } }));
  assert.equal(globalThis.__bay4FeedCalls.length, 0);
  await asset.unmount();
});

test("清除筛选只清搜索词和站点：求购留在求购，种类留在原处", async () => {
  reset({ filter: { kind: "request", category: "ppt" } });
  const wanted = await mount(React.createElement(BayFeed, { filter: { kind: "request", category: "ppt" }, activeKey: null }));
  const clearWanted = wanted.host.querySelector("[data-bay-clear-filters]");
  assert.ok(clearWanted);
  await act(() => clearWanted.click());
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "request");
  await wanted.unmount();

  reset({ filter: { kind: "app", q: "logo" } });
  const selling = await mount(React.createElement(BayFeed, { filter: { kind: "app", q: "logo" }, activeKey: null }));
  const clearSell = selling.host.querySelector("[data-bay-clear-filters]");
  assert.ok(clearSell);
  await act(() => clearSell.click());
  assert.equal(globalThis.__bay4Filters.at(-1)?.kind, "app");
  assert.equal(globalThis.__bay4Filters.at(-1)?.q, undefined);
  await selling.unmount();
});

test("kind=asset 时有素材库和三类切换，没有返回键，页面没有官方素材横幅", async () => {
  reset({ filter: { kind: "asset" } });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector("[data-bay-asset-library]"));
  assert.ok(view.host.querySelector("[data-bay-view]"));
  assert.equal(view.host.querySelector("[data-bay-materials-back]"), null);
  assert.equal(view.host.querySelector("[data-bay-materials-promo]"), null);
  await view.unmount();

  reset();
  const browse = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.equal(browse.host.querySelector("[data-bay-materials-promo]"), null);
  await browse.unmount();
});
