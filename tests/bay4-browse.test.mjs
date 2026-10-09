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
  filter: { kind: "supply" },
  signedIn: true,
  enabled: true,
  feed: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  categories: {
    categories: [{ slug: "design", name_zh: "设计与视觉", name_en: "Design", icon: "palette" }],
    loading: false,
    failed: false,
  },
};
globalThis.__bay4Page = pageState;

function reset(patch = {}) {
  pageState.current = { kind: "feed" };
  pageState.filter = { kind: "supply" };
  pageState.signedIn = true;
  pageState.enabled = true;
  pageState.feed = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  Object.assign(pageState, patch);
}

const stateStub = dataModule(`
  const s = () => globalThis.__bay4Page;
  export function openBay(){}
  export function replaceBay(){}
  export function bayBack(){}
  export function requireBayLogin(){ return true; }
  export function setBayFilter(){}
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

test("有 data-bay-view 两个 tab", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const tabs = view.host.querySelector("[data-bay-view]");
  assert.ok(tabs);
  assert.equal(tabs.getAttribute("role"), "tablist");
  const views = [...tabs.querySelectorAll('[role="tab"]')].map((node) => node.getAttribute("data-view"));
  assert.deepEqual(views, ["supply", "demand"]);
  await view.unmount();
});

test("供给下有 data-category=advice，需求下没有", async () => {
  reset({ filter: { kind: "supply" } });
  const supply = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(supply.host.querySelector('[data-category="advice"]'));
  await supply.unmount();

  reset({ filter: { kind: "demand" } });
  const demand = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.equal(demand.host.querySelector('[data-category="advice"]'), null);
  assert.ok(demand.host.querySelector('[data-category="design"]'));
  await demand.unmount();
});

test("需求视图请求 kind=needs，供给视图请求 kind=supply", async () => {
  function Probe({ filter }) {
    useBayFeed(filter, false);
    return React.createElement("span", { "data-feed-probe": filter.kind ?? "supply" });
  }

  globalThis.__bay4FeedCalls = [];
  const supply = await mount(React.createElement(Probe, { filter: { kind: "supply" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.kind === "supply"));
  await supply.unmount();

  globalThis.__bay4FeedCalls = [];
  const demand = await mount(React.createElement(Probe, { filter: { kind: "demand" } }));
  assert.ok(globalThis.__bay4FeedCalls.some((call) => call.kind === "needs"));
  assert.equal(
    globalThis.__bay4FeedCalls.some((call) => call.kind === "demand"),
    false,
  );
  await demand.unmount();
});

test("kind=material 时有返回键、没有切换，页面没有官方素材横幅", async () => {
  reset({ filter: { kind: "material" } });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector("[data-bay-materials-back]"));
  assert.equal(view.host.querySelector("[data-bay-view]"), null);
  assert.equal(view.host.querySelector("[data-bay-materials-promo]"), null);
  await view.unmount();

  reset();
  const browse = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.equal(browse.host.querySelector("[data-bay-materials-promo]"), null);
  await browse.unmount();
});
