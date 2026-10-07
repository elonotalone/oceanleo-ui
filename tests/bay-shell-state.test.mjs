// W03（oceanleo-bay）：Bay 深链解析、跨站地址、境内开关、目标栈、类目默认值、信息流请求。
import test from "node:test";
import assert from "node:assert/strict";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const links = await import("../src/shell/bay/shell/bay-links.ts");

const AUTH_SIGNED_OUT = dataModule(`
export const AUTH_STATE_EVENT = "oceanleo:auth-state";
export function cachedAccessToken() { return null; }
export async function accessToken() { return null; }
`);

const AUTH_CONFIG = dataModule(`
export function isLeoDevPreviewHost(host) {
  const h = String(host || "").trim().toLowerCase().replace(/\\.$/, "").split(":")[0];
  return /^p-[0-9a-f]{32}\\.dev\\.oceanleo\\.com$/.test(h);
}
`);

function familyStub(family) {
  return dataModule(`
export function currentDomainFamily() { return ${JSON.stringify(family)}; }
export function currentDomainProfile() { return { portalOrigin: "https://oceanleo.com" }; }
export function currentFamilySubsiteOrigin(label) { return "https://" + label + ".oceanleo.com"; }
`);
}

async function loadState(family = "com") {
  return import(
    await compileModule("src/shell/bay/shell/bay-state.ts", {
      "../../../contracts/domain-family": familyStub(family),
      "../../../lib/auth/client": AUTH_SIGNED_OUT,
      "../../../lib/auth/config": AUTH_CONFIG,
    })
  );
}

test("深链：契约 §5 的每一种都能解析，并且能原样写回", () => {
  const cases = [
    ["feed", { kind: "feed" }],
    ["demand:3f1c2d9e-aaaa-bbbb-cccc-123456789abc", { kind: "demand", id: "3f1c2d9e-aaaa-bbbb-cccc-123456789abc" }],
    ["service:s1", { kind: "service", id: "s1" }],
    ["help:h_1", { kind: "help", id: "h_1" }],
    ["consult:c-9", { kind: "consult", id: "c-9" }],
    ["profile:leo.design_01", { kind: "profile", handle: "leo.design_01" }],
    ["order:o1", { kind: "order", id: "o1" }],
    ["conversation:t42", { kind: "conversation", threadId: "t42" }],
    ["post-need", { kind: "post-need" }],
    ["post-need:design", { kind: "post-need", category: "design" }],
    ["call-human", { kind: "call-human" }],
    ["call-human:video", { kind: "call-human", category: "video" }],
    ["propose:d7", { kind: "propose", demandId: "d7" }],
    ["checkout:svc1", { kind: "checkout", serviceId: "svc1" }],
    ["checkout:svc1:premium", { kind: "checkout", serviceId: "svc1", tier: "premium" }],
    ["service-editor", { kind: "service-editor" }],
    ["service-editor:svc2", { kind: "service-editor", serviceId: "svc2" }],
    ["mine:needs", { kind: "mine", tab: "needs" }],
    ["mine:proposals", { kind: "mine", tab: "proposals" }],
    ["mine:services", { kind: "mine", tab: "services" }],
    ["mine:orders", { kind: "mine", tab: "orders" }],
    ["mine:help", { kind: "mine", tab: "help" }],
    ["settings", { kind: "settings" }],
    ["settings:profile", { kind: "settings", pane: "profile" }],
    ["settings:vetting", { kind: "settings", pane: "vetting" }],
    ["settings:money", { kind: "settings", pane: "money" }],
  ];
  for (const [raw, expected] of cases) {
    assert.deepEqual(links.parseBayParam(raw), expected, raw);
    assert.equal(links.formatBayParam(expected), raw, `format ${raw}`);
    assert.deepEqual(links.parseBayDeepLink(`?x=1&bay=${encodeURIComponent(raw)}`), expected, `search ${raw}`);
  }
});

test("深链：非法值一律忽略", () => {
  const bad = [
    "",
    "   ",
    "unknown",
    "unknown:1",
    "feed:all",
    "demand",
    "demand:",
    "demand:<script>",
    "demand:a b",
    "demand:../../etc",
    `demand:${"x".repeat(81)}`,
    "profile:",
    "profile:a/b",
    "order:o1:extra",
    "conversation:",
    "post-need:Design",
    "post-need:a b",
    "call-human:<x>",
    "propose:",
    "checkout",
    "checkout:",
    "checkout:svc:tier:more",
    "checkout:svc:TIER",
    "service-editor:bad id",
    "mine",
    "mine:all",
    "mine:NEEDS",
    "settings:billing",
    "settings:",
    "javascript:alert(1)",
    "x".repeat(201),
  ];
  for (const raw of bad) assert.equal(links.parseBayParam(raw), null, JSON.stringify(raw));
  assert.equal(links.parseBayParam(null), null);
  assert.equal(links.parseBayParam(undefined), null);
  assert.equal(links.parseBayDeepLink("?im=inbox"), null);
  assert.equal(links.parseBayDeepLink(""), null);
});

test("查询串：写 bay 时保留别的参数，信息流首页或 null 时去掉 bay", () => {
  assert.equal(links.buildBaySearch("?a=1", { kind: "demand", id: "d1" }), "?a=1&bay=demand:d1");
  assert.equal(links.buildBaySearch("?a=1&bay=order:o1", null), "?a=1");
  assert.equal(links.buildBaySearch("?bay=order:o1", { kind: "feed" }), "");
  assert.equal(links.buildBaySearch("", { kind: "checkout", serviceId: "s1", tier: "basic" }), "?bay=checkout:s1:basic");
});

test("/bay 路径识别", () => {
  assert.equal(links.isBayPath("/bay"), true);
  assert.equal(links.isBayPath("/bay/"), true);
  assert.equal(links.isBayPath("/en/bay"), true);
  assert.equal(links.isBayPath("/bayside"), false);
  assert.equal(links.isBayPath("/explore"), false);
  assert.equal(links.isBayPath(""), false);
});

test("跨站地址：子站按子域标签拼，门户与未知站落到门户", () => {
  const origins = {
    portalOrigin: "https://oceanleo.com",
    subsiteOrigin: (label) => `https://${label}.oceanleo.com`,
  };
  assert.equal(links.bayHrefWith("video", { kind: "demand", id: "d1" }, origins), "https://video.oceanleo.com/bay?bay=demand:d1");
  assert.equal(links.bayHrefWith("ppt", { kind: "order", id: "o1" }, origins), "https://slide.oceanleo.com/bay?bay=order:o1");
  assert.equal(links.bayHrefWith("threed", { kind: "feed" }, origins), "https://3d.oceanleo.com/bay?bay=feed");
  assert.equal(links.bayHrefWith("ecommerce", { kind: "call-human" }, origins), "https://e-commerce.oceanleo.com/bay?bay=call-human");
  assert.equal(links.bayHrefWith("oceanleo", { kind: "service", id: "s1" }, origins), "https://oceanleo.com/bay?bay=service:s1");
  assert.equal(links.bayHrefWith("Bad Key!", { kind: "feed" }, origins), "https://oceanleo.com/bay?bay=feed");
  const noSubsites = { portalOrigin: "https://oceanbizs.com", subsiteOrigin: () => undefined };
  assert.equal(links.bayHrefWith("video", { kind: "feed" }, noSubsites), "https://oceanbizs.com/bay?bay=feed");
  const slot = "https://p-9eb457fcce0b00b75abc9133119f56f8.dev.oceanleo.com";
  const stay = { ...origins, stayOnOrigin: slot };
  assert.equal(links.bayHrefWith("ppt", { kind: "demand", id: "d1" }, stay), `${slot}/bay?bay=demand:d1`);
  assert.equal(links.bayHrefWith("video", { kind: "feed" }, stay), `${slot}/bay?bay=feed`);
  assert.equal(links.bayHrefWith("oceanleo", { kind: "service", id: "s1" }, stay), `${slot}/bay?bay=service:s1`);
});

test("境内 bayEnabledHere() 为 false；海外未登录为 true", async () => {
  const cn = await loadState("cn");
  assert.equal(cn.bayEnabledHere(), false);
  const com = await loadState("com");
  assert.equal(com.bayEnabledHere(), true);
  assert.equal(com.bayHrefOnSite("ppt", { kind: "demand", id: "d9" }), "https://slide.oceanleo.com/bay?bay=demand:d9");
});

test("目标栈：打开详情、返回、回到信息流；任务上下文与站点", async () => {
  const state = await loadState("com");
  assert.deepEqual(state.bayStateSnapshot(), { current: { kind: "feed", filter: { kind: "all" } }, canGoBack: false });
  state.openBay({ kind: "demand", id: "d1" });
  assert.deepEqual(state.bayStateSnapshot().current, { kind: "demand", id: "d1" });
  assert.equal(state.bayStateSnapshot().canGoBack, true);
  state.openBay({ kind: "demand", id: "d1" });
  state.openBay({ kind: "order", id: "o1" });
  assert.deepEqual(state.bayStateSnapshot().current, { kind: "order", id: "o1" });
  state.bayBack();
  assert.deepEqual(state.bayStateSnapshot().current, { kind: "demand", id: "d1" });
  state.bayBack();
  assert.equal(state.bayStateSnapshot().canGoBack, false);
  state.openBay({ kind: "service", id: "s1" });
  state.openBay({ kind: "feed", filter: { kind: "service", category: "design" } });
  assert.deepEqual(state.bayStateSnapshot(), {
    current: { kind: "feed", filter: { kind: "service", category: "design" } },
    canGoBack: false,
  });
  state.setBayFilter({ kind: "bogus", category: "Not A Slug", q: "  logo  " });
  assert.deepEqual(state.bayStateSnapshot().current, { kind: "feed", filter: { kind: "all", q: "logo" } });

  state.setBaySiteKey("video");
  state.setBaySiteKey("../evil");
  state.setBayTaskContext({ taskId: "t1", messages: [{ id: 1 }] });
  state.setBayTaskContext(null);
  assert.equal(state.requireBayLogin(), false);
});

test("类目：defaultCategoryForSite 只读接口的 site_defaults，门户为 null", async () => {
  let calls = 0;
  const body = {
    items: [],
    flat_items: [
      { slug: "video", parent_slug: null, name_zh: "视频与动画", name_en: "Video", position: 30, published: true, catalog_kind: "delivery", regulated_domain: "none", main_site: "video" },
      { slug: "design", parent_slug: null, name_zh: "设计与视觉", name_en: "Design", position: 10, published: true, catalog_kind: "delivery", regulated_domain: "none", main_site: "design" },
      { slug: "tax", parent_slug: null, name_zh: "税务", name_en: "Tax", position: 1000, published: true, catalog_kind: "consult", regulated_domain: "tax", main_site: null },
    ],
    total: 3,
    site_defaults: { video: "video", ppt: "doc", oceanleo: null },
  };
  const categories = await import(
    await compileModule("src/lib/bay/categories.ts", {
      "./http": dataModule(`
        export async function bayGet(path, opts) {
          globalThis.__bayCategoryCalls = (globalThis.__bayCategoryCalls || 0) + 1;
          if (path !== "/v1/talent/categories" || !opts || opts.anonymous !== true) throw new Error("bad call " + path);
          return ${JSON.stringify(body)};
        }
      `),
    })
  );
  assert.equal(await categories.defaultCategoryForSite("video"), "video");
  assert.equal(await categories.defaultCategoryForSite("ppt"), "doc");
  assert.equal(await categories.defaultCategoryForSite("oceanleo"), null);
  assert.equal(await categories.defaultCategoryForSite("nosuchsite"), null);
  calls = globalThis.__bayCategoryCalls;
  assert.equal(calls, 1, "带缓存：只取一次");
  const data = await categories.fetchBayCategories();
  assert.deepEqual(categories.deliveryCategories(data).map((row) => row.slug), ["design", "video"]);
  assert.equal(categories.siteDefaultCategory(data, "oceanleo"), null);
  assert.equal(categories.siteDefaultCategory(null, "video"), null);
});

test("信息流请求：参数白名单、匿名可调；待办数要登录", async () => {
  const feed = await import(
    await compileModule("src/lib/bay/feed.ts", {
      "./http": dataModule(`
        export async function bayGet(path, opts) {
          (globalThis.__bayFeedCalls ||= []).push({ path, anonymous: Boolean(opts && opts.anonymous) });
          if (path.startsWith("/v1/talent/bay/summary")) return { needs_action: 3, items: { proposals: 1, orders: 2, help: -4 } };
          return { items: [{ kind: "demand", id: "d1", title: "做个 logo", author: { user_id: "u" } }, { kind: "evil", id: "x", title: "x", author: {} }, null], next_cursor: "" };
        }
      `),
    })
  );
  assert.equal(feed.bayFeedPath(), "/v1/talent/bay/feed?kind=all");
  assert.equal(
    feed.bayFeedPath({ kind: "service", category: "design", q: "  海报  ", limit: 99 }, "c1"),
    "/v1/talent/bay/feed?kind=service&category=design&q=%E6%B5%B7%E6%8A%A5&cursor=c1&limit=40",
  );
  assert.equal(feed.bayFeedPath({ kind: "nope", category: "DROP TABLE" }), "/v1/talent/bay/feed?kind=all");
  const page = await feed.fetchBayFeed({ kind: "demand" });
  assert.deepEqual(page.items.map((item) => item.id), ["d1"]);
  assert.equal(page.next_cursor, null);
  const summary = await feed.fetchBaySummary();
  assert.deepEqual(summary, { needs_action: 3, items: { proposals: 1, orders: 2, help: 0 } });
  const calls = globalThis.__bayFeedCalls;
  assert.equal(calls[0].anonymous, true);
  assert.equal(calls[1].anonymous, false);
});

test("consumeDeepLink：别的页面带 ?bay= → 跳到 /bay 页", async () => {
  const state = await loadState("com");
  const assigned = [];
  const replaced = [];
  const location = {
    pathname: "/library",
    search: "?bay=demand:d1",
    hash: "",
    origin: "https://video.oceanleo.com",
    href: "https://video.oceanleo.com/library?bay=demand:d1",
    assign(href) {
      assigned.push(href);
    },
  };
  globalThis.window = {
    location,
    history: {
      state: {},
      replaceState(_s, _t, url) {
        replaced.push(url);
        const parsed = new URL(url, "https://video.oceanleo.com/library");
        location.search = parsed.search;
        location.href = parsed.href;
      },
      pushState() {},
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const off = state.attachBayDeepLinks();
  assert.equal(location.search, "");
  assert.ok(replaced.length >= 1, "从原地址清掉 ?bay=");
  assert.equal(state.bayStateSnapshot().current.kind, "demand");
  assert.equal(state.bayStateSnapshot().current.id, "d1");
  assert.deepEqual(assigned, ["/bay?bay=demand:d1"]);
  off();
});
