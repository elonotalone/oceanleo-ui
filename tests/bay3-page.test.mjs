// LeoBay `/bay` 这一张页：页头四个键、五种种类、素材货架、openBay 跳页。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://video.oceanleo.com/library" });
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
globalThis.__bay3React = React;
const { createRoot } = await import("react-dom/client");

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);

const pageState = {
  current: { kind: "feed" },
  filter: { kind: "all" },
  signedIn: true,
  enabled: true,
  feed: { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} },
  categories: {
    categories: [
      { slug: "design", name_zh: "设计与视觉", name_en: "Design", icon: "palette" },
    ],
    loading: false,
    failed: false,
  },
};
globalThis.__bay3Page = pageState;

function feedOf(patch = {}) {
  return { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {}, ...patch };
}

function reset(patch = {}) {
  pageState.current = { kind: "feed" };
  pageState.filter = { kind: "all" };
  pageState.signedIn = true;
  pageState.enabled = true;
  pageState.feed = feedOf();
  Object.assign(pageState, patch);
}

const stateStub = dataModule(`
  const s = () => globalThis.__bay3Page;
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
  export function useBayFeed(){ return globalThis.__bay3Page.feed; }
  export function useBayCategories(){ return globalThis.__bay3Page.categories; }
`);
const cardStub = (names) =>
  names
    .map(
      (name) =>
        `export function ${name}({ item, variant }){ return createElement("button", { type: "button", "data-stub-card": "${name}", "data-variant": variant || "row" }, item.title); }`,
    )
    .join("\n");
const needsStub = dataModule(`
  const createElement = (...args) => globalThis.__bay3React.createElement(...args);
  ${cardStub(["DemandCard", "HelpRequestCard"])}
  export function LibraryWorkPickerHost(){ return null; }
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CallHumanPane = pane("call-human"), DemandPane = pane("demand"), HelpRequestPane = pane("help"), PostNeedPane = pane("post-need"), ProposePane = pane("propose");
  export const MyHelpRequestsPane = pane("mine-help"), MyNeedsPane = pane("mine-needs"), MyProposalsPane = pane("mine-proposals");
`);
const supplyStub = dataModule(`
  const createElement = (...args) => globalThis.__bay3React.createElement(...args);
  ${cardStub(["ServiceCard", "ConsultCard"])}
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CheckoutPane = pane("checkout"), ConsultPane = pane("consult"), ProfilePane = pane("profile"), ServicePane = pane("service");
`);
const paneModule = (exports) =>
  dataModule(`
    const createElement = (...args) => globalThis.__bay3React.createElement(...args);
    ${Object.entries(exports)
      .map(([name, label]) => `export function ${name}(){ return createElement("section", { "data-stub-pane": "${label}" }); }`)
      .join("\n")}
  `);
const exploreStub = dataModule(`
  const createElement = (...args) => globalThis.__bay3React.createElement(...args);
  export function ExplorePage(props){
    return createElement("div", { "data-explore-embedded": props.embedded ? "true" : undefined, "data-explore-stub": "1" });
  }
`);
const officialStub = dataModule(`
  export async function getBayOfficialPublisher(){
    return { user_id: null, handle: "oceanleo", display_name: "OceanLeo", avatar_url: null, official: true };
  }
`);

const stubs = {
  "next-intl": dataModule(`export function useLocale(){ return "zh"; }`),
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/official": officialStub,
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
const { BayKindTabs, BayFeed } = await import(await compileModule("src/shell/bay/shell/BayList.tsx", stubs));

const AUTH_SIGNED_OUT = dataModule(`
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export function cachedAccessToken() { return null; }
  export async function accessToken() { return null; }
`);
const AUTH_CONFIG = dataModule(`export function isLeoDevPreviewHost() { return false; }`);
const familyStub = dataModule(`
  export function currentDomainFamily() { return "com"; }
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
  export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
`);
const hostStub = dataModule(`
  globalThis.__bay3Host = { enabled: false, open: false, opened: [], conversationId: null };
  export function hostState() {
    const h = globalThis.__bay3Host;
    return {
      getSnapshot() { return { enabled: h.enabled, open: h.open, conversationId: h.conversationId }; },
      open(target) { h.opened.push(target); h.open = true; h.conversationId = target && target.conversationId || null; },
      subscribe() { return () => {}; },
    };
  }
`);
const bayState = await import(
  await compileModule("src/shell/bay/shell/bay-state.ts", {
    "../../../contracts/domain-family": familyStub,
    "../../../lib/auth/client": AUTH_SIGNED_OUT,
    "../../../lib/auth/config": AUTH_CONFIG,
    "../../messages/host-state": hostStub,
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

const html = (node) => renderToStaticMarkup(node);
const count = (text, pattern) => (text.match(pattern) || []).length;

test("页头有「我的主页 / 我的 / 找人帮忙 / 发布」四个键", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const actions = view.host.querySelector("[data-bay-page-actions]");
  assert.ok(actions);
  assert.equal(count(actions.outerHTML, /data-bay-action="my-page"/g), 1);
  assert.equal(count(actions.outerHTML, /data-bay-action="mine"/g), 1);
  assert.equal(count(actions.outerHTML, /data-bay-action="get-help"/g), 1);
  assert.equal(count(actions.outerHTML, /data-bay-action="publish"/g), 1);
  assert.match(actions.textContent, /我的主页/);
  assert.match(actions.textContent, /我的/);
  assert.match(actions.textContent, /找人帮忙/);
  assert.match(actions.textContent, /发布/);
  await view.unmount();
});

test("种类是「全部 / 素材 / 服务 / 需求 / 答疑」", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  const tabs = view.host.querySelector('[data-bay-kinds="page"]');
  assert.ok(tabs);
  const labels = [...tabs.querySelectorAll('[role="tab"]')].map((node) => node.textContent.replace(/\s+/g, ""));
  assert.deepEqual(labels, ["全部", "素材", "服务", "需求", "答疑"]);
  await view.unmount();
});

test("停在「素材」时渲染素材货架和发布者说明、不渲染类目和信息流", async () => {
  reset({ filter: { kind: "material" } });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector('[data-explore-embedded="true"]'));
  assert.ok(view.host.querySelector("[data-bay-materials-publisher]"));
  assert.equal(view.host.querySelector("[data-bay-categories]"), null);
  assert.equal(view.host.querySelector("[data-bay-feed]"), null);
  await view.unmount();
});

test("停在「全部」且没筛选时有素材推广条", async () => {
  reset();
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.ok(view.host.querySelector("[data-bay-materials-promo]"));
  assert.match(view.host.querySelector("[data-bay-materials-promo]").textContent, /官方素材/);
  await view.unmount();
});

test("境内只渲染素材货架", async () => {
  reset({ enabled: false });
  const view = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  assert.equal(view.host.querySelector('[data-bay-page="materials-only"]')?.getAttribute("data-bay-page"), "materials-only");
  assert.ok(view.host.querySelector('[data-explore-embedded="true"]'));
  assert.equal(view.host.querySelector("[data-bay-page-hero]"), null);
  await view.unmount();
});

test("openBay 不在 /bay 页上时调用 setBayNavigator 交进来的函数、地址是 /bay?bay=<目标>", () => {
  const hrefs = [];
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/library");
  bayState.setBayNavigator((href) => hrefs.push(href));
  bayState.openBay({ kind: "feed" });
  hrefs.length = 0;
  bayState.openBay({ kind: "service", id: "s1" });
  assert.deepEqual(hrefs, ["/bay?bay=service:s1"]);
  bayState.setBayNavigator(null);
});

test("openBay({kind:conversation}) 不改目标栈、打开的是消息小窗", () => {
  const before = bayState.bayStateSnapshot();
  globalThis.__bay3Host.enabled = true;
  globalThis.__bay3Host.opened = [];
  bayState.openBay({ kind: "conversation", threadId: "t9" });
  assert.deepEqual(globalThis.__bay3Host.opened, [{ conversationId: "talent:t9" }]);
  assert.deepEqual(bayState.bayStateSnapshot().current, before.current);
});

test("?kind=material 进页面后停在素材", async () => {
  window.history.replaceState(window.history.state, "", "https://video.oceanleo.com/bay?kind=material");
  const off = bayState.registerBayPage();
  function Probe() {
    const filter = bayState.useBayFilter();
    return React.createElement("span", { "data-kind": filter.kind ?? "all" });
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(() => {
    root.render(React.createElement(Probe));
  });
  assert.equal(host.querySelector("[data-kind]").getAttribute("data-kind"), "material");
  await act(() => root.unmount());
  host.remove();
  off();
});

function feedItems() {
  const base = { summary: "摘要", category: "design", created_at: "2026-10-07T00:00:00Z", author: { display_name: "Leo" }, stats: {}, price: null };
  return [
    { ...base, kind: "demand", id: "d1", title: "做一份路演稿" },
    { ...base, kind: "help", id: "h1", title: "排期拿不准" },
    { ...base, kind: "service", id: "s1", title: "品牌 Logo 设计" },
    { ...base, kind: "consult", id: "c1", title: "产品定价答疑" },
  ];
}

test("信息流：首屏骨架、出错给重试、加载更多是一个键", () => {
  reset({ feed: feedOf({ loading: true, loaded: false }) });
  assert.match(html(React.createElement(BayFeed, { filter: pageState.filter, activeKey: null, variant: "grid" })), /data-bay-feed-loading/);
  reset({ feed: feedOf({ error: "加载失败，请稍后再试。" }) });
  const failed = html(React.createElement(BayFeed, { filter: pageState.filter, activeKey: null }));
  assert.match(failed, /data-bay-feed-error/);
  assert.match(failed, />重试</);
  reset({ feed: feedOf({ items: feedItems(), hasMore: true }) });
  assert.equal(count(html(React.createElement(BayFeed, { filter: pageState.filter, activeKey: null, variant: "grid" })), />加载更多</g), 1);
});

test("种类筛选行会换行，没有横向滚动容器", () => {
  const out = html(React.createElement(BayKindTabs, { filter: { kind: "all" }, accent: "#0ea5e9" }));
  assert.match(out, /flex-wrap/);
  assert.doesNotMatch(out, /overflow-x-auto/);
  assert.equal(count(out, /role="tab"/g), 5);
});

const DISPLAY = new Set(["block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents"]);
const COLOR_WORD =
  /^(?:inherit|current|transparent|black|white|(?:stone|neutral|gray|zinc|slate|red|rose|amber|orange|yellow|emerald|green|teal|sky|blue|indigo|violet|purple|pink)-\d+)(?:\/.+)?$/;

function familyOf(utility) {
  if (DISPLAY.has(utility) || /^line-clamp-\d+$/.test(utility)) return "display";
  if (utility === "truncate" || /^whitespace-/.test(utility)) return "white-space";
  let m = utility.match(/^(gap-x|gap-y|gap|min-w|max-w|min-h|max-h|mt|mb|ml|mr|mx|my|m|pt|pb|pl|pr|px|py|p|w|h|leading|tracking|rounded|justify|items|z)-/);
  if (m) return m[1];
  m = utility.match(/^-(mt|mb|ml|mr|mx|my|m)-/);
  if (m) return m[1];
  if (/^font-(?:thin|light|normal|medium|semibold|bold|extrabold)$/.test(utility)) return "font-weight";
  if (/^text-(?:left|center|right|justify|start|end)$/.test(utility)) return "text-align";
  if (/^text-(?:\[[\d.]+(?:px|rem|em)\]|xs|sm|base|lg|xl|\dxl)$/.test(utility)) return "font-size";
  if (/^text-/.test(utility)) return COLOR_WORD.test(utility.slice(5)) || /^text-\[/.test(utility) ? "color" : null;
  if (/^bg-/.test(utility)) return COLOR_WORD.test(utility.slice(3)) || /^bg-\[/.test(utility) ? "background-color" : null;
  if (/^flex-(?:row|col)(?:-reverse)?$/.test(utility)) return "flex-direction";
  if (/^flex-(?:1|auto|none|initial)$/.test(utility)) return "flex";
  if (/^flex-(?:wrap|nowrap)$/.test(utility)) return "flex-wrap";
  if (/^(?:static|fixed|absolute|relative|sticky)$/.test(utility)) return "position";
  return null;
}

function conflictsIn(classValue) {
  const seen = new Map();
  const out = [];
  for (const token of classValue.split(/\s+/).filter(Boolean)) {
    const cut = token.lastIndexOf(":");
    const prefix = cut < 0 ? "" : token.slice(0, cut + 1);
    const family = familyOf(cut < 0 ? token : token.slice(cut + 1));
    if (!family) continue;
    const key = prefix + family;
    const earlier = seen.get(key);
    if (earlier && earlier !== token) out.push(`${earlier} ↔ ${token}`);
    else seen.set(key, token);
  }
  return out;
}

test("自检：打架比对器认得出截断遇上块级、两个上边距，也不冤枉正常的写法", () => {
  assert.deepEqual(conflictsIn("mt-1 line-clamp-2 block text-[12px]"), ["line-clamp-2 ↔ block"]);
  assert.deepEqual(conflictsIn("mt-auto pt-4 mt-3"), ["mt-auto ↔ mt-3"]);
  assert.deepEqual(conflictsIn("hidden sm:inline-flex px-4 py-2 text-[13px] text-neutral-700 bg-white hover:bg-neutral-50"), []);
  assert.deepEqual(conflictsIn("inline-flex sm:hidden dark:bg-white/10 bg-black/5 text-left text-stone-800 text-[15px]"), []);
  assert.deepEqual(conflictsIn("flex flex-wrap gap-x-3 gap-y-2 min-w-0 w-full max-w-3xl"), []);
  assert.deepEqual(conflictsIn("gap-2 gap-3"), ["gap-2 ↔ gap-3"]);
});

test("种类源码是全部 / 素材 / 服务 / 需求 / 答疑，没有求助栏", () => {
  const list = src("shell/bay/shell/BayList.tsx");
  assert.match(list, /\["all", "material", "service", "demand", "consult"\]/);
  assert.match(list, /material: "素材"/);
  assert.match(list, /consult: "答疑"/);
  assert.doesNotMatch(list, /KIND_TABS = \[[^\]]*help/);
});

test("源码：不在 /bay 页上的 openBay 写成 /bay?bay=；交易会话走消息小窗", () => {
  const state = src("shell/bay/shell/bay-state.ts");
  assert.match(state, /\/bay\?\$\{text\}/);
  assert.match(state, /openBayConversation/);
  assert.match(state, /talent:\$\{threadId\}/);
  assert.match(state, /kind === "conversation"/);
});

test("渲染出来的每个元素：没有两个类在抢同一个属性", async () => {
  const pages = [];
  reset();
  const browse = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo", accent: "#0ea5e9" }));
  pages.push(["逛", browse.host.innerHTML]);
  await browse.unmount();
  reset({ filter: { kind: "material" } });
  const material = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  pages.push(["素材", material.host.innerHTML]);
  await material.unmount();
  reset({ current: { kind: "post-need" } });
  const detail = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  pages.push(["详情", detail.host.innerHTML]);
  await detail.unmount();
  reset({ filter: { kind: "service", category: "design" }, feed: feedOf({ items: feedItems(), hasMore: true }) });
  const filtered = await mount(React.createElement(LeoBayPage, { siteKey: "oceanleo" }));
  pages.push(["筛选", filtered.host.innerHTML]);
  await filtered.unmount();
  pages.push(["种类", html(React.createElement(BayKindTabs, { filter: { kind: "all" }, accent: "#0ea5e9" }))]);

  const found = [];
  let checked = 0;
  for (const [label, markup] of pages) {
    for (const match of markup.matchAll(/class="([^"]*)"/g)) {
      checked += 1;
      for (const conflict of conflictsIn(match[1])) found.push(`${label}：${conflict}（${match[1]}）`);
    }
  }
  assert.ok(checked > 40, `只查到 ${checked} 个元素，取样失效`);
  assert.deepEqual([...new Set(found)], []);
});
