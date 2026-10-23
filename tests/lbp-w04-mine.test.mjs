// leobay-projects W04：「我的」页。
// 三块下划线页签（交易 / 我的主页 / 数据面板）、交易里两个下拉、地址兼容、不铺整页白板、
// 「我买到的」每行付款金额与对账单、退役种类名清扫、新文案 17 语。jsdom 真渲染，接口用 http 替身。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_MINE_LIST,
  MINE_BLOCKS,
  MINE_LISTS,
  isMineList,
  mineBlockOfTab,
  mineListOfTab,
  mineTabOfBlock,
  normalizeMineTab,
} from "../src/shell/bay/mine/mine-blocks.ts";
import { getMineView, resetMineView, setMineSearch, setMineView } from "../src/shell/bay/mine/mine-view-state.ts";

const INITIAL_MINE_VIEW = { list: "published", category: "all", display: "grid", queries: { published: "", sold: "", bought: "", favorites: "" } };

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://design.oceanleo.com/bay",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__w4React = React;
const { createRoot } = await import("react-dom/client");

const W = (globalThis.__w4 = {
  opened: [],
  signedIn: true,
  panes: [],
  calls: [],
  userId: "me",
  orders: [],
});

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  const api = {
    host,
    root,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    async render(next) {
      await act(async () => root.render(next));
      await settle();
    },
    async click(target) {
      const el = typeof target === "string" ? host.querySelector(target) : target;
      assert.ok(el, `找不到 ${target}`);
      await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await settle();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
  return api;
}

// ---------------------------------------------------------------------------------------------
// 一、纯规则：三块与地址映射
// ---------------------------------------------------------------------------------------------

test("地址映射表：published|sold|bought|favorites 都落在「交易」并选中对应列表；page、dashboard 原样；认不出的当 published", () => {
  assert.deepEqual([...MINE_BLOCKS], ["trade", "page", "dashboard"]);
  assert.deepEqual([...MINE_LISTS], ["published", "sold", "bought", "favorites"]);
  assert.equal(DEFAULT_MINE_LIST, "published");
  const table = [
    ["published", "trade", "published"],
    ["sold", "trade", "sold"],
    ["bought", "trade", "bought"],
    ["favorites", "trade", "favorites"],
    ["page", "page", "published"],
    ["dashboard", "dashboard", "published"],
    ["help", "trade", "published"],
    ["", "trade", "published"],
    [undefined, "trade", "published"],
  ];
  for (const [tab, block, list] of table) {
    assert.equal(mineBlockOfTab(tab), block, `${String(tab)} 的块`);
    assert.equal(mineListOfTab(tab), list, `${String(tab)} 的列表`);
  }
  assert.equal(normalizeMineTab("page"), "page");
  assert.equal(normalizeMineTab("dashboard"), "dashboard");
  assert.equal(normalizeMineTab("nope"), "published");
  assert.equal(mineListOfTab("page", "bought"), "bought", "主页没有列表，用最近看的那个");
  assert.equal(mineListOfTab("sold", "bought"), "sold", "地址上有列表就以地址为准");
  assert.equal(isMineList("sold"), true);
  assert.equal(isMineList("page"), false);
  // 点页签换到的地址值
  assert.equal(mineTabOfBlock("trade"), "published");
  assert.equal(mineTabOfBlock("trade", "bought"), "bought");
  assert.equal(mineTabOfBlock("page", "bought"), "page");
  assert.equal(mineTabOfBlock("dashboard", "bought"), "dashboard");
});

test("bay-links 与 BayMineTab 类型不动：六个地址值照旧能解析（老值也落到新位置）", async () => {
  const links = await import("../src/shell/bay/shell/bay-links.ts");
  for (const tab of ["published", "sold", "bought", "favorites", "page", "dashboard"]) {
    assert.equal(links.normalizeBayMineTab(tab), tab);
  }
  assert.equal(links.normalizeBayMineTab("orders"), "bought");
  assert.equal(links.normalizeBayMineTab("card"), "page");
  assert.deepEqual(links.parseBayParam("mine:sold"), { kind: "mine", tab: "sold" });
  assert.deepEqual(links.parseBayParam("mine:page"), { kind: "mine", tab: "page" });
  assert.deepEqual(links.parseBayParam("mine:dashboard"), { kind: "mine", tab: "dashboard" });
  assert.equal(links.formatBayParam({ kind: "mine", tab: "favorites" }), "mine:favorites");
});

test("视图状态仓：没变化不通知；复位回到「我发布的」与「全部」", () => {
  resetMineView();
  assert.deepEqual(getMineView(), INITIAL_MINE_VIEW);
  const first = getMineView();
  setMineView({ list: "published" });
  assert.equal(getMineView(), first, "值没变就不换对象");
  setMineView({ list: "bought", category: "lesson" });
  assert.deepEqual(getMineView(), { ...INITIAL_MINE_VIEW, list: "bought", category: "lesson" });
  resetMineView();
  assert.deepEqual(getMineView(), INITIAL_MINE_VIEW);
});

test("搜索按交易清单分别保存，视图切换独立于类别和查询", () => {
  resetMineView();
  setMineSearch("published", "Logo");
  setMineSearch("bought", "课程");
  setMineView({ list: "bought", display: "list" });
  assert.deepEqual(getMineView().queries, { published: "Logo", sold: "", bought: "课程", favorites: "" });
  assert.equal(getMineView().display, "list");
  const previous = getMineView();
  setMineSearch("bought", "课程");
  assert.equal(getMineView(), previous);
  resetMineView();
});

// ---------------------------------------------------------------------------------------------
// 二、BayMine 真渲染（窗格换成替身，页签与下拉是真的）
// ---------------------------------------------------------------------------------------------

const stateStub = dataModule(`
  export function replaceBay(target){ globalThis.__w4.opened.push(target); }
  export function openBay(target){ globalThis.__w4.opened.push(target); }
  export function requireBayLogin(){ return true; }
  export function useBaySignedIn(){ return globalThis.__w4.signedIn !== false; }
`);
const panesStub = dataModule(`
  const createElement = (...args) => globalThis.__w4React.createElement(...args);
  const make = (name) => function Pane(props){
    globalThis.__w4.panes.push({ name, category: props.category, tab: props.tab, target: props.target, layout: props.layout });
    return createElement("section", { "data-stub-pane": name, "data-category": props.category == null ? "" : props.category, "data-query": props.query, "data-display": props.display });
  };
  export const MyPublishedPane = make("published"), MySoldPane = make("sold"), MyBoughtPane = make("bought"), MyFavoritesPane = make("favorites");
`);
const dashboardStub = dataModule(`
  const createElement = (...args) => globalThis.__w4React.createElement(...args);
  export function BayMineDashboardTab(props){ return createElement("section", { "data-stub-pane": "dashboard", "data-category": props.category == null ? "" : props.category }); }
`);
const profileStub = dataModule(`
  const createElement = (...args) => globalThis.__w4React.createElement(...args);
  export function ProfilePane(props){ return createElement("section", { "data-stub-pane": "profile", "data-handle": props.target && props.target.handle }); }
`);
const partsStub = dataModule("export function PaneLoading(){ return null; }");

const { BayMine, BayMineTabs } = await import(
  await compileModule("src/shell/bay/shell/BayMine.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../mine": panesStub,
    "../mine/MyDashboardTab": dashboardStub,
    "../supply/ProfilePane": profileStub,
    "../supply/parts": partsStub,
    "./bay-state": stateStub,
  })
);

function reset() {
  W.opened = [];
  W.signedIn = true;
  W.panes = [];
  W.calls = [];
  resetMineView();
}

const mine = (tab, layout = "page", extra = {}) => React.createElement(BayMine, { tab, layout, siteKey: "design", ...extra });
const tabIds = (view) => view.qa("[data-bay-mine-tabs] [role=tab]").map((node) => node.getAttribute("data-project-tab"));
const tabLabels = (view) => view.qa("[data-bay-mine-tabs] [role=tab]").map((node) => node.textContent.trim());
const selectedTab = (view) => view.q('[data-bay-mine-tabs] [role=tab][aria-selected="true"]')?.getAttribute("data-project-tab");
const trigger = (view, name) => view.q(`[data-bay-filter="${name}"]`);

async function openMenu(view, name) {
  await view.click(trigger(view, name));
  const menu = document.querySelector(`[data-bay-filter-menu="${name}"]`);
  assert.ok(menu, `${name} 的选项单没打开`);
  return {
    menu,
    options: [...menu.querySelectorAll('[role="option"]')].map((node) => ({ value: node.getAttribute("data-value"), label: node.textContent.trim(), node })),
  };
}

test("页签是项目页同一件下划线 ProjectTabNav：三块，交易 / 我的主页 / 数据面板；不是灰底胶囊，也不再有六个页签", async () => {
  reset();
  const view = await mount(mine("published"));
  assert.deepEqual(tabIds(view), ["trade", "page", "dashboard"]);
  assert.deepEqual(tabLabels(view), ["交易", "我的主页", "数据面板"]);
  assert.ok(view.q("[data-bay-mine-tabs=page] [data-project-tab-nav]"), "用的是 ProjectTabNav 本件");
  assert.equal(selectedTab(view), "trade");
  const active = view.q('[role=tab][aria-selected="true"]');
  assert.match(active.className, /\bborder-b-2\b/, "选中项是下划线");
  assert.doesNotMatch(view.q("[data-bay-mine-tabs]").innerHTML, /rounded-xl bg-neutral-100/, "不是分段胶囊");
  assert.equal(view.qa("[data-mine-tab]").length, 0);
  // 页签与下面的 tabpanel 互相指着
  const panel = view.q('[role="tabpanel"]');
  assert.ok(panel);
  assert.equal(active.getAttribute("aria-controls"), panel.id);
  assert.equal(panel.getAttribute("aria-labelledby"), active.id);
  await view.unmount();
});

test("交易里一行两个下拉：第一个选 我发布的 / 我卖出的 / 我买到的 / 我的收藏，第二个选类别；胶囊条已删", async () => {
  reset();
  const view = await mount(mine("published"));
  assert.ok(view.q("[data-bay-mine-filters]"));
  assert.equal(view.qa("[data-bay-mine-filters] [data-bay-filter]").length, 2);
  assert.equal(view.q("[data-bay-mine-category-bar]"), null);
  assert.equal(view.q('[role="radiogroup"]'), null);
  assert.equal(view.qa("[data-bay-mine-category]").length, 0);
  assert.equal(trigger(view, "mine-list").getAttribute("data-value"), "published");
  assert.equal(trigger(view, "mine-category").getAttribute("data-value"), "");
  // §5.2：按键上只写当前值；「全部」自带名词；列表下拉是视图切换，不因选了具体值加深边框
  assert.equal(trigger(view, "mine-list").textContent.trim(), "我发布的");
  assert.equal(trigger(view, "mine-category").textContent.trim(), "全部类别");
  assert.doesNotMatch(trigger(view, "mine-list").className, /\bborder-neutral-900\b/);
  assert.doesNotMatch(trigger(view, "mine-category").className, /\bborder-neutral-900\b/);

  const list = await openMenu(view, "mine-list");
  assert.deepEqual(list.options.map((o) => o.value), ["published", "sold", "bought", "favorites"]);
  assert.deepEqual(list.options.map((o) => o.label), ["我发布的", "我卖出的", "我买到的", "我的收藏"]);
  await view.click(list.options[1].node);
  assert.deepEqual(W.opened.at(-1), { kind: "mine", tab: "sold" }, "选列表走地址");

  const category = await openMenu(view, "mine-category");
  assert.deepEqual(category.options.map((o) => o.value), ["", "digital", "service", "app", "lesson", "other"]);
  assert.deepEqual(category.options.map((o) => o.label), ["全部类别", "现成文件", "人工服务", "网站与软件服务", "课程", "其他"]);
  assert.equal(category.options.filter((o) => o.label === "全部").length, 0, "「全部」要自带名词");
  await view.click(category.options[4].node);
  assert.equal(trigger(view, "mine-category").getAttribute("data-value"), "lesson");
  assert.equal(trigger(view, "mine-category").textContent.trim(), "课程");
  assert.doesNotMatch(trigger(view, "mine-category").className, /\bborder-neutral-900\b/, "选了类别也保持浅灰边框");
  assert.equal(view.q('[data-stub-pane="published"]').getAttribute("data-category"), "lesson", "类别传给了列表窗格");
  await view.unmount();
});

test("类别在四个列表之间保持，从主页点回「交易」回到最近看的列表；BayMine 真正离开后才复位", async () => {
  reset();
  const view = await mount(mine("sold", "page", { key: "mine:sold" }));
  const category = await openMenu(view, "mine-category");
  await view.click(category.options.find((o) => o.value === "app").node);
  assert.equal(view.q('[data-stub-pane="sold"]').getAttribute("data-category"), "app");

  // 地址变化会让外面的 key 变、BayMine 整个重挂：状态不能丢
  await view.render(mine("bought", "page", { key: "mine:bought" }));
  assert.equal(trigger(view, "mine-list").getAttribute("data-value"), "bought");
  assert.equal(trigger(view, "mine-category").getAttribute("data-value"), "app");
  assert.equal(view.q('[data-stub-pane="bought"]').getAttribute("data-category"), "app");

  // 去主页再点回「交易」：回到 bought
  await view.render(mine("page", "page", { key: "mine:page" }));
  assert.equal(selectedTab(view), "page");
  W.opened = [];
  await view.click('[data-project-tab="trade"]');
  assert.deepEqual(W.opened.at(-1), { kind: "mine", tab: "bought" });

  await view.unmount();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(getMineView(), INITIAL_MINE_VIEW, "离开「我的」后复位");
});

test("交易工具栏使用库搜索和视图切换；搜索只传给当前清单，切换地址后可恢复", async () => {
  reset();
  const view = await mount(mine("published", "page", { key: "mine:published" }));
  const search = view.q("[data-bay-mine-tools] input[type=search]");
  assert.ok(search);
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(search, "Logo");
  await act(async () => search.dispatchEvent(new window.Event("input", { bubbles: true })));
  assert.equal(view.q('[data-stub-pane="published"]').getAttribute("data-query"), "Logo");
  await view.click('[data-bay-mine-tools] button[aria-label="列表视图"]');
  assert.equal(view.q('[data-stub-pane="published"]').getAttribute("data-display"), "list");
  await view.render(mine("bought", "page", { key: "mine:bought" }));
  assert.equal(view.q("[data-bay-mine-tools] input[type=search]").value, "");
  assert.equal(view.q('[data-stub-pane="bought"]').getAttribute("data-query"), "");
  await view.render(mine("published", "page", { key: "mine:published" }));
  assert.equal(view.q("[data-bay-mine-tools] input[type=search]").value, "Logo");
  await view.unmount();
});

test("地址兼容：mine:published|sold|bought|favorites 打开「交易」并选中对应列表；mine:page、mine:dashboard 不变", async () => {
  for (const tab of ["published", "sold", "bought", "favorites"]) {
    reset();
    const view = await mount(mine(tab));
    assert.equal(view.q("[data-bay-mine]").getAttribute("data-bay-mine-block"), "trade", tab);
    assert.equal(selectedTab(view), "trade", tab);
    assert.equal(trigger(view, "mine-list").getAttribute("data-value"), tab);
    assert.ok(view.q(`[data-stub-pane="${tab}"]`), `${tab} 的列表窗格`);
    assert.equal(view.qa("[data-stub-pane]").length, 1);
    await view.unmount();
  }
  reset();
  const page = await mount(mine("page"));
  assert.equal(page.q("[data-bay-mine]").getAttribute("data-bay-mine-block"), "page");
  assert.equal(selectedTab(page), "page");
  assert.ok(page.q('[data-stub-pane="profile"]'), "主页借用 ProfilePane");
  assert.equal(page.q('[data-stub-pane="profile"]').getAttribute("data-handle"), "me");
  assert.equal(page.q("[data-bay-mine-filters]"), null, "主页没有列表下拉");
  assert.equal(trigger(page, "mine-list"), null);
  await page.unmount();

  reset();
  const dash = await mount(mine("dashboard"));
  assert.equal(dash.q("[data-bay-mine]").getAttribute("data-bay-mine-block"), "dashboard");
  assert.equal(selectedTab(dash), "dashboard");
  assert.ok(dash.q('[data-stub-pane="dashboard"]'));
  assert.equal(dash.q("[data-bay-mine-filters]"), null);
  await dash.unmount();

  reset();
  const unknown = await mount(mine("help"));
  assert.equal(selectedTab(unknown), "trade", "认不出的值落在交易");
  assert.equal(trigger(unknown, "mine-list").getAttribute("data-value"), "published");
  await unknown.unmount();
});

test("点页签换地址：交易 → 最近的列表，我的主页 → page，数据面板 → dashboard；点已选中的不动", async () => {
  reset();
  const view = await mount(mine("favorites"));
  await view.click('[data-project-tab="page"]');
  assert.deepEqual(W.opened.at(-1), { kind: "mine", tab: "page" });
  await view.click('[data-project-tab="dashboard"]');
  assert.deepEqual(W.opened.at(-1), { kind: "mine", tab: "dashboard" });
  const before = W.opened.length;
  await view.click('[data-project-tab="trade"]');
  assert.equal(W.opened.length, before, "已在交易里，再点交易不换地址");
  await view.unmount();
});

test("不铺整页白板：根、页签、tabpanel、筛选和清单外框都不带白底；每个清单条目自行成卡", async () => {
  reset();
  const view = await mount(mine("published"));
  for (const sel of ["[data-bay-mine]", "[data-bay-mine-tabs]", '[role="tabpanel"]', "[data-bay-mine-filters]"]) {
    assert.doesNotMatch(view.q(sel).className, /\bbg-white\b/, `${sel} 不该铺白`);
  }
  const cards = view.qa("[data-bay-mine-card]");
  assert.equal(cards.length, 1);
  assert.doesNotMatch(cards[0].className, /\bbg-white\b|\bborder\b/);
  assert.ok(cards[0].querySelector('[data-stub-pane="published"]'), "列表在卡片里");
  // 页签与下拉在卡片外面，直接坐在页底
  assert.equal(cards[0].querySelector("[data-bay-mine-tabs]"), null);
  assert.equal(cards[0].querySelector("[data-bay-mine-filters]"), null);
  await view.unmount();

  for (const tab of ["page", "dashboard"]) {
    reset();
    const other = await mount(mine(tab));
    assert.equal(other.qa("[data-bay-mine-card]").length, 0, `${tab} 外框不包白卡`);
    assert.equal(other.qa(".bg-white").length, 0, `${tab} 外框不铺白`);
    await other.unmount();
  }
});

test("右侧小窗（overlay）同样三块两下拉；不包卡片、不用整行 mt", async () => {
  reset();
  const view = await mount(mine("bought", "docked"));
  assert.ok(view.q("[data-bay-mine-tabs=overlay]"));
  assert.deepEqual(tabIds(view), ["trade", "page", "dashboard"]);
  assert.equal(trigger(view, "mine-list").getAttribute("data-value"), "bought");
  assert.ok(trigger(view, "mine-category"));
  assert.equal(view.q("[data-collection-filter-row]"), null);
  assert.doesNotMatch(view.q("[data-bay-mine-card]").className, /\bbg-white\b|\bborder\b/);
  assert.ok(view.q('[data-stub-pane="bought"]'));
  await view.click('[data-project-tab="page"]');
  assert.deepEqual(W.opened.at(-1), { kind: "mine", tab: "page" });
  await view.unmount();
});

test("没登录：页签还在，下面是登录提示，没有下拉", async () => {
  reset();
  W.signedIn = false;
  const view = await mount(mine("published"));
  assert.deepEqual(tabIds(view), ["trade", "page", "dashboard"]);
  assert.ok(view.q("[data-bay-sign-in]"));
  assert.match(view.q("[data-bay-sign-in]").textContent, /登录后查看你发布的、卖出的、买到的和收藏/);
  assert.equal(view.q("[data-bay-mine-filters]"), null);
  assert.equal(view.qa("[data-stub-pane]").length, 0);
  await view.unmount();
});

test("BayMineTabs 单独用：onSelect 收到的是地址值（交易 → 最近的列表）", async () => {
  reset();
  const picked = [];
  const view = await mount(React.createElement(BayMineTabs, { tab: "sold", variant: "page", onSelect: (tab) => picked.push(tab) }));
  await view.click('[data-project-tab="dashboard"]');
  await view.click('[data-project-tab="page"]');
  assert.deepEqual(picked, ["dashboard", "page"]);
  await view.unmount();
});

// ---------------------------------------------------------------------------------------------
// 三、LeoBayPage：不铺整页白板、搜索提示
// ---------------------------------------------------------------------------------------------

const pageState = { current: { kind: "feed" }, filter: { kind: "service" }, enabled: true };
globalThis.__w4Page = pageState;

const pageStateStub = dataModule(`
  const s = () => globalThis.__w4Page;
  export function bayBack(){}
  export function bayEnabledHere(){ return s().enabled; }
  export function registerBayPage(){ return () => {}; }
  export function setBaySiteKey(){}
  export function useBayFilter(){ return s().filter; }
  export function useBaySiteKey(){ return "design"; }
  export function useBayState(){ return { current: s().current, canGoBack: s().current.kind !== "feed" }; }
`);
const listStub = dataModule(`
  const createElement = (...args) => globalThis.__w4React.createElement(...args);
  export const BayListingChromeContext = globalThis.__w4React.createContext({ view: "grid", favoritesOnly: false });
  export function BayCategorySelect(){ return null; }
  export function BayFeed(){ return createElement("div", { "data-bay-feed": "1" }); }
  export function BayViewSwitch(){ return null; }
  export function openMine(){}
  export function startPublish(){}
  export function useBaySearchText(){ return { text: "", change(){}, commit(){} }; }
`);
const detailStub = dataModule(`
  const createElement = (...args) => globalThis.__w4React.createElement(...args);
  export function BayDetailPane(props){ return createElement("section", { "data-stub-detail-pane": props.target.kind }); }
  export function bayDetailTitleKey(target){ return target.kind === "mine" ? "我的" : target.kind === "dashboard" ? "数据面板" : "发布"; }
`);
const filterSelectStub = dataModule(`
  export function BayToolbarFilterSlot(){ return null; }
  export function BayToolbarSlotProvider(props){ return props.children; }
`);
const emptyShelf = (name) =>
  dataModule(`export function ${name}(){ return null; }`);

const { LeoBayPage } = await import(
  await compileModule("src/shell/bay/shell/LeoBayPage.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "./bay-state": pageStateStub,
    "./BayList": listStub,
    "./BayDetail": detailStub,
    "./BayFilterSelect": filterSelectStub,
    "./bay-auth-host": emptyShelf("BayAuthHost"),
    "../needs/LibraryWorkPicker": emptyShelf("LibraryWorkPickerHost"),
    "../asset/BayAssetLibrary": emptyShelf("BayAssetLibrary"),
    "../apps/BayAppShelf": emptyShelf("BayAppShelf"),
    "../lessons/BayLessonShelf": emptyShelf("BayLessonShelf"),
  })
);

test("LeoBayPage：我的、数据面板、发帖和编辑页都不垫整页白板，编辑页保留滚动框架", async () => {
  for (const current of [{ kind: "mine", tab: "published" }, { kind: "mine", tab: "dashboard" }, { kind: "dashboard" }]) {
    pageState.current = current;
    const view = await mount(React.createElement(LeoBayPage, { siteKey: "design" }));
    const page = view.q('[data-bay-page="detail"]');
    assert.ok(page, `${current.kind} 走详情页`);
    assert.equal(view.q("[data-bay-page-paper]"), null, `${current.kind} 没有白底圆角板`);
    assert.equal(view.q("[data-bay-page-scroll]"), null);
    assert.doesNotMatch(page.className, /\bbg-white\b/);
    assert.match(page.className, /\bpt-3\b/, "走普通页框，不是贴边的白板页框");
    assert.ok(view.q(`[data-bay-page-detail="${current.kind}"]`));
    // 逛 Bay 那一块在详情页上只是藏起来（hidden），不算
    const whites = view.qa(".bg-white").filter((node) => !node.closest("[data-bay-page-browse]"));
    assert.equal(whites.length, 0, `${current.kind} 页上没有任何白底`);
    assert.ok(view.q("[data-bay-page-detail-header]"), "返回和标题行还在");
    await view.unmount();
  }
  for (const current of [{ kind: "publish" }, { kind: "service-editor", serviceId: "s1" }, { kind: "post-need" }]) {
    pageState.current = current;
    const view = await mount(React.createElement(LeoBayPage, { siteKey: "design" }));
    const paper = view.q("[data-bay-page-paper]");
    assert.equal(paper?.getAttribute("data-bay-page-paper"), current.kind);
    assert.doesNotMatch(paper.className, /\bbg-white\b|\brounded-3xl\b/);
    assert.equal(paper.getAttribute("data-bay-page-canvas"), "cards");
    await view.unmount();
  }
  pageState.current = { kind: "feed" };
});

test("LeoBayPage：页头搜索提示不列种类名（搜索 LeoBay）", async () => {
  pageState.current = { kind: "feed" };
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "design" }));
  const input = view.q("[data-bay-page-search] input");
  assert.ok(input);
  assert.equal(input.getAttribute("placeholder"), "搜索 LeoBay");
  await view.unmount();
  const page = src("src/shell/bay/shell/LeoBayPage.tsx");
  assert.doesNotMatch(page, /搜素材/);
  assert.match(page, /const PAPER_DETAILS[\s\S]*?\]\);/);
  const paperSet = page.match(/const PAPER_DETAILS[\s\S]*?\]\);/)[0];
  assert.doesNotMatch(paperSet, /"mine"|"dashboard"/, "PAPER_DETAILS 不含 mine、dashboard");
  for (const kind of ["publish", "post-need", "service-editor", "app-editor", "lesson-editor", "bundle-editor"]) {
    assert.match(paperSet, new RegExp(`"${kind}"`), `${kind} 保留白板`);
  }
});

test("BayDetail：标题不再用退役的种类名（服务详情 / 作品详情 / 管理作品 / 编辑作品）", async () => {
  const detail = src("src/shell/bay/shell/BayDetail.tsx");
  const titles = detail.match(/const DETAIL_TITLES[\s\S]*?\};/)[0];
  for (const retired of ["服务详情", "作品详情", "管理作品", "编辑作品"]) {
    assert.ok(!titles.includes(retired), `${retired} 已退役`);
    assert.ok(!detail.includes(`return "${retired}"`), `${retired} 已退役`);
  }
  assert.match(titles, /service: "详情"/);
  assert.match(titles, /app: "详情"/);
  assert.match(titles, /"app-manage": "管理"/);
  assert.match(titles, /mine: "我的"/);
  assert.match(detail, /target\.kind === "app-editor" && target\.appId\) return "编辑";/);
});

// ---------------------------------------------------------------------------------------------
// 四、我买到的：每行付款金额；有订单（合同）的行「查看对账单」
// ---------------------------------------------------------------------------------------------

const httpStub = dataModule(`
  const W = globalThis.__w4;
  export class BayApiError extends Error {
    constructor(message, status = 0, code = null) { super(message); this.status = status; this.code = code; }
  }
  async function reply(method, path, body, opts) {
    W.calls.push({ method, path, body, opts });
    const responder = globalThis.__w4HttpRespond;
    return responder ? responder(method, path, body, opts) : {};
  }
  export const bayGet = (path, opts) => reply("GET", path, undefined, opts);
  export const bayPost = (path, body) => reply("POST", path, body);
  export const bayPatch = (path, body) => reply("PATCH", path, body);
  export const bayDelete = (path) => reply("DELETE", path);
`);
const boughtStateStub = dataModule(`
  export function openBay(target){ globalThis.__w4.opened.push(target); }
  export function replaceBay(target){ globalThis.__w4.opened.push(target); }
  export function requireBayLogin(){ return true; }
  export function useBaySignedIn(){ return globalThis.__w4.signedIn !== false; }
  export function bayHrefOnSite(){ return ""; }
`);
const lessonsStub = dataModule(`
  export async function listBoughtBayLessonOrders(){ return { items: globalThis.__w4.boughtLessons || [] }; }
  export async function listSoldBayLessonOrders(){ return { items: [] }; }
`);
const domainStub = dataModule(`
  export function familyForHost(){ return undefined; }
  export const CONFIGURED_DOMAIN_FAMILY = undefined;
  export function currentDomainFamily(){ return undefined; }
  export function domainProfileForHost(){ return undefined; }
  export function currentDomainProfile(){ return { portalOrigin: "https://oceanleo.test/" }; }
  export function currentFamilySubsiteOrigin(){ return undefined; }
  export function portalHref(path){ return "https://oceanleo.test" + path; }
`);
const localeStub = dataModule("export function useLocale(){ return 'zh'; }");

const { MyBoughtPane } = await import(
  await compileModule("src/shell/bay/mine/MyBoughtPane.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/bay/http": httpStub,
    "../../../lib/bay/lessons": lessonsStub,
    "../shell/bay-state": boughtStateStub,
    "../../../contracts/domain-family": domainStub,
    "next-intl": localeStub,
  })
);

function contract(extra = {}) {
  return {
    id: "k1",
    buyer_user_id: "buyer-1",
    seller_user_id: "seller-1",
    title: "一套品牌 Logo",
    engagement_kind: "fixed",
    total_fen: 12000,
    currency: "USD",
    status: "active",
    payment_state: "disabled",
    my_role: "buyer",
    seller: { user_id: "seller-1", display_name: "Mia", handle: "mia" },
    buyer: { user_id: "buyer-1", display_name: "Leo", handle: "leo" },
    milestones: [],
    deliveries: [],
    ...extra,
  };
}

function statementOf(id, extra = {}) {
  return {
    contract_id: id,
    counterparty: { display_name: "Mia", handle: "mia" },
    terms: { title: "我买的稿", status: "delivered", engagement_kind: "fixed" },
    tier: null,
    amount_fen: 12000,
    currency: "USD",
    money_notice: "",
    timeline: [
      {
        id: "e1",
        counterparty_user_id: null,
        contract_id: id,
        direction: "out",
        event: "ordered",
        amount_fen: 12000,
        currency: "USD",
        note: "",
        created_at: "2026-10-01T08:00:00Z",
        counterparty: null,
      },
    ],
    ...extra,
  };
}

function resetBought({ statementFails = false } = {}) {
  reset();
  W.boughtLessons = [
    { id: "lo1", item_title: "PPT 入门", item_kind: "lesson", item_id: "l1", status: "completed", price_fen: 9900, contract_id: "lesson-contract" },
    { id: "lo2", item_title: "免费试听", item_kind: "lesson", item_id: "l2", status: "completed", price_fen: 0, contract_id: null },
  ];
  W.orders = [contract({ id: "buy-1", title: "我买的稿", status: "delivered" }), contract({ id: "buy-free", title: "免费咨询", total_fen: 0, status: "completed" })];
  globalThis.__w4HttpRespond = (method, path) => {
    if (method !== "GET") return {};
    if (path === "/v1/bay/app-paid/mine/bought") {
      return {
        purchases: [
          { id: "ap1", item_kind: "app", item_id: "a1", item_title: "计算器", status: "completed", price_fen: 4500, contract_id: "app-contract" },
        ],
        subscriptions: [{ id: "sub1", app_id: "a2", app_title: "记账本", status: "active", price_fen: 800 }],
        trials: [],
        apps: [],
      };
    }
    if (String(path).startsWith("/v1/talent/ledger/statement")) {
      if (statementFails) throw new Error("boom");
      const id = new URL(path, "https://x.test").searchParams.get("contract_id");
      return statementOf(id);
    }
    if (String(path).startsWith("/v1/talent/services/")) return { service: { id: "svc", listing_kind: "service" } };
    if (String(path).startsWith("/v1/talent/contracts")) return { items: W.orders };
    return {};
  };
}

const boughtProps = { target: { kind: "mine", tab: "bought" }, layout: "page", siteKey: "design" };

test("我买到的：每一行都显示付款金额（订单 / 课程 / 网站与软件服务 / 订阅），0 写免费", async () => {
  resetBought();
  const view = await mount(React.createElement(MyBoughtPane, boughtProps));
  const rows = view.qa("[data-bay-mine-row]");
  assert.equal(rows.length, 6, "订单 2 + 课程 2 + 买断 1 + 订阅 1");
  const amounts = Object.fromEntries(view.qa("[data-bay-mine-amount]").map((node) => [node.getAttribute("data-bay-mine-amount"), node.textContent.trim()]));
  assert.equal(Object.keys(amounts).length, 6, "每一行都有金额");
  assert.match(amounts["order:buy-1"], /120\.00/);
  assert.match(amounts["order:buy-1"], /\$/, "按订单自带的币种写");
  assert.equal(amounts["order:buy-free"], "免费");
  assert.match(amounts["lesson-order:lo1"], /99\.00/);
  assert.equal(amounts["lesson-order:lo2"], "免费");
  assert.match(amounts["app-order:ap1"], /45\.00/);
  assert.match(amounts["app-sub:sub1"], /8\.00/);
  // 金额放在行右侧，和类别标签同一块；状态留在副标题
  const first = view.q('[data-bay-mine-row="order:buy-1"]');
  assert.ok(first.querySelector("[data-bay-mine-amount]"));
  assert.ok(first.querySelector("[data-bay-listing-kind]"));
  assert.doesNotMatch(first.textContent, /^.*\$120\.00.*\$120\.00/, "金额只出现一次");
  await view.unmount();
});

test("我买到的：有订单（合同）的行才有「查看对账单」；点开按合同号取对账单，用 StatementPanel 画，可关", async () => {
  resetBought();
  const view = await mount(React.createElement(MyBoughtPane, boughtProps));
  const withStatement = view.qa("[data-bay-mine-statement]").map((node) => node.getAttribute("data-bay-mine-statement")).sort();
  assert.deepEqual(withStatement, ["app-order:ap1", "lesson-order:lo1", "order:buy-1", "order:buy-free"], "没有合同号的行不出现");
  assert.equal(view.q('[data-bay-mine-statement="lesson-order:lo2"]'), null);
  assert.equal(view.q('[data-bay-mine-statement="app-sub:sub1"]'), null);
  assert.equal(view.q('[data-bay-mine-statement="order:buy-1"]').textContent.trim(), "查看对账单");
  assert.equal(view.q("[data-bay-statement]"), null, "默认不展开");

  await view.click('[data-bay-mine-statement="order:buy-1"]');
  const call = W.calls.find((c) => String(c.path).startsWith("/v1/talent/ledger/statement"));
  assert.ok(call, "点开才去取");
  assert.equal(call.path, "/v1/talent/ledger/statement?contract_id=buy-1");
  const panel = view.q('[data-bay-mine-statement-panel="order:buy-1"] [data-bay-statement="buy-1"]');
  assert.ok(panel, "对账单在这一行下面展开");
  assert.match(panel.textContent, /订单对账单/);
  assert.match(panel.textContent, /120\.00/);
  assert.match(panel.textContent, /订单成立/);
  assert.equal(view.q('[data-bay-mine-statement="order:buy-1"]').getAttribute("aria-expanded"), "true");

  // 课程买断带的是 contract_id，不是行号
  await view.click('[data-bay-mine-statement="lesson-order:lo1"]');
  assert.ok(W.calls.some((c) => c.path === "/v1/talent/ledger/statement?contract_id=lesson-contract"));
  assert.ok(view.q('[data-bay-statement="lesson-contract"]'));
  assert.equal(view.q('[data-bay-statement="buy-1"]'), null, "一次只展开一张");

  // 对账单自己的「关闭」收起它
  const close = [...view.q('[data-bay-statement="lesson-contract"]').querySelectorAll("button")].find((node) => node.textContent.trim() === "关闭");
  assert.ok(close);
  await view.click(close);
  assert.equal(view.q("[data-bay-statement]"), null);
  assert.equal(view.q('[data-bay-mine-statement="lesson-order:lo1"]').getAttribute("aria-expanded"), "false");

  // 再点一次「查看对账单」可以收起
  await view.click('[data-bay-mine-statement="order:buy-1"]');
  assert.ok(view.q('[data-bay-statement="buy-1"]'));
  await view.click('[data-bay-mine-statement="order:buy-1"]');
  assert.equal(view.q("[data-bay-statement]"), null);
  await view.unmount();
});

test("我买到的：对账单取不到时在这一行下面说「加载失败」，列表和金额不受影响", async () => {
  resetBought({ statementFails: true });
  const view = await mount(React.createElement(MyBoughtPane, boughtProps));
  await view.click('[data-bay-mine-statement="order:buy-1"]');
  const panel = view.q('[data-bay-mine-statement-panel="order:buy-1"]');
  assert.ok(panel);
  assert.ok(panel.querySelector("[data-bay-statement-failed]"));
  assert.match(panel.textContent, /加载失败，请稍后再试。/);
  assert.equal(view.q("[data-bay-statement]"), null);
  assert.match(view.q('[data-bay-mine-amount="order:buy-1"]').textContent, /120\.00/);
  await view.unmount();
});

test("我买到的：类别筛选只留这一类，金额照样显示", async () => {
  resetBought();
  const view = await mount(React.createElement(MyBoughtPane, { ...boughtProps, category: "lesson" }));
  assert.deepEqual(
    view.qa("[data-bay-mine-row]").map((node) => node.getAttribute("data-bay-mine-row")).sort(),
    ["lesson-order:lo1", "lesson-order:lo2"],
  );
  assert.equal(view.qa("[data-bay-mine-amount]").length, 2);
  await view.unmount();
});

// ---------------------------------------------------------------------------------------------
// 五、文案：新词条 17 语齐全，英文大小写，LeoChat 的「交易」不被覆盖
// ---------------------------------------------------------------------------------------------

test("文案：页签「交易 」（末尾一个空格）英文 Listings & orders，不动 LeoChat 筛选的「交易」（Deals）", async () => {
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const key = "交易 ";
  assert.equal(key.length, 3);
  assert.equal(UI_MESSAGES.en[key], "Listings & orders");
  assert.equal(UI_MESSAGES.en["交易"], "Deals", "LeoChat 的「交易」筛选保持原译法");
  const tabsSource = src("src/shell/bay/shell/BayMine.tsx");
  assert.match(tabsSource, /const TRADE_TAB_LABEL = "交易 ";/);
  for (const locale of LOCALES) {
    if (locale === "zh") continue;
    assert.ok(UI_MESSAGES[locale][key], `${locale} 缺「交易 」`);
    assert.ok(UI_MESSAGES[locale]["全部类别"], `${locale} 缺「全部类别」`);
    assert.ok(UI_MESSAGES[locale]["网站与软件服务"], `${locale} 缺「网站与软件服务」（15 语译文由 lbp-w02-copy.ts 定义）`);
    assert.ok(UI_MESSAGES[locale]["现成文件"], `${locale} 缺「现成文件」`);
  }
  assert.equal(UI_MESSAGES.en["全部类别"], "All categories");
  assert.equal(UI_MESSAGES.en["网站与软件服务"], "Website & software service");
  assert.equal(UI_MESSAGES.en["现成文件"], "Ready-made files");
  for (const locale of LOCALES) {
    if (locale === "zh" || locale === "zh-TW" || locale === "ja") continue;
    for (const k of [key, "全部类别", "网站与软件服务"]) {
      assert.doesNotMatch(UI_MESSAGES[locale][k], /[一-鿿]/, `${locale} 的「${k}」不该含汉字`);
    }
  }
});

test("文案：英文页签与下拉选项首字母大写（Published / Sold / Purchases / Favorites / My page / Dashboard）", async () => {
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const expected = {
    "我发布的": "Published",
    "我卖出的": "Sold",
    "我买到的": "Purchases",
    "我的收藏": "Favorites",
    "我的主页": "My page",
    "数据面板": "Dashboard",
  };
  for (const [zh, en] of Object.entries(expected)) assert.equal(UI_MESSAGES.en[zh], en, zh);
  // 其余语种的这几条首字母本来就是大写 / 无大小写之分：不该有以小写拉丁字母开头的
  const { LOCALES } = await import("../src/i18n/config.ts");
  for (const locale of LOCALES) {
    if (locale === "zh") continue;
    for (const zh of Object.keys(expected)) {
      const value = UI_MESSAGES[locale][zh];
      assert.ok(value, `${locale} 缺 ${zh}`);
      assert.doesNotMatch(value, /^[a-zà-ÿ]/, `${locale} 的「${zh}」(${value}) 首字母是小写`);
    }
  }
});

test("退役名字清扫：我的页相关源码里的可见文案不再用「成品文件 / 未命名服务 / 未命名作品」", () => {
  for (const rel of [
    "src/shell/bay/mine/PublishedCategoryTag.tsx",
    "src/shell/bay/mine/MyPublishedPane.tsx",
    "src/shell/bay/mine/MySoldPane.tsx",
    "src/shell/bay/mine/MyBoughtPane.tsx",
    "src/shell/bay/mine/MyFavoritesPane.tsx",
    "src/shell/bay/shell/BayMine.tsx",
  ]) {
    const text = src(rel);
    assert.doesNotMatch(text, /tt\("成品文件"\)|"成品文件"/, rel);
    assert.doesNotMatch(text, /tt\("未命名服务"\)|tt\("未命名作品"\)/, rel);
  }
});
