// LeoBay 版式（2026-10-08 LeoChat 重做后）：小窗的 LeoBay 栏与整页的 LeoBay 栏渲染出来之后要满足的几条。
//   1. 小窗三栏头部同一个样子：第一行「搜索框 + 一个 + 号」，第二行筛选；LeoBay 的 + 号里是「找人帮忙」「发布服务」。
//      每个操作在一个界面里只出现一次；「发需求」「叫真人」这两个旧叫法不再出现。
//   2. 整页的 LeoBay 栏不带页框和页标题（那是 LeoChat 整页的）；逛的时候信息流是整页宽的卡片网格。
//   3. 点开一条：换成「返回 + 标题」和一张正文卡；信息流只藏起来、不卸载。
//   4. 筛选行在任何语言下都不出横向滚动条、不截断（允许换行）。
//   5. 四种卡在网格里是同一种卡片外形，在小窗里是同一种整行外形。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, "src", rel), "utf8");

// ---- 替身：界面状态、数据、卡片、窗格都由测试给，渲染的是真的 BayList / LeoBaySection / BayDetail / BayMine ----

const state = {
  current: { kind: "feed" },
  filter: { kind: "all" },
  signedIn: true,
  feed: null,
  categories: {
    categories: [
      { slug: "design", name_zh: "设计与视觉", name_en: "Design & visuals", icon: "palette" },
      { slug: "doc", name_zh: "文档与表格", name_en: "Docs & spreadsheets", icon: "file-text" },
    ],
    loading: false,
    failed: false,
  },
};
globalThis.__bayLayoutTest = state;
// `data:` 替身模块引不了裸包名，React 经全局交给它们。
globalThis.__bayLayoutReact = React;

/** 一份「已取完、没有内容」的信息流；测试在它上面改几项。 */
function feedOf(patch = {}) {
  return { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {}, ...patch };
}

function reset(patch = {}) {
  state.current = { kind: "feed" };
  state.filter = { kind: "all" };
  state.signedIn = true;
  state.feed = feedOf();
  Object.assign(state, patch);
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stateStub = dataModule(`
  const s = () => globalThis.__bayLayoutTest;
  export function openBay(){}
  export function replaceBay(){}
  export function bayBack(){}
  export function requireBayLogin(){ return true; }
  export function setBayFilter(){}
  export function setBaySiteKey(){}
  export function registerBayPage(){ return () => {}; }
  export function bayEnabledHere(){ return true; }
  export function useBayFilter(){ return s().filter; }
  export function useBaySignedIn(){ return s().signedIn; }
  export function useBaySiteKey(){ return "oceanleo"; }
  export function useBayState(){ return { current: s().current, canGoBack: s().current.kind !== "feed" }; }
`);
const dataStub = dataModule(`
  export function useBayFeed(){ return globalThis.__bayLayoutTest.feed; }
  export function useBayCategories(){ return globalThis.__bayLayoutTest.categories; }
`);
const cardStub = (names) =>
  names
    .map(
      (name) =>
        `export function ${name}({ item, variant }){ return createElement("button", { type: "button", "data-stub-card": "${name}", "data-variant": variant || "row" }, item.title); }`,
    )
    .join("\n");
const needsStub = dataModule(`
  const createElement = (...args) => globalThis.__bayLayoutReact.createElement(...args);
  ${cardStub(["DemandCard", "HelpRequestCard"])}
  export function LibraryWorkPickerHost(){ return null; }
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CallHumanPane = pane("call-human"), DemandPane = pane("demand"), HelpRequestPane = pane("help"), PostNeedPane = pane("post-need"), ProposePane = pane("propose");
  export const MyHelpRequestsPane = pane("mine-help"), MyNeedsPane = pane("mine-needs"), MyProposalsPane = pane("mine-proposals");
`);
const supplyStub = dataModule(`
  const createElement = (...args) => globalThis.__bayLayoutReact.createElement(...args);
  ${cardStub(["ServiceCard", "ConsultCard"])}
  const pane = (name) => function Pane(){ return createElement("section", { "data-stub-pane": name }); };
  export const CheckoutPane = pane("checkout"), ConsultPane = pane("consult"), ProfilePane = pane("profile"), ServicePane = pane("service");
`);
const paneModule = (exports) =>
  dataModule(`
    const createElement = (...args) => globalThis.__bayLayoutReact.createElement(...args);
    ${Object.entries(exports)
      .map(([name, label]) => `export function ${name}(){ return createElement("section", { "data-stub-pane": "${label}" }); }`)
      .join("\n")}
  `);
const dealStub = dataModule(`
  const createElement = (...args) => globalThis.__bayLayoutReact.createElement(...args);
  export function DealConversationView({ threadId, layout, onBack }){
    return createElement("section", { "data-stub-conversation": threadId, "data-layout": layout, "data-has-back": onBack ? "true" : "false" });
  }
`);
const motionStub = dataModule(`export function useBaySlideIn(){ return { current: null }; }`);
const authHostStub = dataModule(`export function BayAuthHost(){ return null; }`);

// 替身按「那条 import 的原文」认。同一份文件从 src/shell/bay/shell 和 src/shell/leochat 两处引，原文不同，各写一条。
const stubs = {
  "next-intl": dataModule(`export function useLocale(){ return "zh"; }`),
  "../../../i18n/ui/useUI": uiStub,
  "../needs": needsStub,
  "../supply": supplyStub,
  "../deal": dealStub,
  "../orders": paneModule({ OrderPane: "order", MyOrdersPane: "mine-orders" }),
  "../seller": paneModule({ ServiceEditorPane: "service-editor", MyServicesPane: "mine-services" }),
  "../settings": paneModule({ BaySettingsPane: "settings" }),
  "./bay-state": stateStub,
  "./use-bay-data": dataStub,
  "./bay-motion": motionStub,
};
const pageStubs = {
  ...stubs,
  "../../i18n/ui/useUI": uiStub,
  "../bay/deal/DealConversationView": dealStub,
  "../bay/needs/LibraryWorkPicker": dataModule(`export function LibraryWorkPickerHost(){ return null; }`),
  "../bay/shell/bay-auth-host": authHostStub,
  "../bay/shell/bay-state": stateStub,
};

const { BayList, BayFeed } = await import(await compileModule("src/shell/bay/shell/BayList.tsx", stubs));
const { BayDetail, bayDetailTitleKey } = await import(await compileModule("src/shell/bay/shell/BayDetail.tsx", stubs));
const { BayMineTabs } = await import(await compileModule("src/shell/bay/shell/BayMine.tsx", stubs));
const { LeoBaySection, LeoBayHeaderActions } = await import(await compileModule("src/shell/leochat/page-leobay.tsx", pageStubs));

/** 整页的 LeoBay 栏：正文（LeoBaySection）加上整页画在页头右边的那组操作（只在停在信息流时有）。 */
function Section(props = {}) {
  return React.createElement(LeoBaySection, { active: true, ...props });
}

const html = (node) => renderToStaticMarkup(node);
const count = (text, pattern) => (text.match(pattern) || []).length;

function feedItems() {
  const base = { summary: "摘要", category: "design", created_at: "2026-10-07T00:00:00Z", author: { display_name: "Leo" }, stats: {}, price: null };
  return [
    { ...base, kind: "demand", id: "d1", title: "做一份路演稿" },
    { ...base, kind: "help", id: "h1", title: "排期拿不准" },
    { ...base, kind: "service", id: "s1", title: "品牌 Logo 设计" },
    { ...base, kind: "consult", id: "c1", title: "产品定价答疑" },
  ];
}

// ---- 小窗 -------------------------------------------------------------------------

test("小窗空列表：第一行只有搜索框和一个 + 号；我的一个；没有发需求、叫真人、整页打开", () => {
  reset();
  const out = html(React.createElement(BayList, { layout: "docked" }));
  assert.equal(count(out, /data-leochat-toolbar/g), 1);
  assert.equal(count(out, /data-leochat-search/g), 1);
  assert.equal(count(out, /data-leochat-plus(?=[\s=>])/g), 1);
  assert.match(out, /<button[^>]*data-leochat-plus[^>]*aria-haspopup="menu"/, "+ 号里不止一项，点开是菜单");
  assert.equal(count(out, /data-bay-action="mine"/g), 1);
  for (const gone of ["post-need", "open-page", "call-human", "publish-service"]) {
    assert.equal(count(out, new RegExp(`data-bay-action="${gone}"`, "g")), 0, gone);
  }
  assert.equal(count(out, /发需求|叫真人/g), 0);
  assert.match(out, /data-bay-empty="pristine"/);
});

test("小窗有内容时：四种都是整行", () => {
  reset({ feed: feedOf({ items: feedItems() }) });
  const out = html(React.createElement(BayList, { layout: "docked" }));
  assert.equal(count(out, /data-stub-card=/g), 4);
  assert.equal(count(out, /data-variant="row"/g), 4);
  assert.doesNotMatch(out, /data-bay-empty/);
});

test("小窗筛选后没结果：给清除筛选", () => {
  reset({ filter: { kind: "demand" } });
  const out = html(React.createElement(BayList, { layout: "docked" }));
  assert.match(out, /data-bay-empty="filtered"/);
  assert.match(out, /data-bay-clear-filters/);
});

test("小窗筛选行：四个种类（没有求助），右端类目和我的各一个；整块没有横向滚动容器", () => {
  reset();
  const out = html(React.createElement(BayList, { layout: "docked" }));
  const kinds = out.match(/<div role="tablist"[^>]*data-bay-kinds="overlay"[^>]*>/);
  assert.ok(kinds, "有种类筛选行");
  assert.match(kinds[0], /data-im-filter-row/);
  assert.match(kinds[0], /flex-wrap/);
  assert.equal(count(out, /role="tab"/g), 4);
  assert.doesNotMatch(out, />求助</);
  assert.equal(count(out, /data-bay-category-toggle/g), 1);
  assert.doesNotMatch(out, /data-bay-category-panel/);
  assert.doesNotMatch(out, /data-category="design"/, "类目没展开时不铺在列表上面");
  assert.doesNotMatch(out, /overflow-x-auto/);
});

test("小窗详情：一条返回栏（返回 + 标题）；停在信息流时不渲染；交易会话自己带头", () => {
  reset({ current: { kind: "post-need" } });
  const out = html(React.createElement(BayDetail, { layout: "docked" }));
  assert.equal(count(out, /data-bay-detail-bar/g), 1);
  assert.match(out, /aria-label="返回"/);
  assert.match(out, />找人帮忙</);
  assert.match(out, /data-stub-pane="post-need"/);

  reset();
  assert.equal(html(React.createElement(BayDetail, { layout: "docked" })), "");
  assert.equal(html(React.createElement(BayDetail, { layout: "full" })), "", "宽浮窗里也不再画一块带按键的占位");

  reset({ current: { kind: "conversation", threadId: "t1" } });
  const chat = html(React.createElement(BayDetail, { layout: "docked" }));
  assert.doesNotMatch(chat, /data-bay-detail-bar/);
  assert.match(chat, /data-stub-conversation="t1"[^>]*data-has-back="true"/);
});

// ---- 整页的 LeoBay 栏 ----------------------------------------------------------------

test("整页 LeoBay 栏逛的时候：不带页框和页标题；页头那组操作里我的、发布服务、找人帮忙各一个", () => {
  reset();
  const out = html(Section({ accent: "#0ea5e9" }));
  assert.match(out, /^<div class="flex min-h-0 flex-1 flex-col" data-bay-page="browse"/);
  assert.doesNotMatch(out, /max-w-6xl/, "页框是 LeoChat 整页的，这里不再套一层");
  assert.equal(count(out, /<h1/g), 0, "页标题是 LeoChat 整页的");
  assert.doesNotMatch(out, /data-bay-detail-empty|data-bay-page-detail/, "逛的时候没有详情栏，也没有它的占位");

  const actions = html(React.createElement(LeoBayHeaderActions));
  for (const action of ["mine", "publish-service", "get-help"]) {
    assert.equal(count(actions, new RegExp(`data-bay-action="${action}"`, "g")), 1, action);
  }
  assert.equal(count(actions, /找人帮忙/g), 1);
  assert.equal(count(actions + out, /发需求|叫真人/g), 0);
  assert.equal(count(actions + out, /data-bay-action="(?:post-need|call-human)"/g), 0);
});

test("整页的「发布服务」：宽屏在页头，手机在空列表下面，两处靠断点互斥", () => {
  reset();
  const classesOf = (markup) =>
    [...markup.matchAll(/<button[^>]*data-bay-action="publish-service"[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  const header = classesOf(html(React.createElement(LeoBayHeaderActions)));
  const body = classesOf(html(Section()));
  assert.equal(header.length, 1);
  assert.equal(body.length, 1);
  assert.ok(header[0].includes("hidden") && header[0].includes("sm:inline-flex"), "页头那个在手机上藏起来");
  assert.ok(body[0].includes("inline-flex") && body[0].includes("sm:hidden"), "空列表那个只在手机上出现");

  reset({ feed: feedOf({ items: feedItems() }) });
  assert.equal(count(html(Section()), /data-bay-action="publish-service"/g), 0, "有内容时正文里不再有");
});

test("整页信息流：卡片网格；种类是会换行的分段标签（四个）；类目直接摆出来；没有横向滚动容器和固定宽的栏", () => {
  reset({ feed: feedOf({ items: feedItems() }) });
  const out = html(Section({ accent: "#0ea5e9" }));
  assert.match(out, /<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">/);
  assert.equal(count(out, /data-variant="card"/g), 4);
  assert.equal(count(out, /data-variant="row"/g), 0);
  const kinds = out.match(/<div role="tablist"[^>]*data-bay-kinds="page"[^>]*class="([^"]*)"/);
  assert.ok(kinds);
  assert.match(kinds[1], /flex-wrap/);
  assert.match(kinds[1], /rounded-xl bg-neutral-100 p-1/);
  assert.equal(count(out, /role="tab"/g), 4);
  assert.match(out, /<div class="mb-4 hidden sm:block"><div role="group"[^>]*data-bay-categories="chips"/);
  assert.equal(count(out, /data-category="design"/g), 1);
  assert.match(out, /<button[^>]*data-bay-category-toggle[^>]*class="[^"]*sm:hidden/);
  assert.doesNotMatch(out, /overflow-x-auto/);
  assert.doesNotMatch(out, /\bw-56\b|w-\[360px\]/);
  assert.match(out, /type="search"/);
});

test("整页点开一条：返回 + 标题一行、正文一张卡；信息流藏起来但还在", () => {
  reset({ current: { kind: "post-need" } });
  const out = html(Section());
  assert.match(out, /^<div class="flex min-h-0 flex-1 flex-col" data-bay-page="detail"/);
  assert.match(out, /<div class="hidden" data-bay-page-browse="true">/);
  assert.equal(count(out, /data-bay-page-back/g), 1);
  assert.match(out, /data-bay-page-detail-header/);
  const visible = out.slice(out.indexOf("data-bay-page-detail-header"));
  assert.match(visible, /<h2 class="min-w-0 truncate text-\[17px\] font-semibold tracking-tight text-neutral-900">找人帮忙<\/h2>/);
  assert.equal(count(out, /<h1/g), 0, "整页只有 LeoChat 一个一级标题");
  assert.equal(count(visible, /data-bay-action=/g), 0, "详情视图里没有再放一套全局操作");
  const card = out.match(/<div class="([^"]*)" data-bay-page-detail="post-need">/);
  assert.ok(card);
  assert.ok(card[1].includes("max-w-3xl") && card[1].includes("rounded-2xl") && card[1].includes("overflow-hidden"));
  assert.match(out, /data-stub-pane="post-need"/);
});

test("整页详情宽度：服务、下单、会话用满页框；其余收在易读宽度；会话占满高度且不带第二个返回键", () => {
  for (const target of [{ kind: "service", id: "s1" }, { kind: "checkout", serviceId: "s1" }]) {
    reset({ current: target });
    const card = html(Section()).match(new RegExp(`<div class="([^"]*)" data-bay-page-detail="${target.kind}">`));
    assert.ok(card && !card[1].includes("max-w-3xl"), target.kind);
  }
  for (const target of [{ kind: "demand", id: "d1" }, { kind: "mine", tab: "needs" }, { kind: "service-editor" }]) {
    reset({ current: target });
    const card = html(Section()).match(new RegExp(`<div class="([^"]*)" data-bay-page-detail="${target.kind}">`));
    assert.ok(card && card[1].includes("max-w-3xl"), target.kind);
  }
  reset({ current: { kind: "conversation", threadId: "t9" } });
  const chat = html(Section());
  const card = chat.match(/<div class="([^"]*)" data-bay-page-detail="conversation">/);
  assert.ok(card && card[1].split(/\s+/).includes("flex-1") && !card[1].includes("max-w-3xl"));
  assert.match(chat, /data-stub-conversation="t9"[^>]*data-layout="page"[^>]*data-has-back="false"/);
  assert.equal(count(chat, /data-bay-page-back/g), 1);
  assert.match(chat, />交易会话<\/h2>/);
});

test("「我的」四个分区：整页是分段标签，小窗是筛选行；都会换行；旧的「我的求助」深链落在「我发出的」", () => {
  reset({ current: { kind: "mine", tab: "orders" } });
  const page = html(Section());
  const pageTabs = page.match(/<div role="tablist"[^>]*data-bay-mine-tabs="page"[^>]*class="([^"]*)"/);
  assert.ok(pageTabs && /flex-wrap/.test(pageTabs[1]) && /rounded-xl bg-neutral-100 p-1/.test(pageTabs[1]));
  assert.match(page, /data-stub-pane="mine-orders"/);
  const overlay = html(React.createElement(BayDetail, { layout: "docked" }));
  const overlayTabs = overlay.match(/<div role="tablist"[^>]*data-bay-mine-tabs="overlay"[^>]*>/);
  assert.ok(overlayTabs && /data-im-filter-row/.test(overlayTabs[0]) && /flex-wrap/.test(overlayTabs[0]));
  assert.doesNotMatch(page + overlay, /overflow-x-auto/);

  for (const variant of ["page", "overlay"]) {
    const tabs = html(React.createElement(BayMineTabs, { tab: "help", variant }));
    assert.deepEqual([...tabs.matchAll(/data-mine-tab="([a-z]+)"/g)].map((m) => m[1]), ["needs", "proposals", "services", "orders"], variant);
    assert.match(tabs, /aria-selected="true"[^>]*data-mine-tab="needs"/, `${variant}：旧深链高亮「我发出的」`);
    assert.match(tabs, />我发出的</);
    assert.doesNotMatch(tabs, /我的求助|我的需求/);
  }
  reset({ current: { kind: "mine", tab: "help" } });
  assert.match(html(Section()), /data-stub-pane="mine-needs"/);
});

test("标题：每种目标都有；编辑已有服务叫「编辑服务」；信息流没有标题", () => {
  assert.equal(bayDetailTitleKey({ kind: "feed" }), null);
  assert.equal(bayDetailTitleKey({ kind: "service-editor" }), "发布服务");
  assert.equal(bayDetailTitleKey({ kind: "service-editor", serviceId: "s1" }), "编辑服务");
  assert.equal(bayDetailTitleKey({ kind: "conversation", threadId: "t" }), "交易会话");
  assert.equal(bayDetailTitleKey({ kind: "post-need" }), "找人帮忙");
  assert.equal(bayDetailTitleKey({ kind: "call-human" }), "找人帮忙", "发需求和叫真人是同一张表单、同一个名字");
  for (const kind of ["demand", "service", "help", "consult", "profile", "order", "post-need", "call-human", "propose", "checkout", "mine", "settings"]) {
    assert.ok(bayDetailTitleKey({ kind }), kind);
  }
});

test("信息流状态：首屏是骨架，出错给重试，加载更多是一个键", () => {
  reset({ feed: feedOf({ loading: true, loaded: false }) });
  assert.match(html(React.createElement(BayFeed, { filter: state.filter, activeKey: null, variant: "grid" })), /data-bay-feed-loading/);
  reset({ feed: feedOf({ error: "加载失败，请稍后再试。" }) });
  const failed = html(React.createElement(BayFeed, { filter: state.filter, activeKey: null }));
  assert.match(failed, /data-bay-feed-error/);
  assert.match(failed, />重试</);
  assert.doesNotMatch(failed, /data-bay-empty/);
  reset({ feed: feedOf({ items: feedItems(), hasMore: true }) });
  assert.equal(count(html(React.createElement(BayFeed, { filter: state.filter, activeKey: null, variant: "grid" })), />加载更多</g), 1);
});

// ---- 源码层面 ---------------------------------------------------------------------

test("LeoBay 的四个界面文件：版式只靠样式断点，不量窗口宽；不用品牌蓝实心块；没有横向滚动条容器", () => {
  const files = ["shell/leochat/page-leobay.tsx", "shell/bay/shell/BayList.tsx", "shell/bay/shell/BayDetail.tsx", "shell/bay/shell/BayMine.tsx"];
  assert.doesNotMatch(src(files[0]), /innerWidth|addEventListener\("resize"|useWidth/);
  for (const name of files) {
    const text = src(name);
    assert.doesNotMatch(text, /bg-sky-500|bg-sky-600/, `${name} 用了品牌蓝实心块`);
    assert.doesNotMatch(text, /overflow-x-auto/, `${name} 有横向滚动容器`);
    assert.doesNotMatch(text, /kind: "call-human"/, `${name} 里又放了一个单独的叫真人`);
    assert.doesNotMatch(text, /OceanLeo Bay/, `${name} 还在用旧名字`);
  }
  assert.doesNotMatch(src("shell/bay/shell/BayDetail.tsx"), /BayDetailEmpty|BayEmptyActions/);
  const bayPage = src("shell/bay/shell/BayPage.tsx");
  assert.match(bayPage, /<LeoChatPage siteKey=\{siteKey\} accent=\{accent\} initialTab="bay" \/>/, "/bay 就是 LeoChat 整页停在 LeoBay 栏");
});

// ---- 真卡片的两种外形 ----------------------------------------------------------------

const httpStub = dataModule(`
  export class BayApiError extends Error {}
  const no = async () => { throw new Error("network is stubbed"); };
  export const bayGet = no, bayPost = no, bayPatch = no, bayDelete = no;
`);
const realCardStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/bay/http": httpStub,
  "../../../lib/agent": dataModule(`export async function authed(){ return { ok: false, status: 401 }; }`),
};
const needCards = await import(await compileModule("src/shell/bay/needs/NeedCards.tsx", realCardStubs));
const { ServiceCard } = await import(await compileModule("src/shell/bay/supply/ServiceCard.tsx", realCardStubs));
const { ConsultCard } = await import(await compileModule("src/shell/bay/supply/ConsultCard.tsx", realCardStubs));

function realItem(extra = {}) {
  return {
    kind: "demand",
    id: "x1",
    title: "做一份路演稿",
    summary: "十页以内，要有财务预测",
    category: null,
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    posted_site: "ppt",
    handling_site: "ppt",
    price: { min_fen: 50000, max_fen: 100000, unit: null, currency: "CNY" },
    author: { user_id: "u1", handle: "leo", display_name: "Leo", avatar_url: null, verified_level: 0, rating_avg: 4.8, rating_count: 3 },
    stats: { proposal_count: 3, order_count: 2 },
    status: "open",
    deadline_at: null,
    cover_url: null,
    has_attached_work: false,
    ...extra,
  };
}

const CARDS = [
  ["demand", needCards.DemandCard, "需求"],
  ["help", needCards.HelpRequestCard, "求助"],
  ["service", ServiceCard, "服务"],
  ["consult", ConsultCard, "答疑"],
];

test("四种卡在网格里是同一种卡片：整张一个按钮、圆角描边白底、撑满格子、带种类小标", () => {
  for (const [kind, Card, label] of CARDS) {
    const out = html(React.createElement(Card, { item: realItem({ kind }), onOpen() {}, variant: "card" }));
    assert.equal(count(out, /<button/g), 1, kind);
    const root = out.match(/^<button[^>]*class="([^"]*)"/);
    assert.ok(root, kind);
    const classes = root[1].split(/\s+/);
    for (const cls of ["rounded-2xl", "border", "bg-white", "h-full", "w-full", "flex-col", "p-4"]) assert.ok(classes.includes(cls), `${kind} 缺 ${cls}`);
    assert.ok(!classes.includes("border-b"), `${kind} 卡片不该带整行的下边线`);
    assert.match(out, new RegExp(`data-bay-card="${kind}"`));
    assert.match(out, /data-bay-card-variant="card"/);
    assert.match(out, new RegExp(`>${label}<`), `${kind} 没有种类小标`);
    assert.match(out, /做一份路演稿/);
  }
});

test("四种卡在小窗里是同一种整行：下边线、同一档标题字号、带种类小标", () => {
  const titles = new Set();
  for (const [kind, Card, label] of CARDS) {
    const out = html(React.createElement(Card, { item: realItem({ kind }), onOpen() {} }));
    const root = out.match(/^<button[^>]*class="([^"]*)"/);
    assert.ok(root, kind);
    const classes = root[1].split(/\s+/);
    assert.ok(classes.includes("border-b") && classes.includes("w-full"), kind);
    assert.ok(!classes.some((name) => name.startsWith("rounded") || name === "bg-white" || name === "border"), kind);
    assert.doesNotMatch(out, /data-bay-card-variant/);
    assert.match(out, new RegExp(`>${label}<`), `${kind} 没有种类小标`);
    const title = out.match(/<span class="([^"]*)">做一份路演稿<\/span>/);
    assert.ok(title, `${kind} 标题`);
    titles.add(title[1]);
  }
  assert.equal(titles.size, 1, `四种卡的标题不是同一套类名：${[...titles].join(" | ")}`);
});

// ---- 同一个元素上不许有两个互相打架的类 --------------------------------------------------
// 两个类改同一个属性时，谁赢取决于它们在产物里的先后，不取决于写在 className 里的先后。
// 这类问题不报错、也不红，只是悄悄不生效——比如「两行截断」和「块级」写在一起，产物里
// 块级排在后面，于是截断整个失效，长标题把卡片撑变形。这里把渲染出来的每个 class 逐个查。

const DISPLAY = new Set(["block", "inline-block", "inline", "flex", "inline-flex", "grid", "inline-grid", "hidden", "contents"]);
const COLOR_WORD =
  /^(?:inherit|current|transparent|black|white|(?:stone|neutral|gray|zinc|slate|red|rose|amber|orange|yellow|emerald|green|teal|sky|blue|indigo|violet|purple|pink)-\d+)(?:\/.+)?$/;

/** 这个类改的是哪一个属性（只认本测试关心的几族；认不出的返回 null，不参与比对）。 */
function familyOf(utility) {
  if (DISPLAY.has(utility) || /^line-clamp-\d+$/.test(utility)) return "display";
  if (utility === "truncate" || /^whitespace-/.test(utility)) return "white-space";
  // 长的写在前面：`gap-x-3` 改的是列间距，不能被 `gap` 那一支先吃掉。
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

/** 一个 class 属性里，同一个前缀（sm: / dark: / hover: …）下改同一个属性的不同类。 */
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
  assert.deepEqual(conflictsIn("flex flex-wrap gap-x-3 gap-y-2 min-w-0 w-full max-w-3xl"), [], "行距、列距、最小宽、最大宽各是各的属性");
  assert.deepEqual(conflictsIn("gap-2 gap-3"), ["gap-2 ↔ gap-3"]);
});

test("渲染出来的每个元素：没有两个类在抢同一个属性", () => {
  const pages = [];
  reset();
  pages.push(["小窗空列表", html(React.createElement(BayList, { layout: "docked" }))]);
  reset({ filter: { kind: "service", category: "design", q: "logo" } });
  pages.push(["小窗筛选后", html(React.createElement(BayList, { layout: "docked" }))]);
  reset({ feed: feedOf({ items: feedItems(), hasMore: true }) });
  pages.push(["小窗有内容", html(React.createElement(BayList, { layout: "mobile" }))]);
  pages.push(["整页有内容", html(Section({ accent: "#0ea5e9" }))]);
  pages.push(["整页页头操作", html(React.createElement(LeoBayHeaderActions))]);
  reset({ filter: { kind: "all", category: "design" } });
  pages.push(["整页选了类目", html(Section())]);
  reset({ feed: feedOf({ loading: true, loaded: false }) });
  pages.push(["整页加载中", html(Section())]);
  for (const current of [{ kind: "post-need" }, { kind: "mine", tab: "services" }, { kind: "service", id: "s1" }, { kind: "conversation", threadId: "t1" }]) {
    reset({ current });
    pages.push([`整页详情 ${current.kind}`, html(Section())]);
    pages.push([`小窗详情 ${current.kind}`, html(React.createElement(BayDetail, { layout: "docked" }))]);
  }
  reset({ signedIn: false, current: { kind: "mine", tab: "needs" } });
  pages.push(["未登录的我的", html(React.createElement(BayDetail, { layout: "docked" }))]);
  for (const [kind, Card] of CARDS) {
    const item = realItem({ kind, has_attached_work: true, cover_url: "https://cdn.example/c.png", delivery_days: 3 });
    pages.push([`${kind} 卡片`, html(React.createElement(Card, { item, onOpen() {}, variant: "card" }))]);
    pages.push([`${kind} 整行`, html(React.createElement(Card, { item, onOpen() {} }))]);
  }

  const found = [];
  let checked = 0;
  for (const [label, markup] of pages) {
    for (const match of markup.matchAll(/class="([^"]*)"/g)) {
      checked += 1;
      for (const conflict of conflictsIn(match[1])) found.push(`${label}：${conflict}（${match[1]}）`);
    }
  }
  assert.ok(checked > 200, `只查到 ${checked} 个元素，取样失效`);
  assert.deepEqual([...new Set(found)], []);
});
