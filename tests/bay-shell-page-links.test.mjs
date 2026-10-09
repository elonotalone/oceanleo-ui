// oceanleo-bay：人在 `/bay` 页上时，点一个仍然指向本页的链接（侧栏的「OceanLeo Bay」、别处的 `/bay?bay=…`）
// 要按链接带的目标换页内详情；没带目标就回信息流。站内跳转只换地址、不重挂页面，所以这件事由 bay-state 接住。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const state = await import(
  await compileModule("src/shell/bay/shell/bay-state.ts", {
    "../../../contracts/domain-family": dataModule(`
      export function currentDomainFamily() { return "com"; }
      export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
      export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
    `),
    "../../../lib/auth/client": dataModule(`
      export const AUTH_STATE_EVENT = "oceanleo:auth-state";
      export function cachedAccessToken() { return "token"; }
      export async function accessToken() { return "token"; }
    `),
    "../../../lib/auth/config": dataModule(`export function isLeoDevPreviewHost() { return false; }`),
  })
);

function fakeWindow(search) {
  const listeners = { window: new Map(), document: new Map() };
  const location = { origin: "https://oceanleo.com", pathname: "/bay", search, hash: "", href: `https://oceanleo.com/bay${search}` };
  const win = {
    location,
    history: {
      state: null,
      pushState(next, _title, url) {
        this.state = next;
        const parsed = new URL(url, location.href);
        location.search = parsed.search;
        location.href = parsed.href;
      },
      replaceState(next, _title, url) {
        this.pushState(next, _title, url);
      },
      back() {},
    },
    addEventListener: (type, fn) => listeners.window.set(type, fn),
    removeEventListener: (type) => listeners.window.delete(type),
    dispatchEvent: () => true,
    document: {
      addEventListener: (type, fn, capture) => listeners.document.set(type, { fn, capture }),
      removeEventListener: (type) => listeners.document.delete(type),
    },
  };
  return { win, listeners };
}

function clickOn(listeners, href, extra = {}) {
  const anchor = {
    getAttribute: (name) => (name === "href" ? href : name === "target" ? extra.target ?? null : null),
    hasAttribute: (name) => name === "download" && Boolean(extra.download),
  };
  listeners.document.get("click").fn({
    button: extra.button ?? 0,
    metaKey: Boolean(extra.metaKey),
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: (selector) => (selector === "a[href]" ? anchor : null) },
  });
}

test("在 /bay 页上点指向本页的链接：没带目标回信息流，带了就换到那个目标；别的链接不管", () => {
  const { win, listeners } = fakeWindow("?bay=demand:d1");
  globalThis.window = win;
  try {
    const release = state.registerBayPage();
    assert.deepEqual(state.bayStateSnapshot().current, { kind: "demand", id: "d1" }, "进页面时读地址里的目标");
    assert.equal(listeners.document.get("click")?.capture, true, "在捕获阶段听，先于站内跳转");

    clickOn(listeners, "/projects");
    assert.equal(state.bayStateSnapshot().current.kind, "demand", "去别的页面的链接不动页内状态");

    clickOn(listeners, "/bay", { metaKey: true });
    assert.equal(state.bayStateSnapshot().current.kind, "demand", "按着修饰键是新标签页打开，不动本页");
    clickOn(listeners, "/bay", { target: "_blank" });
    assert.equal(state.bayStateSnapshot().current.kind, "demand");
    clickOn(listeners, "/bay", { button: 1 });
    assert.equal(state.bayStateSnapshot().current.kind, "demand");

    clickOn(listeners, "/bay");
    assert.deepEqual(state.bayStateSnapshot().current.kind, "feed", "侧栏的 OceanLeo Bay：回信息流");
    assert.equal(state.bayStateSnapshot().canGoBack, false);

    clickOn(listeners, "/bay?bay=mine:orders");
    assert.deepEqual(state.bayStateSnapshot().current, { kind: "mine", tab: "bought" });
    clickOn(listeners, "/bay?bay=publish:design");
    assert.deepEqual(state.bayStateSnapshot().current, { kind: "publish", category: "design" });

    clickOn(listeners, "https://oceanleo.com/bay?bay=service:s1");
    assert.deepEqual(state.bayStateSnapshot().current, { kind: "service", id: "s1" });

    clickOn(listeners, "https://design.oceanleo.com/bay");
    assert.equal(state.bayStateSnapshot().current.kind, "service", "别的站的 /bay 不是本页");

    release();
    assert.equal(listeners.document.has("click"), false, "离开页面后不再听");
    assert.equal(listeners.window.has("popstate"), false);
  } finally {
    delete globalThis.window;
  }
});

test("默认筛选不往地址里写 kind；?kind=demand 进页面能读回来", () => {
  const { win } = fakeWindow("");
  globalThis.window = win;
  try {
    const off = state.registerBayPage();
    assert.equal(state.bayStateSnapshot().current.kind, "feed");
    assert.equal(state.bayStateSnapshot().current.filter?.kind ?? "supply", "supply");
    assert.equal(win.location.search.includes("kind="), false, "默认 supply 不写 kind");
    off();
  } finally {
    delete globalThis.window;
  }

  const demand = fakeWindow("?kind=demand");
  globalThis.window = demand.win;
  try {
    const off = state.registerBayPage();
    assert.equal(state.bayStateSnapshot().current.kind, "feed");
    assert.equal(state.bayStateSnapshot().current.filter?.kind, "demand");
    off();
  } finally {
    delete globalThis.window;
  }
});

test("useBayPageMounted 的依据：页面挂着时浮窗知道人已经在 /bay 上", () => {
  const { win } = fakeWindow("");
  globalThis.window = win;
  try {
    const first = state.registerBayPage();
    const second = state.registerBayPage();
    first();
    first();
    // 两次挂载只卸了一次（重复调用同一个卸载函数不重复减）：页面仍算挂着，openBay 走页内而不是开浮窗。
    state.openBay({ kind: "post-need" });
    assert.equal(win.location.search, "?bay=post-need");
    second();
  } finally {
    delete globalThis.window;
  }
});
