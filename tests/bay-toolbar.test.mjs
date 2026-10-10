// LeoBay 一行工具条：页上 flex-nowrap、服务栏站点下拉、素材栏筛选槽、BayFilterSelect 触发器文案、无 Provider 就地画。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
globalThis.__bayToolbarReact = React;

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
    categories: [{ slug: "design", name_zh: "设计与视觉", name_en: "Design", icon: "palette" }],
    loading: false,
    failed: false,
  },
};
globalThis.__bayToolbarPage = pageState;

function reset(patch = {}) {
  pageState.current = { kind: "feed" };
  pageState.filter = { kind: "service" };
  pageState.signedIn = true;
  pageState.enabled = true;
  pageState.feed = { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  Object.assign(pageState, patch);
}

const stateStub = dataModule(`
  const s = () => globalThis.__bayToolbarPage;
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
  export function useBayFeed(){ return globalThis.__bayToolbarPage.feed; }
  export function useBayCategories(){ return globalThis.__bayToolbarPage.categories; }
`);
const cardStub = (names) =>
  names
    .map(
      (name) =>
        `export function ${name}({ item, variant }){ return createElement("button", { type: "button", "data-stub-card": "${name}", "data-variant": variant || "row" }, item.title); }`,
    )
    .join("\n");
const needsStub = dataModule(`
  const createElement = (...args) => globalThis.__bayToolbarReact.createElement(...args);
  ${cardStub(["DemandCard", "HelpRequestCard"])}
  export function LibraryWorkPickerHost(){ return null; }
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CallHumanPane = pane("call-human"), DemandPane = pane("demand"), HelpRequestPane = pane("help"), PostNeedPane = pane("post-need"), ProposePane = pane("propose");
  export const MyHelpRequestsPane = pane("mine-help"), MyNeedsPane = pane("mine-needs"), MyProposalsPane = pane("mine-proposals");
`);
const supplyStub = dataModule(`
  const createElement = (...args) => globalThis.__bayToolbarReact.createElement(...args);
  ${cardStub(["ServiceCard", "ConsultCard"])}
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CheckoutPane = pane("checkout"), ConsultPane = pane("consult"), ProfilePane = pane("profile"), ServicePane = pane("service");
`);
const paneModule = (exports) =>
  dataModule(`
    const createElement = (...args) => globalThis.__bayToolbarReact.createElement(...args);
    ${Object.entries(exports)
      .map(([name, label]) => `export function ${name}(){ return createElement("section", { "data-stub-pane": "${label}" }); }`)
      .join("\n")}
  `);

const stubs = {
  "next-intl": dataModule(`export function useLocale(){ return "zh"; }`),
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/official": dataModule(`export async function getBayOfficialPublisher(){ return { user_id: null, handle: "oceanleo", display_name: "OceanLeo", avatar_url: null, official: true }; }`),
  "../../ExplorePage": dataModule(`
    const createElement = (...args) => globalThis.__bayToolbarReact.createElement(...args);
    export function ExplorePage(){ return createElement("div", { "data-explore-stub": "1" }); }
  `),
  "../asset/BayAssetLibrary": dataModule(`
    const createElement = (...args) => globalThis.__bayToolbarReact.createElement(...args);
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
const { PanelBrowse } = await import(await compileModule("src/shell/bay/panel/PanelBrowse.tsx", stubs));
const { BayFilterSelect, BayToolbarFilters } = await import(await compileModule("src/shell/bay/shell/BayFilterSelect.tsx", stubs));

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

const html = (node) => renderToStaticMarkup(node);

test("工具条容器是 flex-nowrap 且没有 flex-wrap", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const toolbar = view.host.querySelector("[data-bay-page-toolbar]");
  assert.ok(toolbar);
  assert.match(toolbar.className, /\bflex-nowrap\b/);
  assert.doesNotMatch(toolbar.className, /\bflex-wrap\b/);
  assert.ok(toolbar.querySelector("[data-bay-page-search]"));
  await view.unmount();
});

test("服务栏渲染出站点下拉 data-bay-filter=category", async () => {
  reset({ filter: { kind: "service" } });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector('[data-bay-filter="category"]'));
  assert.equal(view.host.querySelector("[data-bay-toolbar-slot]"), null);
  await view.unmount();
});

test("素材栏渲染出 data-bay-toolbar-slot 且不渲染站点下拉", async () => {
  reset({ filter: { kind: "asset" } });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector("[data-bay-toolbar-slot]"));
  assert.equal(view.host.querySelector('[data-bay-filter="category"]'), null);
  await view.unmount();
});

test("BayFilterSelect 选中时按键上显示选中项的 label、未选时显示 allLabel", () => {
  const options = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
  ];
  const selected = html(
    React.createElement(BayFilterSelect, {
      label: "类型",
      name: "type",
      value: "image",
      options,
      allLabel: "全部",
      onChange() {},
    }),
  );
  assert.match(selected, /data-bay-filter="type"/);
  assert.match(selected, /图片/);
  assert.doesNotMatch(selected, />全部</);

  const empty = html(
    React.createElement(BayFilterSelect, {
      label: "类型",
      name: "type",
      value: "",
      options,
      allLabel: "全部",
      onChange() {},
    }),
  );
  assert.match(empty, /全部/);
});

test("BayToolbarFilters 在没有 Provider 时就地渲染 data-bay-toolbar-inline", () => {
  const out = html(
    React.createElement(BayToolbarFilters, { children: React.createElement("span", { "data-filter-child": "1" }, "x") }),
  );
  assert.match(out, /data-bay-toolbar-inline/);
  assert.match(out, /data-filter-child="1"/);
  assert.match(out, /\bflex-nowrap\b/);
});

test("右侧栏第二行是 nowrap 工具条：服务栏有站点下拉，素材栏没有", async () => {
  reset({ filter: { kind: "service" } });
  const service = await mount(React.createElement(PanelBrowse, { siteKey: "oceanleo" }));
  const toolbar = service.host.querySelector("[data-bay-panel-toolbar]");
  assert.ok(toolbar);
  assert.match(toolbar.className, /\bflex-nowrap\b/);
  assert.doesNotMatch(toolbar.className, /\bflex-wrap\b/);
  assert.ok(toolbar.querySelector("[data-bay-view]"));
  assert.ok(toolbar.querySelector('[data-bay-filter="category"]'));
  await service.unmount();

  reset({ filter: { kind: "asset" } });
  const asset = await mount(React.createElement(PanelBrowse, { siteKey: "oceanleo" }));
  const assetBar = asset.host.querySelector("[data-bay-panel-toolbar]");
  assert.ok(assetBar);
  assert.ok(assetBar.querySelector("[data-bay-view]"));
  assert.equal(assetBar.querySelector('[data-bay-filter="category"]'), null);
  await asset.unmount();
});
