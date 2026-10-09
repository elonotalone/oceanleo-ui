// 右侧栏里的 LeoBay 缩小版：相关服务、浏览、详情栈与在场登记。
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
globalThis.__bay5React = React;

const { createRoot } = await import("react-dom/client");

function feedItem(kind, id, title) {
  return {
    kind,
    id,
    title,
    summary: "",
    category: "ppt",
    created_at: "2026-10-09T00:00:00Z",
    posted_site: "ppt",
    handling_site: "ppt",
    price: null,
    author: {
      user_id: "u1",
      handle: "leo",
      display_name: "Leo",
      avatar_url: null,
      verified_level: 0,
      rating_avg: null,
      rating_count: 0,
    },
    stats: {},
    status: "published",
    deadline_at: null,
    cover_url: null,
    has_attached_work: false,
  };
}

globalThis.__bay5 = {
  relatedCalls: [],
  relatedImpl: async () => ({ items: [], match: "none", q: "", site: null }),
  detailLast: null,
  categories: {
    categories: [
      { slug: "ppt", name_zh: "LeoSlides", name_en: "LeoSlides", icon: "slides" },
      { slug: "music", name_zh: "LeoMusic", name_en: "LeoMusic", icon: "music" },
    ],
    loading: false,
    failed: false,
  },
};

function resetRelated(page) {
  globalThis.__bay5.relatedCalls = [];
  globalThis.__bay5.detailLast = null;
  globalThis.__bay5.relatedImpl = async (_input, opts) => {
    if (opts?.signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    return typeof page === "function" ? page() : page;
  };
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const familyStub = dataModule(`
  export function currentDomainFamily() { return "com"; }
  export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
  export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
`);
const AUTH_SIGNED_OUT = dataModule(`
  export const AUTH_STATE_EVENT = "oceanleo:auth-state";
  export function cachedAccessToken() { return null; }
  export async function accessToken() { return null; }
`);
const AUTH_CONFIG = dataModule(`export function isLeoDevPreviewHost() { return false; }`);
const hostStub = dataModule(`
  export function hostState() {
    return {
      getSnapshot() { return { enabled: false, open: false, conversationId: null }; },
      open() {},
      subscribe() { return () => {}; },
    };
  }
`);
const relatedStub = dataModule(`
  export function fetchBayRelated(input, opts) {
    globalThis.__bay5.relatedCalls.push({ input, opts });
    return globalThis.__bay5.relatedImpl(input, opts);
  }
`);
const detailStub = dataModule(`
  const createElement = (...args) => globalThis.__bay5React.createElement(...args);
  export function BayDetailPane(props) {
    globalThis.__bay5.detailLast = props;
    return createElement("section", {
      "data-stub-pane": "detail",
      "data-layout": props.layout,
      "data-kind": props.target && props.target.kind,
    });
  }
  export function bayDetailTitleKey(target) {
    if (!target || target.kind === "feed") return null;
    return "服务详情";
  }
`);
const listStub = dataModule(`
  const createElement = (...args) => globalThis.__bay5React.createElement(...args);
  const useState = (...args) => globalThis.__bay5React.useState(...args);
  export function useBaySearchText(filter) {
    const [text, setText] = useState(filter && filter.q ? filter.q : "");
    return { text, change: setText, commit: setText };
  }
  export function useBayCategoryName() {
    return (c) => c.name_zh || c.slug;
  }
  export function BayViewSwitch() {
    return createElement("div", { "data-bay-view": "stub", role: "tablist" });
  }
  export function BayFeed() {
    return createElement("div", { "data-stub-feed": "BayFeed" });
  }
  export function openMine() {}
  export function startPublish() {}
  export function startPostNeed() {}
`);
const supplyStub = dataModule(`
  const createElement = (...args) => globalThis.__bay5React.createElement(...args);
  export function ServiceCard({ item, variant, onOpen }) {
    return createElement("button", { type: "button", "data-stub-card": "ServiceCard", "data-variant": variant || "row", onClick: onOpen }, item.title);
  }
  export function ConsultCard({ item, variant, onOpen }) {
    return createElement("button", { type: "button", "data-stub-card": "ConsultCard", "data-variant": variant || "row", onClick: onOpen }, item.title);
  }
`);
const dataStub = dataModule(`
  export function useBayCategories() { return globalThis.__bay5.categories; }
  export function useBayFeed() {
    return { items: [], loading: false, loaded: true, error: null, hasMore: false, loadMore() {}, retry() {} };
  }
`);
const pickerStub = dataModule(`export function LibraryWorkPickerHost() { return null; }`);

const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../contracts/domain-family": familyStub,
  "../../../lib/auth/client": AUTH_SIGNED_OUT,
  "../../../lib/auth/config": AUTH_CONFIG,
  "../../messages/host-state": hostStub,
  "../../../lib/bay/related": relatedStub,
  "../shell/BayDetail": detailStub,
  "../shell/BayList": listStub,
  "../supply": supplyStub,
  "../shell/use-bay-data": dataStub,
  "../needs/LibraryWorkPicker": pickerStub,
};

const { BayPanel } = await import(await compileModule("src/shell/bay/panel/BayPanel.tsx", stubs));
const bayState = await import(await compileModule("src/shell/bay/shell/bay-state.ts", stubs));

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function waitFor(assertFn, tries = 40) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      assertFn();
      return;
    } catch (error) {
      last = error;
      await flush();
    }
  }
  throw last;
}

function panelEl(props) {
  return React.createElement(BayPanel, {
    siteKey: "ppt",
    active: true,
    request: null,
    ...props,
  });
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const tree = createRoot(host);
  await act(() => {
    tree.render(element);
  });
  await flush();
  return {
    host,
    async render(next) {
      await act(() => {
        tree.render(next);
      });
      await flush();
    },
    async unmount() {
      await act(() => {
        tree.unmount();
      });
      host.remove();
      bayState.closeBayDetails();
      bayState.setBayFilter({ kind: "supply" });
      bayState.setBayNavigator(null);
    },
  };
}

test("没有 request：browse，有搜索框和类目下拉", async () => {
  resetRelated({ items: [], match: "none", q: "", site: null });
  const view = await mount(panelEl({ request: null, active: true }));
  const root = view.host.querySelector("[data-bay-panel-root]");
  assert.equal(root.getAttribute("data-bay-panel-mode"), "browse");
  assert.ok(view.host.querySelector("[data-bay-panel-search]"));
  const select = view.host.querySelector("[data-bay-panel-category]");
  assert.ok(select);
  const labels = [...select.options].map((option) => option.textContent.trim());
  assert.deepEqual(labels, ["全部类目", "LeoSlides", "LeoMusic", "专业咨询"]);
  assert.equal(globalThis.__bay5.relatedCalls.length, 0);
  await view.unmount();
});

test("有 request、active：发相关服务请求；藏着不发", async () => {
  resetRelated({
    items: [feedItem("service", "s1", "封面设计"), feedItem("consult", "c1", "答疑")],
    match: "keyword",
    q: "封面",
    site: "ppt",
  });
  const hidden = await mount(
    panelEl({ siteKey: "ppt", active: false, request: { nonce: "n1", query: "封面", category: "ppt" } }),
  );
  assert.equal(globalThis.__bay5.relatedCalls.length, 0);
  await hidden.render(panelEl({ siteKey: "ppt", active: true, request: { nonce: "n1", query: "封面", category: "ppt" } }));
  await waitFor(() => assert.ok(hidden.host.querySelector("[data-bay-related-list]")));
  assert.equal(globalThis.__bay5.relatedCalls.length, 1);
  assert.equal(globalThis.__bay5.relatedCalls[0].input.q, "封面");
  assert.equal(globalThis.__bay5.relatedCalls[0].input.site, "ppt");
  assert.equal(globalThis.__bay5.relatedCalls[0].input.limit, 12);
  assert.match(hidden.host.querySelector("[data-bay-related-title]").textContent, /与我的问题相关的服务/);
  assert.match(hidden.host.querySelector("[data-bay-related-query]").textContent, /关键词：封面/);
  assert.ok(hidden.host.querySelector('[data-bay-related-item="service"]'));
  assert.ok(hidden.host.querySelector('[data-bay-related-item="consult"]'));
  await hidden.unmount();

  resetRelated({ items: [feedItem("service", "s2", "配乐")], match: "keyword", q: "配乐", site: "music" });
  const view = await mount(panelEl({ siteKey: "ppt", active: true, request: { nonce: "n2", query: "配乐" } }));
  await waitFor(() => assert.equal(globalThis.__bay5.relatedCalls.length, 1));
  assert.equal(globalThis.__bay5.relatedCalls[0].input.site, "ppt");
  await view.unmount();
});

test("match: site 多出说明，含站点产品名", async () => {
  resetRelated({
    items: [feedItem("service", "s1", "幻灯片")],
    match: "site",
    q: "配乐",
    site: "ppt",
  });
  const view = await mount(panelEl({ siteKey: "ppt", active: true, request: { nonce: "n3", query: "配乐", category: "ppt" } }));
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-note]")));
  assert.match(view.host.querySelector("[data-bay-related-note]").textContent, /LeoSlides/);
  await view.unmount();
});

test("空结果有发需求；失败可重试", async () => {
  resetRelated({ items: [], match: "none", q: "无人", site: "ppt" });
  const empty = await mount(panelEl({ active: true, request: { nonce: "n4", query: "无人", category: "ppt" } }));
  await waitFor(() => assert.ok(empty.host.querySelector("[data-bay-related-empty]")));
  assert.match(empty.host.textContent, /还没有相关的服务。/);
  assert.ok(empty.host.querySelector("[data-bay-related-post-need]"));
  await empty.unmount();

  let fail = true;
  resetRelated(() => {
    if (fail) throw new Error("boom");
    return { items: [feedItem("service", "s9", "修好了")], match: "keyword", q: "修", site: "ppt" };
  });
  const view = await mount(panelEl({ active: true, request: { nonce: "n5", query: "修" } }));
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-error]")));
  assert.match(view.host.textContent, /相关服务没读出来，请稍后再试。/);
  fail = false;
  await act(() => {
    view.host.querySelector("[data-bay-related-error] button").click();
  });
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-list]")));
  assert.equal(globalThis.__bay5.relatedCalls.length, 2);
  await view.unmount();
});

test("点一条服务进详情，返回回到相关服务", async () => {
  const backs = [];
  resetRelated({ items: [feedItem("service", "s1", "封面设计")], match: "keyword", q: "封面", site: "ppt" });
  const view = await mount(
    panelEl({
      active: true,
      request: { nonce: "n6", query: "封面", category: "ppt" },
      onBackChange: (fn) => {
        backs.push(fn);
      },
    }),
  );
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-list]")));
  await act(() => {
    view.host.querySelector('[data-stub-card="ServiceCard"]').click();
  });
  await waitFor(() => assert.equal(view.host.querySelector("[data-bay-panel-root]").getAttribute("data-bay-panel-mode"), "detail"));
  assert.deepEqual(bayState.bayStateSnapshot().current, { kind: "service", id: "s1" });
  assert.equal(globalThis.__bay5.detailLast.layout, "docked");
  const back = [...backs].reverse().find((fn) => typeof fn === "function");
  assert.equal(typeof back, "function");
  await act(() => {
    back();
  });
  await waitFor(() => assert.equal(view.host.querySelector("[data-bay-panel-root]").getAttribute("data-bay-panel-mode"), "related"));
  const last = backs[backs.length - 1];
  assert.equal(last, null);
  await view.unmount();
});

test("active 为真时在场；变假后注销", async () => {
  resetRelated({ items: [], match: "none", q: "", site: null });
  const assigned = [];
  bayState.setBayNavigator((href) => {
    assigned.push(String(href));
  });
  const view = await mount(panelEl({ active: true, request: null }));
  bayState.openBay({ kind: "service", id: "keep" });
  assert.deepEqual(bayState.bayStateSnapshot().current, { kind: "service", id: "keep" });
  assert.deepEqual(assigned, []);
  await view.render(panelEl({ active: false, request: null }));
  bayState.closeBayDetails();
  assigned.length = 0;
  bayState.openBay({ kind: "demand", id: "d2" });
  assert.ok(assigned.some((href) => href.includes("/bay")));
  bayState.setBayNavigator(null);
  await view.unmount();
});

test("逛全部 LeoBay 进 browse，返回回到 related", async () => {
  const backs = [];
  resetRelated({ items: [feedItem("service", "s1", "封面")], match: "keyword", q: "封面", site: "ppt" });
  const view = await mount(
    panelEl({
      active: true,
      request: { nonce: "n7", query: "封面", category: "ppt" },
      onBackChange: (fn) => {
        backs.push(fn);
      },
    }),
  );
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-browse]")));
  await act(() => {
    view.host.querySelector("[data-bay-related-browse]").click();
  });
  await waitFor(() => assert.equal(view.host.querySelector("[data-bay-panel-root]").getAttribute("data-bay-panel-mode"), "browse"));
  const back = [...backs].reverse().find((fn) => typeof fn === "function");
  assert.equal(typeof back, "function");
  await act(() => {
    back();
  });
  await waitFor(() => assert.equal(view.host.querySelector("[data-bay-panel-root]").getAttribute("data-bay-panel-mode"), "related"));
  await view.unmount();
});

test("新 nonce 回到 related、清空目标栈、重新请求", async () => {
  resetRelated({ items: [feedItem("service", "s1", "旧")], match: "keyword", q: "旧", site: "ppt" });
  const view = await mount(panelEl({ active: true, request: { nonce: "old", query: "旧", category: "ppt" } }));
  await waitFor(() => assert.ok(view.host.querySelector("[data-bay-related-list]")));
  await act(() => {
    view.host.querySelector('[data-stub-card="ServiceCard"]').click();
  });
  await waitFor(() => assert.equal(bayState.bayStateSnapshot().current.kind, "service"));
  resetRelated({ items: [feedItem("service", "s2", "新")], match: "keyword", q: "新", site: "ppt" });
  await view.render(panelEl({ active: true, request: { nonce: "new", query: "新", category: "ppt" } }));
  await waitFor(() => {
    assert.equal(view.host.querySelector("[data-bay-panel-root]").getAttribute("data-bay-panel-mode"), "related");
    assert.equal(bayState.bayStateSnapshot().current.kind, "feed");
    assert.equal(globalThis.__bay5.relatedCalls.length, 1);
  });
  await view.unmount();
});

test("先聊聊：openBayConversation 交给 onOpenConversation", async () => {
  const opened = [];
  resetRelated({ items: [], match: "none", q: "", site: null });
  const view = await mount(
    panelEl({
      active: true,
      request: null,
      onOpenConversation: (id) => {
        opened.push(id);
      },
    }),
  );
  await flush();
  bayState.openBayConversation("t1");
  assert.deepEqual(opened, ["talent:t1"]);
  await view.unmount();
});
